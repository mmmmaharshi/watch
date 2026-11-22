import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? "4321";
// Set LIVE_URL to grade the deployed site instead of a local server.
const live = process.env.LIVE_URL;
const baseURL = live ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    // Offline: hydration, input checks, layout. Safe on every pull request.
    { name: "ci", use: { ...devices["Desktop Chrome"] }, grepInvert: /@live/ },
    // Live: real search and provider lookups. Nightly and after deploy.
    {
      name: "live",
      use: { ...devices["Desktop Chrome"] },
      grep: /@live/,
      fullyParallel: false,
    },
    // The phone is where this app is mostly used; grade the same criteria there.
    {
      name: "live-mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@live/,
      fullyParallel: false,
    },
  ],
  webServer: live
    ? undefined
    : {
        command: `bunx astro dev --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
