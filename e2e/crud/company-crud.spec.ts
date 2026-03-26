import { test, expect, type Page } from "@playwright/test";
import { uniqueId, expectToast } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

async function navigateToCompanies(page: Page) {
  await page.goto("/dashboard/admin?tab=companies");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("add-company-btn").waitFor({ state: "visible" });
}

async function createCompany(page: Page, name: string, logoUrl?: string) {
  await page.getByTestId("add-company-btn").click();
  await expect(
    page.getByRole("heading", { name: /Add Company/i }),
  ).toBeVisible();

  await page.getByLabel("Company Name").fill(name);

  if (logoUrl) {
    await page.getByLabel("Company Logo URL").fill(logoUrl);
  }

  await page.getByRole("button", { name: "Save" }).click();

  // Wait for the dialog to close and the table to update
  await expectToast(page, /Company created successfully/);
}

async function deleteCompany(page: Page, name: string) {
  // Find the row containing the company name and click its delete button
  const row = page.getByRole("row", { name: new RegExp(name, "i") }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole("button", { name: /Delete/i }).click();

  // Confirm in the DeleteAlertDialog
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Delete/i })
    .click();

  // Wait for deletion toast
  await expectToast(page, /Company has been deleted successfully/);
}

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create -> assert -> cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Company CRUD", () => {
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

    // Click the edit button (Pencil icon) on that company row
    await row.getByRole("button", { name: /Edit/i }).click();

    // Wait for the edit dialog to open
    await expect(
      page.getByRole("heading", { name: /Edit Company/i }),
    ).toBeVisible();

    // Change the name
    const nameInput = page.getByLabel("Company Name");
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Save
    await page.getByRole("button", { name: "Save" }).click();

    // Verify the update toast
    await expectToast(page, /Company updated successfully/);

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
    await row.getByRole("button", { name: /Delete/i }).click();

    // Confirm in the DeleteAlertDialog
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /Delete/i })
      .click();

    // Verify success toast
    await expectToast(page, /Company has been deleted successfully/);

    // Verify the company is removed from the table
    await expect(
      page.getByRole("row", { name: new RegExp(companyName, "i") }),
    ).not.toBeVisible({ timeout: 10000 });
  });
});
