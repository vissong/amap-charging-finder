import type { HighwayState, RoadContext } from "./contracts";

const HIGHWAY_PATTERN = /高速(?:公路)?|expressway/i;

function mentionsHighway(value: string | null): boolean {
  return value !== null && HIGHWAY_PATTERN.test(value);
}

export function classifyHighway(
  context: RoadContext,
  accuracyMeters: number,
): HighwayState {
  const roadSignal = mentionsHighway(context.nearestRoad);
  const addressSignal = mentionsHighway(context.formattedAddress);

  if (
    roadSignal &&
    context.roadDistanceMeters !== null &&
    context.roadDistanceMeters <= 50 &&
    accuracyMeters <= 50
  ) {
    return "confirmed";
  }

  if (roadSignal || addressSignal) {
    return "possible";
  }

  return "normal";
}
