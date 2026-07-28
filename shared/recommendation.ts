import type {
  ChargingStation,
  Coordinates,
  HighwayState,
  ServiceArea,
} from "./contracts";
import {
  bearingDegrees,
  haversineMeters,
  isAhead,
  smallestAngleDifference,
} from "./geo";

export interface ServiceAreaMatch {
  kind: "inside" | "nearby";
  area: ServiceArea;
}

export interface RankedStation {
  station: ChargingStation;
  bearing: number;
  angleDifference: number;
  serviceAreaMatch: ServiceAreaMatch | null;
  recommendationOrder: number | null;
}

interface RankRecommendationsInput {
  current: Coordinates;
  heading: number;
  highwayState: HighwayState;
  stations: ChargingStation[];
  serviceAreas: ServiceArea[];
}

function namedMatch(
  station: ChargingStation,
  serviceArea: ServiceArea,
): boolean {
  const name = serviceArea.name.trim();
  if (!name) return false;
  return station.name.includes(name) || station.address?.includes(name) === true;
}

export function associateServiceArea(
  station: ChargingStation,
  serviceAreas: ServiceArea[],
  current: Coordinates,
  heading: number,
): ServiceAreaMatch | null {
  const exact = serviceAreas.find(
    (serviceArea) =>
      station.parentId === serviceArea.id ||
      namedMatch(station, serviceArea),
  );
  if (exact) return { kind: "inside", area: exact };

  if (!isAhead(heading, bearingDegrees(current, station.location))) {
    return null;
  }

  const nearby = serviceAreas
    .filter((serviceArea) =>
      isAhead(heading, bearingDegrees(current, serviceArea.location)),
    )
    .map((serviceArea) => ({
      serviceArea,
      distance: haversineMeters(station.location, serviceArea.location),
    }))
    .filter(({ distance }) => distance <= 1_200)
    .sort((first, second) => first.distance - second.distance)[0]?.serviceArea;

  return nearby ? { kind: "nearby", area: nearby } : null;
}

function serviceAreaRank(match: ServiceAreaMatch | null): number {
  if (match?.kind === "inside") return 0;
  if (match?.kind === "nearby") return 1;
  return 2;
}

export function rankRecommendations({
  current,
  heading,
  highwayState,
  stations,
  serviceAreas,
}: RankRecommendationsInput): RankedStation[] {
  const ranked = stations
    .map((station) => {
      const bearing = bearingDegrees(current, station.location);
      const angleDifference = smallestAngleDifference(heading, bearing);
      return {
        station,
        bearing,
        angleDifference,
        serviceAreaMatch: associateServiceArea(
          station,
          serviceAreas,
          current,
          heading,
        ),
        recommendationOrder: null,
      } satisfies RankedStation;
    })
    .filter(({ bearing }) => isAhead(heading, bearing))
    .sort((first, second) => {
      if (highwayState !== "normal") {
        const areaDifference =
          serviceAreaRank(first.serviceAreaMatch) -
          serviceAreaRank(second.serviceAreaMatch);
        if (areaDifference !== 0) return areaDifference;
      }

      const angleDifference =
        first.angleDifference - second.angleDifference;
      if (angleDifference !== 0) return angleDifference;

      const distanceDifference =
        first.station.distanceMeters - second.station.distanceMeters;
      if (distanceDifference !== 0) return distanceDifference;

      return first.station.id.localeCompare(second.station.id);
    });

  return ranked.map((item, index) => ({
    ...item,
    recommendationOrder: index < 3 ? index + 1 : null,
  }));
}
