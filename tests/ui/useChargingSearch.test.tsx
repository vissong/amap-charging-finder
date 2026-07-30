import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  ChargingStation,
  ListResponse,
  RoadContext,
  SearchMode,
  SearchRadius,
  ServiceArea,
} from "../../shared/contracts";
import {
  initialMotionSnapshot,
  type MotionSnapshot,
  type PositionSample,
} from "../../shared/motion";
import {
  shouldRefreshSearch,
  useChargingSearch,
} from "../../src/hooks/useChargingSearch";

const currentSample: PositionSample = {
  timestamp: 10_000,
  location: { lng: 116.4, lat: 39.9 },
  accuracyMeters: 15,
  speedMps: 12,
  headingDegrees: 0,
};

const stoppedSample: PositionSample = {
  ...currentSample,
  speedMps: 0,
};

const movingNorth: MotionSnapshot = {
  ...initialMotionSnapshot,
  phase: "moving",
  accurate: true,
  speedMps: 12,
  heading: 0,
  movingVotes: 2,
};

const stoppedNorth: MotionSnapshot = {
  ...initialMotionSnapshot,
  phase: "stationary",
  accurate: true,
  speedMps: 0,
  heading: 0,
};

function station(
  id: string,
  name: string,
  lat: number,
  distanceMeters: number,
  parentId: string | null = null,
): ChargingStation {
  return {
    id,
    parentId,
    name,
    location: { lng: 116.4, lat },
    distanceMeters,
    type: "汽车服务;充电站;充电站",
    typecode: "011100",
    address: "测试地址",
    province: "北京市",
    city: "北京市",
    district: "昌平区",
    alias: null,
    phone: null,
    openingToday: null,
    openingWeek: null,
    entrance: null,
    exit: null,
    photos: [],
    children: [],
  };
}

