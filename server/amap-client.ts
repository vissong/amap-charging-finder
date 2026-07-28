import type { Coordinates } from "../shared/contracts";

export interface NearbySearchQuery extends Coordinates {
  radius: number;
}

export interface AmapClient {
  searchChargingStations(query: NearbySearchQuery): Promise<unknown>;
  searchChargingStationsByKeyword(keywords: string): Promise<unknown>;
  searchServiceAreas(query: NearbySearchQuery): Promise<unknown>;
  reverseGeocode(query: Coordinates): Promise<unknown>;
}

export class AmapUpstreamError extends Error {
  readonly infocode: string | null;

  constructor(message: string, infocode: string | null = null) {
    super(message);
    this.name = "AmapUpstreamError";
    this.infocode = infocode;
  }
}

interface CreateAmapClientOptions {
  key: string;
  fetchImpl?: typeof fetch;
}

function location({ lng, lat }: Coordinates): string {
  return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

function upstreamStatus(payload: unknown): {
  status: string | null;
  info: string | null;
  infocode: string | null;
} {
  if (payload === null || typeof payload !== "object") {
    return { status: null, info: null, infocode: null };
  }
  const source = payload as Record<string, unknown>;
  return {
    status: typeof source.status === "string" ? source.status : null,
    info: typeof source.info === "string" ? source.info : null,
    infocode: typeof source.infocode === "string" ? source.infocode : null,
  };
}

export function createAmapClient({
  key,
  fetchImpl = fetch,
}: CreateAmapClientOptions): AmapClient {
  async function request(
    pathname: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(pathname, "https://restapi.amap.com");
    url.search = new URLSearchParams({ ...params, key }).toString();

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AmapUpstreamError("AMap request failed");
    }

    if (!response.ok) {
      throw new AmapUpstreamError(`AMap HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AmapUpstreamError("AMap returned invalid JSON");
    }

    const result = upstreamStatus(payload);
    if (result.status !== "1") {
      throw new AmapUpstreamError(
        result.info ?? "AMap returned an error",
        result.infocode,
      );
    }

    return payload;
  }

  function searchNearbyPage(
    query: NearbySearchQuery,
    typecode: "011100" | "180300",
    pageNumber: number,
  ): Promise<unknown> {
    return request("/v5/place/around", {
      location: location(query),
      radius: String(query.radius),
      types: typecode,
      sortrule: "distance",
      show_fields: "business,navi,children",
      page_size: "25",
      page_num: String(pageNumber),
      output: "json",
    });
  }

  async function searchNearbyPages(
    query: NearbySearchQuery,
    typecode: "011100" | "180300",
    maximumPages: number,
  ): Promise<unknown> {
    let firstPayload: Record<string, unknown> | null = null;
    const pois: unknown[] = [];

    for (let pageNumber = 1; pageNumber <= maximumPages; pageNumber += 1) {
      const payload = await searchNearbyPage(query, typecode, pageNumber);
      const source =
        payload !== null && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      const pagePois = Array.isArray(source.pois) ? source.pois : [];

      firstPayload ??= source;
      pois.push(...pagePois);

      if (pagePois.length < 25) {
        break;
      }
    }

    const reportedCount = Number(firstPayload?.count);
    const truncated =
      pois.length === maximumPages * 25 ||
      (Number.isFinite(reportedCount) && reportedCount > pois.length);

    return {
      ...(firstPayload ?? {}),
      pois,
      truncated,
    };
  }

  return {
    searchChargingStations(query) {
      return searchNearbyPages(query, "011100", 8);
    },
    searchChargingStationsByKeyword(keywords) {
      return request("/v5/place/text", {
        keywords,
        types: "011100",
        show_fields: "business,navi,children",
        page_size: "25",
        page_num: "1",
        output: "json",
      });
    },
    searchServiceAreas(query) {
      return searchNearbyPages(query, "180300", 1);
    },
    reverseGeocode(query) {
      return request("/v3/geocode/regeo", {
        location: location(query),
        extensions: "all",
        roadlevel: "0",
        output: "json",
      });
    },
  };
}
