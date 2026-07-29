#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

fail() {
  printf '部署失败：%s\n' "$1" >&2
  exit 1
}

read_env_value() {
  local key="$1"
  awk -v wanted="$key" '
    /^[[:space:]]*#/ { next }
    {
      line = $0
      sub(/\r$/, "", line)
      equals = index(line, "=")
      if (equals == 0) next
      name = substr(line, 1, equals - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != wanted) next
      value = substr(line, equals + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
      exit
    }
  ' .env
}

valid_domain() {
  local value="$1"
  local label
  local labels=()

  [[ "$value" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || return 1
  [[ "$value" != .* && "$value" != *".."* ]] || return 1

  IFS='.' read -r -a labels <<<"$value"
  for label in "${labels[@]}"; do
    (( ${#label} <= 63 )) || return 1
    [[ "$label" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] ||
      return 1
  done
}

valid_ipv4() {
  local value="$1"
  local octet
  local octets=()

  [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r -a octets <<<"$value"
  for octet in "${octets[@]}"; do
    [[ "$octet" == "0" || "$octet" != 0* ]] || return 1
    (( 10#$octet <= 255 )) || return 1
  done
}

valid_ipv6() {
  local value="$1"
  local left right side segment
  local segments=()
  local count=0

  [[ "$value" == *:* && "$value" =~ ^[0-9A-Fa-f:]+$ ]] || return 1
  [[ "$value" != *":::"* ]] || return 1

  if [[ "$value" == *"::"* ]]; then
    left="${value%%::*}"
    right="${value#*::}"
    [[ "$right" != *"::"* ]] || return 1
    for side in "$left" "$right"; do
      [[ -n "$side" ]] || continue
      IFS=':' read -r -a segments <<<"$side"
      for segment in "${segments[@]}"; do
        [[ "$segment" =~ ^[0-9A-Fa-f]{1,4}$ ]] || return 1
        (( count += 1 ))
      done
    done
    (( count < 8 ))
    return
  fi

  [[ "$value" != :* && "$value" != *: ]] || return 1
  IFS=':' read -r -a segments <<<"$value"
  (( ${#segments[@]} == 8 )) || return 1
  for segment in "${segments[@]}"; do
    [[ "$segment" =~ ^[0-9A-Fa-f]{1,4}$ ]] || return 1
  done
}

[[ -f compose.yaml ]] || fail "当前目录缺少 compose.yaml"
command -v docker >/dev/null 2>&1 || fail "未安装 Docker"
docker info >/dev/null 2>&1 || fail "Docker 服务不可用"
[[ -f .env ]] || fail "缺少 .env，请先执行 cp .env.example .env"

amap_key="$(read_env_value AMAP_WEB_SERVICE_KEY)"
app_port="$(read_env_value APP_PORT)"
app_port="${app_port:-3000}"
[[ -n "$amap_key" ]] || fail "AMAP_WEB_SERVICE_KEY 未配置"
case "$amap_key" in
  YOUR_AMAP_WEB_SERVICE_KEY|your-amap-key|你的高德Web服务Key)
    fail "AMAP_WEB_SERVICE_KEY 仍是示例占位值"
    ;;
esac
[[ "$app_port" =~ ^[0-9]+$ ]] || fail "APP_PORT 必须是 1 至 65535 的整数"
(( app_port >= 1 && app_port <= 65535 )) ||
  fail "APP_PORT 必须是 1 至 65535 的整数"

domain="$(read_env_value DOMAIN)"
public_ip="$(read_env_value PUBLIC_IP)"
if [[ -n "$domain" && -n "$public_ip" ]]; then
  fail "DOMAIN 与 PUBLIC_IP 只能配置一个"
fi
if [[ -n "$domain" ]] && ! valid_domain "$domain"; then
  fail "DOMAIN 必须是纯域名，不能包含 http://、端口或路径"
fi
if [[ -n "$public_ip" ]] &&
  ! valid_ipv4 "$public_ip" &&
  ! valid_ipv6 "$public_ip"; then
  fail "PUBLIC_IP 必须是纯 IPv4 或 IPv6 地址，不能包含协议、端口或路径"
fi

https_host="$domain"
https_url_host="$domain"
tls_server_name="$domain"
caddy_config_path="$root/Caddyfile"
if [[ -n "$public_ip" ]]; then
  tls_server_name="$public_ip"
  caddy_config_path="$root/Caddyfile.ip"
  if valid_ipv6 "$public_ip"; then
    https_host="[$public_ip]"
    https_url_host="[$public_ip]"
  else
    https_host="$public_ip"
    https_url_host="$public_ip"
  fi
fi

run_compose() {
  (
    unset COMPOSE_FILE COMPOSE_PROFILES
    export ENV_FILE="$root/.env"
    export APP_PORT="$app_port"
    export DOMAIN="$domain"
    export PUBLIC_IP="$public_ip"
    export HTTPS_HOST="$https_host"
    export TLS_SERVER_NAME="$tls_server_name"
    export CADDY_CONFIG_PATH="$caddy_config_path"
    docker compose \
      --file "$root/compose.yaml" \
      --env-file "$root/.env" \
      "$@"
  )
}

run_compose version >/dev/null 2>&1 || fail "Docker Compose 不可用"

run_selected_compose() {
  if [[ -n "$https_host" ]]; then
    run_compose --profile https "$@"
  else
    run_compose "$@"
  fi
}

if [[ -z "$https_host" ]]; then
  run_compose --profile https rm --stop --force caddy >/dev/null 2>&1 ||
    fail "停止旧 Caddy 服务失败"
fi

run_selected_compose up -d --build --remove-orphans

container_id="$(run_selected_compose ps -q app)"
[[ -n "$container_id" ]] || fail "应用容器未创建"

for _ in $(seq 1 30); do
  health="$(
    docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id"
  )"
  [[ "$health" == "healthy" ]] && break
  [[ "$health" != "unhealthy" && "$health" != "exited" ]] ||
    fail "应用容器健康检查失败，请运行 docker compose logs app"
  sleep 2
done

[[ "$health" == "healthy" ]] ||
  fail "应用健康检查超时，请运行 docker compose logs app"

if [[ -n "$https_host" ]]; then
  caddy_container_id="$(run_selected_compose ps -q caddy)"
  [[ -n "$caddy_container_id" ]] || fail "Caddy 容器未创建"

  https_ready=false
  for _ in $(seq 1 30); do
    caddy_status="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "$caddy_container_id"
    )"
    [[ "$caddy_status" != "unhealthy" &&
      "$caddy_status" != "exited" &&
      "$caddy_status" != "dead" &&
      "$caddy_status" != "restarting" ]] || {
      run_selected_compose logs --tail=30 caddy >&2 || true
      fail "Caddy 启动失败，请检查上方日志"
    }

    if [[ -n "$public_ip" ]]; then
      https_health="$(
        docker exec "$caddy_container_id" \
          wget --no-check-certificate -qO- \
          https://127.0.0.1/api/health 2>/dev/null || true
      )"
      if [[ "$https_health" == '{"status":"ok"}' ]]; then
        https_ready=true
        break
      fi
    elif [[ "$caddy_status" == "running" || "$caddy_status" == "healthy" ]]; then
      https_ready=true
      break
    fi
    sleep 2
  done

  if [[ "$https_ready" != true ]]; then
    run_selected_compose logs --tail=30 caddy >&2 || true
    fail "IP HTTPS 握手失败，请确认公网 80/443 端口已放行"
  fi
fi

server_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
server_ip="${server_ip:-<服务器IP>}"
printf '部署成功： http://%s:%s\n' "$server_ip" "$app_port"
if [[ -n "$https_host" ]]; then
  printf 'HTTPS 地址： https://%s\n' "$https_url_host"
  if [[ -n "$public_ip" ]]; then
    printf 'IP 证书： Let'\''s Encrypt shortlived，Caddy 自动续期\n'
  fi
  printf '证书状态： docker compose --profile https logs caddy\n'
fi
