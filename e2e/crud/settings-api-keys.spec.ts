import { test, expect, type Page } from "@playwright/test";
import { uniqueId, expectToast } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

/** Navigate to Settings > Public API Keys section. */
async function navigateToPublicApiKeys(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Click the "Public API Keys" sidebar button
  await page
    .getByRole("button", { name: /Public API Keys/i })
    .click();

  // Wait for the section to render (heading visible)
  await page
    .getByRole("heading", { name: /Public API Keys/i })
    .waitFor({ state: "visible", timeout: 15000 });
}

/** Create an API key with the given name. Closes the "key created" dialog. */
async function createApiKey(page: Page, keyName: string) {
  // Fill the key name input
  await page.getByPlaceholder(/n8n Integration/i).fill(keyName);

  // Click "Create API Key" button
  await page
    .getByRole("button", { name: /Create API Key/i })
    .click();

  // Wait for the "API Key Created" dialog to appear with the pk_live_ key
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  await expect(dialog.locator("code")).toContainText("pk_live_");

  // Close the dialog via the "Done" button
  await dialog.getByRole("button", { name: /Done/i }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
}

/** Find the key row card containing the given key name. */
function getKeyRow(page: Page, keyName: string) {
  return page
    .locator("div.rounded-lg.border")
    .filter({ hasText: keyName });
}

/** Revoke an active API key by name. */
async function revokeApiKey(page: Page, keyName: string) {
  const row = getKeyRow(page, keyName);
  await expect(row).toBeVisible({ timeout: 10000 });

  // Click the "Revoke" button within the key row
  await row.getByRole("button", { name: /Revoke/i }).click();

  // Confirm in the AlertDialog
  const alertDialog = page.getByRole("alertdialog");
  await alertDialog.waitFor({ state: "visible", timeout: 5000 });
  await alertDialog
    .getByRole("button", { name: /Revoke/i })
    .click();

  // Wait for success toast
  await expectToast(page, /revoked/i);

  // Wait for the AlertDialog to close
  await alertDialog.waitFor({ state: "hidden", timeout: 5000 });
}

/** Delete a revoked API key by name. */
async function deleteApiKey(page: Page, keyName: string) {
  const row = getKeyRow(page, keyName);
  await expect(row).toBeVisible({ timeout: 10000 });

  // Click the trash/delete button (aria-label "Delete")
  await row.getByRole("button", { name: /Delete/i }).click();

  // Confirm in the AlertDialog
  const alertDialog = page.getByRole("alertdialog");
  await alertDialog.waitFor({ state: "visible", timeout: 5000 });
  await alertDialog
    .getByRole("button", { name: /Delete/i })
    .click();

  // Wait for success toast
  await expectToast(page, /deleted/i);

  // Wait for the AlertDialog to close
  await alertDialog.waitFor({ state: "hidden", timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication -- no per-test login needed

test.describe("Public API Key Management", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should create a new API key and display it in the list", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const uid = uniqueId();
    const keyName = `E2E Key ${uid}`;

    await navigateToPublicApiKeys(page);
    await createApiKey(page, keyName);

    // Verify the key appears in the list with "Active" badge
    const row = getKeyRow(page, keyName);
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByText("Active", { exact: true })).toBeVisible();

    // Verify the key prefix is shown (pk_live_ prefix pattern)
    await expect(row.locator(".font-mono")).toBeVisible();

    // Cleanup: revoke then delete
    await revokeApiKey(page, keyName);
    await deleteApiKey(page, keyName);
  });

  test("should revoke an active API key", async ({ page }) => {
    test.setTimeout(60_000);
    const uid = uniqueId();
    const keyName = `E2E Key ${uid}`;

    await navigateToPublicApiKeys(page);
    await createApiKey(page, keyName);

    // Verify key is active
    const row = getKeyRow(page, keyName);
    await expect(row.getByText("Active", { exact: true })).toBeVisible({
      timeout: 10000,
    });

    // Revoke the key
    await revokeApiKey(page, keyName);

    // Verify the "Revoked" badge appears on the key row
    await expect(row.getByText("Revoked")).toBeVisible({ timeout: 10000 });

    // Cleanup: delete the revoked key
    await deleteApiKey(page, keyName);
  });

  test("should delete a revoked API key", async ({ page }) => {
    test.setTimeout(60_000);
    const uid = uniqueId();
    const keyName = `E2E Key ${uid}`;

    await navigateToPublicApiKeys(page);
    await createApiKey(page, keyName);

    // Revoke first (required before deletion)
    await revokeApiKey(page, keyName);

    // Verify key is revoked
    const row = getKeyRow(page, keyName);
    await expect(row.getByText("Revoked")).toBeVisible({ timeout: 10000 });

    // Delete the revoked key
    await deleteApiKey(page, keyName);

    // Verify key is removed from the list
    await expect(row).not.toBeVisible({ timeout: 10000 });
    // No cleanup needed -- key is deleted
  });
});
