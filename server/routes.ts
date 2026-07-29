import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  AmapUpstreamError,
  type AmapClient,
} from "./amap-client";
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

const upstreamMessages: Record<string, string> = {
  "10001": "高德 Web 服务 Key 无效或已过期",
  "10002": "当前 Key 未开通高德 Web 服务 API",
  "10003": "高德接口今日调用配额已用完",
  "10005": "服务器公网 IP 未加入高德 Key 白名单",
  "10021": "高德接口请求过于频繁，请稍后重试",
  "10029": "高德接口请求过于频繁，请稍后重试",
  "10044": "高德账号今日调用配额已用完",
  "20000": "高德接口参数暂时不兼容，请更新系统",
};

function upstreamError(response: Response, error: unknown): void {
  const upstreamCode =
    error instanceof AmapUpstreamError ? error.infocode : null;
  const message =
    (upstreamCode ? upstreamMessages[upstreamCode] : null) ??
    "高德服务暂时不可用，请稍后重试";

  response.status(502).json({
    error: {
      code: "AMAP_UPSTREAM_ERROR",
      message,
      ...(upstreamCode ? { upstreamCode } : {}),
    },
  });
}

function isTruncated(payload: unknown): boolean {
  return (
    payload !== null &&
    typeof payload === "object" &&
    (payload as Record<string, unknown>).truncated === true
  );
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response) => void {
  return (request, response) => {
    handler(request, response).catch((error: unknown) =>
      upstreamError(response, error),
    );
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
      response.json({
        items,
        count: items.length,
        truncated: isTruncated(raw),
      });
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
