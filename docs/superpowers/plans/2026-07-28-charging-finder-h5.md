# 高德充电站 H5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个使用高德真实 POI 数据、适配手机与车机、支持附近搜索和行进方向推荐的充电站 H5。

**Architecture:** React/Vite 前端使用浏览器 Geolocation API 采集位置并在本地计算速度、方向和推荐排序；Express 服务端代理高德 Web Service API、归一化响应并保护 Key。生产环境由同一 Node 进程提供 `/api` 与前端静态文件。

**Tech Stack:** Node.js 22、React 19、TypeScript 7、Vite 8、Express 5、Zod 4、Vitest 4、Testing Library、Playwright 1.62

## Global Constraints

- 只展示高德 Web Service API 实际返回的数据，不模拟品牌、枪数、功率、价格或忙闲状态。
- Web Service Key 只能存在于被 Git 忽略的服务端 `.env`，不得进入前端源码、构建产物或提交记录。
- 充电站使用 POI 类型 `011100`；高速服务区使用 POI 类型 `180300`。
- 搜索半径只允许 `3000、5000、10000、20000、50000` 米。
- 前方候选限定在平滑行进方向左右各 `60°`。
- 生产定位要求 HTTPS；localhost 仅用于本地开发。
- 界面采用深色、高对比、工业仪表盘风格，适配 390×844、844×390 和 1280×720。
- 每项业务行为遵循测试先行：先看到目标测试因功能缺失而失败，再写最小实现。

---

## File Map

```text
.
├── .env.example                         # 服务端环境变量示例
├── .gitignore                           # 忽略真实 Key、构建与测试产物
├── .impeccable.md                       # 已确认的用户、场景和视觉方向
├── package.json                         # 依赖与验证命令
├── tsconfig.json                        # 前后端共享 TypeScript 配置
├── vite.config.ts                       # Vite、Vitest 与开发代理配置
├── playwright.config.ts                 # 手机与车机 E2E 项目
├── index.html                           # H5 入口
├── scripts/
│   └── verify-no-key.ts                 # 检查 Key 未进入源码或构建产物
├── shared/
│   ├── contracts.ts                     # 前后端 API 契约
│   ├── geo.ts                           # 距离、方位和角度算法
│   ├── motion.ts                        # 行进状态与方向平滑
│   ├── highway.ts                       # 高速状态判断
│   ├── recommendation.ts                # 服务区关联与推荐排序
│   └── amap-uri.ts                      # 高德跳转 URI
├── server/
│   ├── config.ts                        # 环境变量读取
│   ├── amap-client.ts                   # 高德 HTTP 客户端
│   ├── normalize.ts                     # 上游响应归一化
│   ├── routes.ts                        # `/api` 路由
│   ├── app.ts                           # 可注入依赖的 Express App
│   └── index.ts                         # 开发/生产启动入口
├── src/
│   ├── main.tsx                         # React 启动入口
│   ├── App.tsx                          # 页面状态编排
│   ├── styles.css                       # 视觉系统与响应式布局
│   ├── lib/api.ts                       # 前端 API 客户端
│   ├── hooks/useDriveTracker.ts         # 浏览器持续定位
│   ├── hooks/useChargingSearch.ts       # 查询取消、刷新与组合
│   └── components/
│       ├── StatusBar.tsx                # 定位、速度、道路和高速状态
│       ├── RoadRadar.tsx                # 相对方向雷达
│       ├── ModeControls.tsx              # 模式和范围切换
│       ├── StationList.tsx               # 结果和推荐列表
│       ├── StationCard.tsx               # 可展开真实字段详情
│       └── StateMessage.tsx              # 权限、空结果和错误状态
├── tests/
│   ├── fixtures/amap.ts                 # 固定高德响应夹具
│   ├── shared/*.test.ts                 # 算法单元测试
│   ├── server/*.test.ts                 # 服务端契约测试
│   └── ui/*.test.tsx                    # 组件行为测试
└── e2e/
    └── charging-finder.spec.ts           # 手机与车机端到端流程
```

