/**
 * Staging layout toggle — happy path E2E (Stream G / honesty gate)
 *
 * Verifies the StagingLayoutToggle (task 5 of the UX sprint) switches the
 * layout size and persists the choice in localStorage across reload.
 *
 * The control is a SINGLE icon Button (data-testid="staging-layout-toggle"),
 * not the original three-radio group — StagingLayoutToggle.tsx dropped the
 * radiogroup because users expected one enlarge/minimise affordance. Its
 * aria-label names the state the NEXT click produces, so it reads
 * "Comfortable" while the layout is compact/default and "Compact" once
 * enlarged. Storage key: jobsync-staging-layout-size.
 */
import { test, expect, type Page } from "@playwright/test";

const STORAGE_KEY = "jobsync-staging-layout-size";

async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function navigateToStaging(page: Page) {
  await page.goto("/dashboard/staging");
  await page.waitForLoadState("domcontentloaded");
  await page
    .getByRole("tab", { name: /New/i })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
}

async function readStoredSize(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
}

test.describe("Staging layout toggle", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("switches to comfortable and persists across reload", async ({
    page,
  }) => {
    test.setTimeout(45_000);

    await navigateToStaging(page);

    // Capture original state so we can restore it at the end
    const original = await readStoredSize(page);

    const toggle = page.getByTestId("staging-layout-toggle");
    await expect(toggle).toBeVisible({ timeout: 5000 });

    // A previous session may have left the layout comfortable. Cycle back so
    // the enlarge step below is actually exercised rather than reversed.
    if ((await toggle.getAttribute("aria-label")) === "Compact") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-label", "Comfortable");
    }

    // Enlarge
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", "Compact");

    // Verify localStorage was updated
    const afterClick = await readStoredSize(page);
    expect(afterClick).toBe("comfortable");

    // Reload — the value must persist
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page
      .getByRole("tab", { name: /New/i })
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    const afterReload = await readStoredSize(page);
    expect(afterReload).toBe("comfortable");

    // The button reflects the persisted choice: it now offers "Compact"
    await expect(
      page.getByTestId("staging-layout-toggle"),
    ).toHaveAttribute("aria-label", "Compact");

    // Cleanup: restore whatever this session started with. The button can only
    // reach compact/comfortable, so a persisted "default" is restored directly.
    await page.evaluate(
      ([key, value]) => {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      },
      [STORAGE_KEY, original] as const,
    );
  });
});
