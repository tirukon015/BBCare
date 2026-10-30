import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * End-to-end tests run against a disposable database (name must end in _test or _ci) and a
 * dedicated Next.js server on port 3100. Device projects emulate Windows/macOS desktops,
 * Android phones, iPhones and iPads. In this cloud environment only Chromium is installed,
 * so mobile Safari layouts are emulated with Chromium; set PW_WEBKIT=1 where WebKit is
 * installed (for example in CI) to also run the real WebKit engine.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE || undefined;
const chromium = { launchOptions: executablePath ? { executablePath } : {} };

const projects = [
  { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], ...chromium } },
  { name: "android-phone", use: { ...devices["Pixel 7"], ...chromium } },
  { name: "iphone", use: { ...devices["iPhone 14"], browserName: "chromium" as const, ...chromium } },
  { name: "ipad", use: { ...devices["iPad (gen 7)"], browserName: "chromium" as const, ...chromium } },
];
if (process.env.PW_WEBKIT === "1") {
  projects.push({ name: "iphone-webkit", use: { ...devices["iPhone 14"] } } as (typeof projects)[number]);
  projects.push({ name: "desktop-safari", use: { ...devices["Desktop Safari"] } } as (typeof projects)[number]);
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-MY",
    timezoneId: "Asia/Kuala_Lumpur",
  },
  projects,
  webServer: {
    command: process.env.E2E_SERVER_COMMAND ?? `pnpm exec next dev -p ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      BBCARE_ENV: "test",
      BBCARE_AI_PROVIDER: "mock",
      BBCARE_RATE_LIMIT_MULTIPLIER: "50",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DIST_DIR: ".next-e2e",
      // Synthetic geolocation ranges (RFC 5737) so the geographic pipeline can be exercised end to end.
      BBCARE_GEOIP_CSV: fileURLToPath(new URL("./e2e/fixtures/geoip-test.csv", import.meta.url)),
    },
  },
});
