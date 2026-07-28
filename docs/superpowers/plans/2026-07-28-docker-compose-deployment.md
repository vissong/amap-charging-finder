# Docker Compose One-Click Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-owned `./deploy.sh` workflow that builds and runs the charging finder with Docker Compose, supports both IP access and optional Caddy-managed domain HTTPS, and never bakes the AMap key into Git or the image.

**Architecture:** A multi-stage Node image builds the Vite frontend and runs the existing Express server as a non-root user. Compose always starts the application with a published host port and conditionally starts Caddy through an `https` profile; the root deployment script validates `.env`, selects the profile, starts services, and waits for the application health check.

**Tech Stack:** Bash, Docker Engine 24+, Docker Compose v2.20+, Node.js 22 Alpine, Caddy 2 Alpine, Vitest, existing React/Express application.

## Global Constraints

- Target a Linux server with Docker and the `docker compose` subcommand installed.
- The application container listens on internal port `3000`; `APP_PORT` controls only the host mapping.
- `AMAP_WEB_SERVICE_KEY` is mandatory and may be injected only at container runtime.
- `.env`, `.env.*`, Git metadata, local dependencies, build output, reports, and local worktrees must not enter the Docker build context.
- IP access remains available at `http://<服务器 IP>:<APP_PORT>`.
- A non-empty `DOMAIN` enables Caddy on TCP 80/443 and automatic HTTPS without disabling IP access.
- Containers use `restart: unless-stopped`, named certificate volumes, and an `/api/health` health check.
- The deployment script must not source `.env`, echo the key, modify Git state, or pull code.
- Tests must exercise the real shell script and real container where practical; Docker itself is faked only in deployment-script unit tests.

---

## File Structure

- Create `.dockerignore`: keep secrets and local-only files outside the build context.
- Create `Dockerfile`: build the frontend and produce a non-root production image.
- Create `compose.yaml`: define the application and optional `https` profile.
- Create `Caddyfile`: reverse proxy the configured domain to `app:3000`.
- Create `deploy.sh`: validate configuration, deploy services, and wait for health.
- Create `tests/deploy/fixtures/valid.env`: non-secret runtime fixture used only by Docker smoke tests.
- Create `tests/deploy/docker-smoke.test.sh`: verify the real image, container, health endpoint, user, restart policy, and secret boundary.
- Create `tests/deploy/deploy-script.test.sh`: execute the real deployment script against an isolated fake Docker CLI.
- Create `tests/deploy/https-config.test.sh`: validate the real Compose profile and Caddy configuration.
- Modify `package.json` and `package-lock.json`: retain `tsx` as a runtime dependency and add deployment test scripts.
- Modify `.env.example`: replace container-internal `PORT` guidance with `APP_PORT` and optional `DOMAIN`.
- Modify `README.md`: document one-command deployment, update, IP limitations, HTTPS prerequisites, logs, and shutdown.

### Task 1: Build and Run the Production Application Container

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `tests/deploy/fixtures/valid.env`
- Create: `tests/deploy/docker-smoke.test.sh`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: existing `npm run build`, `npm start`, `GET /api/health`, and `AMAP_WEB_SERVICE_KEY`.
- Produces: Compose service `app`, internal port `3000`, a healthy container, and a production image containing `tsx` but not test/build dependencies.

- [ ] **Step 1: Write the failing Docker smoke test**

Create `tests/deploy/fixtures/valid.env`:

```dotenv
AMAP_WEB_SERVICE_KEY=deployment-smoke-test-key
```

Create `tests/deploy/docker-smoke.test.sh` with an isolated Compose project and guaranteed cleanup:

```bash
#!/usr/bin/env bash
set -euo pipefail

project="amap-deploy-test-$$"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose=(docker compose -p "$project")

cleanup() {
  (
    cd "$root"
    ENV_FILE=tests/deploy/fixtures/valid.env APP_PORT=0 \
      "${compose[@]}" down -v --remove-orphans
  ) >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$root"
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
```

The production change that makes this test pass is a real Compose `app` service backed by a healthy non-root image; a Docker mock cannot satisfy these assertions.

- [ ] **Step 2: Run the smoke test and verify RED**

Run:

```bash
bash tests/deploy/docker-smoke.test.sh
```

Expected: FAIL because `compose.yaml` and `Dockerfile` do not exist.

- [ ] **Step 3: Move `tsx` into production dependencies**

Run:

```bash
npm install --save-prod tsx@^4.23.1
```

Confirm `tsx` appears under `dependencies`, not `devDependencies`, so `npm prune --omit=dev` retains the production server runner.

- [ ] **Step 4: Add the Docker build boundary**

Create `.dockerignore`:

