import { test, expect, type Page } from "@playwright/test";
import { uniqueId, expectToast } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

/** Navigate to Settings > Company Blacklist section. */
async function navigateToBlacklist(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Click the "Company Blacklist" sidebar button
  await page
    .getByRole("button", { name: "Company Blacklist", exact: true })
    .click();

  // Wait for the blacklist section heading to be visible
  await page
    .getByRole("heading", { name: "Company Blacklist" })
    .waitFor({ state: "visible", timeout: 10000 });
}

/** Add a blacklist entry with the given pattern. Uses default match type "Contains". */
async function addBlacklistEntry(page: Page, pattern: string) {
  await page.getByLabel("Company Name or Pattern").fill(pattern);
  await page.getByRole("button", { name: "Add Entry" }).click();
  await expectToast(page, /added to blacklist/i);

  // Wait for the entry to appear in the list
  await expect(page.getByText(pattern, { exact: true }).first()).toBeVisible({
    timeout: 10000,
  });
}

/** Delete a blacklist entry by clicking the trash icon and confirming. */
async function deleteBlacklistEntry(page: Page, pattern: string) {
  // Find the entry row containing the pattern
  const entryRow = page
    .locator("div.rounded-lg.border")
    .filter({ hasText: pattern })
    .first();

  // Click the trash button (aria-label="Delete")
  await entryRow.getByRole("button", { name: "Delete" }).click();

  // Confirm in the AlertDialog
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expectToast(page, /removed from blacklist/i);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication -- no per-test login needed

test.describe("Company Blacklist", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should add a blacklist entry", async ({ page }) => {
    const uid = uniqueId();
    const pattern = `E2E BadCorp ${uid}`;

    await navigateToBlacklist(page);

    // Fill pattern input and submit
    await addBlacklistEntry(page, pattern);

    // Verify entry is visible in the list with "Contains" badge
    const entryRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: pattern });
    await expect(entryRow).toBeVisible();
    await expect(entryRow.getByText("Contains")).toBeVisible();

    // Cleanup: delete the entry
    await deleteBlacklistEntry(page, pattern);
  });

  test("should delete a blacklist entry with confirmation", async ({
    page,
  }) => {
    const uid = uniqueId();
    const pattern = `E2E BadCorp ${uid}`;

    await navigateToBlacklist(page);

    // Create entry first
    await addBlacklistEntry(page, pattern);

    // Find the entry row
    const entryRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: pattern })
      .first();

    // Click trash icon
    await entryRow.getByRole("button", { name: "Delete" }).click();

    // Verify AlertDialog confirmation appears
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByText("Remove this entry from the blacklist?"),
    ).toBeVisible();

    // Click confirm button in the dialog
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expectToast(page, /removed from blacklist/i);

    // Verify entry is no longer in the list
    await expect(
      page.getByText(pattern, { exact: true }),
    ).not.toBeVisible({ timeout: 5000 });

    // No cleanup needed -- entry already deleted
  });

  test("should reject duplicate blacklist entry", async ({ page }) => {
    const uid = uniqueId();
    const pattern = `E2E BadCorp ${uid}`;

    await navigateToBlacklist(page);

    // Create first entry
    await addBlacklistEntry(page, pattern);

    // Try to add the same pattern again with the same match type
    await page.getByLabel("Company Name or Pattern").fill(pattern);
    await page.getByRole("button", { name: "Add Entry" }).click();

    // Verify error toast for duplicate
    await expectToast(page, /already exists/i);

    // Cleanup: delete the first entry
    await deleteBlacklistEntry(page, pattern);
  });
});
