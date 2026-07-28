import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    geolocation: {
      longitude: 116.4,
      latitude: 39.9,
      accuracy: 15,
    },
    permissions: ["geolocation"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-portrait",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile-landscape",
      use: { viewport: { width: 844, height: 390 } },
    },
    {
      name: "car-display",
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: {
    command:
      "PORT=4173 AMAP_WEB_SERVICE_KEY=e2e-placeholder npm run dev",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