const ordinaryStation = station("ordinary", "城市充电站", 39.905, 550);
const serviceStation = station(
  "service",
  "百葛服务区充电站",
  39.92,
  2_200,
  "area-1",
);
const serviceArea: ServiceArea = {
  id: "area-1",
  name: "百葛服务区",
  location: { lng: 116.4, lat: 39.92 },
  distanceMeters: 2_200,
  address: "京藏高速",
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("search refresh policy", () => {
  const anchor = {
    location: { lng: 116.4, lat: 39.9 },
    heading: 0,
    radius: 10_000,
    mode: "nearby" as const,
    timestamp: 1_000,
  };

  it("refreshes for radius changes and each forward kilometer", () => {
    expect(shouldRefreshSearch(null, anchor)).toBe(true);
    expect(
      shouldRefreshSearch(anchor, {
        ...anchor,
        location: { lng: 116.4, lat: 39.92 },
      }),
    ).toBe(false);
    expect(
      shouldRefreshSearch(anchor, { ...anchor, heading: 20 }),
    ).toBe(false);
    expect(
      shouldRefreshSearch(anchor, { ...anchor, timestamp: 31_000 }),
    ).toBe(false);
    expect(
      shouldRefreshSearch(anchor, { ...anchor, radius: 20_000 }),
    ).toBe(true);
    expect(
      shouldRefreshSearch(anchor, { ...anchor, mode: "forward" }),
    ).toBe(false);

    const forwardAnchor = { ...anchor, mode: "forward" as const };
    expect(
      shouldRefreshSearch(forwardAnchor, {
        ...forwardAnchor,
        location: { lng: 116.4, lat: 39.908 },
      }),
    ).toBe(false);
    expect(
      shouldRefreshSearch(forwardAnchor, {
        ...forwardAnchor,
        location: { lng: 116.4, lat: 39.91 },
      }),
    ).toBe(true);
  });

  it("does not refresh for a small position and heading update", () => {
    expect(
      shouldRefreshSearch(anchor, {
        ...anchor,
        location: { lng: 116.4, lat: 39.9005 },
        heading: 10,
        timestamp: 20_000,
      }),
    ).toBe(false);
  });
});

describe("useChargingSearch", () => {
  it("skips service-area requests on an ordinary road", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/charging-stations") {
        return json({
          items: [ordinaryStation],
          count: 1,
          truncated: true,
        } satisfies ListResponse<ChargingStation>);
      }
      if (url.pathname === "/api/road-context") {
        return json({
          formattedAddress: "北京市中山路",
          nearestRoad: "中山路",
          roadDistanceMeters: 5,
        } satisfies RoadContext);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const { result } = renderHook(() =>
      useChargingSearch({
        latest: currentSample,
        motion: movingNorth,
        mode: "nearby",
        radius: 10_000,
        fetchImpl,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.highwayState).toBe("normal");
    expect(result.current.serviceAreas).toEqual([]);
    expect(result.current.stations[0].id).toBe("ordinary");
    expect(result.current.truncated).toBe(true);
  });

  it("loads forward service-area stations when stopped with a known direction", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/charging-stations") {
        return json({
          items: [ordinaryStation, serviceStation],
          count: 2,
        } satisfies ListResponse<ChargingStation>);
      }
      if (url.pathname === "/api/road-context") {
        return json({
          formattedAddress: "北京市京藏高速",
          nearestRoad: "京藏高速",
          roadDistanceMeters: 12,
        } satisfies RoadContext);
      }
      if (url.pathname === "/api/service-areas") {
        return json({
          items: [serviceArea],
          count: 1,
        } satisfies ListResponse<ServiceArea>);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const { result } = renderHook(() =>
      useChargingSearch({
        latest: stoppedSample,
        motion: stoppedNorth,
        mode: "forward",
        radius: 50_000,
        fetchImpl,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.highwayState).toBe("confirmed");
    expect(result.current.ranked[0].station.id).toBe("service");
  });

  it("does not start a forward search before direction is trustworthy", () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("No request should be sent");
    };
    const { result } = renderHook(() =>
      useChargingSearch({
        latest: currentSample,
        motion: { ...movingNorth, heading: null },
        mode: "forward",
        radius: 10_000,
        fetchImpl,
      }),
    );

    expect(result.current.status).toBe("awaiting-direction");
  });

  it("reuses loaded stations when switching to forward mode", async () => {
    let stationRequests = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/charging-stations") {
        stationRequests += 1;
        return json({
          items: [ordinaryStation],
          count: 1,
        } satisfies ListResponse<ChargingStation>);
      }
      if (url.pathname === "/api/road-context") {
        return json({
          formattedAddress: "北京市中山路",
          nearestRoad: "中山路",
          roadDistanceMeters: 5,
        } satisfies RoadContext);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const { result, rerender } = renderHook(
      ({
        mode,
        latest,
      }: {
        mode: SearchMode;
        latest: PositionSample;
      }) =>
        useChargingSearch({
          latest,
          motion: movingNorth,
          mode,
          radius: 10_000,
          fetchImpl,
        }),
      {
        initialProps: {
          mode: "nearby" as SearchMode,
          latest: currentSample,
        },
      },
    );

    await waitFor(() => expect(result.current.status).toBe("success"));
    rerender({ mode: "forward", latest: currentSample });

    await waitFor(() =>
      expect(result.current.ranked[0]?.station.id).toBe("ordinary"),
    );
    expect(stationRequests).toBe(1);

    rerender({
      mode: "forward",
      latest: {
        ...currentSample,
        timestamp: 20_000,
        location: { lng: 116.4, lat: 39.91 },
      },
    });

    await waitFor(() => expect(stationRequests).toBe(2));
  });

  it("keeps loaded stations visible during a background refresh", async () => {
    let resolveRefresh: ((response: Response) => void) | null = null;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshedStation = station(
      "refreshed",
      "刷新后的充电站",
      39.91,
      1_100,
    );
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/road-context") {
        return json({
          formattedAddress: "北京市中山路",
          nearestRoad: "中山路",
          roadDistanceMeters: 5,
        } satisfies RoadContext);
      }
      if (url.searchParams.get("radius") === "20000") {
        return refreshResponse;
      }
      return json({
        items: [ordinaryStation],
        count: 1,
      } satisfies ListResponse<ChargingStation>);
    };

    const { result, rerender } = renderHook(
      ({ radius }: { radius: SearchRadius }) =>
        useChargingSearch({
          latest: currentSample,
          motion: movingNorth,
          mode: "nearby",
          radius,
          fetchImpl,
        }),
      { initialProps: { radius: 10_000 as SearchRadius } },
    );

    await waitFor(() => expect(result.current.status).toBe("success"));
    rerender({ radius: 20_000 });

    await waitFor(() => expect(result.current.refreshing).toBe(true));
    expect(result.current.status).toBe("success");
    expect(result.current.stations[0].id).toBe("ordinary");

    act(() => {
      resolveRefresh?.(
        json({
          items: [refreshedStation],
          count: 1,
        } satisfies ListResponse<ChargingStation>),
      );
    });

    await waitFor(() =>
      expect(result.current.stations[0].id).toBe("refreshed"),
    );
    expect(result.current.refreshing).toBe(false);
  });

  it("prevents an older response from replacing a newer radius query", async () => {
    let resolveOld: ((response: Response) => void) | null = null;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const newerStation = station("new", "新范围充电站", 39.91, 1_100);
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/road-context") {
        return json({
          formattedAddress: "北京市中山路",
          nearestRoad: "中山路",
          roadDistanceMeters: 5,
        } satisfies RoadContext);
      }
      if (
        url.pathname === "/api/charging-stations" &&
        url.searchParams.get("radius") === "10000"
      ) {
        return oldResponse;
      }
      return json({
        items: [newerStation],
        count: 1,
      } satisfies ListResponse<ChargingStation>);
    };

    const { result, rerender } = renderHook(
      ({ radius }: { radius: SearchRadius }) =>
        useChargingSearch({
          latest: currentSample,
          motion: movingNorth,
          mode: "nearby",
          radius,
          fetchImpl,
        }),
      { initialProps: { radius: 10_000 as SearchRadius } },
    );
    rerender({ radius: 20_000 });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.stations[0].id).toBe("new");

    act(() => {
      resolveOld?.(
        json({
          items: [ordinaryStation],
          count: 1,
        } satisfies ListResponse<ChargingStation>),
      );
    });

    await waitFor(() => expect(result.current.stations[0].id).toBe("new"));
  });
});
