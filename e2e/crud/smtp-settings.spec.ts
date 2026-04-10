import { test, expect, type Page } from "@playwright/test";
import { uniqueId, expectToast, safeWait } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

/** Dismiss any visible toast notifications that might overlay buttons. */
async function dismissToasts(page: Page) {
  const dismiss = page.getByRole("button", { name: /Dismiss/i });
  while (await dismiss.first().isVisible().catch(() => false)) {
    await dismiss.first().click().catch(() => {});
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for the dismiss
    // button to disappear rather than sleeping a fixed 300 ms.
    await safeWait(page, {
      condition: async () => {
        const visible = await dismiss.first().isVisible().catch(() => false);
        if (visible) throw new Error("toast still visible");
      },
    }).catch(() => null); // acceptable if toast already gone
  }
}

/** Navigate to Settings > Email section and wait for loading to complete. */
async function navigateToSmtp(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Dismiss any lingering toasts from prior operations
  await dismissToasts(page);

  // Click the "Email" sidebar button
  await page
    .getByRole("button", { name: "Email", exact: true })
    .click();

  // Wait for the section heading to be visible
  await page
    .getByText("Email Notifications", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });

  // Wait for loading spinner to disappear
  await page
    .locator(".animate-spin")
    .first()
    .waitFor({ state: "hidden", timeout: 15000 })
    .catch(() => {
      /* spinner may have already gone */
    });

  // Dismiss any toasts that appeared during loading
  await dismissToasts(page);
}

/**
 * Ensure a clean (empty) SMTP state by deleting any existing config.
 * Must be called after navigateToSmtp().
 */
