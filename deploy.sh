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

[[ -f compose.yaml ]] || fail "当前目录缺少 compose.yaml"
command -v docker >/dev/null 2>&1 || fail "未安装 Docker"
docker info >/dev/null 2>&1 || fail "Docker 服务不可用"
docker compose version >/dev/null 2>&1 || fail "Docker Compose 不可用"
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
if [[ -n "$domain" && ! "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  fail "DOMAIN 必须是纯域名，不能包含 http://、端口或路径"
fi

compose_args=(compose)
if [[ -n "$domain" ]]; then
  compose_args+=(--profile https)
else
  docker compose --profile https rm --stop --force caddy >/dev/null 2>&1 || true
fi

docker "${compose_args[@]}" up -d --build --remove-orphans

container_id="$(docker "${compose_args[@]}" ps -q app)"
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

server_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
server_ip="${server_ip:-<服务器IP>}"
printf '部署成功： http://%s:%s\n' "$server_ip" "$app_port"
if [[ -n "$domain" ]]; then
  printf 'HTTPS 地址： https://%s\n' "$domain"
  printf '证书状态： docker compose --profile https logs caddy\n'
fi
