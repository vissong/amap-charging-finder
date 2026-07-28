#!/usr/bin/env bash
set -euo pipefail

project="amap-deploy-test-$$"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose=(docker compose -p "$project")
reports_dir="$root/reports"
context_dir=""
context_dir_created=false
preexisting_context_dir="$reports_dir/.docker-context-test-$$"
preexisting_sentinel="$preexisting_context_dir/preexisting-sentinel"
preexisting_fixture_created=false
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
  if [[ "$context_dir_created" == true ]]; then
    rm -rf "$context_dir"
  fi
  rm -f "$context_dockerfile" "$context_log"
}

verify_cleanup_safety() {
  cleanup
  if [[ "$preexisting_fixture_created" == true ]]; then
    if [[ ! -f "$preexisting_sentinel" ]]; then
      echo 'pre-existing Docker context test content was deleted' >&2
      exit 1
    fi
    rm -rf "$preexisting_context_dir"
  fi
  rmdir "$reports_dir" >/dev/null 2>&1 || true
}
trap verify_cleanup_safety EXIT

cd "$root"
if [[ -e "$preexisting_context_dir" ]]; then
  echo 'refusing to overwrite a pre-existing Docker context test fixture' >&2
  exit 1
fi
mkdir -p "$preexisting_context_dir"
printf 'pre-existing sentinel\n' > "$preexisting_sentinel"
preexisting_fixture_created=true
context_dir="$(mktemp -d "$reports_dir/.docker-context-test.XXXXXX")"
context_dir_created=true
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
