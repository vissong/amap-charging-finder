#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

services="$(
  DOMAIN=charge.example.com \
  ENV_FILE=tests/deploy/fixtures/valid.env \
  docker compose --profile https config --services
)"
grep -Fx "app" <<<"$services"
grep -Fx "caddy" <<<"$services"

docker run --rm \
  -e DOMAIN=charge.example.com \
  -v "$root/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
