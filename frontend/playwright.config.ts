import { defineConfig, devices } from "@playwright/test";

// End-to-end flows against the real demo stack (make up at the repo root).
// The dev server proxies to CPD_URL; tokens come from the env or the demo's token files.
const port = 5173;
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npm run dev -- --port ${port} --strictPort`, port, reuseExistingServer: true },
});
