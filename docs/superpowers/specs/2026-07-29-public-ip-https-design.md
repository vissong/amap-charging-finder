# 公网 IP HTTPS 支持设计

## 目标

在保留现有域名自动 HTTPS 和纯 IP HTTP 部署方式的同时，允许用户为固定公网 IPv4 或 IPv6 申请浏览器可信的 HTTPS 证书，使移动端和车机浏览器能在安全上下文中调用定位能力。

## 配置模型

- `DOMAIN`：可选，配置域名自动 HTTPS。
- `PUBLIC_IP`：可选，配置公网 IPv4 或 IPv6 自动 HTTPS。
- `DOMAIN` 与 `PUBLIC_IP` 不能同时设置。
- 两者都为空时，继续通过 `http://服务器IP:APP_PORT` 访问。

不自动探测公网 IP。云服务器、多网卡、NAT 和负载均衡环境中的自动探测结果不可靠，显式配置更容易验证和审计。

## 证书与代理

域名模式继续使用现有 Caddy 配置和默认 ACME 证书策略。公网 IP 模式使用独立的 Caddy 配置，并显式选择 Let’s Encrypt `shortlived` ACME profile。IP 证书有效期约 160 小时，Caddy 负责自动续期，证书数据继续保存在现有命名卷中。

Docker Compose 通过部署脚本传入确定后的 Caddy 配置文件和 HTTPS 主机。部署脚本负责：

1. 读取并校验 `.env`。
2. 拒绝同时设置 `DOMAIN` 和 `PUBLIC_IP`。
3. 对域名执行现有标签校验，对 IP 执行 IPv4/IPv6 格式校验。
4. 仅在配置了域名或公网 IP 时启用 `https` profile。
5. 在成功输出中显示实际 HTTPS 地址和短期证书提示。

## 定位行为

页面通过有效、浏览器信任的域名 HTTPS 或 IP HTTPS 打开时，属于安全上下文，可调用 Geolocation API。能否最终返回位置仍取决于：

- 用户是否授予站点定位权限；
- 操作系统和浏览器/车机 WebView 的定位开关；
- 设备是否能提供 GPS、网络或融合定位结果；
- 页面是否被嵌入 iframe，以及上层页面是否通过 Permissions Policy 允许定位。

证书过期、证书不受信任或 HTTPS 被浏览器判定不安全时，不应视为可用的安全上下文。

## 测试

- 部署脚本行为测试：域名、IPv4、IPv6、冲突配置、非法 IP、纯 HTTP 模式。
- Caddy 配置测试：域名配置和 IP 短期证书配置都能被当前镜像解析。
- Compose 配置测试：选择的 Caddy 配置文件、环境变量和 HTTPS profile 正确。
- 现有单元测试、端到端测试、类型检查、构建和 Key 泄漏扫描继续通过。

