import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

/** Navigate to Settings > Push section. */
async function navigateToPush(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Click the "Push" sidebar button
  await page
    .getByRole("button", { name: "Push", exact: true })
    .click();

  // Wait for the section heading to be visible
  await page
    .getByText("Push Notifications", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Push Settings", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should display push settings section", async ({ page }) => {
    await navigateToPush(page);

    // The push section header should be visible
    await expect(
      page.getByText("Push Notifications", { exact: true }).first(),
    ).toBeVisible();

    // The description should be visible
    await expect(
      page.getByText(
        /Receive browser push notifications for important events/i,
      ).first(),
    ).toBeVisible();

    // Wait for loading spinner to disappear
    await page
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {
        /* spinner may have already gone */
      });

    // In headless Chromium, PushManager may or may not be available.
    // Either the "not supported" card, the main UI with enable button,
    // or the permission-blocked state should show.
    // Use polling to wait for one of these states to appear.
    await expect(async () => {
      const notSupported = await page
        .getByText(/Your browser does not support push notifications/i)
        .isVisible()
        .catch(() => false);
      const enableBtn = await page
        .getByRole("button", { name: /Enable Push Notifications/i })
        .isVisible()
        .catch(() => false);
      const notActiveBadge = await page
        .getByText("Not active", { exact: true })
        .isVisible()
        .catch(() => false);
      const rotateKeys = await page
        .getByText("Rotate VAPID Keys", { exact: true })
        .isVisible()
        .catch(() => false);

      expect(
        notSupported || enableBtn || notActiveBadge || rotateKeys,
      ).toBe(true);
    }).toPass({ timeout: 15000 });
  });

  test("should show VAPID rotation section with rotate button", async ({
    page,
  }) => {
    await navigateToPush(page);

    // The "not supported" message may appear in headless Chromium.
    // The VAPID rotation section is only visible when browser supports push.
    const notSupported = page.getByText(
      /Your browser does not support push notifications/i,
    );
    const isUnsupported = await notSupported.isVisible().catch(() => false);

    if (isUnsupported) {
      // Sprint 3 follow-up (silent-skip audit): hard-fail instead of silently
      // skipping so CI catches regressions in environments where push IS
      // expected to work. Replace with test.skip only when the CI environment
      // is confirmed to lack PushManager support project-wide.
      throw new Error(
        "Push notifications are not supported in this browser environment. " +
        "If this is expected (e.g. headless Chromium without PushManager), " +
        "confirm the CI environment and convert this throw to test.skip() " +
        "with a tracked issue rather than silently suppressing coverage.",
      );
    }

    // The VAPID rotation section should be visible
    await expect(
      page.getByText("Rotate VAPID Keys", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // The "Rotate Keys" button should be visible
    await expect(
      page.getByRole("button", { name: /Rotate Keys/i }),
    ).toBeVisible();
  });

  test("should show VAPID rotation warning dialog and cancel", async ({
    page,
  }) => {
    await navigateToPush(page);

    // Check if push is supported in this browser
    const notSupported = page.getByText(
      /Your browser does not support push notifications/i,
    );
    const isUnsupported = await notSupported.isVisible().catch(() => false);

    if (isUnsupported) {
      // Sprint 3 follow-up (silent-skip audit): hard-fail instead of silently
      // skipping — same rationale as the VAPID rotation section test above.
      throw new Error(
        "Push notifications are not supported in this browser environment. " +
        "If this is expected (e.g. headless Chromium without PushManager), " +
        "confirm the CI environment and convert this throw to test.skip() " +
        "with a tracked issue rather than silently suppressing coverage.",
      );
    }

    // Click the "Rotate Keys" button to open the confirmation dialog
    await page
      .getByRole("button", { name: /Rotate Keys/i })
      .click();

    // The AlertDialog should appear
    const alertDialog = page.getByRole("alertdialog");
    await alertDialog.waitFor({ state: "visible", timeout: 5000 });

    // Verify the warning title is shown
    await expect(
      alertDialog.getByText(/Rotate VAPID keys\?/i),
    ).toBeVisible();

    // Verify the warning description mentions invalidating subscriptions
    await expect(
      alertDialog.getByText(/invalidate ALL existing push subscriptions/i),
    ).toBeVisible();

    // Click Cancel to dismiss without rotating
    await alertDialog
      .getByRole("button", { name: /Cancel/i })
      .click();

    // The dialog should close
    await alertDialog.waitFor({ state: "hidden", timeout: 5000 });

    // The page should still show the push settings (nothing changed)
    await expect(
      page.getByText("Push Notifications", { exact: true }).first(),
    ).toBeVisible();
  });
});
