import type {
  ChargingStation,
  Coordinates,
  PoiChild,
  PoiPhoto,
  RoadContext,
  ServiceArea,
} from "../shared/contracts";

type UnknownRecord = Record<string, unknown>;

const automotiveChargingTypecodes = new Set([
  "011100",
  "011101",
  "011102",
  "011103",
]);
const micromobilityPattern =
  /电动自行车|自行车充电|自行车换电|电瓶车|两轮车|换电柜|充电柜/i;

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