### Task 1: Runtime Foundation and Secret Boundary

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env`（本地文件，不提交）
- Create: `server/config.ts`
- Create: `scripts/verify-no-key.ts`
- Create: `tests/setup.ts`
- Test: `tests/server/config.test.ts`

**Interfaces:**
- Produces: `getServerConfig(env?: NodeJS.ProcessEnv): { amapWebServiceKey: string; port: number }`
- Produces: `npm run test`、`npm run typecheck`、`npm run build`、`npm run verify:no-key`

- [ ] **Step 1: Create package metadata and the failing config test**

`package.json` 固定以下脚本和依赖边界：

```json
{
  "name": "amap-charging-finder",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch server/index.ts",
    "build": "vite build",
    "start": "NODE_ENV=production tsx server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test",
    "verify:no-key": "tsx scripts/verify-no-key.ts",
    "check": "npm run test && npm run typecheck && npm run build && npm run verify:no-key"
  }
}
```

`tsconfig.json` 同时覆盖浏览器、Node 和测试代码，并启用严格检查：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "useDefineForClassFields": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "server", "shared", "scripts", "tests", "e2e", "*.ts"]
}
```

`vite.config.ts` 固定浏览器入口、测试环境和覆盖范围：

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["shared/**/*.ts", "server/**/*.ts", "src/**/*.{ts,tsx}"]
    }
  }
});
```

`tests/setup.ts` 只注册 DOM 断言：

```ts
import "@testing-library/jest-dom/vitest";
```

测试先定义缺失 Key、合法端口和默认端口行为：

```ts
import { describe, expect, it } from "vitest";
import { getServerConfig } from "../../server/config";

describe("getServerConfig", () => {
  it("rejects startup when the AMap Web Service key is missing", () => {
    expect(() => getServerConfig({})).toThrow("AMAP_WEB_SERVICE_KEY");
  });

  it("uses port 3000 by default", () => {
    expect(getServerConfig({ AMAP_WEB_SERVICE_KEY: "test-key" }).port).toBe(3000);
  });

  it("rejects a non-numeric port", () => {
    expect(() =>
      getServerConfig({ AMAP_WEB_SERVICE_KEY: "test-key", PORT: "abc" }),
    ).toThrow("PORT");
  });
});
```

- [ ] **Step 2: Install dependencies and verify RED**

Run:

```bash
npm install react@19.2.8 react-dom@19.2.8 express@5.2.1 express-rate-limit@8.6.1 zod@4.4.3 lucide-react@1.27.0 dotenv
npm install -D typescript@7.0.2 tsx@4.23.1 vite@8.1.5 @vitejs/plugin-react@6.0.4 vitest@4.1.10 jsdom@30 @types/node @types/express @types/react @types/react-dom supertest@7.2.2 @types/supertest @testing-library/react@16.3.2 @testing-library/jest-dom @testing-library/user-event @playwright/test@1.62.0
npm test -- tests/server/config.test.ts
```

Expected: FAIL because `server/config.ts` does not exist.

- [ ] **Step 3: Implement server config and ignored local secret**

`server/config.ts`:

```ts
export interface ServerConfig {
  amapWebServiceKey: string;
  port: number;
}

export function getServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const key = env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!key) throw new Error("AMAP_WEB_SERVICE_KEY is required");

  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return { amapWebServiceKey: key, port };
}
```

`.gitignore` 必须包含：

```gitignore
node_modules/
dist/
playwright-report/
test-results/
coverage/
.env
.env.*
!.env.example
```

`.env.example` 只包含变量名：

```dotenv
AMAP_WEB_SERVICE_KEY=
PORT=3000
```

真实 Key 写入本地 `.env`，随后运行 `git status --short` 确认 `.env` 未出现。

- [ ] **Step 4: Add the no-secret verifier**

`scripts/verify-no-key.ts` 读取 `.env` 中的真实值，扫描 `git ls-files` 与 `dist`；失败只输出命中的文件名，不输出 Key：

```ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const envText = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const key = /^AMAP_WEB_SERVICE_KEY=(.+)$/m.exec(envText)?.[1]?.trim();
if (!key) throw new Error("Local .env is missing AMAP_WEB_SERVICE_KEY");

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}

