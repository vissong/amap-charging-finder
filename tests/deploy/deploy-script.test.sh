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
compose_env="$workspace/compose.env"
output="$workspace/deploy.output"
mkdir -p "$case_dir" "$fake_bin"
cp "$root/deploy.sh" "$case_dir/deploy.sh"
cp "$root/compose.yaml" "$case_dir/compose.yaml"
chmod +x "$case_dir/deploy.sh"

cat >"$fake_bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$DOCKER_CALLS"

if [[ "${1:-}" == "compose" ]]; then
  printf 'ENV_FILE=%s|APP_PORT=%s|DOMAIN=%s|PUBLIC_IP=%s|HTTPS_HOST=%s|CADDY_CONFIG_PATH=%s|COMPOSE_FILE=%s|COMPOSE_PROFILES=%s|CALL=%s\n' \
    "${ENV_FILE-<unset>}" \
    "${APP_PORT-<unset>}" \
    "${DOMAIN-<unset>}" \
    "${PUBLIC_IP-<unset>}" \
    "${HTTPS_HOST-<unset>}" \
    "${CADDY_CONFIG_PATH-<unset>}" \
    "${COMPOSE_FILE-<unset>}" \
    "${COMPOSE_PROFILES-<unset>}" \
    "$*" >>"$COMPOSE_ENV"
fi

assert_success_not_reported() {
  if grep -Fq '部署成功：' "$DEPLOY_OUTPUT"; then
    echo "health confirmation must occur before deployment success" >&2
    exit 9
  fi
}

if [[ "$*" == "info" ]]; then
  exit 0
fi

[[ "${1:-}" == "compose" ]] || {
  if [[ "${1:-}" == "inspect" && "$*" == *"test-container" ]]; then
    assert_success_not_reported
    printf 'healthy\n'
    exit 0
  fi
  printf 'unexpected docker call: %s\n' "$*" >&2
  exit 9
}

shift
profile=""
while (( $# > 0 )); do
  case "$1" in
    --file|-f|--env-file)
      shift 2
      ;;
    --profile)
      profile="${2:-}"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

case "${1:-}" in
  version)
    ;;
  up)
    [[ "$*" == "up -d --build --remove-orphans" ]]
    ;;
  ps)
    [[ "$*" == "ps -q app" ]]
    assert_success_not_reported
    printf 'test-container\n'
    ;;
  rm)
    [[ "$profile" == "https" && "$*" == "rm --stop --force caddy" ]]
    if [[ "${FAIL_CADDY_RM:-0}" == "1" ]]; then
      printf 'simulated caddy removal failure\n' >&2
      exit 42
    fi
    ;;
  *)
    printf 'unexpected docker compose call: %s\n' "$*" >&2
    exit 9
    ;;
esac
FAKE_DOCKER
chmod +x "$fake_bin/docker"

run_deploy() {
  : >"$calls"
  : >"$compose_env"
  (
    cd "$case_dir"
    PATH="$fake_bin:$PATH" \
      DOCKER_CALLS="$calls" \
      COMPOSE_ENV="$compose_env" \
      DEPLOY_OUTPUT="$output" \
      FAIL_CADDY_RM="${FAIL_CADDY_RM:-0}" \
      ./deploy.sh
  ) >"$output" 2>&1
}