```dockerignore
.git
.github
.worktrees
.env
.env.*
node_modules
dist
coverage
playwright-report
test-results
docs
e2e
tests
```

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY shared ./shared
COPY server ./server
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000
CMD ["npm", "start"]
```

The Dockerfile copies explicit build inputs rather than `COPY . .`, providing a second secret boundary in addition to `.dockerignore`.

- [ ] **Step 5: Add the base Compose application service**

Create the initial `compose.yaml`:

```yaml
name: amap-charging-finder

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    env_file:
      - "${ENV_FILE:-.env}"
    environment:
      NODE_ENV: production
      PORT: "3000"
    ports:
      - "${APP_PORT:-3000}:3000"
    restart: unless-stopped
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          fetch('http://127.0.0.1:3000/api/health')
          .then((response) => { if (!response.ok) process.exit(1); })
          .catch(() => process.exit(1))
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 10s
```

- [ ] **Step 6: Run the Docker smoke test and verify GREEN**

Run:

```bash
bash tests/deploy/docker-smoke.test.sh
```

Expected: PASS; cleanup removes only the isolated `amap-deploy-test-$$` project and its test volumes.

- [ ] **Step 7: Commit the containerized application**

```bash
git add .dockerignore Dockerfile compose.yaml package.json package-lock.json tests/deploy
git commit -m "feat: containerize charging finder"
```

### Task 2: Add Safe One-Command IP Deployment

**Files:**
- Create: `deploy.sh`
- Create: `tests/deploy/deploy-script.test.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: `.env`, `compose.yaml`, Docker CLI, and Compose service `app`.
- Produces: executable `./deploy.sh`; exit code `0` only after the app reports `healthy`.

- [ ] **Step 1: Write failing deployment-script behavior tests**

Create `tests/deploy/deploy-script.test.sh`. The test must:

1. Copy the real `deploy.sh` and a minimal `compose.yaml` into a temporary project.
2. Place a fake executable named `docker` first in `PATH`.
3. Make the fake return success for `docker info`, `docker compose version`, and `docker compose up`.
4. Make `docker compose ps -q app` return `test-container`.
5. Make `docker inspect ... test-container` return `healthy`.
6. Record every Docker argument in `$DOCKER_CALLS`.

Start the test with a deliberate missing-feature assertion and a strict fake Docker boundary:

```bash
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
case "$*" in
  "info"|"compose version"|"compose up -d --build --remove-orphans"|\
  "compose --profile https up -d --build --remove-orphans"|\
  "compose --profile https rm --stop --force caddy")
    ;;
  "compose ps -q app"|"compose --profile https ps -q app")
    printf 'test-container\n'
    ;;
  inspect\ --format*test-container)
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
    PATH="$fake_bin:$PATH" DOCKER_CALLS="$calls" ./deploy.sh
  ) >"$output" 2>&1
}

# Missing .env
if run_deploy; then
  echo "missing .env must fail" >&2
  exit 1
fi
grep -F "缺少 .env" "$output"

# Empty key
printf 'AMAP_WEB_SERVICE_KEY=\\nAPP_PORT=3000\\n' >"$case_dir/.env"
if run_deploy; then
  echo "empty key must fail" >&2
  exit 1
fi
grep -F "AMAP_WEB_SERVICE_KEY" "$output"

# Example placeholder key
printf 'AMAP_WEB_SERVICE_KEY=YOUR_AMAP_WEB_SERVICE_KEY\\nAPP_PORT=3000\\n' \
  >"$case_dir/.env"
if run_deploy; then
  echo "placeholder key must fail" >&2
  exit 1
fi
grep -F "AMAP_WEB_SERVICE_KEY" "$output"

# Invalid port
printf 'AMAP_WEB_SERVICE_KEY=test-secret\\nAPP_PORT=70000\\n' >"$case_dir/.env"
if run_deploy; then
  echo "invalid port must fail" >&2
  exit 1
fi
grep -F "APP_PORT" "$output"

# Valid IP deployment
printf 'AMAP_WEB_SERVICE_KEY=test-secret\\nAPP_PORT=3100\\nDOMAIN=\\n' >"$case_dir/.env"
run_deploy
grep -Fx "compose up -d --build --remove-orphans" "$calls"
grep -F "http://" "$output"
! grep -F "test-secret" "$output"
! grep -F "test-secret" "$calls"
```

The production mutation caught by these tests is skipping validation, sourcing/printing `.env`, invoking the wrong Compose command, or reporting success before health is confirmed.

- [ ] **Step 2: Run the script test and verify RED**

Run:

```bash
bash tests/deploy/deploy-script.test.sh
```

Expected: FAIL with `deploy.sh must exist`.

- [ ] **Step 3: Implement the minimal safe deployment script**

Create `deploy.sh` with:

```bash
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

docker compose up -d --build --remove-orphans

container_id="$(docker compose ps -q app)"
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

server_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
server_ip="${server_ip:-<服务器IP>}"
printf '部署成功： http://%s:%s\n' "$server_ip" "$app_port"
```

