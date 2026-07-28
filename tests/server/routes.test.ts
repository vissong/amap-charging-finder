import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AmapClient } from "../../server/amap-client";
import { createApp } from "../../server/app";
import {
  amapRoadContextResponse,
  amapServiceAreaResponse,
  fullAmapPoiResponse,
} from "../fixtures/amap";

function fakeAmapClient(
  overrides: Partial<AmapClient> = {},
): AmapClient {
  return {
    searchChargingStations: async () => fullAmapPoiResponse,
    searchChargingStationsByKeyword: async () => fullAmapPoiResponse,
    searchServiceAreas: async () => amapServiceAreaResponse,
    reverseGeocode: async () => amapRoadContextResponse,
    ...overrides,
  };
}

describe("API routes", () => {
  it("reports service health without exposing configuration", async () => {
    const response = await request(
      createApp({ amapClient: fakeAmapClient() }),
    ).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("rejects an unsupported search radius", async () => {
    const response = await request(
      createApp({ amapClient: fakeAmapClient() }),
    ).get(
      "/api/charging-stations?lng=116.39&lat=39.90&radius=7000",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_QUERY",
        message: "查询参数无效",
      },
    });
  });

  it("returns normalized charging station data", async () => {
    const response = await request(
      createApp({ amapClient: fakeAmapClient() }),
    ).get(
      "/api/charging-stations?lng=116.39&lat=39.90&radius=10000",
    );

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.truncated).toBe(false);
    expect(response.body.items[0]).toMatchObject({
      id: "B0FFTEST01",
      name: "京藏高速百葛服务区充电站",
    });
    expect(JSON.stringify(response.body)).not.toContain("server-only-key");
  });

  it("marks a paginated nearby result as truncated", async () => {
    const amapClient = fakeAmapClient({
      searchChargingStations: async () => ({
        ...fullAmapPoiResponse,
        truncated: true,
      }),
    });

    const response = await request(createApp({ amapClient })).get(
      "/api/charging-stations?lng=116.39&lat=39.90&radius=50000",
    );

    expect(response.status).toBe(200);
    expect(response.body.truncated).toBe(true);
  });

  it("qualifies a text query and returns nationwide charging results", async () => {
    let submittedKeyword = "";
    const amapClient = fakeAmapClient({
      searchChargingStationsByKeyword: async (keywords) => {
        submittedKeyword = keywords;
        return fullAmapPoiResponse;
      },
    });

    const response = await request(createApp({ amapClient })).get(
      "/api/search-stations?keywords=%E5%AD%9F%E6%9D%91%E6%9C%8D%E5%8A%A1%E5%8C%BA",
    );

    expect(response.status).toBe(200);
    expect(submittedKeyword).toBe("孟村服务区 充电站");
    expect(response.body).toMatchObject({
      query: {
        display: "孟村服务区",
        submitted: "孟村服务区 充电站",
      },
      count: 1,
    });
    expect(response.body.items[0].name).toBe(
      "京藏高速百葛服务区充电站",
    );
  });

  it("returns normalized service areas and road context", async () => {
    const app = createApp({ amapClient: fakeAmapClient() });
    const serviceAreas = await request(app).get(
      "/api/service-areas?lng=116.39&lat=39.90&radius=50000",
    );
    const roadContext = await request(app).get(
      "/api/road-context?lng=116.39&lat=39.90",
    );

    expect(serviceAreas.body.items[0].id).toBe("B0FFAREA01");
    expect(roadContext.body).toEqual({
      formattedAddress: "北京市昌平区京藏高速",
      nearestRoad: "京藏高速",
      roadDistanceMeters: 12.4,
    });
  });

  it("maps upstream failures to a stable response without raw details", async () => {
    const amapClient = fakeAmapClient({
      searchChargingStations: async () => {
        throw Object.assign(new Error("request contained server-only-key"), {
          name: "AmapUpstreamError",
        });
      },
    });

    const response = await request(createApp({ amapClient })).get(
      "/api/charging-stations?lng=116.39&lat=39.90&radius=10000",
    );

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "AMAP_UPSTREAM_ERROR",
        message: "高德服务暂时不可用，请稍后重试",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("server-only-key");
  });
});
