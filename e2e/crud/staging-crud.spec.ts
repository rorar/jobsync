import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function navigateToStaging(page: Page) {
  await page.goto("/dashboard/staging");
  await page.waitForLoadState("domcontentloaded");
  // Wait for the Staging Queue card title to appear (locale-resilient)
  await page
    .getByRole("heading", { name: /staging|queue|file|cola/i })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Staging Page", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should render staging page with all four tabs", async ({ page }) => {
    await navigateToStaging(page);

    // Verify page title is visible
    await expect(
      page.getByRole("heading", { name: /staging queue/i }),
    ).toBeVisible({ timeout: 10000 });

    // Verify all 4 tab triggers are present
    const tabList = page.getByRole("tablist");
    await expect(tabList).toBeVisible({ timeout: 10000 });

    // Check each tab by its English label
    await expect(
      page.getByRole("tab", { name: /^New/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Dismissed/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Archive/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Trash/i }),
    ).toBeVisible();

    // "New" tab should be selected by default
    await expect(
      page.getByRole("tab", { name: /^New/i }),
    ).toHaveAttribute("data-state", "active");

    // Tab content panel should be rendered
    await expect(page.getByRole("tabpanel")).toBeVisible();
  });

  test("should toggle between list and deck view mode", async ({ page }) => {
    await navigateToStaging(page);

    // Find the ViewModeToggle radiogroup
    const viewModeGroup = page.getByRole("radiogroup", {
      name: /view mode/i,
    });
    await expect(viewModeGroup).toBeVisible({ timeout: 10000 });

    const listRadio = viewModeGroup.getByRole("radio", { name: /list/i });
    const deckRadio = viewModeGroup.getByRole("radio", { name: /deck/i });

    await expect(listRadio).toBeVisible();
    await expect(deckRadio).toBeVisible();

    // Switch to deck mode
    await deckRadio.click();
    await expect(deckRadio).toHaveAttribute("aria-checked", "true");
    await expect(listRadio).toHaveAttribute("aria-checked", "false");

    // In deck mode, the tabs should NOT be visible (deck replaces them)
    await expect(page.getByRole("tablist")).not.toBeVisible();

    // Switch back to list mode
    await listRadio.click();
    await expect(listRadio).toHaveAttribute("aria-checked", "true");
    await expect(deckRadio).toHaveAttribute("aria-checked", "false");

    // Tabs should be visible again in list mode
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 10000 });
  });

  test("should show search input in list mode and accept input", async ({
    page,
  }) => {
    await navigateToStaging(page);

    // Ensure we are in list mode (search is only visible in list mode)
    const viewModeGroup = page.getByRole("radiogroup", {
      name: /view mode/i,
    });
    await expect(viewModeGroup).toBeVisible({ timeout: 10000 });
    const listRadio = viewModeGroup.getByRole("radio", { name: /list/i });
    await listRadio.click();

    // Find the search input by its aria-label
    const searchInput = page.getByRole("searchbox", {
      name: /search vacancies/i,
    });
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search term and verify the input updates
    await searchInput.fill("test search query");
    await expect(searchInput).toHaveValue("test search query");

    // Clear the search and verify
    await searchInput.fill("");
    await expect(searchInput).toHaveValue("");
  });
});
