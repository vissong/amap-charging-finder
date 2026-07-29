# Public IP HTTPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic browser-trusted HTTPS for an explicitly configured public IPv4 or IPv6 while preserving domain HTTPS and plain HTTP deployment.

**Architecture:** `deploy.sh` selects one of three modes from `.env`: domain HTTPS, public-IP HTTPS, or plain HTTP. Domain and IP HTTPS share the existing Caddy service, but IP mode mounts a dedicated Caddyfile that selects Let’s Encrypt’s `shortlived` ACME profile.

**Tech Stack:** Bash, Docker Compose, Caddy 2.11, Let’s Encrypt ACME, shell integration tests

## Global Constraints

- `DOMAIN` and `PUBLIC_IP` are mutually exclusive.
- Do not auto-detect the public IP.
- Domain certificates keep the default ACME profile.
- Public IP certificates use the `shortlived` ACME profile.
- IPv4 and IPv6 literals are supported; schemes, ports, paths, brackets, and malformed literals are rejected.
- The real AMap key must not enter tracked files, build artifacts, logs, or Git history.

---

### Task 1: Deployment mode selection and validation

**Files:**
- Modify: `tests/deploy/deploy-script.test.sh`
- Modify: `deploy.sh`

**Interfaces:**
- Consumes: `.env` values `DOMAIN`, `PUBLIC_IP`, and `APP_PORT`
- Produces: exported Compose values `HTTPS_HOST`, `PUBLIC_IP`, and `CADDY_CONFIG_PATH`

- [ ] **Step 1: Write failing deployment behavior tests**

Extend the fake Docker environment recording to include:

```bash
PUBLIC_IP="${PUBLIC_IP-<unset>}"
HTTPS_HOST="${HTTPS_HOST-<unset>}"
CADDY_CONFIG_PATH="${CADDY_CONFIG_PATH-<unset>}"
```

Add cases that require:

```bash
# IPv4 enables HTTPS and reports a trusted URL.
PUBLIC_IP=203.0.113.10

# IPv6 enables HTTPS and reports a bracketed URL.
PUBLIC_IP=2001:db8::10

# DOMAIN and PUBLIC_IP together fail before Docker Compose starts.
DOMAIN=charge.example.com
PUBLIC_IP=203.0.113.10

# Malformed values fail before Docker Compose starts.
PUBLIC_IP=999.1.1.1
PUBLIC_IP=https://203.0.113.10
PUBLIC_IP=2001:::10
```

- [ ] **Step 2: Run the deployment test and verify RED**

Run:

```bash
bash tests/deploy/deploy-script.test.sh
```

Expected: FAIL because `deploy.sh` does not read `PUBLIC_IP`, does not select the IP Caddyfile, and still treats an empty `DOMAIN` as plain HTTP.

- [ ] **Step 3: Implement minimal mode selection**

Add focused Bash validators:

```bash
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

  IFS=':' read -r -a segments <<<"$value"
  (( ${#segments[@]} == 8 )) || return 1
  for segment in "${segments[@]}"; do
    [[ "$segment" =~ ^[0-9A-Fa-f]{1,4}$ ]] || return 1
  done
}
```

Read `PUBLIC_IP`, reject conflicting HTTPS identifiers, and derive:

```bash
https_host="$domain"
caddy_config_path="$root/Caddyfile"

if [[ -n "$public_ip" ]]; then
  https_host="$public_ip"
  caddy_config_path="$root/Caddyfile.ip"
fi
```

Bracket IPv6 only for the Caddy site address and printed URL. Enable the Compose `https` profile when either `DOMAIN` or `PUBLIC_IP` is set. Export only values read or derived from the repository `.env`, so inherited shell variables cannot override deployment.

- [ ] **Step 4: Run the deployment test and verify GREEN**

Run:

```bash
bash tests/deploy/deploy-script.test.sh
```

Expected: PASS for plain HTTP, domain HTTPS, IPv4 HTTPS, IPv6 HTTPS, conflicting input, malformed input, inherited environment isolation, and Caddy removal failure.

