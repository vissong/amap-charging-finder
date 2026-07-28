import { Router, type Request, type Response } from "express";
import { z } from "zod";

import type { AmapClient } from "./amap-client";
import {
  normalizeChargingStations,
  normalizeRoadContext,
  normalizeServiceAreas,
} from "./normalize";
import { normalizeStationKeyword } from "../shared/search-keyword";

const allowedRadii = [3_000, 5_000, 10_000, 20_000, 50_000];

const coordinatesQuery = z.object({
  lng: z.coerce.number().min(73).max(136),
  lat: z.coerce.number().min(3).max(54),
});

const nearbyQuery = coordinatesQuery.extend({
  radius: z.coerce
    .number()
    .refine((value) => allowedRadii.includes(value)),
});

const keywordQuery = z.object({
  keywords: z.string(),
});

function invalidQuery(response: Response): void {
  response.status(400).json({
    error: {
      code: "INVALID_QUERY",
      message: "查询参数无效",
    },
  });
}

function upstreamError(response: Response): void {
  response.status(502).json({
    error: {
      code: "AMAP_UPSTREAM_ERROR",
      message: "高德服务暂时不可用，请稍后重试",
    },
  });
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response) => void {
  return (request, response) => {
    handler(request, response).catch(() => upstreamError(response));
  };
}

export function createApiRouter(amapClient: AmapClient): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  router.get(
    "/charging-stations",
    asyncRoute(async (request, response) => {
      const parsed = nearbyQuery.safeParse(request.query);
      if (!parsed.success) {
        invalidQuery(response);
        return;
      }

      const raw = await amapClient.searchChargingStations(parsed.data);
      const items = normalizeChargingStations(raw);
      response.json({ items, count: items.length });
    }),
  );

  router.get(
    "/search-stations",
    asyncRoute(async (request, response) => {
      const parsed = keywordQuery.safeParse(request.query);
      const query = parsed.success
        ? normalizeStationKeyword(parsed.data.keywords)
        : null;
      if (!query) {
        invalidQuery(response);
        return;
      }

      const raw = await amapClient.searchChargingStationsByKeyword(
        query.submitted,
      );
      const items = normalizeChargingStations(raw);
      response.json({ query, items, count: items.length });
    }),
  );

  router.get(
    "/service-areas",
    asyncRoute(async (request, response) => {
      const parsed = nearbyQuery.safeParse(request.query);
      if (!parsed.success) {
        invalidQuery(response);
        return;
      }

      const raw = await amapClient.searchServiceAreas(parsed.data);
      const items = normalizeServiceAreas(raw);
      response.json({ items, count: items.length });
    }),
  );

  router.get(
    "/road-context",
    asyncRoute(async (request, response) => {
      const parsed = coordinatesQuery.safeParse(request.query);
      if (!parsed.success) {
        invalidQuery(response);
        return;
      }

      const raw = await amapClient.reverseGeocode(parsed.data);
      response.json(normalizeRoadContext(raw));
    }),
  );

  return router;
}
