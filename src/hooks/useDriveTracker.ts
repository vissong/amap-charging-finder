import { useCallback, useEffect, useState } from "react";

import {
  deriveMotion,
  initialMotionSnapshot,
  type MotionSnapshot,
  type PositionSample,
} from "../../shared/motion";
import { wgs84ToGcj02 } from "../../shared/geo";

export type DriveTrackerStatus =
  | "locating"
  | "ready"
  | "permission-denied"
  | "unavailable"
  | "timeout"
  | "unsupported";

export interface DriveTrackerState {
  status: DriveTrackerStatus;
  latest: PositionSample | null;
  samples: PositionSample[];
  motion: MotionSnapshot;
  retry: () => void;
}

function toSample(position: GeolocationPosition): PositionSample {
  const location = wgs84ToGcj02({
    lng: position.coords.longitude,
    lat: position.coords.latitude,
  });

  return {
    timestamp: position.timestamp,
    location,
    accuracyMeters: position.coords.accuracy,
    speedMps:
      position.coords.speed !== null && position.coords.speed >= 0
        ? position.coords.speed
        : null,
    headingDegrees:
      position.coords.heading !== null && position.coords.heading >= 0
        ? position.coords.heading
        : null,
  };
}

function statusForError(error: GeolocationPositionError): DriveTrackerStatus {
  if (error.code === error.PERMISSION_DENIED) return "permission-denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

export function useDriveTracker(): DriveTrackerState {
  const [status, setStatus] = useState<DriveTrackerStatus>("locating");
  const [latest, setLatest] = useState<PositionSample | null>(null);
  const [samples, setSamples] = useState<PositionSample[]>([]);
  const [motion, setMotion] = useState<MotionSnapshot>(
    initialMotionSnapshot,
  );
  const [generation, setGeneration] = useState(0);

  const retry = useCallback(() => {
    setStatus("locating");
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    let active = true;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        const sample = toSample(position);
        setStatus("ready");
        setLatest(sample);
        setSamples((previousSamples) => {
          const nextSamples = [...previousSamples, sample].slice(-8);
          setMotion((previousMotion) =>
            deriveMotion(nextSamples, previousMotion),
          );
          return nextSamples;
        });
      },
      (error) => {
        if (active) setStatus(statusForError(error));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3_000,
        timeout: 10_000,
      },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [generation]);

  return { status, latest, samples, motion, retry };
}
