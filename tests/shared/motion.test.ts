import { describe, expect, it } from "vitest";

import {
  circularMean,
  deriveHeading,
  deriveMotion,
  initialMotionSnapshot,
  type PositionSample,
} from "../../shared/motion";

const baseSample: PositionSample = {
  timestamp: 1_000,
  location: { lng: 116.397499, lat: 39.908722 },
  accuracyMeters: 15,
  speedMps: null,
  headingDegrees: null,
};

describe("motion engine", () => {
  it("enters moving after two consecutive speed votes at or above 3 m/s", () => {
    const samples = [
      { ...baseSample, timestamp: 1_000, speedMps: 3.2 },
      { ...baseSample, timestamp: 2_000, speedMps: 3.4 },
      { ...baseSample, timestamp: 3_000, speedMps: 3.6 },
      { ...baseSample, timestamp: 4_000, speedMps: 3.8 },
    ];

    const afterFirstVote = deriveMotion(
      samples.slice(0, 3),
      initialMotionSnapshot,
    );
    const afterSecondVote = deriveMotion(samples, afterFirstVote);

    expect(afterFirstVote.phase).toBe("stationary");
    expect(afterSecondVote.phase).toBe("moving");
    expect(afterSecondVote.speedMps).toBe(3.6);
  });

  it("returns to stationary after staying below 1.5 m/s for 15 seconds", () => {
    const moving = {
      ...initialMotionSnapshot,
      phase: "moving" as const,
      movingVotes: 2,
    };
    const slowingSamples = [
      { ...baseSample, timestamp: 10_000, speedMps: 1 },
      { ...baseSample, timestamp: 11_000, speedMps: 1.2 },
      { ...baseSample, timestamp: 12_000, speedMps: 1.1 },
    ];
    const slowing = deriveMotion(slowingSamples, moving);
    const stopped = deriveMotion(
      slowingSamples.map((sample) => ({
        ...sample,
        timestamp: sample.timestamp + 15_000,
      })),
      slowing,
    );

    expect(slowing.phase).toBe("moving");
    expect(stopped.phase).toBe("stationary");
  });

  it("averages headings across zero degrees", () => {
    expect(circularMean([350, 10])).toBeCloseTo(0, 5);
  });

  it("derives a heading from positions at least 10 meters apart", () => {
    expect(
      deriveHeading([
        baseSample,
        {
          ...baseSample,
          timestamp: 3_000,
          location: { lng: 116.397499, lat: 39.908922 },
        },
      ]),
    ).toBeCloseTo(0, 0);
  });

  it("does not derive a heading from samples less than 10 meters apart", () => {
    expect(
      deriveHeading([
        baseSample,
        {
          ...baseSample,
          timestamp: 2_000,
          location: { lng: 116.397499, lat: 39.908732 },
        },
      ]),
    ).toBeNull();
  });

  it("rejects low-accuracy samples from speed and direction updates", () => {
    const snapshot = deriveMotion(
      [
        {
          ...baseSample,
          accuracyMeters: 140,
          speedMps: 20,
          headingDegrees: 90,
        },
      ],
      initialMotionSnapshot,
    );

    expect(snapshot.accurate).toBe(false);
    expect(snapshot.speedMps).toBeNull();
    expect(snapshot.heading).toBeNull();
  });
});
