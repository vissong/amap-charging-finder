import { describe, expect, it } from "vitest";

import { getServerConfig } from "../../server/config";

describe("getServerConfig", () => {
  it("rejects startup when the AMap Web Service key is missing", () => {
    expect(() => getServerConfig({})).toThrow("AMAP_WEB_SERVICE_KEY");
  });

  it("uses port 3000 by default", () => {
    expect(getServerConfig({ AMAP_WEB_SERVICE_KEY: "test-key" }).port).toBe(
      3000,
    );
  });

  it("rejects a non-numeric port", () => {
    expect(() =>
      getServerConfig({ AMAP_WEB_SERVICE_KEY: "test-key", PORT: "abc" }),
    ).toThrow("PORT");
  });
});
