import type { Coordinates } from "./contracts";
import { bearingDegrees, haversineMeters } from "./geo";

export interface PositionSample {
  timestamp: number;
  location: Coordinates;
  accuracyMeters: number;
  speedMps: number | null;
  headingDegrees: number | null;
}

export type MotionPhase = "stationary" | "moving";

export interface MotionSnapshot {
  phase: MotionPhase;
  speedMps: number | null;
  heading: number | null;
  accurate: boolean;
  movingVotes: number;
  stationarySince: number | null;
}

export const initialMotionSnapshot: MotionSnapshot = {
  phase: "stationary",
  speedMps: null,
  heading: null,
  accurate: false,
  movingVotes: 0,
  stationarySince: null,
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function validHeading(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < 360
  );
}

export function circularMean(headings: number[]): number | null {
  if (headings.length === 0) return null;
  const vectors = headings.reduce(
    (sum, heading) => {
      const radians = (heading * Math.PI) / 180;
      return {
        x: sum.x + Math.cos(radians),
        y: sum.y + Math.sin(radians),
      };
    },
    { x: 0, y: 0 },
  );

  const degrees = (Math.atan2(vectors.y, vectors.x) * 180) / Math.PI;
  const normalized = ((degrees % 360) + 360) % 360;
  return Math.abs(normalized - 360) < 1e-10 ? 0 : normalized;
}

export function deriveHeading(samples: PositionSample[]): number | null {
  const accurateSamples = samples.filter(
    (sample) => sample.accuracyMeters <= 100,
  );
  const deviceHeadings = accurateSamples
    .filter(
      (sample) =>
        validHeading(sample.headingDegrees) &&
        (sample.speedMps === null || sample.speedMps >= 1),
    )
    .slice(-3)
    .map((sample) => sample.headingDegrees as number);

  if (deviceHeadings.length > 0) {
    return circularMean(deviceHeadings);
  }

  const derivedHeadings: number[] = [];
  for (let index = 1; index < accurateSamples.length; index += 1) {
    const previous = accurateSamples[index - 1];
    const current = accurateSamples[index];
    if (haversineMeters(previous.location, current.location) >= 10) {
      derivedHeadings.push(
        bearingDegrees(previous.location, current.location),
      );
    }
  }

  return circularMean(derivedHeadings.slice(-3));
}

function sampleSpeeds(samples: PositionSample[]): number[] {
  const accurateSamples = samples.filter(
    (sample) => sample.accuracyMeters <= 100,
  );

  return accurateSamples.flatMap((sample, index) => {
    if (
      sample.speedMps !== null &&
      Number.isFinite(sample.speedMps) &&
      sample.speedMps >= 0
    ) {
      return [sample.speedMps];
    }

    const previous = accurateSamples[index - 1];
    const seconds = previous
      ? (sample.timestamp - previous.timestamp) / 1_000
      : 0;
    if (!previous || seconds <= 0) return [];

    return [haversineMeters(previous.location, sample.location) / seconds];
  });
}

export function deriveMotion(
  samples: PositionSample[],
  previous: MotionSnapshot = initialMotionSnapshot,
): MotionSnapshot {
  const latest = samples.at(-1);
  if (!latest) return previous;

  const accurate = latest.accuracyMeters <= 100;
  const speeds = sampleSpeeds(samples).slice(-3);
  const measuredSpeed = median(speeds);
  const speedMps = measuredSpeed ?? previous.speedMps;
  const derivedHeading = deriveHeading(samples);
  const heading = derivedHeading ?? previous.heading;

  let movingVotes =
    measuredSpeed !== null && measuredSpeed >= 3
      ? previous.movingVotes + 1
      : 0;
  let stationarySince =
    measuredSpeed !== null && measuredSpeed < 1.5
      ? (previous.stationarySince ?? latest.timestamp)
      : null;
  let phase: MotionPhase =
    previous.phase === "moving" || movingVotes >= 2 ? "moving" : "stationary";

  if (
    phase === "moving" &&
    stationarySince !== null &&
    latest.timestamp - stationarySince >= 15_000
  ) {
    phase = "stationary";
    movingVotes = 0;
    stationarySince = null;
  }

  return {
    phase,
    speedMps,
    heading,
    accurate,
    movingVotes,
    stationarySince,
  };
}