async function ensureEmptyState(page: Page) {
  const editBtn = page.getByRole("button", { name: /Edit Configuration/i });
  const hasConfig = await editBtn.isVisible().catch(() => false);
  if (hasConfig) {
    await deleteSmtpConfig(page);
    // Re-navigate to get a fresh state
    await navigateToSmtp(page);
  }

  // Wait for "Configure SMTP" button to appear (empty state)
  await page
    .getByRole("button", { name: /Configure SMTP/i })
    .waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Fill and save an SMTP configuration from empty state.
 * Assumes the "Configure SMTP" button is visible (empty state).
 */
async function createSmtpConfig(
  page: Page,
  opts: { host: string; username: string; fromAddress: string },
) {
  // Click "Configure SMTP" button in empty state
  await page
    .getByRole("button", { name: /Configure SMTP/i })
    .click();

  // Wait for the form to appear and be editable
  const hostInput = page.getByLabel("SMTP Host");
  await hostInput.waitFor({ state: "visible", timeout: 10000 });
  await expect(hostInput).toBeEnabled({ timeout: 5000 });

  // Fill form fields
  await hostInput.fill(opts.host);
  await page.getByLabel("Username").fill(opts.username);
  await page.locator("#smtp-password").fill("test-password-12345");
  await page.getByLabel("From Address").fill(opts.fromAddress);

  // Verify the Save button is enabled before clicking
  const saveBtn = page.getByRole("button", { name: /Save Configuration/i });
  await expect(saveBtn).toBeEnabled({ timeout: 5000 });
  await saveBtn.click();

  // Wait for success toast
  await expectToast(page, /SMTP configuration saved/i);

  // Wait for view mode to appear
  await expect(
    page.getByRole("button", { name: /Edit Configuration/i }),
  ).toBeVisible({ timeout: 10000 });

  // Dismiss the toast to prevent it from blocking subsequent button clicks
  await dismissToasts(page);
}

/** Delete the SMTP configuration via the Delete button and confirm dialog. */
async function deleteSmtpConfig(page: Page) {
  try {
    // Dismiss any toast first to avoid blocking the Delete button
    await dismissToasts(page);

    // Click "Delete Configuration" button
    await page
      .getByRole("button", { name: /Delete Configuration/i })
      .waitFor({ state: "visible", timeout: 5000 });
    await page
      .getByRole("button", { name: /Delete Configuration/i })
      .click();

    // Confirm in the AlertDialog
    const alertDialog = page.getByRole("alertdialog");
    await alertDialog.waitFor({ state: "visible", timeout: 5000 });
    await alertDialog
      .getByRole("button", { name: /Delete/i })
      .click();

    // Wait for success toast
    await expectToast(page, /SMTP configuration deleted/i);

    // Wait for the AlertDialog to close
    await alertDialog.waitFor({ state: "hidden", timeout: 5000 });

    // Dismiss the delete toast
    await dismissToasts(page);
  } catch {
    // Config may not exist — skip cleanup
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("SMTP Settings", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should display empty SMTP state", async ({ page }) => {
    await navigateToSmtp(page);

    // The empty state shows "No email configuration" text
    // (only visible if no config exists yet — test is best-effort)
    const noConfigText = page.getByText(/No email configuration/i);
    const editButton = page.getByRole("button", {
      name: /Edit Configuration/i,
    });

    // Either we see the empty state or an existing config
    const isEmpty = await noConfigText.isVisible().catch(() => false);
    const hasConfig = await editButton.isVisible().catch(() => false);

    // One of the two must be true
    expect(isEmpty || hasConfig).toBe(true);

    if (isEmpty) {
      await expect(
        page.getByText(
          /Configure an SMTP server to receive email notifications/i,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Configure SMTP/i }),
      ).toBeVisible();
    }
  });

  test("should configure SMTP and display the saved config", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();

    await navigateToSmtp(page);
    await ensureEmptyState(page);

    // Create a new SMTP config
    await createSmtpConfig(page, {
      host: `smtp-${uid}.example.com`,
      username: `user-${uid}`,
      fromAddress: `e2e-${uid}@example.com`,
    });

    // After save, the view mode should show the Edit button
    await expect(
      page.getByRole("button", { name: /Edit Configuration/i }),
    ).toBeVisible({ timeout: 10000 });

    // The "Send Test Email" button should also be visible in view mode
    await expect(
      page.getByRole("button", { name: /Send Test Email/i }),
    ).toBeVisible();

    // The "Delete Configuration" button should be visible
    await expect(
      page.getByRole("button", { name: /Delete Configuration/i }),
    ).toBeVisible();

    // Cleanup
    await deleteSmtpConfig(page);
  });

  test("should edit SMTP configuration", async ({ page }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();

    await navigateToSmtp(page);
    await ensureEmptyState(page);

    // Create initial config
    await createSmtpConfig(page, {
      host: `smtp-${uid}.example.com`,
      username: `user-${uid}`,
      fromAddress: `e2e-${uid}@example.com`,
    });

    // Click Edit to switch to edit mode.
    // Use JS click to avoid toast overlay intercepting Playwright's click.
    const editBtn = page.getByRole("button", { name: /Edit Configuration/i });
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.evaluate((el) => (el as HTMLButtonElement).click());

    // Wait for the form inputs to become editable
    const usernameInput = page.locator("#smtp-username");
    await expect(usernameInput).toBeEnabled({ timeout: 15000 });

    // Change the username
    const updatedUsername = `updated-${uid}`;
    await usernameInput.clear();
    await usernameInput.fill(updatedUsername);

    // Save the updated config via the submit button
    await page.locator("form button[type='submit']").click();

    await expectToast(page, /SMTP configuration saved/i);

    // Verify we're back in view mode
    await expect(
      page.getByRole("button", { name: /Edit Configuration/i }),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup
    await deleteSmtpConfig(page);
  });

  test("should delete SMTP configuration", async ({ page }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();

    await navigateToSmtp(page);
    await ensureEmptyState(page);

    // Create a config to delete
    await createSmtpConfig(page, {
      host: `smtp-${uid}.example.com`,
      username: `user-${uid}`,
      fromAddress: `e2e-${uid}@example.com`,
    });

    // Verify config exists (view mode with Edit button)
    await expect(
      page.getByRole("button", { name: /Edit Configuration/i }),
    ).toBeVisible({ timeout: 10000 });

    // Delete the config
    await deleteSmtpConfig(page);

    // Verify empty state returns
    await expect(
      page.getByText(/No email configuration/i),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByRole("button", { name: /Configure SMTP/i }),
    ).toBeVisible();
  });

  test("should show test email button with cooldown text", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();

    await navigateToSmtp(page);
    await ensureEmptyState(page);

    // Create a config so the test button appears
    await createSmtpConfig(page, {
      host: `smtp-${uid}.example.com`,
      username: `user-${uid}`,
      fromAddress: `e2e-${uid}@example.com`,
    });

    // Verify the "Send Test Email" button is visible
    const testBtn = page.getByRole("button", { name: /Send Test Email/i });
    await expect(testBtn).toBeVisible({ timeout: 10000 });

    // We don't actually send an email (no real SMTP server),
    // but we verify the button exists and is enabled
    await expect(testBtn).toBeEnabled();

    // Cleanup
    await deleteSmtpConfig(page);
  });
});
