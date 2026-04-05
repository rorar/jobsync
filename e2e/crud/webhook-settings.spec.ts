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

/** Navigate to Settings > Webhooks section. */
async function navigateToWebhooks(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Click the "Webhooks" sidebar button
  await page
    .getByRole("button", { name: "Webhooks", exact: true })
    .click();

  // Wait for the section heading to be visible
  await page
    .getByText("Webhooks", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Create a webhook endpoint with the given URL and at least one event selected.
 * Closes the secret dialog after creation.
 */
async function createWebhookEndpoint(
  page: Page,
  webhookUrl: string,
  eventLabel: string,
) {
  // Fill the URL input
  await page.getByLabel("Endpoint URL").fill(webhookUrl);

  // Select at least one event checkbox
  const eventCheckbox = page
    .locator("label")
    .filter({ hasText: eventLabel })
    .locator("input[type='checkbox']");
  await eventCheckbox.check();

  // Click "Add Endpoint" button
  await page
    .getByRole("button", { name: /Add Endpoint/i })
    .click();

  // Wait for the secret dialog to appear
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 15000 });

  // Verify the dialog shows the signing secret
  await expect(dialog.getByText(/Save the signing secret/i)).toBeVisible();
  await expect(dialog.locator("code")).toBeVisible();

  // Close the dialog via the "Done" button
  await dialog.getByRole("button", { name: /Done/i }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
}

/**
 * Find the endpoint card containing the given URL.
 * The URL may be truncated in the display, so match on the first 40 chars.
 */
function getEndpointCard(page: Page, webhookUrl: string) {
  // Match on the domain part of the URL since long URLs are truncated
  const urlPrefix = webhookUrl.length > 40
    ? webhookUrl.slice(0, 40)
    : webhookUrl;
  return page
    .locator(".rounded-lg, .rounded-xl")
    .filter({ hasText: urlPrefix });
}

/** Delete a webhook endpoint by its URL. */
async function deleteWebhookEndpoint(page: Page, webhookUrl: string) {
  const card = getEndpointCard(page, webhookUrl);
  try {
    await card.first().waitFor({ state: "visible", timeout: 5000 });

    // Click the delete button (Trash icon with aria-label "Delete")
    await card.first().getByRole("button", { name: /Delete/i }).click();

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
  } catch {
    // Endpoint may not exist — skip cleanup
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Webhook Settings", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should display webhook settings section with create form", async ({
    page,
  }) => {
    await navigateToWebhooks(page);

    // Verify the section description
    await expect(
      page.getByText(/Configure webhook endpoints to receive notifications/i),
    ).toBeVisible();

    // Verify the create form elements
    await expect(page.getByLabel("Endpoint URL")).toBeVisible();
    await expect(
      page.getByText("Events", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add Endpoint/i }),
    ).toBeVisible();

    // Verify event checkboxes are displayed
    await expect(
      page.locator("label").filter({ hasText: "Module Deactivated" }),
    ).toBeVisible();
    await expect(
      page.locator("label").filter({ hasText: "Vacancy Promoted" }),
    ).toBeVisible();
  });

  test("should create a webhook endpoint and display it in the list", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();
    const webhookUrl = `https://example.com/webhooks/e2e-${uid}`;

    await navigateToWebhooks(page);
    await createWebhookEndpoint(page, webhookUrl, "Module Deactivated");

    // Verify the endpoint appears in the list
    // The URL should be visible (possibly truncated)
    await expect(
      page.getByText(new RegExp(`example\\.com/webhooks/e2e-${uid}`)).first(),
    ).toBeVisible({ timeout: 10000 });

    // Verify the events count badge is shown
    await expect(
      page.getByText("1 events").first(),
    ).toBeVisible();

    // Cleanup
    await deleteWebhookEndpoint(page, webhookUrl);
  });

  test("should toggle webhook endpoint active state", async ({ page }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();
    const webhookUrl = `https://example.com/webhooks/e2e-${uid}`;

    await navigateToWebhooks(page);
    await createWebhookEndpoint(page, webhookUrl, "Vacancy Promoted");

    // Find the endpoint card
    const card = getEndpointCard(page, webhookUrl);
    await expect(card.first()).toBeVisible({ timeout: 10000 });

    // Find the active toggle switch within the card
    const toggle = card.first().getByRole("switch");
    await expect(toggle).toBeVisible();

    // Toggle the switch off (deactivate)
    await toggle.click();
    await expectToast(page, /updated/i);

    // Verify the card shows reduced opacity (inactive state)
    // The card gets opacity-60 class when inactive
    await expect(card.first()).toHaveClass(/opacity-60/, { timeout: 5000 });

    // Toggle it back on
    await toggle.click();
    await expectToast(page, /updated/i);

    // Cleanup
    await deleteWebhookEndpoint(page, webhookUrl);
  });

  test("should delete a webhook endpoint", async ({ page }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();
    const webhookUrl = `https://example.com/webhooks/e2e-${uid}`;

    await navigateToWebhooks(page);
    await createWebhookEndpoint(page, webhookUrl, "Authentication Failure");

    // Verify the endpoint is visible
    const card = getEndpointCard(page, webhookUrl);
    await expect(card.first()).toBeVisible({ timeout: 10000 });

    // Delete the endpoint
    await deleteWebhookEndpoint(page, webhookUrl);

    // Verify the endpoint is no longer in the list
    // After deletion, the empty state or no matching card should show
    await expect(
      page.getByText(new RegExp(`e2e-${uid}`)).first(),
    ).not.toBeVisible({ timeout: 10000 });

    // No cleanup needed — endpoint is deleted
  });

  test("should expand endpoint details to show subscribed events", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const uid = uniqueId();
    const webhookUrl = `https://example.com/webhooks/e2e-${uid}`;

    await navigateToWebhooks(page);
    await createWebhookEndpoint(page, webhookUrl, "Vacancy Batch Staged");

    // Find the endpoint card
    const card = getEndpointCard(page, webhookUrl);
    await expect(card.first()).toBeVisible({ timeout: 10000 });

    // Click the expand/collapse button (Show details)
    await card.first().getByRole("button", { name: /Show details/i }).click();

    // Verify expanded details show the subscribed event
    await expect(
      card.first().getByText("Subscribed Events"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      card.first().getByText("Vacancy Batch Staged"),
    ).toBeVisible();

    // Verify "No failures" is shown
    await expect(
      card.first().getByText("No failures"),
    ).toBeVisible();

    // Cleanup
    await deleteWebhookEndpoint(page, webhookUrl);
  });
});
