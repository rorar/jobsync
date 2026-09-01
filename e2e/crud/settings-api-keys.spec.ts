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

  // ...and then for the panel's own data. PublicApiKeySettings.tsx:166
  // early-returns a loading block containing that same heading, so the wait
  // above passes while the controls are still unmounted.
  // Scoped to <main>: SchedulerStatusBar (Header.tsx:76, above <main> in
  // DOM order) renders its own .animate-spin whenever a scheduler run is
  // active, so an unscoped .first() would wait on the wrong element,
  // time out, and be swallowed by the .catch below.
  await page
    .getByRole("main")
    .locator(".animate-spin")
    .first()
    .waitFor({ state: "hidden", timeout: 15000 })
    .catch(() => {
      /* spinner may have already gone */
    });
}

/**
 * Names of the API keys created by the test currently running.
 *
 * Same cap-shaped hazard as webhook-settings.spec.ts: createPublicApiKey
 * (publicApiKey.actions.ts:38) throws `api.maxKeysReached` once a user holds
 * 10 ACTIVE keys. Each test below revokes and deletes its key inline as its
 * last statements, so a test that throws before those lines leaks an active
 * key — and after ten leaks key creation, and therefore every test in this
 * file, fails in every later run until someone deletes rows by hand.
 *
 * `createApiKey` registers here itself so no caller can forget, and
 * `deleteApiKey` de-registers on success, so the afterEach below only ever
 * removes what genuinely leaked. An ARRAY, not a scalar: a test that creates
 * two keys (the obvious missing one — "create refuses at the cap" — would
 * create ten) must not leak all but the last. Module scope is per-worker
 * (workers are separate processes running their tests serially) and the hook
 * swaps the reference out, so nothing bleeds into the next test.
 */
let createdKeyNames: string[] = [];

/** Create an API key with the given name. Closes the "key created" dialog. */
async function createApiKey(page: Page, keyName: string) {
  // Register BEFORE creating: a create that fails after the row was written
  // has still leaked one.
  createdKeyNames.push(keyName);

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

  // Deleted for real — drop it from the tracking so the afterEach does not
  // retry a row that is already gone. This function throws on any failure
  // above, so the line is reached only on success.
  createdKeyNames = createdKeyNames.filter((n) => n !== keyName);
}

/**
 * Best-effort teardown for one key: revoke it if it is still active, then
 * delete it, tolerating a key that is already revoked or already gone.
 *
 * Deliberately NOT `revokeApiKey` + `deleteApiKey`: those two are the flows
 * under test and must fail loudly when a step does not work, whereas teardown
 * must stay silent so it cannot turn one failed test into a failed run.
 */
async function purgeApiKey(page: Page, keyName: string) {
  const row = getKeyRow(page, keyName).first();
  try {
    // A revoked key has no Revoke button — skip the step instead of waiting
    // out the action timeout on a button that will never appear.
    const revokeButton = row.getByRole("button", { name: /Revoke/i });
    if ((await revokeButton.count()) > 0) {
      await revokeButton.click();
      const revokeDialog = page.getByRole("alertdialog");
      await revokeDialog.waitFor({ state: "visible", timeout: 5000 });
      await revokeDialog.getByRole("button", { name: /Revoke/i }).click();
      await revokeDialog.waitFor({ state: "hidden", timeout: 5000 });
    }

    await row.getByRole("button", { name: /Delete/i }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await deleteDialog.waitFor({ state: "visible", timeout: 5000 });
    await deleteDialog.getByRole("button", { name: /Delete/i }).click();
    await deleteDialog.waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    // Key already gone, or the page is unusable — cleanup-stale-data.ts
    // (step 13, name startsWith "E2E ") is the backstop.
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication -- no per-test login needed

test.describe("Public API Key Management", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  // Safety net for the inline revoke/delete at the end of each test — see
  // `createdKeyNames` above. On a green test this list is already empty
  // (deleteApiKey de-registers), so the hook costs nothing and stays silent; a
  // warning here therefore means a REAL leak, not routine noise.
  test.afterEach(async ({ page }) => {
    // Swap the reference out BEFORE the first await: clearing afterwards would
    // keep entries alive into the next test if a delete throws, and clearing in
    // a beforeEach would not run at all under test.skip.
    const leaked = createdKeyNames;
    createdKeyNames = [];
    if (leaked.length === 0) return;

    try {
      // purgeApiKey assumes the Public API Keys panel is open. A test that
      // failed inside createApiKey leaves the browser on the "key created"
      // dialog, so navigate first — and keep it inside the try, because a hook
      // that throws replaces the real test failure in the report.
      await navigateToPublicApiKeys(page);
      for (const keyName of leaked) {
        await purgeApiKey(page, keyName);
      }
    } catch (error) {
      console.warn(
        `[settings-api-keys] afterEach cleanup failed: ${String(error)}`,
      );
    }
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
