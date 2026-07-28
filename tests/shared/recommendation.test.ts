import { describe, expect, it } from "vitest";

import type {
  ChargingStation,
  Coordinates,
  ServiceArea,
} from "../../shared/contracts";
import {
  associateServiceArea,
  rankRecommendations,
} from "../../shared/recommendation";

const current: Coordinates = { lng: 116.4, lat: 39.9 };

function station(
  id: string,
  location: Coordinates,
  overrides: Partial<ChargingStation> = {},
): ChargingStation {
  return {
    id,
    parentId: null,
    name: `充电站 ${id}`,
    location,
    distanceMeters: 1_000,
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
    ...overrides,
  };
}

function area(
  id: string,
  location: Coordinates,
  overrides: Partial<ServiceArea> = {},
): ServiceArea {
  return {
    id,
    name: `服务区 ${id}`,
    location,
    distanceMeters: 1_000,
    address: "测试高速",
    ...overrides,
  };
}

describe("service-area association", () => {
  it("treats an exact parent POI match as inside", () => {
    const serviceArea = area("area-1", { lng: 116.4, lat: 39.92 });
    const match = associateServiceArea(
      station("station-1", { lng: 116.4, lat: 39.92 }, {
        parentId: "area-1",
      }),
      [serviceArea],
      current,
      0,
    );

    expect(match).toEqual({ kind: "inside", area: serviceArea });
  });

  it("treats the service-area name in the station address as inside", () => {
    const serviceArea = area("area-1", { lng: 116.4, lat: 39.92 }, {
      name: "百葛服务区",
    });
    const match = associateServiceArea(
      station("station-1", { lng: 116.4, lat: 39.92 }, {
        address: "京藏高速百葛服务区东区",
      }),
      [serviceArea],
      current,
      0,
    );

    expect(match?.kind).toBe("inside");
  });

  it("uses a forward spatial match within 1200 meters as nearby", () => {
    const serviceArea = area("area-1", { lng: 116.4, lat: 39.92 });
    const match = associateServiceArea(
      station("station-1", { lng: 116.4, lat: 39.91 }),
      [serviceArea],
      current,
      0,
    );

    expect(match?.kind).toBe("nearby");
  });

  it("does not associate a station more than 1200 meters away", () => {
    const serviceArea = area("area-1", { lng: 116.4, lat: 39.94 });
    const match = associateServiceArea(
      station("station-1", { lng: 116.4, lat: 39.91 }),
      [serviceArea],
      current,
      0,
    );

    expect(match).toBeNull();
  });
});

describe("forward recommendation ranking", () => {
  const ordinary = station("ordinary", { lng: 116.4, lat: 39.905 }, {
    distanceMeters: 550,
  });
  const serviceAreaStation = station(
    "service-area",
    { lng: 116.4, lat: 39.92 },
    {
      parentId: "area-1",
      distanceMeters: 2_200,
    },
  );
  const behind = station("behind", { lng: 116.4, lat: 39.89 }, {
    distanceMeters: 1_100,
  });
  const east = station("east", { lng: 116.42, lat: 39.9 }, {
    distanceMeters: 1_700,
  });
  const serviceArea = area("area-1", { lng: 116.4, lat: 39.92 });

  it("ranks aligned distance before service-area status in normal mode", () => {
    const ranked = rankRecommendations({
      current,
      heading: 0,
      highwayState: "normal",
      stations: [serviceAreaStation, ordinary, behind, east],
      serviceAreas: [serviceArea],
    });

    expect(ranked.map((item) => item.station.id)).toEqual([
      "ordinary",
      "service-area",
    ]);
  });

  it("prioritizes service-area stations in highway mode", () => {
    const ranked = rankRecommendations({
      current,
      heading: 0,
      highwayState: "confirmed",
      stations: [ordinary, serviceAreaStation, behind],
      serviceAreas: [serviceArea],
    });

    expect(ranked.map((item) => item.station.id)).toEqual([
      "service-area",
      "ordinary",
    ]);
    expect(ranked[0].recommendationOrder).toBe(1);
    expect(ranked[0].serviceAreaMatch?.kind).toBe("inside");
  });

  it("excludes stations outside the forward 120-degree sector", () => {
    const ranked = rankRecommendations({
      current,
      heading: 0,
      highwayState: "normal",
      stations: [ordinary, east, behind],
      serviceAreas: [],
    });

    expect(ranked.map((item) => item.station.id)).toEqual(["ordinary"]);
  });
});
