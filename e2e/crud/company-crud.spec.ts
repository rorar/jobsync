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

async function navigateToCompanies(page: Page) {
  await page.goto("/dashboard/admin?tab=companies");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-company-btn").waitFor({ state: "visible" });
}

/**
 * Click "Load More" until the target company row is visible, or until there
 * is no more data to load.  This handles the pagination problem where newly
 * created companies may appear beyond the first page (25-per-page default).
 */
async function loadUntilCompanyVisible(page: Page, name: string) {
  const row = page.getByRole("row", { name: new RegExp(name, "i") }).first();

  // Wait for the table to have at least one data row (i.e. data has loaded).
  // The first row is the header row, so we wait for at least 2 rows.
  await page
    .getByRole("row")
    .nth(1)
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {});

  // Try up to 10 iterations (10 × 25 = 250 companies max)
  for (let i = 0; i < 10; i++) {
    // Check if the row is already visible
    const visible = await row.isVisible().catch(() => false);
    if (visible) return;

    // Check if there is a "Load More" button
    const loadMoreBtn = page.getByRole("button", { name: /Load More/i });
    const loadMoreVisible = await loadMoreBtn.isVisible().catch(() => false);
    if (!loadMoreVisible) break;

    // Click "Load More" and wait for the table to update
    await loadMoreBtn.click();
    await page.waitForTimeout(1000);
  }
}

async function createCompany(page: Page, name: string, logoUrl?: string) {
  await page.getByTestId("add-company-btn").click();

  // Wait for the dialog to open — use role, not heading text
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Fill in the company name — first textbox inside the dialog
  const nameInput = dialog.getByRole("textbox").first();
  await nameInput.fill(name);

  if (logoUrl) {
    const logoInput = dialog.getByRole("textbox").nth(1);
    await logoInput.fill(logoUrl);
  }

  // Click submit (the non-outline button, i.e. type="submit")
  await dialog.locator('button[type="submit"]').click();

  // Wait for the success toast
  await expectToast(page, /Company created/i);
}

async function deleteCompany(page: Page, name: string) {
  // Ensure all pages are loaded so we can find the row
  await loadUntilCompanyVisible(page, name);

  const row = page.getByRole("row", { name: new RegExp(name, "i") }).first();
  await expect(row).toBeVisible({ timeout: 10000 });

  // Click the delete button
  await row.getByRole("button", { name: "Delete" }).click();

  // Confirm in the DeleteAlertDialog — click the last button (destructive action)
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button").last().click();

  // Wait for deletion toast
  await expectToast(page, /Company has been deleted/i);
}

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create -> assert -> cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Company CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should create a company", async ({ page }) => {
    const uid = uniqueId();
    const companyName = `E2E Company ${uid}`;

    await navigateToCompanies(page);
    await createCompany(page, companyName);

    // Reload to ensure table is fresh, then verify
    await navigateToCompanies(page);
    await loadUntilCompanyVisible(page, companyName);
    await expect(
      page.getByRole("row", { name: new RegExp(companyName, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup
    await deleteCompany(page, companyName);
  });

  test("should edit a company", async ({ page }) => {
    const uid = uniqueId();
    const companyName = `E2E Company ${uid}`;
    const updatedName = `E2E Company Updated ${uid}`;

    await navigateToCompanies(page);
    await createCompany(page, companyName);

    // Reload to ensure table is fresh after creation
    await navigateToCompanies(page);
    await loadUntilCompanyVisible(page, companyName);
    const row = page
      .getByRole("row", { name: new RegExp(companyName, "i") })
      .first();
    await expect(row).toBeVisible({ timeout: 10000 });

    // Click the edit button — identified by its Pencil icon (lucide-pencil)
    await row.getByRole("button", { name: "Edit" }).click();

    // Wait for the edit dialog to open
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Change the name — first textbox in the dialog
    // Wait for useEffect reset() to populate the form with the original value
    const nameInput = dialog.getByRole("textbox").first();
    await expect(nameInput).toHaveValue(companyName, { timeout: 5000 });
    // Now safe to modify
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Save
    await dialog.locator('button[type="submit"]').click();

    // Verify the update toast
    await expectToast(page, /Company updated/i);

    // Load all pages if needed, then verify the updated name appears
    await loadUntilCompanyVisible(page, updatedName);
    await expect(
      page.getByRole("row", { name: new RegExp(updatedName, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup — delete the updated company
    await deleteCompany(page, updatedName);
  });

  test("should delete a company", async ({ page }) => {
    const uid = uniqueId();
    const companyName = `E2E Company ${uid}`;

    await navigateToCompanies(page);
    await createCompany(page, companyName);

    // Reload to ensure table is fresh after creation
    await navigateToCompanies(page);
    await loadUntilCompanyVisible(page, companyName);
    await expect(
      page.getByRole("row", { name: new RegExp(companyName, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Delete the company
    const row = page
      .getByRole("row", { name: new RegExp(companyName, "i") })
      .first();

    // Click the delete button
    await row.getByRole("button", { name: "Delete" }).click();

    // Confirm in the DeleteAlertDialog — last button is the destructive action
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button").last().click();

    // Verify success toast
    await expectToast(page, /Company has been deleted/i);

    // Verify the company is removed from the table
    await expect(
      page.getByRole("row", { name: new RegExp(companyName, "i") }),
    ).not.toBeVisible({ timeout: 10000 });
  });
});
