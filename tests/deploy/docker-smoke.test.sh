#!/usr/bin/env bash
set -euo pipefail

project="amap-deploy-test-$$"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose=(docker compose -p "$project")
reports_dir="$root/reports"
context_dir="$reports_dir/.docker-context-test-$$"
context_dockerfile="$root/Dockerfile.context-test-$$"
context_image="${project}-context-test"
context_log="$(mktemp)"

cleanup() {
  (
    cd "$root"
    ENV_FILE=tests/deploy/fixtures/valid.env APP_PORT=0 \
      "${compose[@]}" down -v --remove-orphans
  ) >/dev/null 2>&1 || true
  docker image rm -f "$context_image" >/dev/null 2>&1 || true
  rm -rf "$context_dir"
  rmdir "$reports_dir" >/dev/null 2>&1 || true
  rm -f "$context_dockerfile" "$context_log"
}
trap cleanup EXIT

cd "$root"
mkdir -p "$context_dir"
printf 'build-context-sentinel\n' > "$context_dir/sentinel"
printf '%s\n' \
  'FROM node:22-alpine' \
  'COPY reports /reports' \
  'RUN test -f /reports/.docker-context-test-'"$$"'/sentinel' \
  > "$context_dockerfile"

if docker build --tag "$context_image" --file "$context_dockerfile" "$root" >"$context_log" 2>&1; then
  echo 'reports/ was included in the Docker build context' >&2
  exit 1
fi
grep -F 'reports' "$context_log" >/dev/null

ENV_FILE=tests/deploy/fixtures/valid.env APP_PORT=0 \
  "${compose[@]}" up -d --build app

container_id="$(
  ENV_FILE=tests/deploy/fixtures/valid.env APP_PORT=0 \
    "${compose[@]}" ps -q app
)"
test -n "$container_id"

for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$container_id")"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  [[ "$status" != "unhealthy" ]]
  sleep 1
done
test "$(docker inspect --format '{{.State.Health.Status}}' "$container_id")" = "healthy"

published="$(
  ENV_FILE=tests/deploy/fixtures/valid.env APP_PORT=0 \
    "${compose[@]}" port app 3000
)"
host_port="${published##*:}"
test "$(curl --fail --silent "http://127.0.0.1:${host_port}/api/health")" = '{"status":"ok"}'
test "$(docker inspect --format '{{.Config.User}}' "$container_id")" = "node"
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" = "unless-stopped"

image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
! docker image inspect "$image_id" --format '{{json .Config.Env}}' |
  grep -F 'deployment-smoke-test-key'
! docker history --no-trunc "$image_id" |
  grep -F 'deployment-smoke-test-key'
