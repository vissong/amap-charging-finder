import express, { type Express } from "express";

export function serveProductionFrontend(
  app: Express,
  distDirectory: string,
): void {
  app.use(express.static(distDirectory));
  app.use((request, response, next) => {
    if (
      request.method !== "GET" ||
      request.path.startsWith("/api/")
    ) {
      next();
      return;
    }

    response.sendFile(
      "index.html",
      { root: distDirectory },
      (error) => {
        if (error) {
          next(error);
        }
      },
    );
  });
}
