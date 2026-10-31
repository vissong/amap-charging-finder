import "dotenv/config";

import { resolve } from "node:path";

import { createAmapClient } from "./amap-client";
import { createApp } from "./app";
import { getServerConfig } from "./config";
import { serveProductionFrontend } from "./frontend";
import { createRequestRateLimiter } from "./request-rate-limiter";

async function main(): Promise<void> {
  const config = getServerConfig();
  const requestRateLimiter = createRequestRateLimiter({
    maxQps: config.amapMaxQps,
  });
  const amapClient = createAmapClient({
    key: config.amapWebServiceKey,
    requestRateLimiter,
  });
  const app = createApp({ amapClient });

  if (process.env.NODE_ENV === "production") {
    const dist = resolve("dist");
    serveProductionFrontend(app, dist);
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(config.port, () => {
    console.log(`Charging finder listening on http://localhost:${config.port}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Unable to start charging finder: ${message}`);
  process.exitCode = 1;
});
