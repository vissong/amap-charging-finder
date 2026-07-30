import { describe, expect, it } from "vitest";

import { createAmapClient } from "../../server/amap-client";
import { fullAmapPoiResponse } from "../fixtures/amap";

function poiPage(pageNumber: number, count: number) {
  return {
    status: "1",
    info: "OK",
    infocode: "10000",
    count: String(count),
    pois: Array.from({ length: count }, (_, index) => ({
      id: `page-${pageNumber}-poi-${index}`,
      name: `第 ${pageNumber} 页充电站 ${index}`,
      location: `116.4${pageNumber},39.9${index}`,
      distance: String(pageNumber * 1_000 + index),
      type: "汽车服务;充电站;充电站",
      typecode: "011100",
    })),
  };
}

describe("AMap HTTP client", () => {
  it("sends the exact charging station query without rounding beyond six decimals", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(fullAmapPoiResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl,
    });

    await client.searchChargingStations({
      lng: 116.3974994,
      lat: 39.9087224,
      radius: 10_000,
    });

    const parsedUrl = new URL(requestedUrl);
    expect(parsedUrl.pathname).toBe("/v5/place/around");
    expect(parsedUrl.searchParams.get("location")).toBe(
      "116.397499,39.908722",
    );
    expect(parsedUrl.searchParams.get("types")).toBe(
      "011100|011101|011102|011103",
    );
    expect(parsedUrl.searchParams.get("show_fields")).toBe(
      "business,navi,children",
    );
    expect(parsedUrl.searchParams.get("page_size")).toBe("25");
    expect(parsedUrl.searchParams.get("key")).toBe("server-only-key");
  });

  it("uses the official service-area type code", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          status: "1",
          info: "OK",
          infocode: "10000",
          count: "0",
          pois: [],
        }),
      );
    };
    const client = createAmapClient({ key: "server-only-key", fetchImpl });

    await client.searchServiceAreas({
      lng: 116.4,
      lat: 39.9,
      radius: 50_000,
    });

    expect(new URL(requestedUrl).searchParams.get("types")).toBe("180300");
  });

  it("collects at most 50 nearby stations across two pages", async () => {
    const requestedPages: number[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const pageNumber = Number(
        new URL(String(input)).searchParams.get("page_num"),
      );
      requestedPages.push(pageNumber);
      return new Response(
        JSON.stringify({
          ...poiPage(pageNumber, 25),
          count: "200",
        }),
        { status: 200 },
      );
    };
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl,
      sleepImpl: async () => {},
    });

    const response = (await client.searchChargingStations({
      lng: 116.4,
      lat: 39.9,
      radius: 10_000,
    })) as { pois: unknown[]; truncated: boolean };

    expect(requestedPages).toEqual([1, 2]);
    expect(response.pois).toHaveLength(50);
    expect(response.truncated).toBe(true);
  });

  it("stops nearby pagination after the first short page", async () => {
    const requestedPages: number[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const pageNumber = Number(
        new URL(String(input)).searchParams.get("page_num"),
      );
      requestedPages.push(pageNumber);
      const count = pageNumber === 1 ? 25 : 2;
      return new Response(
        JSON.stringify(poiPage(pageNumber, count)),
        { status: 200 },
      );
    };
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl,
      sleepImpl: async () => {},
    });

    const response = (await client.searchChargingStations({
      lng: 116.4,
      lat: 39.9,
      radius: 3_000,
    })) as { pois: unknown[] };

    expect(requestedPages).toEqual([1, 2]);
    expect(response.pois).toHaveLength(27);
  });

  it("keeps successful nearby pages when a later page is rate limited", async () => {
    const requestedPages: number[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const pageNumber = Number(
        new URL(String(input)).searchParams.get("page_num"),
      );
      requestedPages.push(pageNumber);
      if (pageNumber === 2) {
        return new Response(
          JSON.stringify({
            status: "0",
            info: "CUQPS_HAS_EXCEEDED_THE_LIMIT",
            infocode: "10021",
          }),
        );
      }
      return new Response(
        JSON.stringify({
          ...poiPage(pageNumber, 25),
          count: "200",
        }),
        { status: 200 },
      );
    };
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl,
      sleepImpl: async () => {},
    });

    const response = (await client.searchChargingStations({
      lng: 116.4,
      lat: 39.9,
      radius: 3_000,
    })) as { pois: unknown[]; truncated: boolean };

    expect(requestedPages).toEqual([1, 2, 2]);
    expect(response.pois).toHaveLength(25);
    expect(response.truncated).toBe(true);
  });

  it("backs off once and recovers a rate-limited nearby page", async () => {
    const requestedPages: number[] = [];
    const sleepDurations: number[] = [];
    let pageTwoAttempts = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const pageNumber = Number(
        new URL(String(input)).searchParams.get("page_num"),
      );
      requestedPages.push(pageNumber);
      if (pageNumber === 2 && pageTwoAttempts++ === 0) {
        return new Response(
          JSON.stringify({
            status: "0",
            info: "CUQPS_HAS_EXCEEDED_THE_LIMIT",
            infocode: "10021",
          }),
        );
      }
      const count = pageNumber === 1 ? 25 : 2;
      return new Response(
        JSON.stringify(poiPage(pageNumber, count)),
        { status: 200 },
      );
    };
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl,
      sleepImpl: async (milliseconds) => {
        sleepDurations.push(milliseconds);
      },
    });

    const response = (await client.searchChargingStations({
      lng: 116.4,
      lat: 39.9,
      radius: 3_000,
    })) as { pois: unknown[]; truncated: boolean };

    expect(requestedPages).toEqual([1, 2, 2]);
    expect(sleepDurations).toEqual([400, 1_000]);
    expect(response.pois).toHaveLength(27);
    expect(response.truncated).toBe(false);
  });

  it("searches charging stations nationwide with a qualified keyword", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(fullAmapPoiResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl,
    });

    await client.searchChargingStationsByKeyword(
      "孟村服务区 充电站",
    );

    const parsedUrl = new URL(requestedUrl);
    expect(parsedUrl.pathname).toBe("/v5/place/text");
    expect(parsedUrl.searchParams.get("keywords")).toBe(
      "孟村服务区 充电站",
    );
    expect(parsedUrl.searchParams.get("types")).toBe(
      "011100|011101|011102|011103",
    );
    expect(parsedUrl.searchParams.has("region")).toBe(false);
    expect(parsedUrl.searchParams.get("show_fields")).toBe(
      "business,navi,children",
    );
  });

  it("discovers service-area charging stations through localized suggestions", async () => {
    const requestedUrls: URL[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      if (url.pathname === "/v5/place/text") {
        return new Response(
          JSON.stringify({
            status: "1",
            info: "OK",
            pois: [
              {
                id: "service-area",
                name: "云峰山服务区(鹤大高速大连方向)",
                location: "125.322855,41.234724",
                adcode: "210522",
              },
            ],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          status: "1",
          info: "OK",
          tips: [
            {
              id: `tip-${url.searchParams.get("keywords")}`,
              name: "云峰山服务区充电站",
              location: "125.323095,41.235146",
              typecode: "011100",
            },
          ],
        }),
      );
    };
    const sleepDurations: number[] = [];
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl,
      sleepImpl: async (milliseconds) => {
        sleepDurations.push(milliseconds);
      },
    });

    const response = (await client.searchServiceAreaChargingStations(
      "云峰山服务区",
    )) as { tips: unknown[] };

    expect(requestedUrls).toHaveLength(3);
    expect(requestedUrls[0].pathname).toBe("/v5/place/text");
    expect(requestedUrls[0].searchParams.get("keywords")).toBe(
      "云峰山服务区",
    );
    expect(requestedUrls[0].searchParams.get("types")).toBe("180300");
    expect(requestedUrls[1].pathname).toBe(
      "/v3/assistant/inputtips",
    );
    expect(requestedUrls[1].searchParams.get("keywords")).toBe("云峰山");
    expect(requestedUrls[1].searchParams.get("city")).toBe("210522");
    expect(requestedUrls[1].searchParams.get("citylimit")).toBe("true");
    expect(requestedUrls[1].searchParams.get("location")).toBe(
      "125.322855,41.234724",
    );
    expect(requestedUrls[2].searchParams.get("keywords")).toBe("交投");
    expect(sleepDurations).toEqual([400]);
    expect(response.tips).toHaveLength(2);
  });

  it("rejects a successful HTTP response with an AMap failure status", async () => {
    const client = createAmapClient({
      key: "server-only-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: "0",
            info: "DAILY_QUERY_OVER_LIMIT",
            infocode: "10003",
          }),
        ),
    });

    await expect(
      client.reverseGeocode({ lng: 116.4, lat: 39.9 }),
    ).rejects.toMatchObject({
      name: "AmapUpstreamError",
      infocode: "10003",
    });
  });
});
