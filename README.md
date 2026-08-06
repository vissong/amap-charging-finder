# 前路充电

适合手机和汽车车机浏览器使用的高德充电站查询 H5。

## 功能

- 按当前位置查询 3、5、10、20 或 50 公里内的充电站。
- 附近查询自动翻页，最多展示 200 个站点；数量后的“+”表示结果已达到查询上限。
- 按服务区、充电站或地点名称进行全国搜索；例如输入“孟村服务区”会自动按“孟村服务区 充电站”查询。
- 持续定位并结合速度、移动轨迹推算行进方向。
- “前方推荐”模式过滤明显位于车后的站点。
- 根据高德逆地理编码识别高速场景，并优先推荐前方服务区内的充电站。
- 展示高德公开 POI 字段：名称、地址、距离、方向、分类、营业时间、电话、别名和入口/出口等。
- 从详情页拉起高德地图 App；未安装 App 时由高德 URI 页面承接。

列表距离不采用高德响应中的 `distance`：系统先把浏览器 WGS84 定位转换为高德 GCJ-02 坐标，再根据当前位置和 POI 坐标使用 Haversine 公式计算球面直线距离，并按所选半径进行二次过滤。该距离不是道路导航里程，实际路线以高德导航为准。

高德公开地点搜索接口不提供充电枪实时忙闲、枪数、功率、价格和运营商品牌等标准字段，因此页面不编造这些数据，并明确引导用户到高德地图查看实时详情。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
cp .env.example .env
```

在 `.env` 中配置高德 Web 服务 Key：

```dotenv
AMAP_WEB_SERVICE_KEY=你的高德Web服务Key
PORT=3000
```

启动开发环境：

```bash
npm run dev
```

浏览器访问 `http://localhost:3000`。桌面浏览器通常允许 localhost 定位；部署到其他域名时必须使用 HTTPS，否则浏览器会拒绝地理位置权限。

## 生产运行

```bash
npm run build
npm start
```

服务端同时托管构建后的 H5 和 `/api` 代理。请只在服务器环境变量中配置高德 Key，不要把 Key 写进前端源码或构建产物。

健康检查：

```text
GET /api/health
```

核心代理接口：

```text
GET /api/charging-stations?lng=116.4&lat=39.9&radius=5000
GET /api/search-stations?keywords=孟村服务区
GET /api/service-areas?lng=116.4&lat=39.9&radius=5000
GET /api/road-context?lng=116.4&lat=39.9
```

## Docker Compose 一键部署

服务器需已安装 Git、Docker Engine 和 Docker Compose 插件。克隆项目并准备配置：

```bash
git clone https://github.com/vissong/amap-charging-finder.git
cd amap-charging-finder
cp .env.example .env
# 编辑 .env，至少填写 AMAP_WEB_SERVICE_KEY
./deploy.sh
```

`PORT` 保留给非 Docker 的 `npm run dev` 和 `npm start`；Docker 容器内部固定使用 3000 端口，`APP_PORT` 仅控制服务器对外暴露的端口。

访问方式通过 `.env` 选择：

```dotenv
# 域名 HTTPS：先将域名 DNS 解析到服务器
DOMAIN=charge.example.com
PUBLIC_IP=

# 公网 IP HTTPS：填写固定公网 IPv4 或 IPv6，不要填写协议、端口或路径
DOMAIN=
PUBLIC_IP=203.0.113.10

# 纯 HTTP IP：两项都留空
DOMAIN=
PUBLIC_IP=
```

`DOMAIN` 与 `PUBLIC_IP` 只能设置一个。域名或公网 IP HTTPS 都要求 TCP 80 和 443 能从公网直接到达服务器；公网 IP 模式不能填写内网地址、动态出口地址或负载均衡后的错误地址。两项都为空时，使用 `http://服务器IP:APP_PORT` 访问。

公网 IP 证书由 Let’s Encrypt 的 `shortlived` profile 签发，支持 IPv4 和 IPv6，有效期约 160 小时，由 Caddy 自动续期。部署成功后可通过 `docker compose --profile https logs caddy` 查看签发和续期状态。

云服务器的公网 IP 常通过 NAT 映射到实例内网地址。项目会把 `PUBLIC_IP`
同时配置为 Caddy 的默认 SNI，保证浏览器访问裸 IP（ClientHello 不携带
SNI）时仍能选中正确证书。部署脚本会在宣布成功前实际检查一次 IP HTTPS
握手和应用健康接口。

### HTTPS 与定位权限

有效且受浏览器信任的域名 HTTPS **不会妨碍定位**，而是移动浏览器开放 Geolocation API 所需的安全上下文。有效的公网 IP HTTPS 同样属于安全上下文。HTTP 公网 IP 通常只能使用名称搜索，“附近”和“前方推荐”会因定位 API 受限而不可用。

HTTPS 只满足安全前提，最终能否获得位置还取决于：

- 用户是否允许该站点访问位置；
- 手机或车机系统定位服务是否开启；
- 浏览器或车机 WebView 是否获得系统定位权限并实现 Geolocation；
- 页面若被跨域 iframe 嵌入，上层页面是否通过 `Permissions-Policy` 和 `allow="geolocation"` 放行；
- 设备当前是否能获得 GPS、网络或融合定位结果。

相关浏览器规则可参考 [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) 和 [Permissions-Policy: geolocation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation)。

常用运维命令：

```bash
# 更新
git pull --ff-only && ./deploy.sh

# 查看状态与应用日志
docker compose ps
docker compose logs -f app

# 查看 HTTPS 反向代理日志
docker compose --profile https logs -f caddy

# 确认使用支持公网 IP 证书的 Caddy 版本
docker compose --profile https exec caddy caddy version

# 停止服务，保留证书
docker compose --profile https down

# 仅在有意重置 HTTPS 时，删除容器和证书卷
docker compose --profile https down -v
```

如果浏览器提示 `ERR_SSL_PROTOCOL_ERROR`，先更新代码并重新部署：

```bash
git pull --ff-only
docker compose --profile https pull caddy
./deploy.sh
```

若部署脚本报告 IP HTTPS 握手失败，检查云安全组和系统防火墙是否同时放行
TCP 80、TCP 443，并运行
`docker compose --profile https logs --tail=100 caddy` 查看证书签发错误。

## 验证

```bash
npm run check
npm run e2e
```

`npm run check` 会执行单元/组件/接口测试、TypeScript 检查、生产构建和 Key 泄漏扫描。端到端测试覆盖手机竖屏、手机横屏与 1280×720 车机屏。

首次运行端到端测试前，如本机还没有 Playwright Chromium：

```bash
npx playwright install chromium
```

## 定位与推荐边界

- 浏览器定位按 WGS84 处理，在常用 GCJ-02 有效范围内转换后再查询高德 POI、计算距离和方向。产品服务范围为中国大陆，不提供境外充电站查询或精确国界判断。
- 方向优先采用设备定位提供的 heading；设备未提供时，使用连续轨迹估算。
- 高速识别采用道路名称、地址关键词和道路距离的启发式判断，不等同于地图匹配或导航级车道定位。
- “前方”是相对当前航向的空间筛选，实际道路可达性和行驶路线以高德导航为准。
- 页面只在本次会话中处理定位数据，不持久化位置轨迹。