Set the executable bit:

```bash
chmod +x deploy.sh tests/deploy/deploy-script.test.sh tests/deploy/docker-smoke.test.sh
```

- [ ] **Step 4: Add deployment tests to the normal check**

Add scripts:

```json
{
  "test:deploy": "bash tests/deploy/deploy-script.test.sh",
  "check": "npm run test && npm run test:deploy && npm run typecheck && npm run build && npm run verify:no-key"
}
```

- [ ] **Step 5: Run the script and existing tests**

Run:

```bash
npm run test:deploy
npm run test
```

Expected: deployment behavior cases PASS and all existing Vitest suites PASS.

- [ ] **Step 6: Commit the IP deployment workflow**

```bash
git add deploy.sh package.json tests/deploy/deploy-script.test.sh
git commit -m "feat: add one-command server deployment"
```

### Task 3: Add Optional Domain HTTPS

**Files:**
- Create: `Caddyfile`
- Create: `tests/deploy/https-config.test.sh`
- Modify: `compose.yaml`
- Modify: `deploy.sh`
- Modify: `tests/deploy/deploy-script.test.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: optional `DOMAIN` from `.env`, healthy Compose service `app`.
- Produces: Compose profile `https`, service `caddy`, ports 80/443, volumes `caddy_data` and `caddy_config`, and `https://<DOMAIN>` output.

- [ ] **Step 1: Add failing HTTPS profile tests**

Create `tests/deploy/https-config.test.sh`:

```bash
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
```

Extend `tests/deploy/deploy-script.test.sh`:

```bash
# Domain deployment enables the profile.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\\nAPP_PORT=3100\\nDOMAIN=charge.example.com\\n' \
  >"$case_dir/.env"
run_deploy
grep -Fx "compose --profile https up -d --build --remove-orphans" "$calls"
grep -F "https://charge.example.com" "$output"

# Removing DOMAIN stops the old optional proxy without deleting named volumes.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\\nAPP_PORT=3100\\nDOMAIN=\\n' \
  >"$case_dir/.env"
run_deploy
grep -Fx "compose --profile https rm --stop --force caddy" "$calls"

# URL, port, and path are rejected instead of being passed to Caddy.
printf 'AMAP_WEB_SERVICE_KEY=test-secret\\nAPP_PORT=3100\\nDOMAIN=https://charge.example.com\\n' \
  >"$case_dir/.env"
if run_deploy; then
  echo "DOMAIN with scheme must fail" >&2
  exit 1
fi
grep -F "DOMAIN" "$output"
```

These tests catch a missing profile, invalid Caddyfile, stale Caddy service after removing a domain, or an HTTPS URL that does not match the configured domain.

- [ ] **Step 2: Run HTTPS tests and verify RED**

Run:

```bash
bash tests/deploy/https-config.test.sh
bash tests/deploy/deploy-script.test.sh
```

Expected: FAIL because the `caddy` service, `Caddyfile`, and domain branch do not exist.

- [ ] **Step 3: Add Caddy configuration and Compose profile**

Create `Caddyfile`:

```caddyfile
{$DOMAIN} {
	encode zstd gzip
	reverse_proxy app:3000
}
```

Extend `compose.yaml`:

