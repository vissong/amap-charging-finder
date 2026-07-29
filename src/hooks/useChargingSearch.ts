import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChargingStation,
  Coordinates,
  HighwayState,
  RoadContext,
  SearchMode,
  SearchRadius,
  ServiceArea,
} from "../../shared/contracts";
import { haversineMeters } from "../../shared/geo";
import { classifyHighway } from "../../shared/highway";
import type {
  MotionSnapshot,
  PositionSample,
} from "../../shared/motion";
import {
  rankRecommendations,
  type RankedStation,
} from "../../shared/recommendation";
import {
  ChargingApiError,
  fetchChargingStations,
  fetchRoadContext,
  fetchServiceAreas,
  type ApiErrorCode,
} from "../lib/api";

export interface SearchAnchor {
  location: Coordinates;
  heading: number | null;
  radius: number;
  mode: SearchMode;
  timestamp: number;
}

export function shouldRefreshSearch(
  previous: SearchAnchor | null,
  next: SearchAnchor,
): boolean {
  if (!previous) return true;
  if (previous.radius !== next.radius) return true;
  return (
    previous.mode === "forward" &&
    next.mode === "forward" &&
    haversineMeters(previous.location, next.location) >= 1_000
  );
}

export type ChargingSearchStatus =
  | "idle"
  | "awaiting-direction"
  | "loading"
  | "success"
  | "empty"
  | "error";

export interface ChargingSearchState {
  status: ChargingSearchStatus;
  stations: ChargingStation[];
  ranked: RankedStation[];
  serviceAreas: ServiceArea[];
  roadContext: RoadContext | null;
  highwayState: HighwayState;
  truncated: boolean;
  refreshing: boolean;
  error: { code: ApiErrorCode; message: string } | null;
  retry: () => void;
}

interface UseChargingSearchInput {
  latest: PositionSample | null;
  motion: MotionSnapshot;
  mode: SearchMode;
  radius: SearchRadius;
  fetchImpl?: typeof fetch;
}

const emptyState: Omit<ChargingSearchState, "status" | "retry"> = {
  stations: [],
  ranked: [],
  serviceAreas: [],
  roadContext: null,
  highwayState: "normal",
  truncated: false,
  refreshing: false,
  error: null,
};

export function useChargingSearch({
  latest,
  motion,
  mode,
  radius,
  fetchImpl,
}: UseChargingSearchInput): ChargingSearchState {
  const initialStatus: ChargingSearchStatus =
    mode === "forward" &&
    (motion.phase !== "moving" || motion.heading === null)
      ? "awaiting-direction"
      : "idle";
  const [state, setState] = useState<
    Omit<ChargingSearchState, "retry">
  >({
    status: initialStatus,
    ...emptyState,
  });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const anchorRef = useRef<SearchAnchor | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const retry = useCallback(() => {
    anchorRef.current = null;
    setRetryGeneration((value) => value + 1);
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!latest) {
      setState({ status: "idle", ...emptyState });
      return;
    }

    if (
      mode === "forward" &&
      (motion.phase !== "moving" || motion.heading === null)
    ) {
      setState((previous) => ({
        ...previous,
        status: "awaiting-direction",
        ranked: [],
        error: null,
      }));
      return;
    }

    const nextAnchor: SearchAnchor = {
      location: latest.location,
      heading: motion.heading,
      radius,
      mode,
      timestamp: latest.timestamp,
    };
    if (!shouldRefreshSearch(anchorRef.current, nextAnchor)) {
      if (anchorRef.current?.mode !== nextAnchor.mode) {
        anchorRef.current = nextAnchor;
      }
      setState((previous) => {
        if (
          previous.status === "loading" ||
          previous.status === "error"
        ) {
          return previous;
        }
        const ranked =
          mode === "forward" && motion.heading !== null
            ? rankRecommendations({
                current: latest.location,
                heading: motion.heading,
                highwayState: previous.highwayState,
                stations: previous.stations,
                serviceAreas: previous.serviceAreas,
              })
            : [];
        const resultCount =
          mode === "forward" ? ranked.length : previous.stations.length;
        return {
          ...previous,
          status: resultCount === 0 ? "empty" : "success",
          ranked,
        };
      });
      return;
    }
    anchorRef.current = nextAnchor;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((previous) => {
      const keepLoadedResults = previous.stations.length > 0;
      return {
        ...previous,
        status: keepLoadedResults ? previous.status : "loading",
        refreshing: keepLoadedResults,
        error: null,
      };
    });

    const options = { signal: controller.signal, fetchImpl };
    Promise.all([
      fetchChargingStations(latest.location, radius, options),
      fetchRoadContext(latest.location, options),
    ])
      .then(async ([stationResponse, roadContext]) => {
        const highwayState = classifyHighway(
          roadContext,
          latest.accuracyMeters,
        );
        const areaResponse =
          motion.phase === "moving" && highwayState !== "normal"
            ? await fetchServiceAreas(latest.location, radius, options)
            : { items: [], count: 0 };
        if (requestId !== requestIdRef.current) return;

        const stations = [...stationResponse.items].sort(
          (first, second) =>
            first.distanceMeters - second.distanceMeters ||
            first.id.localeCompare(second.id),
        );
        const ranked =
          mode === "forward" && motion.heading !== null
            ? rankRecommendations({
                current: latest.location,
                heading: motion.heading,
                highwayState,
                stations,
                serviceAreas: areaResponse.items,
              })
            : [];
        const resultCount =
          mode === "forward" ? ranked.length : stations.length;

        setState({
          status: resultCount === 0 ? "empty" : "success",
          stations,
          ranked,
          serviceAreas: areaResponse.items,
          roadContext,
          highwayState,
          truncated: stationResponse.truncated ?? false,
          refreshing: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }
        const apiError =
          error instanceof ChargingApiError
            ? error
            : new ChargingApiError(
                "NETWORK_ERROR",
                "网络连接失败，请稍后重试",
              );
        setState((previous) => ({
          ...previous,
          status:
            previous.stations.length > 0 ? previous.status : "error",
          refreshing: false,
          error: { code: apiError.code, message: apiError.message },
        }));
      });
  }, [
    fetchImpl,
    latest,
    mode,
    motion.heading,
    motion.phase,
    radius,
    retryGeneration,
  ]);

  return { ...state, retry };
}