const leaked = [...tracked, ...walk("dist")].filter((path) =>
  readFileSync(path).includes(key),
);
if (leaked.length) {
  throw new Error(`AMap key leaked into: ${leaked.join(", ")}`);
}
console.log("AMap key is absent from tracked files and dist");
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npm test -- tests/server/config.test.ts
npm run typecheck
npm run verify:no-key
git add package.json package-lock.json tsconfig.json vite.config.ts .gitignore .env.example server/config.ts scripts/verify-no-key.ts tests/server/config.test.ts
git commit -m "chore: initialize charging finder runtime"
```

Expected: config tests pass, typecheck exits 0, secret check reports no leak, `.env` remains untracked and ignored.

### Task 2: Geometry and Motion State

**Files:**
- Create: `shared/contracts.ts`
- Create: `shared/geo.ts`
- Create: `shared/motion.ts`
- Test: `tests/shared/geo.test.ts`
- Test: `tests/shared/motion.test.ts`

**Interfaces:**
- Produces: `haversineMeters(a, b): number`
- Produces: `bearingDegrees(from, to): number`
- Produces: `smallestAngleDifference(a, b): number`
- Produces: `isAhead(currentHeading, targetBearing, halfAngle = 60): boolean`
- Produces: `deriveMotion(samples, previousState): MotionSnapshot`

- [ ] **Step 1: Write failing geometry tests**

```ts
import { describe, expect, it } from "vitest";
import {
  bearingDegrees,
  haversineMeters,
  isAhead,
  smallestAngleDifference,
} from "../../shared/geo";

describe("geo primitives", () => {
  it("calculates a known short distance", () => {
    expect(
      haversineMeters(
        { lng: 116.397499, lat: 39.908722 },
        { lng: 116.407499, lat: 39.908722 },
      ),
    ).toBeGreaterThan(840);
  });

  it("handles the north wrap-around", () => {
    expect(smallestAngleDifference(350, 10)).toBe(20);
    expect(isAhead(350, 30, 60)).toBe(true);
    expect(isAhead(350, 80, 60)).toBe(false);
  });

  it("calculates east as roughly 90 degrees", () => {
    expect(
      bearingDegrees(
        { lng: 116.397499, lat: 39.908722 },
        { lng: 116.407499, lat: 39.908722 },
      ),
    ).toBeCloseTo(90, 0);
  });
});
```

- [ ] **Step 2: Run geometry tests and verify RED**

Run: `npm test -- tests/shared/geo.test.ts`

Expected: FAIL because `shared/geo.ts` does not exist.

- [ ] **Step 3: Implement geometry primitives**

Use Earth radius `6_371_000` meters, normalize bearings to `[0, 360)`, and compare wrap-around angles with:

```ts
export function smallestAngleDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function isAhead(
  currentHeading: number,
  targetBearing: number,
  halfAngle = 60,
): boolean {
  return smallestAngleDifference(currentHeading, targetBearing) <= halfAngle;
}
```

- [ ] **Step 4: Verify geometry GREEN**

Run: `npm test -- tests/shared/geo.test.ts`

Expected: all geometry tests pass.

- [ ] **Step 5: Write failing motion tests**

Tests must cover median speed, stationary transition, computed bearing fallback, low-accuracy rejection and circular mean:

```ts
it("enters moving after two consecutive medians at or above 3 m/s", () => {
  const snapshot = deriveMotion(movingSamples, { phase: "stationary" });
  expect(snapshot.phase).toBe("moving");
  expect(snapshot.speedMps).toBeGreaterThanOrEqual(3);
});

