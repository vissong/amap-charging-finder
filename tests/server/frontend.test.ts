import express from "express";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { serveProductionFrontend } from "../../server/frontend";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("production frontend hosting", () => {
  it("serves the SPA entry point for client-side routes", async () => {
    const distDirectory = await mkdtemp(
      join(tmpdir(), "charging-finder-dist-"),
    );
    temporaryDirectories.push(distDirectory);
    await writeFile(
      join(distDirectory, "index.html"),
      "<!doctype html><title>前电</title>",
      "utf8",
    );

    const app = express();
    serveProductionFrontend(app, distDirectory);

    const response = await request(app).get("/station/example");

    expect(response.status).toBe(200);
    expect(response.text).toContain("<title>前电</title>");
  });
});
