import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDriveTracker } from "../../src/hooks/useDriveTracker";

interface GeolocationHarness {
  geolocation: Geolocation;
  emitPosition(position: Partial<GeolocationCoordinates>): void;
  emitError(code: number): void;
  clearWatch: ReturnType<typeof vi.fn>;
}

function installGeolocation(): GeolocationHarness {
  let success: PositionCallback | null = null;
  let failure: PositionErrorCallback | null = null;
  const clearWatch = vi.fn();
  const watchPosition = vi.fn(
    (
      next: PositionCallback,
      error?: PositionErrorCallback | null,
    ): number => {
      success = next;
      failure = error ?? null;
      return 42;
    },
  );
  const geolocation = {
    watchPosition,
    clearWatch,
    getCurrentPosition: vi.fn(),
  } as unknown as Geolocation;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: geolocation,
  });

  return {
    geolocation,
    clearWatch,
    emitPosition(position) {
      success?.({
        timestamp: position.longitude === 116.401 ? 2_000 : 1_000,
        coords: {
          latitude: position.latitude ?? 39.9,
          longitude: position.longitude ?? 116.4,
          accuracy: position.accuracy ?? 15,
          altitude: null,
          altitudeAccuracy: null,
          heading: position.heading ?? 0,
          speed: position.speed ?? 3.5,
          toJSON: () => ({}),
        },
        toJSON: () => ({}),
      });
    },
    emitError(code) {
      failure?.({
        code,
        message: "geolocation failure",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDriveTracker", () => {
  it("starts high-accuracy continuous positioning and clears it on unmount", () => {
    const harness = installGeolocation();
    const { unmount } = renderHook(() => useDriveTracker());

    expect(harness.geolocation.watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        maximumAge: 3_000,
        timeout: 10_000,
      },
    );

    unmount();
    expect(harness.clearWatch).toHaveBeenCalledWith(42);
  });

  it("derives moving state from consecutive position samples", () => {
    const harness = installGeolocation();
    const { result } = renderHook(() => useDriveTracker());

    act(() => {
      harness.emitPosition({ longitude: 116.4, heading: 0, speed: 3.4 });
      harness.emitPosition({ longitude: 116.401, heading: 5, speed: 3.6 });
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.motion.phase).toBe("moving");
    expect(result.current.motion.heading).toBeCloseTo(2.5, 0);
    expect(result.current.latest?.location).toEqual({
      lng: 116.401,
      lat: 39.9,
    });
  });

  it("exposes permission denial as a recoverable state", () => {
    const harness = installGeolocation();
    const { result } = renderHook(() => useDriveTracker());

    act(() => {
      harness.emitError(1);
    });

    expect(result.current.status).toBe("permission-denied");
    expect(result.current.retry).toEqual(expect.any(Function));
  });
});
