import { useCallback, useEffect, useRef, useState } from "react";

import type { ChargingStation } from "../../shared/contracts";
import {
  normalizeStationKeyword,
  type StationKeyword,
} from "../../shared/search-keyword";
import {
  ChargingApiError,
  fetchStationsByKeyword,
  type ApiErrorCode,
} from "../lib/api";

export type KeywordSearchStatus =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "error";

export interface StationKeywordSearchState {
  status: KeywordSearchStatus;
  query: StationKeyword | null;
  stations: ChargingStation[];
  error: { code: ApiErrorCode; message: string } | null;
  search: (input: string) => void;
  clear: () => void;
  retry: () => void;
}

interface UseStationKeywordSearchOptions {
  fetchImpl?: typeof fetch;
}

const initialState = {
  status: "idle" as const,
  query: null,
  stations: [],
  error: null,
};

export function useStationKeywordSearch({
  fetchImpl,
}: UseStationKeywordSearchOptions = {}): StationKeywordSearchState {
  const [state, setState] = useState<
    Omit<StationKeywordSearchState, "search" | "clear" | "retry">
  >(initialState);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const search = useCallback(
    (input: string) => {
      const query = normalizeStationKeyword(input);
      if (!query) {
        controllerRef.current?.abort();
        requestIdRef.current += 1;
        setState({
          status: "error",
          query: null,
          stations: [],
          error: {
            code: "INVALID_QUERY",
            message: "地点名称请控制在 76 个字符内",
          },
        });
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setState({
        status: "loading",
        query,
        stations: [],
        error: null,
      });

      fetchStationsByKeyword(query.display, {
        signal: controller.signal,
        fetchImpl,
      })
        .then((response) => {
          if (requestId !== requestIdRef.current) return;
          setState({
            status: response.count === 0 ? "empty" : "success",
            query: response.query,
            stations: response.items,
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
          setState({
            status: "error",
            query,
            stations: [],
            error: {
              code: apiError.code,
              message: apiError.message,
            },
          });
        });
    },
    [fetchImpl],
  );

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    requestIdRef.current += 1;
    setState(initialState);
  }, []);

  const retry = useCallback(() => {
    if (state.query) search(state.query.display);
  }, [search, state.query]);

  return { ...state, search, clear, retry };
}
