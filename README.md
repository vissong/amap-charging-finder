# 前路充电

适合手机和汽车车机浏览器使用的高德充电站查询 H5。

## 功能

- 按当前位置查询 3、5、10、20 或 50 公里内的充电站。
- 按服务区、充电站或地点名称进行全国搜索；例如输入“孟村服务区”会自动按“孟村服务区 充电站”查询。
- 持续定位并结合速度、移动轨迹推算行进方向。
- “前方推荐”模式过滤明显位于车后的站点。
- 根据高德逆地理编码识别高速场景，并优先推荐前方服务区内的充电站。
- 展示高德公开 POI 字段：名称、地址、距离、方向、分类、营业时间、电话、别名和入口/出口等。
- 从详情页拉起高德地图 App；未安装 App 时由高德 URI 页面承接。

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

- 方向优先采用设备定位提供的 heading；设备未提供时，使用连续轨迹估算。
- 高速识别采用道路名称、地址关键词和道路距离的启发式判断，不等同于地图匹配或导航级车道定位。
- “前方”是相对当前航向的空间筛选，实际道路可达性和行驶路线以高德导航为准。
- 页面只在本次会话中处理定位数据，不持久化位置轨迹。
