import type { Coordinates } from "./contracts";

const EARTH_RADIUS_METERS = 6_371_000;
const GCJ_EARTH_AXIS_METERS = 6_378_245;
const GCJ_ECCENTRICITY_SQUARED = 0.006693421622965943;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function isOutsideGcj02Coverage({ lng, lat }: Coordinates): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLatitude(lng: number, lat: number): number {
  let result =
    -100 +
    2 * lng +
    3 * lat +
    0.2 * lat ** 2 +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng));
  result +=
    ((20 * Math.sin(6 * lng * Math.PI) +
      20 * Math.sin(2 * lng * Math.PI)) *
      2) /
    3;
  result +=
    ((20 * Math.sin(lat * Math.PI) +
      40 * Math.sin((lat / 3) * Math.PI)) *
      2) /
    3;
  result +=
    ((160 * Math.sin((lat / 12) * Math.PI) +
      320 * Math.sin((lat * Math.PI) / 30)) *
      2) /
    3;
  return result;
}

function transformLongitude(lng: number, lat: number): number {
  let result =
    300 +
    lng +
    2 * lat +
    0.1 * lng ** 2 +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  result +=
    ((20 * Math.sin(6 * lng * Math.PI) +
      20 * Math.sin(2 * lng * Math.PI)) *
      2) /
    3;
  result +=
    ((20 * Math.sin(lng * Math.PI) +
      40 * Math.sin((lng / 3) * Math.PI)) *
      2) /
    3;
  result +=
    ((150 * Math.sin((lng / 12) * Math.PI) +
      300 * Math.sin((lng / 30) * Math.PI)) *
      2) /
    3;
  return result;
}

/** Converts browser Geolocation WGS84 coordinates to AMap's GCJ-02 system. */
export function wgs84ToGcj02(location: Coordinates): Coordinates {
  if (isOutsideGcj02Coverage(location)) return { ...location };

  const longitudeOffset = location.lng - 105;
  const latitudeOffset = location.lat - 35;
  const latitudeRadians = radians(location.lat);
  const sineLatitude = Math.sin(latitudeRadians);
  const magic = 1 - GCJ_ECCENTRICITY_SQUARED * sineLatitude ** 2;
  const squareRootMagic = Math.sqrt(magic);
  const latitudeDelta =
    (transformLatitude(longitudeOffset, latitudeOffset) * 180) /
    (((GCJ_EARTH_AXIS_METERS * (1 - GCJ_ECCENTRICITY_SQUARED)) /
      (magic * squareRootMagic)) *
      Math.PI);
  const longitudeDelta =
    (transformLongitude(longitudeOffset, latitudeOffset) * 180) /
    ((GCJ_EARTH_AXIS_METERS / squareRootMagic) *
      Math.cos(latitudeRadians) *
      Math.PI);

  return {
    lng: location.lng + longitudeDelta,
    lat: location.lat + latitudeDelta,
  };
}

export function haversineMeters(
  first: Coordinates,
  second: Coordinates,
): number {
  const firstLatitude = radians(first.lat);
  const secondLatitude = radians(second.lat);
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lng - first.lng);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function bearingDegrees(
  from: Coordinates,
  to: Coordinates,
): number {
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const longitudeDelta = radians(to.lng - from.lng);

  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) *
      Math.cos(toLatitude) *
      Math.cos(longitudeDelta);

  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

export function smallestAngleDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function isAhead(
  currentHeading: number,
  targetBearing: number,
  halfAngle = 60,
): boolean {
  return smallestAngleDifference(currentHeading, targetBearing) <= halfAngle;
}
