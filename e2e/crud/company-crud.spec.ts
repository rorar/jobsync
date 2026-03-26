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
  await page.waitForLoadState("networkidle");
  await page.getByTestId("add-company-btn").waitFor({ state: "visible" });
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
  const row = page.getByRole("row", { name: new RegExp(name, "i") }).first();
  await expect(row).toBeVisible({ timeout: 10000 });

  // Click the delete button — identified by its Trash2 icon (lucide-trash-2)
  await row.locator("button:has(.lucide-trash-2)").click();

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

    // Verify the company appears in the table
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

    // Verify the company exists in the table
    const row = page
      .getByRole("row", { name: new RegExp(companyName, "i") })
      .first();
    await expect(row).toBeVisible({ timeout: 10000 });

    // Click the edit button — identified by its Pencil icon (lucide-pencil)
    await row.locator("button:has(.lucide-pencil)").click();

    // Wait for the edit dialog to open
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Change the name — first textbox in the dialog
    const nameInput = dialog.getByRole("textbox").first();
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Save
    await dialog.locator('button[type="submit"]').click();

    // Verify the update toast
    await expectToast(page, /Company updated/i);

    // Verify the updated name appears in the table
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

    // Verify the company exists in the table
    await expect(
      page.getByRole("row", { name: new RegExp(companyName, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Delete the company
    const row = page
      .getByRole("row", { name: new RegExp(companyName, "i") })
      .first();

    // Click the delete button — identified by Trash2 icon
    await row.locator("button:has(.lucide-trash-2)").click();

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
