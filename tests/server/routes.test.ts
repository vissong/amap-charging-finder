import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  AmapUpstreamError,
  type AmapClient,
} from "../../server/amap-client";
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
    searchServiceAreaChargingStations: async () => ({
      anchor: null,
      tips: [],
    }),
    searchServiceAreas: async () => amapServiceAreaResponse,
    reverseGeocode: async () => amapRoadContextResponse,
    ...overrides,
  };
}

function chargingPoi(
  id: string,
  name: string,
  typecode: string,
  type: string,
) {
  return {
    id,
    name,
    location: "116.400000,39.900000",
    distance: "1000",
    type,
    typecode,
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
      "/api/charging-stations?lng=116.2468&lat=40.1659&radius=10000",
    );

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.truncated).toBe(false);
    expect(response.body.items[0]).toMatchObject({
      id: "B0FFTEST01",
      name: "京藏高速百葛服务区充电站",
      distanceMeters: 0,
    });
    expect(JSON.stringify(response.body)).not.toContain("server-only-key");
  });

  it("calculates and filters nearby distance locally instead of trusting AMap", async () => {
    const amapClient = fakeAmapClient({
      searchChargingStations: async () => ({
        status: "1",
        info: "OK",
        infocode: "10000",
        count: "2",
        pois: [
          {
            ...chargingPoi(
              "nearby",
              "本地距离内充电站",
              "011100",
              "汽车服务;充电站;充电站",
            ),
            location: "116.400100,39.900000",
            distance: "999999",
          },
          {
            ...chargingPoi(
              "outside",
              "本地距离外充电站",
              "011100",
              "汽车服务;充电站;充电站",
            ),
            location: "116.450000,39.900000",
            distance: "1",
          },
        ],
      }),
    });

    const response = await request(createApp({ amapClient })).get(
      "/api/charging-stations?lng=116.4&lat=39.9&radius=3000",
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      id: "nearby",
      distanceMeters: 9,
    });
  });

  it("keeps only automotive charging and swapping POI categories", async () => {
    const raw = {
      status: "1",
      info: "OK",
      infocode: "10000",
      count: "9",
      pois: [
        chargingPoi(
          "car-charge",
          "汽车公共充电站",
          "011100",
          "汽车服务;充电站;充电站",
        ),
        chargingPoi(
          "car-swap",
          "汽车换电站",
          "011101",
          "汽车服务;换电站;换电站",
        ),
        chargingPoi(
          "car-both",
          "汽车充换电站",
          "011102",
          "汽车服务;充电站;充换电站",
        ),
        chargingPoi(
          "car-dedicated",
          "汽车专用充电站",
          "011103",
          "汽车服务;充电站;专用充电站",
        ),
        chargingPoi(
          "bike-charge",
          "电动自行车充电站",
          "073000",
          "生活服务;电动自行车充电站;电动自行车充电站",
        ),
        chargingPoi(
          "bike-swap",
          "电动自行车换电站",
          "073001",
          "生活服务;电动自行车充电站;电动自行车换电站",
        ),
        chargingPoi(
          "swap-cabinet",
          "社区智能换电柜",
          "011100",
          "汽车服务;充电站;充电站",
        ),
        chargingPoi(
          "bike-misclassified",
          "电动自行车专用充电站",
          "011103",
          "汽车服务;充电站;专用充电站",
        ),
        chargingPoi(
          "B0MAX5LZ4V",
          "(i换电)北京海淀区百望山换电站",
          "011100",
          "汽车服务;充电站;充电站",
        ),
      ],
    };
    const amapClient = fakeAmapClient({
      searchChargingStations: async () => raw,
      searchChargingStationsByKeyword: async () => raw,
    });
    const app = createApp({ amapClient });

    const [nearby, keyword] = await Promise.all([
      request(app).get(
        "/api/charging-stations?lng=116.39&lat=39.90&radius=10000",
      ),
      request(app).get("/api/search-stations?keywords=%E5%85%85%E7%94%B5"),
    ]);
    const expectedNames = [
      "汽车公共充电站",
      "汽车换电站",
      "汽车充换电站",
      "汽车专用充电站",
    ];

    expect(nearby.status).toBe(200);
    expect(nearby.body.items.map((item: { name: string }) => item.name)).toEqual(
      expectedNames,
    );
    expect(keyword.status).toBe(200);
    expect(keyword.body.items.map((item: { name: string }) => item.name)).toEqual(
      expectedNames,
    );
  });

  it("exposes a curated quality network brand for matching stations", async () => {
    const amapClient = fakeAmapClient({
      searchChargingStations: async () => ({
        status: "1",
        info: "OK",
        infocode: "10000",
        count: "1",
        pois: [
          chargingPoi(
            "quality-network",
            "特来电望京超级充电站",
            "011100",
            "汽车服务;充电站;充电站",
          ),
        ],
      }),
    });

    const response = await request(createApp({ amapClient })).get(
      "/api/charging-stations?lng=116.39&lat=39.90&radius=10000",
    );

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      name: "特来电望京超级充电站",
      qualityNetworkBrand: "特来电",
    });
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

  it("finds charging stations anchored to a named service area", async () => {
    const directButIrrelevant = {
      status: "1",
      info: "OK",
      infocode: "10000",
      count: "1",
      pois: [
        chargingPoi(
          "irrelevant",
          "辽宁桓宇超级充电站(参中堂充电站)",
          "011100",
          "汽车服务;充电站;充电站",
        ),
      ],
    };
    const amapClient = {
      ...fakeAmapClient({
        searchChargingStationsByKeyword: async () =>
          directButIrrelevant,
      }),
      searchServiceAreaChargingStations: async () => ({
        anchor: {
          id: "B019E0NHJW",
          name: "云峰山服务区(鹤大高速大连方向)",
          location: "125.322855,41.234724",
          pname: "辽宁省",
          cityname: "本溪市",
          adname: "桓仁满族自治县",
        },
        tips: [
          {
            id: "B0MUB55ZOO",
            name: "辽宁交投超级充电站(云峰山服务区大连方向充电站·华为超充技术支持)",
            location: "125.323095,41.235146",
            address: "云峰山服务区(鹤大高速大连方向)",
            typecode: "011100",
          },
          {
            id: "B0MUB56DSJ",
            name: "云峰山服务区电动汽车充电站",
            location: "125.324449,41.234164",
            address: "云峰山服务区治安执勤点",
            typecode: "011100",
          },
          {
            id: "B0MU4Z9NKA",
            name: "辽宁交投超级充电站(华来服务区充电站)",
            location: "125.125620,41.367016",
            address: "华来服务区",
            typecode: "011100",
          },
        ],
      }),
    } as AmapClient;

    const response = await request(createApp({ amapClient })).get(
      "/api/search-stations?keywords=%E4%BA%91%E5%B3%B0%E5%B1%B1%E6%9C%8D%E5%8A%A1%E5%8C%BA",
    );

    expect(response.status).toBe(200);
    expect(response.body.items.map(({ name }: { name: string }) => name))
      .toEqual([
        "辽宁交投超级充电站(云峰山服务区大连方向充电站·华为超充技术支持)",
        "云峰山服务区电动汽车充电站",
      ]);
    expect(response.body.count).toBe(2);
  });

  it("keeps direct results when service-area discovery is unavailable", async () => {
    const amapClient = fakeAmapClient({
      searchServiceAreaChargingStations: async () => {
        throw new AmapUpstreamError("suggestions unavailable", "10021");
      },
    });

    const response = await request(createApp({ amapClient })).get(
      "/api/search-stations?keywords=%E5%AD%9F%E6%9D%91%E6%9C%8D%E5%8A%A1%E5%8C%BA",
    );

    expect(response.status).toBe(200);
    expect(response.body.items[0].name).toBe(
      "京藏高速百葛服务区充电站",
    );
  });

  it("calculates, sorts, and filters service-area distance locally", async () => {
    const amapClient = fakeAmapClient({
      searchServiceAreas: async () => ({
        status: "1",
        info: "OK",
        infocode: "10000",
        count: "3",
        pois: [
          {
            id: "farther",
            name: "范围内较远服务区",
            location: "116.410000,39.900000",
            distance: "1",
            address: "测试高速",
          },
          {
            id: "nearest",
            name: "范围内最近服务区",
            location: "116.400100,39.900000",
            distance: "999999",
            address: "测试高速",
          },
          {
            id: "outside",
            name: "范围外服务区",
            location: "116.450000,39.900000",
            distance: "2",
            address: "测试高速",
          },
        ],
      }),
    });
    const app = createApp({ amapClient });
    const serviceAreas = await request(app).get(
      "/api/service-areas?lng=116.4&lat=39.9&radius=3000",
    );
    const roadContext = await request(app).get(
      "/api/road-context?lng=116.39&lat=39.90",
    );

    expect(serviceAreas.status).toBe(200);
    expect(serviceAreas.body.items).toHaveLength(2);
    expect(serviceAreas.body.items).toEqual([
      expect.objectContaining({ id: "nearest", distanceMeters: 9 }),
      expect.objectContaining({ id: "farther", distanceMeters: 853 }),
    ]);
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

  it("returns a safe actionable message for an AMap IP whitelist error", async () => {
    const amapClient = fakeAmapClient({
      searchChargingStations: async () => {
        throw new AmapUpstreamError("INVALID_USER_IP", "10005");
      },
    });

    const response = await request(createApp({ amapClient })).get(
      "/api/charging-stations?lng=116.39&lat=39.90&radius=10000",
    );

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "AMAP_UPSTREAM_ERROR",
        message: "服务器公网 IP 未加入高德 Key 白名单",
        upstreamCode: "10005",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("INVALID_USER_IP");
  });
});
