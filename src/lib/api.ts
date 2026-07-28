import type {
  ChargingStation,
  Coordinates,
  ListResponse,
  RoadContext,
  ServiceArea,
} from "../../shared/contracts";

export type ApiErrorCode =
  | "INVALID_QUERY"
  | "AMAP_UPSTREAM_ERROR"
  | "NETWORK_ERROR";

export class ChargingApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ChargingApiError";
    this.code = code;
  }
}

interface QueryOptions {
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}

async function requestJson<T>(
  path: string,
  params: Record<string, string>,
  { signal, fetchImpl = fetch }: QueryOptions,
): Promise<T> {
  const query = new URLSearchParams(params);
  let response: Response;

  try {
    response = await fetchImpl(`${path}?${query.toString()}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ChargingApiError("NETWORK_ERROR", "网络连接失败，请稍后重试");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: ApiErrorCode; message?: string };
    } | null;
    throw new ChargingApiError(
      body?.error?.code ?? "NETWORK_ERROR",
      body?.error?.message ?? "服务暂时不可用，请稍后重试",
    );
  }

  return (await response.json()) as T;
}

function coordinateParams(location: Coordinates): Record<string, string> {
  return {
    lng: String(location.lng),
    lat: String(location.lat),
  };
}

export function fetchChargingStations(
  location: Coordinates,
  radius: number,
  options: QueryOptions,
): Promise<ListResponse<ChargingStation>> {
  return requestJson(
    "/api/charging-stations",
    { ...coordinateParams(location), radius: String(radius) },
    options,
  );
}

export function fetchServiceAreas(
  location: Coordinates,
  radius: number,
  options: QueryOptions,
): Promise<ListResponse<ServiceArea>> {
  return requestJson(
    "/api/service-areas",
    { ...coordinateParams(location), radius: String(radius) },
    options,
  );
}

export function fetchRoadContext(
  location: Coordinates,
  options: QueryOptions,
): Promise<RoadContext> {
  return requestJson(
    "/api/road-context",
    coordinateParams(location),
    options,
  );
}
