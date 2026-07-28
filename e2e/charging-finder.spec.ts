import { expect, test, type Page } from "@playwright/test";

import type {
  ChargingStation,
  ListResponse,
  RoadContext,
  ServiceArea,
} from "../shared/contracts";

function station(
  id: string,
  name: string,
  latitude: number,
  distanceMeters: number,
  parentId: string | null = null,
): ChargingStation {
  return {
    id,
    parentId,
    name,
    location: { lng: 116.4, lat: latitude },
    distanceMeters,
    type: "汽车服务;充电站;充电站",
    typecode: "011100",
    address: "京藏高速测试路段",
    province: "北京市",
    city: "北京市",
    district: "昌平区",
    alias: null,
    phone: null,
    openingToday: "00:00-24:00",
    openingWeek: null,
    entrance: null,
    exit: null,
    photos: [],
    children: [],
  };
}

const ordinary = station("ordinary", "城市公共充电站", 39.905, 550);
const serviceStation = station(
  "service",
  "百葛服务区充电站",
  39.92,
  2_200,
  "area-1",
);
const serviceArea: ServiceArea = {
  id: "area-1",
  name: "百葛服务区",
  location: { lng: 116.4, lat: 39.92 },
  distanceMeters: 2_200,
  address: "京藏高速",
};

interface MockOptions {
  stations?: ChargingStation[];
  road?: RoadContext;
  serviceAreas?: ServiceArea[];
}

async function mockApi(
  page: Page,
  {
    stations = [ordinary, serviceStation],
    road = {
      formattedAddress: "北京市中山路",
      nearestRoad: "中山路",
      roadDistanceMeters: 8,
    },
    serviceAreas = [],
  }: MockOptions = {},
): Promise<void> {
  await page.route("**/api/charging-stations?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: stations,
        count: stations.length,
      } satisfies ListResponse<ChargingStation>),
    });
  });
  await page.route("**/api/road-context?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(road),
    });
  });
  await page.route("**/api/service-areas?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: serviceAreas,
        count: serviceAreas.length,
      } satisfies ListResponse<ServiceArea>),
    });
  });
}

test("nearby stations stay distance-sorted and expose the AMap URI", async (
  { page },
  testInfo,
) => {
  await mockApi(page, { stations: [serviceStation, ordinary] });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "城市公共充电站" }),
  ).toBeVisible();
  await expect(page.locator(".station-card h3").first()).toHaveText(
    "城市公共充电站",
  );

  if (process.env.CAPTURE_VISUALS === "1") {
    await page.screenshot({
      path: testInfo.outputPath("dashboard.png"),
      fullPage: true,
    });
  }

  await page
    .getByRole("button", { name: "展开城市公共充电站详情" })
    .click();
  const amapLink = page
    .getByRole("article")
    .filter({ hasText: "城市公共充电站" })
    .getByRole("link", { name: "在高德查看" });
  await expect(amapLink).toHaveAttribute("href", /callnative=1/);
  await expect(amapLink).toHaveAttribute("href", /coordinate=gaode/);
  await expect(amapLink).toHaveAttribute("href", /116\.4%2C39\.905/);
});

test("a moving highway session prioritizes the forward service-area station", async ({
  context,
  page,
}) => {
  await mockApi(page, {
    road: {
      formattedAddress: "北京市京藏高速",
      nearestRoad: "京藏高速",
      roadDistanceMeters: 12,
    },
    serviceAreas: [serviceArea],
  });
  await page.goto("/");

  await context.setGeolocation({
    longitude: 116.4,
    latitude: 39.901,
    accuracy: 15,
  });
  await page.waitForTimeout(120);
  await context.setGeolocation({
    longitude: 116.4,
    latitude: 39.902,
    accuracy: 15,
  });
  await page.waitForTimeout(120);
  await context.setGeolocation({
    longitude: 116.4,
    latitude: 39.903,
    accuracy: 15,
  });

  await page.getByRole("radio", { name: "前方推荐" }).click();

  await expect(page.getByText("已识别高速")).toBeVisible();
  await expect(page.locator(".station-card h3").first()).toHaveText(
    "百葛服务区充电站",
  );
  await expect(page.getByText("服务区内").first()).toBeVisible();
});

test("permission denial gives a visible recovery action", async ({
  context,
  page,
}) => {
  await context.clearPermissions();
  await mockApi(page);
  await page.goto("/");

  await expect(
    page.getByText("无法定位，开启位置权限后再试"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "重新定位" }),
  ).toBeVisible();
});

test("an empty result explains the next useful action", async ({ page }) => {
  await mockApi(page, { stations: [] });
  await page.goto("/");

  await expect(page.getByText("当前范围暂无充电站")).toBeVisible();
  await expect(
    page.getByText("扩大搜索范围，或切换到附近充电查看全部方向。"),
  ).toBeVisible();
});

test("the selected viewport has no horizontal page overflow", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "城市公共充电站" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