run_deploy_with_conflicting_env() {
  : >"$calls"
  : >"$compose_env"
  (
    cd "$case_dir"
    PATH="$fake_bin:$PATH" \
      DOCKER_CALLS="$calls" \
      COMPOSE_ENV="$compose_env" \
      DEPLOY_OUTPUT="$output" \
      ENV_FILE="/tmp/inherited.env" \
      APP_PORT="65500" \
      DOMAIN="inherited.example.net" \
      PUBLIC_IP="198.51.100.99" \
      HTTPS_HOST="inherited.example.net" \
      CADDY_CONFIG_PATH="/tmp/inherited.Caddyfile" \
      COMPOSE_FILE="/tmp/inherited-compose.yaml" \
      COMPOSE_PROFILES="https" \
      ./deploy.sh
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

# Valid plain HTTP deployment
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\nPUBLIC_IP=\n' \
  >"$case_dir/.env"
run_deploy || {
  echo "valid plain HTTP deployment failed unexpectedly" >&2
  sed -n '1,120p' "$output" >&2
  exit 1
}
ip_up_call="$(grep -E '^compose .*up -d --build --remove-orphans$' "$calls")"
ip_ps_call="$(grep -E '^compose .*ps -q app$' "$calls")"
[[ "$ip_up_call" != *"--profile"* ]]
[[ "$ip_ps_call" != *"--profile"* ]]
grep -Fx "inspect --format {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} test-container" "$calls"
ps_line="$(grep -n -E '^compose .*ps -q app$' "$calls" | cut -d: -f1)"
inspect_line="$(grep -n -Fx "inspect --format {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} test-container" "$calls" | cut -d: -f1)"
(( ps_line < inspect_line ))
grep -F "http://" "$output"
! grep -F "test-secret" "$output"
! grep -F "test-secret" "$calls"

# Domain deployment enables the profile.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=charge.example.com\n' \
  >"$case_dir/.env"
run_deploy
grep -E '^compose .*--profile https .*up -d --build --remove-orphans$' "$calls"
grep -F "https://charge.example.com" "$output"
grep -F "|PUBLIC_IP=|HTTPS_HOST=charge.example.com|CADDY_CONFIG_PATH=$case_dir/Caddyfile|" \
  "$compose_env"

# Public IPv4 deployment enables HTTPS with the short-lived certificate config.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\nPUBLIC_IP=203.0.113.10\n' \
  >"$case_dir/.env"
run_deploy
grep -E '^compose .*--profile https .*up -d --build --remove-orphans$' "$calls"
grep -F "https://203.0.113.10" "$output"
grep -F "|PUBLIC_IP=203.0.113.10|HTTPS_HOST=203.0.113.10|CADDY_CONFIG_PATH=$case_dir/Caddyfile.ip|" \
  "$compose_env"

# Public IPv6 deployment enables HTTPS and prints a bracketed URL.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\nPUBLIC_IP=2001:db8::10\n' \
  >"$case_dir/.env"
run_deploy
grep -E '^compose .*--profile https .*up -d --build --remove-orphans$' "$calls"
grep -F "https://[2001:db8::10]" "$output"
grep -F "|PUBLIC_IP=2001:db8::10|HTTPS_HOST=[2001:db8::10]|CADDY_CONFIG_PATH=$case_dir/Caddyfile.ip|" \
  "$compose_env"

# Domain and public IP cannot select two certificate identities at once.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=charge.example.com\nPUBLIC_IP=203.0.113.10\n' \
  >"$case_dir/.env"
if run_deploy; then
  echo "DOMAIN and PUBLIC_IP conflict must fail" >&2
  exit 1
fi
grep -F "DOMAIN" "$output"
grep -F "PUBLIC_IP" "$output"
! grep -F "compose " "$calls"

# Schemes, malformed IPv4, and malformed IPv6 are rejected.
for invalid_ip in \
  "https://203.0.113.10" \
  "999.1.1.1" \
  "01.2.3.4" \
  "2001:::10" \
  "2001:db8::10/64"; do
  printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\nPUBLIC_IP=%s\n' \
    "$invalid_ip" >"$case_dir/.env"
  if run_deploy; then
    printf 'invalid PUBLIC_IP was accepted: %s\n' "$invalid_ip" >&2
    exit 1
  fi
  grep -F "PUBLIC_IP" "$output"
done

# Removing DOMAIN stops the old optional proxy without deleting named volumes.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\nPUBLIC_IP=\n' \
  >"$case_dir/.env"
run_deploy
grep -E '^compose .*--profile https .*rm --stop --force caddy$' "$calls"

# URL, port, and path are rejected instead of being passed to Caddy.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=https://charge.example.com\n' \
  >"$case_dir/.env"
if run_deploy; then
  echo "DOMAIN with scheme must fail" >&2
  exit 1
fi
grep -F "DOMAIN" "$output"

if [[ "${DEPLOY_TEST_CASE:-all}" == "all" ||
  "${DEPLOY_TEST_CASE:-all}" == "inherited-environment" ]]; then
  # Conflicting inherited values cannot override the repository configuration.
  printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\nPUBLIC_IP=\n' \
    >"$case_dir/.env"
  run_deploy_with_conflicting_env
  [[ -s "$compose_env" ]]
  expected_prefix="ENV_FILE=$case_dir/.env|APP_PORT=3100|DOMAIN=|PUBLIC_IP=|HTTPS_HOST=|CADDY_CONFIG_PATH=$case_dir/Caddyfile|COMPOSE_FILE=<unset>|COMPOSE_PROFILES=<unset>|CALL="
  while IFS= read -r recorded_environment; do
    [[ "$recorded_environment" == "$expected_prefix"* ]] || {
      printf 'compose received inherited environment: %s\n' \
        "$recorded_environment" >&2
      exit 1
    }
    [[ "$recorded_environment" == *"--file $case_dir/compose.yaml"* ]]
    [[ "$recorded_environment" == *"--env-file $case_dir/.env"* ]]
  done <"$compose_env"
  grep -F "http://" "$output"
  grep -F ":3100" "$output"
  ! grep -F "HTTPS 地址" "$output"
fi

if [[ "${DEPLOY_TEST_CASE:-all}" == "all" ||
  "${DEPLOY_TEST_CASE:-all}" == "caddy-removal-failure" ]]; then
  # A real Caddy removal failure aborts before updating the application.
  printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=\nPUBLIC_IP=\n' \
    >"$case_dir/.env"
  if FAIL_CADDY_RM=1 run_deploy; then
    echo "caddy removal failure must fail deployment" >&2
    exit 1
  fi
  grep -E '^compose .*--profile https .*rm --stop --force caddy$' "$calls"
  ! grep -F "up -d --build --remove-orphans" "$calls"
  ! grep -F "部署成功：" "$output"
fi

if [[ "${DEPLOY_TEST_CASE:-all}" == "all" ||
  "${DEPLOY_TEST_CASE:-all}" == "invalid-domain-labels" ]]; then
  # Empty, overlong, or hyphen-bounded DNS labels are invalid.
  invalid_domain_failures=0
  long_label="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  for invalid_domain in \
    ".example.com" \
    "foo..example.com" \
    "-foo.example.com" \
    "foo-.example.com" \
    "$long_label.example.com"; do
    printf 'AMAP_WEB_SERVICE_KEY=test-secret\nAPP_PORT=3100\nDOMAIN=%s\n' \
      "$invalid_domain" >"$case_dir/.env"
    if run_deploy; then
      printf 'invalid DOMAIN was accepted: %s\n' "$invalid_domain" >&2
      invalid_domain_failures=$((invalid_domain_failures + 1))
    else
      grep -F "DOMAIN" "$output"
    fi
  done
  if (( invalid_domain_failures > 0 )); then
    exit 1
  fi
fi
