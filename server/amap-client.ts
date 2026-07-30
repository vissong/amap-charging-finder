import type { Coordinates } from "../shared/contracts";
import { serviceAreaKeywordCore } from "../shared/search-keyword";

export interface NearbySearchQuery extends Coordinates {
  radius: number;
}

export interface AmapClient {
  searchChargingStations(query: NearbySearchQuery): Promise<unknown>;
  searchChargingStationsByKeyword(keywords: string): Promise<unknown>;
  searchServiceAreaChargingStations(keywords: string): Promise<unknown>;
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
  sleepImpl?: (milliseconds: number) => Promise<void>;
}

const rateLimitInfocodes = new Set(["10021", "10029"]);
const automotiveChargingTypes = "011100|011101|011102|011103";
const serviceAreaType = "180300";

function location({ lng, lat }: Coordinates): string {
  return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  sleepImpl = sleep,
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
    typecode: typeof automotiveChargingTypes | typeof serviceAreaType,
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
    typecode: typeof automotiveChargingTypes | typeof serviceAreaType,
    maximumPages: number,
  ): Promise<unknown> {
    let firstPayload: Record<string, unknown> | null = null;
    const pois: unknown[] = [];

    for (let pageNumber = 1; pageNumber <= maximumPages; pageNumber += 1) {
      if (pageNumber > 1) {
        await sleepImpl(400);
      }

      let payload: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          payload = await searchNearbyPage(query, typecode, pageNumber);
          break;
        } catch (error) {
          if (
            attempt === 0 &&
            error instanceof AmapUpstreamError &&
            error.infocode !== null &&
            rateLimitInfocodes.has(error.infocode)
          ) {
            await sleepImpl(1_000);
            continue;
          }
          if (firstPayload && pois.length > 0) {
            return {
              ...firstPayload,
              pois,
              truncated: true,
            };
          }
          throw error;
        }
      }
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
      return searchNearbyPages(query, automotiveChargingTypes, 2);
    },
    searchChargingStationsByKeyword(keywords) {
      return request("/v5/place/text", {
        keywords,
        types: automotiveChargingTypes,
        show_fields: "business,navi,children",
        page_size: "25",
        page_num: "1",
        output: "json",
      });
    },
    async searchServiceAreaChargingStations(keywords) {
      const core = serviceAreaKeywordCore(keywords);
      if (!core) return { anchor: null, tips: [] };

      const serviceAreas = (await request("/v5/place/text", {
        keywords,
        types: serviceAreaType,
        show_fields: "business,navi",
        page_size: "10",
        page_num: "1",
        output: "json",
      })) as Record<string, unknown>;
      const anchor = Array.isArray(serviceAreas.pois)
        ? serviceAreas.pois[0]
        : null;
      if (!anchor || typeof anchor !== "object") {
        return { anchor: null, tips: [] };
      }

      const source = anchor as Record<string, unknown>;
      const city =
        typeof source.adcode === "string" ? source.adcode : "";
      const anchorLocation =
        typeof source.location === "string" ? source.location : "";
      const tips: unknown[] = [];

      for (const [index, suggestionKeyword] of [core, "交投"].entries()) {
        if (index > 0) await sleepImpl(400);
        const payload = (await request("/v3/assistant/inputtips", {
          keywords: suggestionKeyword,
          ...(city ? { city, citylimit: "true" } : {}),
          ...(anchorLocation ? { location: anchorLocation } : {}),
          datatype: "poi",
          output: "json",
        })) as Record<string, unknown>;
        if (Array.isArray(payload.tips)) tips.push(...payload.tips);
      }

      return { anchor, tips };
    },
    searchServiceAreas(query) {
      return searchNearbyPages(query, serviceAreaType, 1);
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