it("averages headings across zero degrees", () => {
  expect(circularMean([350, 10])).toBeCloseTo(0, 0);
});

it("does not derive a heading from samples less than 10 meters apart", () => {
  expect(deriveHeading(closeSamples)).toBeNull();
});
```

- [ ] **Step 6: Run motion tests and verify RED**

Run: `npm test -- tests/shared/motion.test.ts`

Expected: FAIL because motion exports are missing.

- [ ] **Step 7: Implement and verify motion state**

Implement the exact thresholds from the design:

```ts
export type MotionPhase = "stationary" | "moving";

export interface MotionSnapshot {
  phase: MotionPhase;
  speedMps: number | null;
  heading: number | null;
  accurate: boolean;
  movingVotes: number;
  stationarySince: number | null;
}
```

Run:

```bash
npm test -- tests/shared/geo.test.ts tests/shared/motion.test.ts
git add shared/contracts.ts shared/geo.ts shared/motion.ts tests/shared
git commit -m "feat: add motion and direction engine"
```

Expected: both suites pass.

### Task 3: AMap Server Adapter and API Routes

**Files:**
- Create: `tests/fixtures/amap.ts`
- Create: `server/amap-client.ts`
- Create: `server/normalize.ts`
- Create: `server/routes.ts`
- Create: `server/app.ts`
- Create: `server/index.ts`
- Test: `tests/server/normalize.test.ts`
- Test: `tests/server/routes.test.ts`

**Interfaces:**
- Consumes: `ServerConfig` from Task 1
- Produces: `AmapClient` with `searchChargingStations`、`searchServiceAreas`、`reverseGeocode`
- Produces: `createApp({ amapClient }): Express`
- Produces: `GET /api/charging-stations`、`GET /api/service-areas`、`GET /api/road-context`、`GET /api/health`

- [ ] **Step 1: Define normalized contracts and failing normalizer tests**

Add to `shared/contracts.ts`:

```ts
export interface Coordinates {
  lng: number;
  lat: number;
}

export interface ChargingStation {
  id: string;
  parentId: string | null;
  name: string;
  location: Coordinates;
  distanceMeters: number;
  type: string | null;
  typecode: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  alias: string | null;
  phone: string | null;
  openingToday: string | null;
  openingWeek: string | null;
  entrance: Coordinates | null;
  exit: Coordinates | null;
  photos: Array<{ title: string | null; url: string }>;
  children: Array<{ id: string; name: string; address: string | null }>;
}
```

Normalizer tests use fixtures where missing fields alternate between `[]`, `""` and absent properties. Assertions require `null` or empty arrays in the normalized result, never mixed upstream shapes.

- [ ] **Step 2: Verify normalizer RED**

Run: `npm test -- tests/server/normalize.test.ts`

Expected: FAIL because `server/normalize.ts` does not exist.

- [ ] **Step 3: Implement strict upstream normalization**

Core helpers:

```ts
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function coordinate(value: unknown): Coordinates | null {
  const raw = text(value);
  if (!raw) return null;
  const [lng, lat] = raw.split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}
```

`normalizePoi` rejects records without a non-empty `id`, `name` or valid `location`. It keeps only `https:` photo URLs.

- [ ] **Step 4: Verify normalizer GREEN**

Run: `npm test -- tests/server/normalize.test.ts`

Expected: all normalizer tests pass.

- [ ] **Step 5: Write failing route contract tests**

Inject a fake `AmapClient`; do not call the network:

```ts
const app = createApp({ amapClient: fakeAmapClient });

it("rejects an unsupported radius", async () => {
  const response = await request(app).get(
    "/api/charging-stations?lng=116.39&lat=39.90&radius=7000",
  );
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe("INVALID_QUERY");
});

