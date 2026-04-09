/**
 * Staging layout toggle — happy path E2E (Stream G / honesty gate)
 *
 * Verifies the StagingLayoutToggle (task 5 of the UX sprint) switches the
 * layout size and persists the choice in localStorage across reload. The
 * toggle uses role="radiogroup" with three role="radio" buttons (Compact /
 * Default / Comfortable). Storage key: jobsync-staging-layout-size.
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

    // The toggle is a radiogroup with three radios
    const compactRadio = page.getByRole("radio", { name: /Compact/i });
    const comfortableRadio = page.getByRole("radio", { name: /Comfortable/i });

    await expect(comfortableRadio).toBeVisible({ timeout: 5000 });

    // Click Comfortable
    await comfortableRadio.click();
    await expect(comfortableRadio).toHaveAttribute("aria-checked", "true");

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

    // The radio reflects the persisted choice
    const comfortableAfterReload = page.getByRole("radio", {
      name: /Comfortable/i,
    });
    await expect(comfortableAfterReload).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Cleanup: restore original state
    if (original && original !== "comfortable") {
      const restoreRadio = page.getByRole("radio", {
        name: new RegExp(original, "i"),
      });
      if (await restoreRadio.isVisible().catch(() => false)) {
        await restoreRadio.click();
      }
    } else if (original === null) {
      // Original was unset — switch back to Compact (a non-default value)
      // then clear via evaluate so the next test session starts unbiased.
      await compactRadio.click();
      await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    }
  });
});
