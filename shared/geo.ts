import type { Coordinates } from "./contracts";

const EARTH_RADIUS_METERS = 6_371_000;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
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
