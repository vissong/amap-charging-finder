import type { StationKeyword } from "./search-keyword";

export interface Coordinates {
  lng: number;
  lat: number;
}

export interface PoiPhoto {
  title: string | null;
  url: string;
}

export interface PoiChild {
  id: string;
  name: string;
  address: string | null;
}

export interface ChargingStation {
  id: string;
  parentId: string | null;
  name: string;
  location: Coordinates;
  distanceMeters: number;
  type: string | null;
  typecode: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  alias: string | null;
  phone: string | null;
  openingToday: string | null;
  openingWeek: string | null;
  entrance: Coordinates | null;
  exit: Coordinates | null;
  photos: PoiPhoto[];
  children: PoiChild[];
}

export interface ServiceArea {
  id: string;
  name: string;
  location: Coordinates;
  distanceMeters: number;
  address: string | null;
}

export interface RoadContext {
  formattedAddress: string | null;
  nearestRoad: string | null;
  roadDistanceMeters: number | null;
}

export type HighwayState = "normal" | "possible" | "confirmed";
export type SearchMode = "nearby" | "forward";
export type SearchRadius = 3_000 | 5_000 | 10_000 | 20_000 | 50_000;

export interface ListResponse<T> {
  items: T[];
  count: number;
}

export interface StationSearchResponse
  extends ListResponse<ChargingStation> {
  query: StationKeyword;
}
