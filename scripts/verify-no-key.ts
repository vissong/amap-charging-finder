import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const envText = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const key = /^AMAP_WEB_SERVICE_KEY=(.+)$/m.exec(envText)?.[1]?.trim();

if (!key) {
  throw new Error("Local .env is missing AMAP_WEB_SERVICE_KEY");
}

const trackedOutput = execFileSync("git", ["ls-files"], {
  encoding: "utf8",
}).trim();
const trackedFiles = trackedOutput ? trackedOutput.split("\n") : [];

function walk(path: string): string[] {
  if (!existsSync(path)) return [];

  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}

const leakedFiles = [...new Set([...trackedFiles, ...walk("dist")])].filter(
  (path) => readFileSync(path).includes(key),
);

if (leakedFiles.length > 0) {
  throw new Error(`AMap key leaked into: ${leakedFiles.join(", ")}`);
}

console.log("AMap key is absent from tracked files and dist");