it("never serializes the upstream key", async () => {
  const response = await request(app).get(
    "/api/charging-stations?lng=116.39&lat=39.90&radius=10000",
  );
  expect(JSON.stringify(response.body)).not.toContain("test-secret");
});
```

- [ ] **Step 6: Verify route RED**

Run: `npm test -- tests/server/routes.test.ts`

Expected: FAIL because `createApp` and routes are missing.

- [ ] **Step 7: Implement AMap client and routes**

`server/amap-client.ts` must use `URL` and `URLSearchParams`, set a 10-second `AbortSignal.timeout`, and request:

```ts
const stationParams = {
  location: `${lng.toFixed(6)},${lat.toFixed(6)}`,
  radius: String(radius),
  types: "011100",
  sortrule: "distance",
  show_fields: "business,navi,photos,children",
  page_size: "25",
  page_num: "1",
  output: "json",
};
```

Service-area search changes `types` to `180300`. Reverse geocoding uses `extensions=all` and `roadlevel=0`.

Zod query schema:

```ts
const nearbyQuery = z.object({
  lng: z.coerce.number().min(73).max(136),
  lat: z.coerce.number().min(3).max(54),
  radius: z.coerce.number().refine((value) =>
    [3000, 5000, 10000, 20000, 50000].includes(value),
  ),
});
```

Map upstream failure to a stable response:

```json
{
  "error": {
    "code": "AMAP_UPSTREAM_ERROR",
    "message": "高德服务暂时不可用，请稍后重试"
  }
}
```

The response must never include upstream URL, Key or raw response body.

- [ ] **Step 8: Implement development and production server entry**

`server/index.ts` loads `.env`, creates the app, mounts Vite middleware in development, and serves `dist` with an SPA fallback in production. `GET /api/health` returns:

```json
{ "status": "ok" }
```

- [ ] **Step 9: Verify GREEN and commit**

Run:

```bash
npm test -- tests/server
npm run typecheck
git add shared/contracts.ts server tests/fixtures tests/server
git commit -m "feat: add secure amap api proxy"
```

Expected: route and normalizer tests pass with no external requests.

### Task 4: Highway Detection and Recommendation Ranking

**Files:**
- Create: `shared/highway.ts`
- Create: `shared/recommendation.ts`
- Create: `shared/amap-uri.ts`
- Test: `tests/shared/highway.test.ts`
- Test: `tests/shared/recommendation.test.ts`
- Test: `tests/shared/amap-uri.test.ts`

**Interfaces:**
- Consumes: `ChargingStation`、`Coordinates`、geo helpers
- Produces: `classifyHighway(context, accuracy): HighwayState`
- Produces: `associateServiceArea(station, areas, current, heading): ServiceAreaMatch | null`
- Produces: `rankRecommendations(input): RankedStation[]`
- Produces: `buildAmapMarkerUri(station): string`

- [ ] **Step 1: Write failing highway tests**

Cover all three states:

```ts
expect(
  classifyHighway(
    { formattedAddress: "京藏高速", nearestRoad: "京藏高速", roadDistanceMeters: 12 },
    20,
  ),
).toBe("confirmed");

expect(
  classifyHighway(
    { formattedAddress: "京藏高速附近", nearestRoad: null, roadDistanceMeters: null },
    80,
  ),
).toBe("possible");

