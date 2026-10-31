import { describe, expect, it } from "vitest";

import { getServerConfig } from "../../server/config";

describe("getServerConfig", () => {
  it("rejects startup when the AMap Web Service key is missing", () => {
    expect(() => getServerConfig({})).toThrow("AMAP_WEB_SERVICE_KEY");
  });

  it("uses port 3000 by default", () => {
    expect(getServerConfig({ AMAP_WEB_SERVICE_KEY: "test-key" })).toEqual({
      amapWebServiceKey: "test-key",
      amapMaxQps: 3,
      port: 3000,
    });
  });

  it("rejects a non-numeric port", () => {
    expect(() =>
      getServerConfig({ AMAP_WEB_SERVICE_KEY: "test-key", PORT: "abc" }),
    ).toThrow("PORT");
  });

  it("accepts a conservative AMap QPS override", () => {
    expect(
      getServerConfig({
        AMAP_WEB_SERVICE_KEY: "test-key",
        AMAP_MAX_QPS: "2",
      }).amapMaxQps,
    ).toBe(2);
  });

  it.each(["0", "1.5", "4", "30", "invalid"])(
    "rejects invalid AMap QPS %s",
    (amapMaxQps) => {
      expect(() =>
        getServerConfig({
          AMAP_WEB_SERVICE_KEY: "test-key",
          AMAP_MAX_QPS: amapMaxQps,
        }),
      ).toThrow("AMAP_MAX_QPS");
    },
  );
});
