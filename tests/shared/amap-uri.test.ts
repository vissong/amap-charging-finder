import { describe, expect, it } from "vitest";

import type { ChargingStation } from "../../shared/contracts";
import { buildAmapMarkerUri } from "../../shared/amap-uri";

const station = {
  id: "B0G33X0XSK",
  name: "A&B 百葛服务区充电站",
  location: { lng: 116.2468, lat: 40.1659 },
} as ChargingStation;

it("uses the AMap Web URI on PC browsers", () => {
  const uri = new URL(
    buildAmapMarkerUri(
      station,
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    ),
  );

  expect(uri.origin + uri.pathname).toBe("https://uri.amap.com/marker");
  expect(uri.searchParams.get("poiid")).toBe("B0G33X0XSK");
  expect(uri.searchParams.get("src")).toBe("amap-charging-finder");
  expect(uri.searchParams.get("callnative")).toBe("1");
});

it("uses the AMap POI deep link on mobile H5 browsers", () => {
  const uri = new URL(
    buildAmapMarkerUri(
      station,
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile",
    ),
  );

  expect(`${uri.protocol}//${uri.host}${uri.pathname}`).toBe(
    "amapuri://poi/detail",
  );
  expect(uri.searchParams.get("poiname")).toBe(
    "A&B 百葛服务区充电站",
  );
  expect(uri.searchParams.get("lat")).toBe("40.1659");
  expect(uri.searchParams.get("lon")).toBe("116.2468");
  expect(uri.searchParams.get("poiid")).toBe("B0G33X0XSK");
});

it("uses the AMap Web URI inside WeChat H5", () => {
  const uri = new URL(
    buildAmapMarkerUri(
      station,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.60",
    ),
  );

  expect(uri.origin + uri.pathname).toBe("https://uri.amap.com/marker");
  expect(uri.searchParams.get("poiid")).toBe("B0G33X0XSK");
  expect(uri.searchParams.get("callnative")).toBe("1");
});
