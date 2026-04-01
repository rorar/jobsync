import { chromium, type FullConfig } from "@playwright/test";
import { cleanupStaleE2EData } from "./cleanup-stale-data";

async function globalSetup(config: FullConfig) {
  // Clean up stale E2E test data from previous runs
  await cleanupStaleE2EData();

  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:3737";

  // Warm up the dev server — Turbopack compiles on first request,
  // which can overwhelm the server when all workers hit it at once.
  await warmUpServer(baseURL);

  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage();

  await page.goto(`${baseURL}/signin`);
  await page.getByPlaceholder("id@example.com").fill("admin@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });

  await page.context().storageState({ path: "e2e/.auth/user.json" });
  await browser.close();
}

/**
 * Hit key routes to trigger Turbopack compilation before tests start.
 * Retries with backoff until the server responds.
 */
async function warmUpServer(baseURL: string) {
  const routes = ["/signin", "/dashboard"];
  for (const route of routes) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await fetch(`${baseURL}${route}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok || res.status === 307) break; // 307 = auth redirect, still means server is ready
      } catch {
        // Server not ready yet
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export default globalSetup;
