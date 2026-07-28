import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";

import type { AmapClient } from "./amap-client";
import { createApiRouter } from "./routes";

interface CreateAppOptions {
  amapClient: AmapClient;
}

export function createApp({ amapClient }: CreateAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.use("/api", apiLimiter, createApiRouter(amapClient));
  return app;
}
