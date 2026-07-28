#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ -f "$root/deploy.sh" ]] || {
  echo "deploy.sh must exist" >&2
  exit 1
}

workspace="$(mktemp -d)"
trap 'rm -rf "$workspace"' EXIT
case_dir="$workspace/project"
fake_bin="$workspace/bin"
calls="$workspace/docker.calls"
output="$workspace/deploy.output"
mkdir -p "$case_dir" "$fake_bin"
cp "$root/deploy.sh" "$case_dir/deploy.sh"
cp "$root/compose.yaml" "$case_dir/compose.yaml"
chmod +x "$case_dir/deploy.sh"

cat >"$fake_bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$DOCKER_CALLS"

assert_success_not_reported() {
  if grep -Fq '部署成功：' "$DEPLOY_OUTPUT"; then
    echo "health confirmation must occur before deployment success" >&2
    exit 9
  fi
}

case "$*" in
  "info"|"compose version"|"compose up -d --build --remove-orphans"|\
  "compose --profile https up -d --build --remove-orphans"|\
  "compose --profile https rm --stop --force caddy")
    ;;
  "compose ps -q app"|"compose --profile https ps -q app")
    assert_success_not_reported
    printf 'test-container\n'
    ;;
  inspect\ --format*test-container)
    assert_success_not_reported
    printf 'healthy\n'
    ;;
  *)
    printf 'unexpected docker call: %s\n' "$*" >&2
    exit 9
    ;;
esac
FAKE_DOCKER
chmod +x "$fake_bin/docker"

run_deploy() {
  : >"$calls"
  (
    cd "$case_dir"
    PATH="$fake_bin:$PATH" DOCKER_CALLS="$calls" DEPLOY_OUTPUT="$output" ./deploy.sh
  ) >"$output" 2>&1
}

# Missing .env
if run_deploy; then
  echo "missing .env must fail" >&2
  exit 1
fi
grep -F "缺少 .env" "$output"

# Empty key
printf 'AMAP_WEB_SERVICE_KEY=\nAPP_PORT=3000\n' >"$case_dir/.env"
if run_deploy; then
  echo "empty key must fail" >&2
  exit 1
fi
grep -F "AMAP_WEB_SERVICE_KEY" "$output"

# Example placeholder key
printf 'AMAP_WEB_SERVICE_KEY=YOUR_AMAP_WEB_SERVICE_KEY\nAPP_PORT=3000\n' \
  >"$case_dir/.env"
if run_deploy; then
  echo "placeholder key must fail" >&2
  exit 1
fi
grep -F "AMAP_WEB_SERVICE_KEY" "$output"

# Invalid port
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=70000\n' >"$case_dir/.env"
if run_deploy; then
  echo "invalid port must fail" >&2
  exit 1
fi
grep -F "APP_PORT" "$output"

# Valid IP deployment
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\n' >"$case_dir/.env"
run_deploy
grep -Fx "compose up -d --build --remove-orphans" "$calls"
grep -Fx "compose ps -q app" "$calls"
grep -Fx "inspect --format {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} test-container" "$calls"
ps_line="$(grep -n -Fx "compose ps -q app" "$calls" | cut -d: -f1)"
inspect_line="$(grep -n -Fx "inspect --format {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} test-container" "$calls" | cut -d: -f1)"
(( ps_line < inspect_line ))
grep -F "http://" "$output"
! grep -F "test-secret" "$output"
! grep -F "test-secret" "$calls"

# Domain deployment enables the profile.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=charge.example.com\n' \
  >"$case_dir/.env"
run_deploy
grep -Fx "compose --profile https up -d --build --remove-orphans" "$calls"
grep -F "https://charge.example.com" "$output"

# Removing DOMAIN stops the old optional proxy without deleting named volumes.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\n' \
  >"$case_dir/.env"
run_deploy
grep -Fx "compose --profile https rm --stop --force caddy" "$calls"

# URL, port, and path are rejected instead of being passed to Caddy.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=https://charge.example.com\n' \
  >"$case_dir/.env"
if run_deploy; then
  echo "DOMAIN with scheme must fail" >&2
  exit 1
fi
grep -F "DOMAIN" "$output"
