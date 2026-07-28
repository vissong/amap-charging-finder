import "dotenv/config";

import express from "express";
import { resolve } from "node:path";

import { createAmapClient } from "./amap-client";
import { createApp } from "./app";
import { getServerConfig } from "./config";

async function main(): Promise<void> {
  const config = getServerConfig();
  const amapClient = createAmapClient({ key: config.amapWebServiceKey });
  const app = createApp({ amapClient });

  if (process.env.NODE_ENV === "production") {
    const dist = resolve("dist");
    app.use(express.static(dist));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.sendFile(resolve(dist, "index.html"));
    });
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
