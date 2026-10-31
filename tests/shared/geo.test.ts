import { describe, expect, it } from "vitest";

import {
  bearingDegrees,
  haversineMeters,
  isAhead,
  smallestAngleDifference,
  wgs84ToGcj02,
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

  it("converts browser WGS84 coordinates to AMap GCJ-02 coordinates", () => {
    const converted = wgs84ToGcj02({
      lng: 116.397128,
      lat: 39.916527,
    });

    expect(converted.lng).toBeCloseTo(116.403372, 5);
    expect(converted.lat).toBeCloseTo(39.917931, 5);
  });

  it("does not transform coordinates outside the supported GCJ-02 extent", () => {
    expect(wgs84ToGcj02({ lng: -0.1276, lat: 51.5072 })).toEqual({
      lng: -0.1276,
      lat: 51.5072,
    });
  });
});
