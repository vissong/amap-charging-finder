import { describe, expect, it } from "vitest";

import { normalizeStationKeyword } from "../../shared/search-keyword";

describe("charging station search keyword", () => {
  it("appends the charging-station qualifier after trimming whitespace", () => {
    expect(normalizeStationKeyword("  孟村   服务区  ")).toEqual({
      display: "孟村 服务区",
      submitted: "孟村 服务区 充电站",
    });
  });

  it("does not append a duplicate charging qualifier", () => {
    expect(normalizeStationKeyword("孟村服务区充电站")).toEqual({
      display: "孟村服务区充电站",
      submitted: "孟村服务区充电站",
    });
    expect(normalizeStationKeyword("孟村服务区 充电桩")).toEqual({
      display: "孟村服务区 充电桩",
      submitted: "孟村服务区 充电桩",
    });
  });

  it("rejects empty or overlong submitted keywords", () => {
    expect(normalizeStationKeyword("   ")).toBeNull();
    expect(normalizeStationKeyword("孟".repeat(77))).toBeNull();
  });
});
