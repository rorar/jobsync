import { defineConfig, devices } from "@playwright/test";

// The port is per worktree (scripts/lib-devserver.sh): the main checkout keeps
// 3737, linked worktrees get a port derived from their path, so two checkouts
// can run suites at the same time without one killing the other's server.
// scripts/test-e2e.sh exports this; the fallback keeps a bare `playwright test`
// working against a hand-started server on the default port.
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3737";

// Dev server or production server. scripts/test-e2e.sh exports E2E_PROD and
// pre-starts the server itself, so `webServer` below is only ever the fallback
// for a bare `playwright test` — but a fallback that starts the WRONG kind of
// server is worse than none: it would answer the readiness probe, the suite
// would run green against a dev server, and the run would silently not be the
// measurement it claims to be.
const E2E_PROD = process.env.E2E_PROD === "1";
// `next start` defaults to 3000, unlike `next dev`, which package.json points at
// PORT. Take the port from the base URL so both modes bind what Playwright polls.
const E2E_PORT = new URL(E2E_BASE_URL).port || "3000";

const chromiumOptions = {
  ...devices["Desktop Chrome"],
  launchOptions: {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  },
};

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: E2E_BASE_URL,
    actionTimeout: 10_000,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "smoke",
      testDir: "./e2e/smoke",
      use: { ...chromiumOptions },
      // NO storageState — these tests verify the auth flow itself
    },
    {
      name: "crud",
      testDir: "./e2e/crud",
      dependencies: ["smoke"],
      use: {
        ...chromiumOptions,
        storageState: "e2e/.auth/user.json",
        // Taller than the 720px Desktop-Chrome default: the AddJob dialog is a
        // long form, and the DatePicker calendar popover (with its "Clear date"
        // button at the bottom) can render below the fold at 720px, leaving the
        // button outside the viewport. Width is unchanged so responsive
        // (width-based) breakpoints behave identically.
        viewport: { width: 1280, height: 1000 },
      },
    },
  ],

  webServer: {
    // A production fallback cannot build for you: `next start` on a missing
    // build exits with "Could not find a production build", which is the honest
    // failure. scripts/e2e-prod-build.sh is the supported way in, and
    // scripts/test-e2e.sh runs it.
    command: E2E_PROD
      ? `bunx next start -p ${E2E_PORT}`
      : "bun run dev",
    url: E2E_BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
