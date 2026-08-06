import { describe, expect, it } from "vitest";

import {
  amapRoadContextResponse,
  amapServiceAreaResponse,
  fullAmapPoiResponse,
  minimalAmapPoiResponse,
} from "../fixtures/amap";
import {
  normalizeChargingStations,
  normalizeRoadContext,
  normalizeServiceAreas,
} from "../../server/normalize";

describe("AMap response normalization", () => {
  it("normalizes actual POI fields and rejects invalid records", () => {
    const stations = normalizeChargingStations(fullAmapPoiResponse, {
      lng: 116.2468,
      lat: 40.1659,
    });

    expect(stations).toHaveLength(1);
    expect(stations[0]).toEqual({
      id: "B0FFTEST01",
      parentId: "B0FFAREA01",
      name: "京藏高速百葛服务区充电站",
      location: { lng: 116.2468, lat: 40.1659 },
      distanceMeters: 0,
      type: "汽车服务;充电站;充电站",
      typecode: "011100",
      address: "京藏高速百葛服务区东区",
      province: "北京市",
      city: "北京市",
      district: "昌平区",
      alias: "百葛服务区充电站",
      qualityNetworkBrand: null,
      phone: "010-12345678",
      openingToday: "00:00-24:00",
      openingWeek: "周一至周日 00:00-24:00",
      entrance: { lng: 116.2467, lat: 40.1658 },
      exit: { lng: 116.2469, lat: 40.166 },
      photos: [
        {
          title: "站点入口",
          url: "https://example.com/entrance.jpg",
        },
      ],
      children: [
        {
          id: "B0FFCHILD01",
          name: "百葛服务区东区停车场",
          address: null,
        },
      ],
    });
  });

  it("converts missing optional fields to null or empty arrays", () => {
    expect(normalizeChargingStations(minimalAmapPoiResponse)[0]).toMatchObject({
      parentId: null,
      type: null,
      address: null,
      qualityNetworkBrand: null,
      phone: null,
      entrance: null,
      photos: [],
      children: [],
    });
  });

  it("normalizes service areas without charging-only details", () => {
    expect(
      normalizeServiceAreas(amapServiceAreaResponse, {
        lng: 116.247,
        lat: 40.166,
      }),
    ).toEqual([
      {
        id: "B0FFAREA01",
        name: "百葛服务区",
        location: { lng: 116.247, lat: 40.166 },
        distanceMeters: 0,
        address: "京藏高速",
      },
    ]);
  });

  it("selects the nearest named road from reverse geocoding", () => {
    expect(normalizeRoadContext(amapRoadContextResponse)).toEqual({
      formattedAddress: "北京市昌平区京藏高速",
      nearestRoad: "京藏高速",
      roadDistanceMeters: 12.4,
    });
  });
});
