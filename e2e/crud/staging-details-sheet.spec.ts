/**
 * Staging details sheet — happy path E2E (Stream G / honesty gate)
 *
 * Verifies the StagedVacancyDetailSheet (task 2 of the UX sprint) opens from
 * the list-mode card, displays the vacancy title, and closes cleanly without
 * advancing any state.
 *
 * M-T-03: The test no longer silently skips when the seed user has no staged
 * vacancies.  A silent skip turns into a green badge that masks broken coverage
 * — the same class-of-bug that CRIT-A2 exposed in production.  Instead, we
 * hard-fail with an actionable message so CI immediately surfaces the missing
 * seed data.  Run `bun run seed-dev` (or the equivalent migration script) to
 * create at least one staged vacancy before running E2E tests.
 *
 * M-T-04: All `waitForTimeout` calls replaced with deterministic `waitFor`
 * conditions.  Fixed waits are documented as an anti-pattern in
 * e2e/CONVENTIONS.md — they silently pass on fast machines and flake on slow
 * ones.
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

  // M-T-04: replaced waitForTimeout(800) with a deterministic condition.
  // Wait until at least one Details button OR an identifiable empty-state
  // element is present so we know the async list-fetch has settled.
  await page
    .getByRole("button", { name: /^Details:/i })
    .first()
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(async () => {
      // No details buttons — the list may be genuinely empty.  That is
      // acceptable here; the test body handles that case below.
    });
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

    // M-T-03: hard failure instead of silent skip.
    // A `test.skip()` here would produce a passing CI badge with zero coverage
    // of the details-sheet path.  Failing loudly forces the seed data to be
    // present and keeps the test meaningful.
    if (buttonCount === 0) {
      throw new Error(
        "seed user has no staged vacancies — the staging details sheet test " +
          "cannot exercise any code path.\n" +
          "Fix: run `bun run seed-dev` (or your equivalent seed script) before " +
          "running E2E tests to ensure at least one staged vacancy exists.",
      );
    }

    // Take the first card. Read its accessible name to learn the vacancy title.
    const firstButton = detailsButtons.first();
    const accessibleName = await firstButton.getAttribute("aria-label");
    expect(accessibleName).toMatch(/^Details: /);
    const vacancyTitle = accessibleName!.replace(/^Details: /, "").trim();
    expect(vacancyTitle.length).toBeGreaterThan(0);

    // Open the sheet
    await firstButton.click();

    // The sheet (Radix Sheet) renders as role="dialog".
    // M-T-04: use toBeVisible with timeout instead of waitForTimeout.
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

    // Verify the dialog is gone — M-T-04: deterministic expect, no fixed wait.
    await expect(sheet).not.toBeVisible({ timeout: 5000 });

    // Verify the original card's Details button is still on the page —
    // the sheet did NOT advance any state.
    await expect(firstButton).toBeVisible();
  });
});