expect(
  classifyHighway(
    { formattedAddress: "中山路", nearestRoad: "中山路", roadDistanceMeters: 8 },
    15,
  ),
).toBe("normal");
```

- [ ] **Step 2: Verify highway RED, implement, and verify GREEN**

Run the test before and after implementing explicit patterns for `高速`、`高速公路` and case-insensitive `expressway`. A `confirmed` result additionally requires road distance ≤ 50 meters and accuracy ≤ 50 meters.

- [ ] **Step 3: Write failing association and ranking tests**

Tests must prove:

- exact `parentId === area.id` becomes `inside`;
- area name in station address becomes `inside`;
- ≤1,200 meter spatial match in the forward sector becomes `nearby`;
- >1,200 meter station does not match;
- normal mode ranks angle then distance;
- highway mode ranks service-area matches first;
- stations outside ±60° are excluded.

```ts
const result = rankRecommendations({
  current: { lng: 116.4, lat: 39.9 },
  heading: 0,
  highwayState: "confirmed",
  stations: [nearOrdinaryStation, fartherServiceAreaStation, behindStation],
  serviceAreas: [serviceArea],
});
expect(result.map((item) => item.station.id)).toEqual([
  fartherServiceAreaStation.id,
  nearOrdinaryStation.id,
]);
```

- [ ] **Step 4: Verify recommendation RED, implement, and verify GREEN**

Use a stable numeric score tuple rather than hidden weights:

```ts
[
  highwayState === "normal" ? 0 : serviceAreaRank,
  angleDifference,
  distanceMeters,
  station.id,
]
```

`serviceAreaRank` is `0` for `inside`, `1` for `nearby`, and `2` for no match. Only the first three results receive `recommendationOrder` 1–3.

- [ ] **Step 5: Test and implement the AMap URI**

Expected URI:

```text
https://uri.amap.com/marker?position=<lng>,<lat>&name=<encoded>&src=amap-charging-finder&coordinate=gaode&callnative=1
```

Test Chinese names and `&` encoding. Use `URL`/`URLSearchParams`, not string concatenation.

- [ ] **Step 6: Run shared suite and commit**

```bash
npm test -- tests/shared
git add shared tests/shared
git commit -m "feat: rank forward and service area recommendations"
```

Expected: all geometry, motion, highway, recommendation and URI tests pass.

### Task 5: Browser Tracking and Search Orchestration

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/hooks/useDriveTracker.ts`
- Create: `src/hooks/useChargingSearch.ts`
- Test: `tests/ui/useDriveTracker.test.tsx`
- Test: `tests/ui/useChargingSearch.test.tsx`

**Interfaces:**
- Consumes: server API contracts and motion/recommendation helpers
- Produces: `useDriveTracker(): DriveTrackerState`
- Produces: `useChargingSearch(input): ChargingSearchState`

- [ ] **Step 1: Write failing geolocation hook tests**

Stub `navigator.geolocation.watchPosition` and assert:

```ts
expect(watchPosition).toHaveBeenCalledWith(
  expect.any(Function),
  expect.any(Function),
  {
    enableHighAccuracy: true,
    maximumAge: 3000,
    timeout: 10000,
  },
);
```

Feed two valid samples and assert that the hook exposes the derived moving phase and heading. Feed error code `1` and assert `permission-denied`.

- [ ] **Step 2: Verify tracker RED, implement, and verify GREEN**

The hook must call `clearWatch` on unmount, retain at most 8 samples, and ignore stale callbacks after unmount.

- [ ] **Step 3: Write failing search orchestration tests**

With injected fetch:

- first accurate position triggers stations and road-context calls;
- `possible` or `confirmed` highway state triggers service-area call;
- `normal` skips service-area call;
- changing radius cancels the prior request;
- a stale response cannot replace newer data;
- forward mode without a heading returns `awaiting-direction`.

- [ ] **Step 4: Verify search RED, implement, and verify GREEN**

`src/lib/api.ts` parses non-2xx responses into:

```ts
export interface ApiError {
  code: "INVALID_QUERY" | "AMAP_UPSTREAM_ERROR" | "NETWORK_ERROR";
  message: string;
}
```

`useChargingSearch` refreshes after ≥500 meters, ≥20° or ≥30 seconds, and exposes explicit `idle | loading | success | empty | error` states.

- [ ] **Step 5: Run hook suite and commit**

```bash
npm test -- tests/ui/useDriveTracker.test.tsx tests/ui/useChargingSearch.test.tsx
git add src/lib src/hooks tests/ui
git commit -m "feat: track driving state and charging searches"
```

Expected: hook tests pass and React emits no act warnings.

### Task 6: Mobile and In-Car Interface