- [ ] **Step 5: Commit**

```bash
git add deploy.sh tests/deploy/deploy-script.test.sh
git commit -m "feat: select public IP HTTPS deployment"
```

### Task 2: Public IP Caddy configuration

**Files:**
- Create: `Caddyfile.ip`
- Modify: `compose.yaml`
- Modify: `tests/deploy/https-config.test.sh`

**Interfaces:**
- Consumes: `HTTPS_HOST`, `PUBLIC_IP`, and `CADDY_CONFIG_PATH` from `deploy.sh`
- Produces: a Caddy reverse proxy using Let’s Encrypt `shortlived` profile for IP literals

- [ ] **Step 1: Write failing Caddy and Compose tests**

Require both configurations to validate:

```bash
docker run --rm -e HTTPS_HOST=charge.example.com \
  -v "$root/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

docker run --rm -e HTTPS_HOST=203.0.113.10 \
  -v "$root/Caddyfile.ip:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Inspect adapted IP JSON and require the ACME issuer profile to equal `shortlived`. Require Compose to mount the selected `CADDY_CONFIG_PATH` and pass `HTTPS_HOST`.

- [ ] **Step 2: Run the HTTPS configuration test and verify RED**

Run:

```bash
bash tests/deploy/https-config.test.sh
```

Expected: FAIL because `Caddyfile.ip`, `HTTPS_HOST`, and the configurable Caddyfile mount do not exist.

- [ ] **Step 3: Implement the IP Caddyfile and Compose wiring**

Create:

```caddyfile
{$HTTPS_HOST} {
	tls {
		issuer acme {
			profile shortlived
		}
	}
	encode zstd gzip
	reverse_proxy app:3000
}
```

Change the domain Caddyfile site address to `{$HTTPS_HOST}`. Pass `HTTPS_HOST` and `PUBLIC_IP` to Caddy, and mount `${CADDY_CONFIG_PATH:-./Caddyfile}` at `/etc/caddy/Caddyfile`.

- [ ] **Step 4: Run the HTTPS configuration test and verify GREEN**

Run:

```bash
bash tests/deploy/https-config.test.sh
```

Expected: PASS with domain and IPv4/IPv6 configurations valid and adapted IP JSON containing `profile: shortlived`.

- [ ] **Step 5: Commit**

```bash
git add Caddyfile Caddyfile.ip compose.yaml tests/deploy/https-config.test.sh
git commit -m "feat: configure short-lived IP certificates"
```

### Task 3: Documentation and complete verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed deployment modes
- Produces: operator instructions and explicit Geolocation behavior

- [ ] **Step 1: Document configuration and positioning constraints**

Add `PUBLIC_IP=` to `.env.example`. Document:

```text
DOMAIN=charge.example.com  # domain HTTPS
PUBLIC_IP=203.0.113.10     # public IP HTTPS
```

State that only one may be set, ports 80/443 must reach the server, IP certificates last about 160 hours and renew automatically, and a stable public IP is required. Explain that valid HTTPS creates the secure context required by Geolocation, while user permission, system location settings, embedded WebView permissions, and iframe Permissions Policy still control the final result.

- [ ] **Step 2: Run deployment checks**

Run:

```bash
npm run test:deploy
bash tests/deploy/docker-smoke.test.sh
```

Expected: all deployment behavior, Caddy configuration, and real container health checks pass.

- [ ] **Step 3: Run the full project verification**

Run:

```bash
npm run check
npm run e2e
git diff --check
```

Expected: unit tests, typecheck, production build, repository Key scan, all Playwright projects, and whitespace validation pass.

- [ ] **Step 4: Run the real-key leak scan**

Read the local ignored key only in memory and scan tracked files, `dist`, and `git log --all -S<key>`. Output only counts and booleans.

Expected:

```json
{"trackedLeak":false,"artifactLeak":false,"gitHistoryLeak":false}
```

- [ ] **Step 5: Commit and publish**

```bash
git add .env.example README.md
git commit -m "docs: explain public IP HTTPS deployment"
git push origin main
```
