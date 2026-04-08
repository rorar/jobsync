import { test, expect, type Page } from "@playwright/test";
import { uniqueId, selectOrCreateComboboxOption } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function navigateToJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible" });
  await page.waitForTimeout(3000);
}

/**
 * Ensure at least one resume exists to avoid P2003 FK violation
 * when the AddJob form submits with resume="".
 */
async function ensureResumeExists(page: Page, resumeTitle: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");

  const existingRow = page.getByRole("row", {
    name: new RegExp(resumeTitle, "i"),
  });
  try {
    await existingRow.first().waitFor({ state: "visible", timeout: 3000 });
    return;
  } catch {
    // Resume does not exist yet — create one
  }

  await page.getByRole("button", { name: "New Resume" }).click();
  await page.getByPlaceholder("Ex: Full Stack Developer").fill(resumeTitle);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText(/Resume title has been/i).first(),
  ).toBeVisible({ timeout: 10000 });
}

async function deleteResume(page: Page, title: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");
  const row = page
    .getByRole("row", { name: new RegExp(title, "i") })
    .first();
  try {
    await row.waitFor({ state: "visible", timeout: 5000 });
    await row.getByTestId("resume-actions-menu-btn").click({ force: true });
    await page
      .getByRole("menuitem", { name: "Delete" })
      .click({ force: true });
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click({ force: true });
  } catch {
    // Resume may not exist — skip cleanup
  }
}

async function createJob(
  page: Page,
  opts: {
    title: string;
    company: string;
    location: string;
    url?: string;
  },
) {
  await page.getByTestId("add-job-btn").click();
  await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();

  await page
    .getByPlaceholder("Copy and paste job link here")
    .fill(opts.url ?? "https://example.com/careers/e2e-test");

  await selectOrCreateComboboxOption(
    page,
    "Title",
    "Create or Search title",
    opts.title,
  );
  await expect(page.getByLabel("Title")).toContainText(opts.title);

  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    opts.company,
  );
  await expect(page.getByLabel("Company")).toContainText(opts.company);

  await selectOrCreateComboboxOption(
    page,
    "Location",
    "Create or Search location",
    opts.location,
  );
  await expect(page.getByLabel("Location")).toContainText(opts.location);

  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill("E2E enrichment test description.");

  // Select a resume to avoid the P2003 FK violation
  const resumeSelect = page.getByLabel("Select Resume");
  await resumeSelect.click();
  const firstResumeOption = page.getByRole("option").first();
  await firstResumeOption.waitFor({ state: "visible", timeout: 10000 });
  await firstResumeOption.click();

  await page.getByTestId("save-job-btn").click();

  // Wait for the dialog to close (confirms save + redirect completed)
  await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({
    timeout: 15000,
  });
}

async function deleteJob(page: Page, jobTitle: string) {
  await navigateToJobs(page);
  const cells = page.getByText(new RegExp(jobTitle, "i"));
  await expect(cells.first()).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("row", { name: jobTitle })
    .getByTestId("job-actions-menu-btn")
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Wait for the confirmation dialog to appear
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
}

async function navigateToEnrichmentSettings(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Click the "Enrichment" sidebar button
  await page
    .getByRole("button", { name: "Enrichment", exact: true })
    .click();

  // Wait for the enrichment section heading to be visible
  await page
    .getByText("Data Enrichment Modules")
    .waitFor({ state: "visible", timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create -> assert -> cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Enrichment", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("company logo component renders after job creation", async ({
    page,
  }) => {
    test.setTimeout(120_000); // Create + verify + cleanup can be slow

    const uid = uniqueId();
    const jobTitle = `E2E Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists (required to avoid FK violation on submit)
    await ensureResumeExists(page, resumeTitle);

    // Create a job
    await navigateToJobs(page);
    await createJob(page, { title: jobTitle, company, location });

    // Navigate fresh to ensure client-side data is loaded after redirect
    await navigateToJobs(page);
    await expect(
      page.getByText(jobTitle).first(),
    ).toBeVisible({ timeout: 15000 });

    // Verify the CompanyLogo component renders in the job row.
    // The CompanyLogo uses role="img" for the initials avatar fallback.
    // Since we used a made-up company name, it will show initials (no real logo URL).
    const jobRow = page
      .getByRole("row", { name: new RegExp(jobTitle, "i") })
      .first();
    await expect(jobRow).toBeVisible();

    // The initials avatar has role="img" with the company name as aria-label
    const companyLogo = jobRow.getByRole("img", {
      name: new RegExp(company, "i"),
    });
    await expect(companyLogo).toBeVisible({ timeout: 10000 });

    // Verify the initials are rendered (first letters of first two words)
    // "E2E Company" -> "EC"
    await expect(companyLogo.locator("span")).toContainText("EC");

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("enrichment module settings are visible with activation toggles", async ({
    page,
  }) => {
    await navigateToEnrichmentSettings(page);

    // Verify the section heading and description
    await expect(
      page.getByText("Data Enrichment Modules"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Configure modules that automatically enrich company and job data",
      ),
    ).toBeVisible();

    // Verify module cards are displayed — the three enrichment modules
    // Logo.dev, Google Favicon, Link Preview Parser
    await expect(
      page.getByText("Logo.dev"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Google Favicon"),
    ).toBeVisible();
    await expect(
      page.getByText("Link Preview Parser"),
    ).toBeVisible();

    // Verify each module has an activation toggle (Switch)
    // The switch aria-label uses the pattern "Toggle {name} module"
    await expect(
      page.getByRole("switch", { name: /Toggle Logo\.dev module/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /Toggle Google Favicon module/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", {
        name: /Toggle Link Preview Parser module/i,
      }),
    ).toBeVisible();

    // Verify the "No API key required" badge is shown
    const noKeyBadges = page.getByText("No API key required");
    await expect(noKeyBadges.first()).toBeVisible();
  });
});