**Files:**
- Create: `.impeccable.md`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/components/StatusBar.tsx`
- Create: `src/components/RoadRadar.tsx`
- Create: `src/components/ModeControls.tsx`
- Create: `src/components/StationList.tsx`
- Create: `src/components/StationCard.tsx`
- Create: `src/components/StateMessage.tsx`
- Test: `tests/ui/App.test.tsx`
- Test: `tests/ui/ModeControls.test.tsx`
- Test: `tests/ui/StationCard.test.tsx`

**Interfaces:**
- Consumes: both hooks from Task 5 and `buildAmapMarkerUri`
- Produces: accessible H5 UI at `/`

- [ ] **Step 1: Load `frontend-design` and `teach-impeccable` before UI work**

Record the already-approved design context in `.impeccable.md`:

```md
# Design Context

## Target audience
新能源车驾驶者，使用手机竖屏或汽车车机横屏，在停车或行进途中快速寻找充电站。

## Use cases
按距离查看附近真实充电站；行进时扫读前方推荐；在高速场景优先发现服务区充电站；跳转高德查看实时详情与导航。

## Brand personality
深色、高对比、克制的道路仪表盘。强调驾驶中一眼读懂、真实可信和明确的数据边界。
```

- [ ] **Step 2: Write failing control and detail tests**

```tsx
it("offers only the approved search radii", async () => {
  render(<ModeControls mode="nearby" radius={10000} onModeChange={fn} onRadiusChange={fn} />);
  expect(screen.getAllByRole("radio").map((item) => item.textContent)).toEqual([
    "3 km", "5 km", "10 km", "20 km", "50 km",
  ]);
});

it("does not invent unavailable charging fields", async () => {
  render(<StationCard station={stationWithoutChargingDetails} />);
  await user.click(screen.getByRole("button", { name: /展开/ }));
  expect(screen.queryByText(/空闲枪|功率|电价/)).not.toBeInTheDocument();
  expect(screen.getByText(/实时充电信息请前往高德地图查看/)).toBeVisible();
});
```

- [ ] **Step 3: Verify UI RED**

Run: `npm test -- tests/ui/ModeControls.test.tsx tests/ui/StationCard.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement semantic components**

Requirements:

- modes use a two-option `radiogroup`;
- radii use a separate `radiogroup`;
- expanded station details use `aria-expanded` and stay inline;
- “高德查看” is an anchor with `target="_blank"` and `rel="noreferrer"`;
- phone links render only when a real phone value exists;
- photos use real high德 URLs and meaningful `alt`;
- all icon-only buttons have Chinese accessible names.

- [ ] **Step 5: Implement the road radar**

`RoadRadar` receives current heading, radius and ranked stations. It uses CSS/SVG only:

- heading-up orientation;
- 120° forward wedge in forward mode;
- three distance rings;
- numbered markers with real relative bearing and normalized radial distance;
- explicit text fallback when heading is missing;
- `prefers-reduced-motion` disables rotational transition.

The SVG has an accessible name and does not claim to be a geographic map.

- [ ] **Step 6: Implement the visual system and responsive layout**

CSS tokens use tinted dark neutrals and high-contrast accents:

```css
:root {
  --road-950: oklch(15% 0.018 115);
  --road-900: oklch(20% 0.02 115);
  --road-800: oklch(27% 0.024 115);
  --ink-100: oklch(94% 0.025 105);
  --ink-300: oklch(76% 0.035 105);
  --charge: oklch(82% 0.19 126);
  --route: oklch(83% 0.15 83);
  --warning: oklch(74% 0.17 64);
  --danger: oklch(66% 0.19 28);
}
```

Use road-line geometry and tabular numerals, avoid gradients and glassmorphism. Every touch target is at least 48×48 CSS pixels.

At `min-width: 900px` and landscape orientation, switch to a `55% / 45%` radar-list split. Use a container query on station cards to change detail fields from one to two columns without hiding content.

- [ ] **Step 7: Verify UI GREEN and commit**

Run:

```bash
npm test -- tests/ui
npm run typecheck
git add .impeccable.md index.html src tests/ui
git commit -m "feat: build mobile and in-car charging interface"
```

Expected: UI tests and typecheck pass without accessibility-query failures or React warnings.

### Task 7: End-to-End, Production Build, and Visual Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/charging-finder.spec.ts`
- Create: `README.md`
- Modify: files exposed by E2E or visual defects

**Interfaces:**
- Consumes: complete app
- Produces: verified mobile/car flows and deployment instructions

- [ ] **Step 1: Write failing E2E scenarios**

Configure three projects:

```ts
projects: [
  { name: "mobile-portrait", use: { viewport: { width: 390, height: 844 } } },
  { name: "mobile-landscape", use: { viewport: { width: 844, height: 390 } } },
  { name: "car-display", use: { viewport: { width: 1280, height: 720 } } },
]
```

Tests intercept `/api/*`, inject browser geolocation permission and coordinates, then verify:

1. nearby mode renders distance-sorted real fixtures;
2. moving north surfaces only forward candidates;
3. confirmed highway moves the service-area station to recommendation 1;
4. denied permission exposes recovery instructions;
5. no result suggests widening the radius;
6. AMap link contains `callnative=1`, `coordinate=gaode` and the station coordinate.

- [ ] **Step 2: Verify E2E RED**

Run: `npx playwright install chromium && npm run e2e`

Expected: at least one scenario fails until the complete UI and test routing are connected.

- [ ] **Step 3: Complete minimal wiring and verify E2E GREEN**

Fix only the behavior exposed by failing scenarios. Re-run `npm run e2e` until all three viewport projects pass.

- [ ] **Step 4: Add deployment documentation**

`README.md` must include:

- Node 22 requirement.
- `.env.example` copy and server-only Key placement.
- `npm install`、`npm run dev`、`npm run check`、`npm run e2e`、`npm run build`、`npm start`.
- HTTPS requirement for production geolocation.
- Exact data boundary: no public real-time gun, power, price or availability fields.
- Description of heuristic highway recognition.

- [ ] **Step 5: Run fresh full verification**

Run:

```bash
npm run test
npm run typecheck
npm run build
npm run verify:no-key
npm run e2e
```

Then start production using the local `.env` and verify:

```bash
npm start
curl --fail http://localhost:3000/api/health
curl --fail "http://localhost:3000/api/charging-stations?lng=116.397499&lat=39.908722&radius=3000"
```

Expected:

- tests report 0 failures;
- TypeScript exits 0;
- Vite build exits 0;
- Key verifier reports no leak;
- all Playwright projects pass;
- health returns `{"status":"ok"}`;
- live query returns normalized real station data or a normalized empty station list without exposing the Key.

- [ ] **Step 6: Perform visual QA**

Capture the three required viewports and inspect:

- no horizontal or clipped overflow;
- touch targets are at least 48×48;
- status, mode, radius, recommendation and AMap link stay visible and usable;
- expanded details scroll within the document/list, not behind an overlay;
- text remains readable over the radar;
- reduced-motion mode has no radar rotation transition.

If visual inspection finds a defect, add the smallest failing component or E2E assertion before fixing it.

- [ ] **Step 7: Commit the verified deliverable**

```bash
git add README.md playwright.config.ts e2e src server shared tests package.json package-lock.json
git commit -m "test: verify charging finder across mobile and car displays"
git status --short
```

Expected: clean worktree with `.env` ignored.

## Plan Self-Review

- Every requirement in the approved design maps to one of Tasks 1–7.
- Every production behavior begins with a failing unit, component or E2E test.
- Shared names are consistent: `ChargingStation`、`MotionSnapshot`、`HighwayState`、`rankRecommendations`、`buildAmapMarkerUri`.
- Security is verified twice: boundary tests and `verify-no-key.ts`.
- Live high德 access is reserved for final smoke verification; deterministic tests use fixtures.
- No simulated charging fields or navigation-grade claims are introduced.
