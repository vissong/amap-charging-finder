# Docker Compose 一键部署设计

## 1. 目标

在仓库内提供一套可重复执行的一键部署工具，让使用者在一台已安装 Docker 与 Docker Compose 的 Linux 服务器上完成构建、启动、更新和健康检查。

部署同时支持两种访问方式：

- 未配置域名时，通过 `http://<服务器 IP>:<APP_PORT>` 访问。
- 配置域名时，在保留 IP 端口访问的同时，由 Caddy 提供域名 HTTPS，并自动申请和续期证书。

真实的高德 Web Service Key 只存在于服务器本地 `.env`，不得进入 Git、Docker 构建上下文、镜像层、前端产物或部署日志。

## 2. 使用流程

首次部署：

```bash
git clone https://github.com/vissong/amap-charging-finder.git
cd amap-charging-finder
cp .env.example .env
# 编辑 .env
./deploy.sh
```

后续更新：

```bash
git pull --ff-only
./deploy.sh
```

`deploy.sh` 不自行修改 Git 工作区，也不自动拉取代码。这样可以避免覆盖服务器上的未提交修改；部署始终基于使用者当前检出的版本。

## 3. 配置

`.env.example` 提供以下字段：

```dotenv
AMAP_WEB_SERVICE_KEY=
PORT=3000
APP_PORT=3000
DOMAIN=
```

- `AMAP_WEB_SERVICE_KEY`：必填，只在运行时注入应用容器。
- `PORT`：可选，只用于不经过 Docker 的本地开发，默认 `3000`。
- `APP_PORT`：可选，服务器对外暴露的 HTTP 端口，默认 `3000`。
- `DOMAIN`：可选；非空时启用 Caddy HTTPS profile。

应用容器内部固定监听 `3000`，不复用宿主机的 `APP_PORT`。这使容器网络和健康检查保持稳定，宿主机端口只负责映射。

## 4. 容器架构

### 4.1 应用容器

`Dockerfile` 使用多阶段构建：

1. 基于固定 Node.js LTS 主版本安装锁定依赖并执行前端生产构建。
2. 移除仅用于测试和构建的开发依赖。
3. 将运行依赖、服务端源码和 `dist` 复制到精简运行镜像。
4. 使用非 root 用户启动 `npm start`。

当前生产启动命令依赖 `tsx` 执行服务端 TypeScript，因此 `tsx` 作为运行依赖保留在最终镜像中；Playwright、Vitest、TypeScript 编译器等开发依赖不进入运行镜像。

应用容器：

- 设置 `NODE_ENV=production` 与内部 `PORT=3000`。
- 通过 Compose `env_file` 在运行时读取 `AMAP_WEB_SERVICE_KEY`。
- 使用 `/api/health` 作为容器健康检查。
- 使用 `restart: unless-stopped` 在服务器或 Docker 重启后自动恢复。
- 将宿主机 `${APP_PORT:-3000}` 映射到容器 `3000`，始终保留 IP 直连能力。

### 4.2 Caddy 容器

Caddy 作为 `https` profile 中的可选服务：

- `DOMAIN` 为空时，部署脚本不启用该 profile，只启动应用容器。
- `DOMAIN` 非空时，部署脚本增加 `--profile https`。
- Caddy 等待应用容器健康后启动，反向代理到 `app:3000`。
- 映射宿主机 `80` 和 `443`。
- 使用命名卷持久化证书与 Caddy 状态。
- 对静态和 API 响应启用安全的 gzip/zstd 压缩。

域名模式要求 DNS 已指向服务器公网 IP，且防火墙允许 TCP 80 和 443。条件不满足时，应用容器仍可通过 `IP:APP_PORT` 访问，但 Caddy 证书签发会失败并在容器日志中说明原因。

## 5. 一键部署脚本

仓库根目录的 `deploy.sh` 负责：

1. 确认当前目录包含 `compose.yaml`。
2. 确认 `docker` 与 `docker compose` 可用。
3. 确认 `.env` 存在。
4. 确认 `AMAP_WEB_SERVICE_KEY` 非空且不是示例占位值。
5. 校验 `APP_PORT` 为 `1` 至 `65535` 的整数。
6. 根据 `DOMAIN` 是否为空选择是否启用 `https` profile。
7. 执行 `docker compose up -d --build --remove-orphans`。
8. 在限定时间内轮询应用容器健康状态。
9. 成功时打印 IP 访问地址；配置域名时同时打印 HTTPS 地址。
10. 失败时返回非零退出码，并打印不含高德 Key 的排查命令。

脚本不得 `source .env`，避免把配置文件内容作为 shell 代码执行。它只读取明确允许的变量，并且任何输出都不得包含 `AMAP_WEB_SERVICE_KEY` 的值。

## 6. Key 与构建安全

- `.env` 和 `.env.*` 继续由 `.gitignore` 忽略，只有 `.env.example` 可提交。
- `.dockerignore` 排除 `.env`、`.env.*`、`.git`、`node_modules`、`dist`、测试报告和本地工作树。
- Dockerfile 不声明 Key 对应的 `ARG` 或 `ENV`。
- Compose 只在容器运行阶段注入 Key，不把 Key 传给构建阶段。
- 现有 Key 泄漏扫描继续检查跟踪文件与 `dist`，并增加部署资产的静态安全断言。
- 部署脚本的错误信息只报告变量缺失，不回显变量值。

## 7. 错误处理

- Docker 或 Compose 缺失：部署前立即失败，并提示安装要求。
- `.env` 或 Key 缺失：部署前立即失败，不启动任何容器。
- 端口无效：部署前立即失败。
- 镜像构建失败：保留 Docker 构建输出并返回非零状态。
- 应用健康检查超时：展示 `docker compose ps` 与应用日志查看命令，返回非零状态。
- HTTPS profile 启动但证书未签发：应用健康不受影响；输出 Caddy 日志查看命令与 DNS、80/443 检查提示。

重复执行部署脚本必须是幂等的：已有容器被更新到当前镜像，没有变化时保持运行，不创建重复服务或匿名证书卷。

## 8. 验证策略

### 8.1 自动化测试

- 部署脚本在缺少 `.env`、缺少 Key、无效端口时返回非零状态。
- 部署脚本在无域名时生成基础 Compose 启动命令。
- 部署脚本在有域名时启用 `https` profile。
- 测试中的 Docker 命令使用隔离的假执行程序，验证参数与输出，不操作真实服务器容器。
- `docker compose config` 分别验证无域名与有域名配置。
- 构建 Docker 镜像并确认容器能通过 `/api/health`。
- 验证镜像历史、镜像环境和构建上下文不包含真实高德 Key。
- 继续运行现有单元测试、类型检查、前端构建和 Key 泄漏扫描。

### 8.2 完成标准

- 服务器准备 `.env` 后只需执行 `./deploy.sh` 即可部署。
- IP 模式能够通过配置端口访问，并在 Docker 重启后自动恢复。
- 域名模式能够通过 HTTPS 访问，证书由 Caddy 自动管理。
- 应用健康检查失败时脚本不会误报成功。
- 高德 Key 不存在于 Git、构建上下文、镜像层、前端产物和部署输出中。
- README 清楚说明 IP HTTP 无法在多数手机浏览器中使用定位，完整定位功能需要域名 HTTPS。
