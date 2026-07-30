import type {
  ChargingStation,
  Coordinates,
  PoiChild,
  PoiPhoto,
  RoadContext,
  ServiceArea,
} from "../shared/contracts";
import { haversineMeters } from "../shared/geo";
import { matchQualityChargingNetwork } from "../shared/quality-charging-networks";
import { serviceAreaKeywordCore } from "../shared/search-keyword";

type UnknownRecord = Record<string, unknown>;

const automotiveChargingTypecodes = new Set([
  "011100",
  "011101",
  "011102",
  "011103",
]);
const micromobilityPattern =
  /电动自行车|自行车充电|自行车换电|电瓶车|两轮车|换电柜|充电柜|i换电/i;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const source = text(value);
  if (source === null) return null;
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinate(value: unknown): Coordinates | null {
  const source = text(value);
  if (!source) return null;
  const [lng, lat] = source.split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

function normalizePhotos(value: unknown): PoiPhoto[] {
  return list(value).flatMap((candidate) => {
    const source = record(candidate);
    const url = text(source?.url);
    if (!url?.startsWith("https://")) return [];
    return [{ title: text(source?.title), url }];
  });
}

function normalizeChildren(value: unknown): PoiChild[] {
  return list(value).flatMap((candidate) => {
    const source = record(candidate);
    const id = text(source?.id);
    const name = text(source?.name);
    if (!id || !name) return [];
    return [{ id, name, address: text(source?.address) }];
  });
}

function pois(response: unknown): unknown[] {
  return list(record(response)?.pois);
}

function tips(response: unknown): unknown[] {
  return list(record(response)?.tips);
}

function isAutomotiveChargingPoi(
  source: UnknownRecord,
  name: string,
  alias: string | null,
): boolean {
  const typecode = text(source.typecode);
  if (!typecode || !automotiveChargingTypecodes.has(typecode)) {
    return false;
  }

  const description = [
    name,
    text(source.type),
    text(source.address),
    alias,
  ]
    .filter(Boolean)
    .join(";");
  return !micromobilityPattern.test(description);
}

export function normalizeChargingStations(
  response: unknown,
): ChargingStation[] {
  return pois(response).flatMap((candidate) => {
    const source = record(candidate);
    const id = text(source?.id);
    const name = text(source?.name);
    const location = coordinate(source?.location);
    if (!source || !id || !name || !location) return [];

    const business = record(source.business);
    const navi = record(source.navi);
    const alias = text(business?.alias);
    if (!isAutomotiveChargingPoi(source, name, alias)) return [];
    const qualityNetworkBrand = matchQualityChargingNetwork(name, alias);

    return [
      {
        id,
        parentId: text(source.parent),
        name,
        location,
        distanceMeters: numeric(source.distance) ?? 0,
        type: text(source.type),
        typecode: text(source.typecode),
        address: text(source.address),
        province: text(source.pname),
        city: text(source.cityname),
        district: text(source.adname),
        alias,
        qualityNetworkBrand: qualityNetworkBrand?.label ?? null,
        phone: text(business?.tel),
        openingToday: text(business?.opentime_today),
        openingWeek: text(business?.opentime_week),
        entrance: coordinate(navi?.entr_location),
        exit: coordinate(navi?.exit_location),
        photos: normalizePhotos(source.photos),
        children: normalizeChildren(source.children),
      },
    ];
  });
}

const chargingTypeNames: Record<string, string> = {
  "011100": "汽车服务;充电站;充电站",
  "011101": "汽车服务;换电站;换电站",
  "011102": "汽车服务;充电站;充换电站",
  "011103": "汽车服务;充电站;专用充电站",
};

export function normalizeServiceAreaChargingStations(
  response: unknown,
  keyword: string,
): ChargingStation[] {
  const source = record(response);
  const anchor = record(source?.anchor);
  const anchorLocation = coordinate(anchor?.location);
  const core = serviceAreaKeywordCore(keyword);
  if (!anchor || !anchorLocation || !core) return [];

  const stations = tips(response).flatMap((candidate) => {
    const suggestion = record(candidate);
    const id = text(suggestion?.id);
    const name = text(suggestion?.name);
    const location = coordinate(suggestion?.location);
    const typecode = text(suggestion?.typecode);
    if (!suggestion || !id || !name || !location || !typecode) {
      return [];
    }
    if (!isAutomotiveChargingPoi(suggestion, name, null)) return [];

    const address = text(suggestion.address);
    const distanceMeters = Math.round(
      haversineMeters(anchorLocation, location),
    );
    const description = `${name}${address ?? ""}`.replace(/\s+/gu, "");
    if (!description.includes(core) && distanceMeters > 1_200) return [];

    const qualityNetworkBrand = matchQualityChargingNetwork(name);
    return [
      {
        id,
        parentId: text(anchor.id),
        name,
        location,
        distanceMeters,
        type: chargingTypeNames[typecode] ?? null,
        typecode,
        address,
        province: text(anchor.pname),
        city: text(anchor.cityname),
        district: text(anchor.adname) ?? text(suggestion.district),
        alias: null,
        qualityNetworkBrand: qualityNetworkBrand?.label ?? null,
        phone: null,
        openingToday: null,
        openingWeek: null,
        entrance: null,
        exit: null,
        photos: [],
        children: [],
      } satisfies ChargingStation,
    ];
  });

  return [...new Map(stations.map((station) => [station.id, station])).values()]
    .sort(
      (first, second) =>
        first.distanceMeters - second.distanceMeters ||
        first.name.localeCompare(second.name),
    );
}

export function normalizeServiceAreas(response: unknown): ServiceArea[] {
  return pois(response).flatMap((candidate) => {
    const source = record(candidate);
    const id = text(source?.id);
    const name = text(source?.name);
    const location = coordinate(source?.location);
    if (!source || !id || !name || !location) return [];

    return [
      {
        id,
        name,
        location,
        distanceMeters: numeric(source.distance) ?? 0,
        address: text(source.address),
      },
    ];
  });
}

export function normalizeRoadContext(response: unknown): RoadContext {
  const regeocode = record(record(response)?.regeocode);
  const roads = list(regeocode?.roads)
    .flatMap((candidate) => {
      const source = record(candidate);
      const name = text(source?.name);
      if (!name) return [];
      return [{ name, distance: numeric(source?.distance) }];
    })
    .sort(
      (first, second) =>
        (first.distance ?? Number.POSITIVE_INFINITY) -
        (second.distance ?? Number.POSITIVE_INFINITY),
    );
  const nearest = roads[0];

  return {
    formattedAddress: text(regeocode?.formatted_address),
    nearestRoad: nearest?.name ?? null,
    roadDistanceMeters: nearest?.distance ?? null,
  };
}
