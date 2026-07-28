import { describe, expect, it } from "vitest";

import type { ChargingStation } from "../../shared/contracts";
import { buildAmapMarkerUri } from "../../shared/amap-uri";

it("builds an encoded AMap marker URI that attempts native launch", () => {
  const station = {
    id: "station-1",
    name: "A&B 百葛服务区充电站",
    location: { lng: 116.2468, lat: 40.1659 },
  } as ChargingStation;

  const uri = new URL(buildAmapMarkerUri(station));

  expect(uri.origin + uri.pathname).toBe("https://uri.amap.com/marker");
  expect(uri.searchParams.get("position")).toBe("116.2468,40.1659");
  expect(uri.searchParams.get("name")).toBe("A&B 百葛服务区充电站");
  expect(uri.searchParams.get("src")).toBe("amap-charging-finder");
  expect(uri.searchParams.get("coordinate")).toBe("gaode");
  expect(uri.searchParams.get("callnative")).toBe("1");
});
