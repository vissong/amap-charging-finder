import { describe, expect, it } from "vitest";

import {
  bearingDegrees,
  haversineMeters,
  isAhead,
  smallestAngleDifference,
} from "../../shared/geo";

describe("geo primitives", () => {
  it("calculates a hand-checked short eastbound distance", () => {
    const distance = haversineMeters(
      { lng: 116.397499, lat: 39.908722 },
      { lng: 116.407499, lat: 39.908722 },
    );

    expect(distance).toBeGreaterThan(850);
    expect(distance).toBeLessThan(860);
  });

  it("calculates east as roughly 90 degrees", () => {
    expect(
      bearingDegrees(
        { lng: 116.397499, lat: 39.908722 },
        { lng: 116.407499, lat: 39.908722 },
      ),
    ).toBeCloseTo(90, 0);
  });

  it("handles the north wrap-around without a 340 degree error", () => {
    expect(smallestAngleDifference(350, 10)).toBe(20);
    expect(isAhead(350, 30, 60)).toBe(true);
    expect(isAhead(350, 80, 60)).toBe(false);
  });

  it("includes candidates exactly on the forward sector boundary", () => {
    expect(isAhead(0, 60)).toBe(true);
    expect(isAhead(0, 300)).toBe(true);
  });
});
