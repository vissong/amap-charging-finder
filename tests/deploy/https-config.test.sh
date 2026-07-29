#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

[[ -f "$root/Caddyfile.ip" ]] || {
  echo "Caddyfile.ip must exist for public IP HTTPS" >&2
  exit 1
}

validate_compose_config() {
  local expected_host="$1"
  local expected_ip="$2"
  local expected_config="$3"
  local expected_server_name="$4"

  HTTPS_HOST="$expected_host" \
    PUBLIC_IP="$expected_ip" \
    TLS_SERVER_NAME="$expected_server_name" \
    CADDY_CONFIG_PATH="$expected_config" \
    ENV_FILE=tests/deploy/fixtures/valid.env \
    docker compose --profile https config --format json |
    EXPECTED_HOST="$expected_host" \
      EXPECTED_IP="$expected_ip" \
      EXPECTED_CONFIG="$expected_config" \
      EXPECTED_SERVER_NAME="$expected_server_name" \
      node --input-type=module -e '
        import { readFileSync } from "node:fs";
        const config = JSON.parse(readFileSync(0, "utf8"));
        const caddy = config.services.caddy;
        if (!config.services.app || !caddy) {
          throw new Error("https profile must include app and caddy");
        }
        if (caddy.image !== "caddy:2.11-alpine") {
          throw new Error(
            "Caddy 2.11 is required for public IP certificate support"
          );
        }
        if (caddy.environment.HTTPS_HOST !== process.env.EXPECTED_HOST) {
          throw new Error("HTTPS_HOST was not passed to Caddy");
        }
        if (caddy.environment.PUBLIC_IP !== process.env.EXPECTED_IP) {
          throw new Error("PUBLIC_IP was not passed to Caddy");
        }
        if (
          caddy.environment.TLS_SERVER_NAME !==
          process.env.EXPECTED_SERVER_NAME
        ) {
          throw new Error("TLS_SERVER_NAME was not passed to Caddy");
        }
        const caddyfile = caddy.volumes.find(
          (volume) => volume.target === "/etc/caddy/Caddyfile"
        );
        if (caddyfile?.source !== process.env.EXPECTED_CONFIG) {
          throw new Error("selected Caddyfile was not mounted");
        }
      '
}

validate_compose_config \
  "charge.example.com" \
  "" \
  "$root/Caddyfile" \
  "charge.example.com"
validate_compose_config \
  "203.0.113.10" \
  "203.0.113.10" \
  "$root/Caddyfile.ip" \
  "203.0.113.10"

docker run --rm \
  -e HTTPS_HOST=charge.example.com \
  -e TLS_SERVER_NAME=charge.example.com \
  -v "$root/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

for ip_host in "203.0.113.10" "[2001:db8::10]"; do
  tls_server_name="${ip_host#[}"
  tls_server_name="${tls_server_name%]}"
  docker run --rm \
    -e HTTPS_HOST="$ip_host" \
    -e TLS_SERVER_NAME="$tls_server_name" \
    -v "$root/Caddyfile.ip:/etc/caddy/Caddyfile:ro" \
    caddy:2.11-alpine \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
done

docker run --rm \
  -e HTTPS_HOST=203.0.113.10 \
  -e TLS_SERVER_NAME=203.0.113.10 \
  -v "$root/Caddyfile.ip:/etc/caddy/Caddyfile:ro" \
  caddy:2.11-alpine \
  caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile |
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const config = JSON.parse(readFileSync(0, "utf8"));
    const policy = config.apps?.tls?.automation?.policies?.[0];
    const issuer = policy?.issuers?.[0];
    const connectionPolicies =
      config.apps?.http?.servers?.srv0?.tls_connection_policies;
    if (issuer?.module !== "acme" || issuer?.profile !== "shortlived") {
      throw new Error("public IP certificates must use ACME shortlived");
    }
    if (!policy.subjects?.includes("203.0.113.10")) {
      throw new Error("public IP must be the certificate subject");
    }
    if (
      !connectionPolicies?.some(
        (connectionPolicy) =>
          connectionPolicy.default_sni === "203.0.113.10"
      )
    ) {
      throw new Error(
        "public IP must be the default SNI for NATed cloud hosts"
      );
    }
  '

docker run --rm \
  -e HTTPS_HOST='[2001:db8::10]' \
  -e TLS_SERVER_NAME='2001:db8::10' \
  -v "$root/Caddyfile.ip:/etc/caddy/Caddyfile:ro" \
  caddy:2.11-alpine \
  caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile |
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const config = JSON.parse(readFileSync(0, "utf8"));
    const connectionPolicies =
      config.apps?.http?.servers?.srv0?.tls_connection_policies;
    if (
      !connectionPolicies?.some(
        (connectionPolicy) =>
          connectionPolicy.default_sni === "2001:db8::10"
      )
    ) {
      throw new Error(
        "IPv6 default SNI must not include URL brackets"
      );
    }
  '
