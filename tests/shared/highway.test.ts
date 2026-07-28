import { describe, expect, it } from "vitest";

import { classifyHighway } from "../../shared/highway";

describe("highway classification", () => {
  it("confirms a nearby named expressway with accurate positioning", () => {
    expect(
      classifyHighway(
        {
          formattedAddress: "北京市昌平区京藏高速",
          nearestRoad: "京藏高速",
          roadDistanceMeters: 12,
        },
        20,
      ),
    ).toBe("confirmed");
  });

  it("does not confirm a highway when location accuracy is poor", () => {
    expect(
      classifyHighway(
        {
          formattedAddress: "京藏高速附近",
          nearestRoad: "京藏高速",
          roadDistanceMeters: 12,
        },
        80,
      ),
    ).toBe("possible");
  });

  it("treats an address-only expressway signal as possible", () => {
    expect(
      classifyHighway(
        {
          formattedAddress: "G6 Expressway 西侧",
          nearestRoad: null,
          roadDistanceMeters: null,
        },
        20,
      ),
    ).toBe("possible");
  });

  it("keeps ordinary urban roads in normal mode", () => {
    expect(
      classifyHighway(
        {
          formattedAddress: "北京市中山路",
          nearestRoad: "中山路",
          roadDistanceMeters: 8,
        },
        15,
      ),
    ).toBe("normal");
  });
});