```yaml
  caddy:
    image: caddy:2-alpine
    profiles:
      - https
    environment:
      DOMAIN: "${DOMAIN:-}"
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 4: Implement domain selection without sourcing `.env`**

After port validation, read and validate the domain:

```bash
domain="$(read_env_value DOMAIN)"
if [[ -n "$domain" && ! "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  fail "DOMAIN 必须是纯域名，不能包含 http://、端口或路径"
fi

compose_args=()
if [[ -n "$domain" ]]; then
  compose_args=(--profile https)
else
  docker compose --profile https rm --stop --force caddy >/dev/null 2>&1 || true
fi

docker compose "${compose_args[@]}" up -d --build --remove-orphans
```

Reuse `compose_args` for `docker compose ps -q app`. After application health succeeds:

```bash
if [[ -n "$domain" ]]; then
  printf 'HTTPS 地址： https://%s\n' "$domain"
  printf '证书状态： docker compose --profile https logs caddy\n'
fi
```

- [ ] **Step 5: Add HTTPS validation to the normal deployment test command**

Set the executable bit and update:

```json
{
  "test:deploy": "bash tests/deploy/deploy-script.test.sh && bash tests/deploy/https-config.test.sh"
}
```

- [ ] **Step 6: Run HTTPS and deployment tests and verify GREEN**

Run:

```bash
npm run test:deploy
```

Expected: all IP, domain, profile-removal, Compose, and Caddy validation cases PASS.

- [ ] **Step 7: Commit optional HTTPS support**

```bash
git add Caddyfile compose.yaml deploy.sh package.json tests/deploy
git commit -m "feat: add automatic domain https"
```

### Task 4: Document, Audit, and Publish the Deployment Workflow

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `tests/deploy/docker-smoke.test.sh`

**Interfaces:**
- Consumes: completed `./deploy.sh`, Compose services, and the existing key scanner.
- Produces: copy-paste deployment documentation and fresh evidence that the repository, build context, image, runtime, and application remain safe.

- [ ] **Step 1: Extend the Docker smoke test to verify `.dockerignore` behavior**

Before the application smoke test cleanup finishes, create an isolated temporary build context:

```bash
context_dir="$(mktemp -d)"
context_image="amap-context-test-$$"
trap 'rm -rf "$context_dir"; docker image rm -f "$context_image" >/dev/null 2>&1 || true; cleanup' EXIT

cp "$root/.dockerignore" "$context_dir/.dockerignore"
printf 'must-not-enter-build-context\n' >"$context_dir/.env"
printf 'safe\n' >"$context_dir/visible.txt"
cat >"$context_dir/Dockerfile" <<'DOCKERFILE'
FROM alpine:3.22
COPY . /context
RUN test ! -e /context/.env && test -e /context/visible.txt
DOCKERFILE
docker build -t "$context_image" "$context_dir"
```

The production mutation caught is removing or weakening the `.env` rule in `.dockerignore`.

- [ ] **Step 2: Verify the new security assertion RED/GREEN**

Temporarily remove the `.env` line from a copy of `.dockerignore` in the test context and confirm the Docker build fails at `test ! -e /context/.env`; restore the production `.dockerignore` copy and confirm:

```bash
bash tests/deploy/docker-smoke.test.sh
```

Expected: PASS with the production ignore rules.

- [ ] **Step 3: Update the server configuration template**

Replace `.env.example` with:

```dotenv
AMAP_WEB_SERVICE_KEY=
PORT=3000
APP_PORT=3000
DOMAIN=
```

Compose overrides the application container with internal `PORT=3000`. The template's `PORT` remains available to the existing non-Docker `npm run dev` and `npm start` workflows, while `APP_PORT` controls only the Docker host mapping.

- [ ] **Step 4: Add complete deployment documentation**

Add a `Docker Compose 一键部署` section to `README.md` containing:

```bash
git clone https://github.com/vissong/amap-charging-finder.git
cd amap-charging-finder
cp .env.example .env
# 编辑 .env，至少填写 AMAP_WEB_SERVICE_KEY
./deploy.sh
```

Document:

- IP URL: `http://服务器IP:APP_PORT`.
- Domain setup: point DNS to the server, open TCP 80/443, set `DOMAIN`, rerun `./deploy.sh`.
- Most mobile browsers deny geolocation on HTTP IP URLs; named search still works, but nearby/forward positioning requires HTTPS.
- Update: `git pull --ff-only && ./deploy.sh`.
- Status: `docker compose ps`.
- App logs: `docker compose logs -f app`.
- HTTPS logs: `docker compose --profile https logs -f caddy`.
- Stop without deleting certificates: `docker compose --profile https down`.
- Remove containers and certificate volumes only when intentionally resetting HTTPS: `docker compose --profile https down -v`.

- [ ] **Step 5: Run the full fresh verification suite**

Run:

```bash
npm run check
npm run e2e
npm run test:deploy
bash tests/deploy/docker-smoke.test.sh
git diff --check
git status --short
```

Expected evidence:

- Vitest reports all suites and tests passing.
- TypeScript exits `0`.
- Vite production build exits `0`.
- Key scanner reports no local key in tracked files or `dist`.
- Playwright reports all mobile portrait, mobile landscape, and car-display tests passing.
- Deployment-script, Compose, and Caddy validation pass.
- The real Docker container becomes healthy and returns `{"status":"ok"}`.
- The image and image history do not contain the deployment fixture key.
- `git diff --check` emits no output.
- `git status --short` lists only the intended deployment files.

- [ ] **Step 6: Repeat the actual-key history and artifact scan without printing the key**

Read the local ignored `.env` in-process and use its value only as a search needle. Verify tracked files, `dist`, and `git log --all -S<key>` return no leak; output only a boolean result or a success sentence.

- [ ] **Step 7: Commit documentation and final security tests**

```bash
git add .env.example README.md tests/deploy/docker-smoke.test.sh
git commit -m "docs: add server deployment guide"
```

- [ ] **Step 8: Push and verify GitHub**

```bash
git push origin main
gh repo view vissong/amap-charging-finder \
  --json url,visibility,defaultBranchRef
git ls-remote --heads origin main
```

Confirm the remote `main` SHA matches local `HEAD`, the repository remains private, and `.env` is absent from `git ls-tree -r --name-only origin/main`.
