import { describe, expect, it } from "vitest";

import { createAmapClient } from "../../server/amap-client";
import { fullAmapPoiResponse } from "../fixtures/amap";

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
    expect(parsedUrl.searchParams.get("types")).toBe("011100");
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
    expect(parsedUrl.searchParams.get("types")).toBe("011100");
    expect(parsedUrl.searchParams.has("region")).toBe(false);
    expect(parsedUrl.searchParams.get("show_fields")).toBe(
      "business,navi,children",
    );
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
