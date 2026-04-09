/**
 * Staging details sheet — happy path E2E (Stream G / honesty gate)
 *
 * Verifies the StagedVacancyDetailSheet (task 2 of the UX sprint) opens from
 * the list-mode card, displays the vacancy title, and closes cleanly without
 * advancing any state. Skips gracefully when the seed user has no staged
 * vacancies — creating one would require running an automation, which is
 * out of scope for an E2E test.
 */
import { test, expect, type Page } from "@playwright/test";

async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function navigateToStaging(page: Page) {
  await page.goto("/dashboard/staging");
  await page.waitForLoadState("domcontentloaded");
  // Wait for either the new-tab trigger (means the container rendered) or the
  // empty state. Either way the page is interactive.
  await page
    .getByRole("tab", { name: /New/i })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  // Give the list a moment to load
  await page.waitForTimeout(800);
}

test.describe("Staging details sheet", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("opens, shows vacancy title, and closes without losing position", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await navigateToStaging(page);

    // The "New" tab is the default; we want to look at staged vacancies.
    // Find any "Details" button — it's added by Stream C to every card footer.
    // The aria-label is `Details: <vacancy title>` so we can extract the title.
    const detailsButtons = page.getByRole("button", { name: /^Details:/i });
    const buttonCount = await detailsButtons.count();

    test.skip(
      buttonCount === 0,
      "no staged vacancies in seed data — details sheet cannot be opened",
    );

    // Take the first card. Read its accessible name to learn the vacancy title.
    const firstButton = detailsButtons.first();
    const accessibleName = await firstButton.getAttribute("aria-label");
    expect(accessibleName).toMatch(/^Details: /);
    const vacancyTitle = accessibleName!.replace(/^Details: /, "").trim();
    expect(vacancyTitle.length).toBeGreaterThan(0);

    // Open the sheet
    await firstButton.click();

    // The sheet (Radix Sheet) renders as role="dialog"
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // The sheet must show the vacancy title. The Sheet renders the title in
    // two places: once as a visually-hidden `sr-only` heading (Radix
    // accessibility requirement) and once as the visible content header.
    // Use `.first()` to satisfy strict mode without picking arbitrarily.
    await expect(
      sheet.getByText(vacancyTitle, { exact: false }).first(),
    ).toBeVisible({
      timeout: 5000,
    });

    // Close the sheet via Escape (most reliable cross-browser dismiss)
    await page.keyboard.press("Escape");

    // Verify the dialog is gone
    await expect(sheet).not.toBeVisible({ timeout: 5000 });

    // Verify the original card's Details button is still on the page —
    // the sheet did NOT advance any state.
    await expect(firstButton).toBeVisible();
  });
});
