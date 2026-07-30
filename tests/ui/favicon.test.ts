import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("browser favicon", () => {
  it("declares the PNG favicon in the public page head", async () => {
    const html = await readFile("index.html", "utf8");

    expect(html).toContain(
      '<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />',
    );
  });

  it("ships a valid 64 pixel square PNG asset", async () => {
    const favicon = await readFile("public/favicon.png");

    expect(favicon.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
    expect(favicon.readUInt32BE(16)).toBe(64);
    expect(favicon.readUInt32BE(20)).toBe(64);
  });
});
