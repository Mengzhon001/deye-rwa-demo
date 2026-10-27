import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  expect: { timeout: 12000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/site-report.json" }],
  ],
  use: {
    baseURL: process.env.REVENUE_SITE_TEST_URL || "http://127.0.0.1:4174",
    // This skips ngrok's service interstitial for interface regression only.
    // The real MetaMask scenario separately clicks Visit Site in the browser.
    extraHTTPHeaders: /\.ngrok(?:-free)?\.(dev|app)/.test(process.env.REVENUE_SITE_TEST_URL || "")
      ? { "ngrok-skip-browser-warning": "1" } : {},
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "test-results/site",
});
