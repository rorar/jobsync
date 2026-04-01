import { test, expect, type Page } from "@playwright/test";
import { selectOrCreateComboboxOption } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateToJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible" });
  // Wait for the jobs table to finish its async loadJobs() call.
  await page.waitForTimeout(2000);
}

/**
 * Ensure at least one resume exists. The AddJob form defaults resume=""
 * which causes a P2003 FK violation when submitted. Having a resume
 * available lets us select it in the form to avoid this issue.
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
    await page.getByRole("menuitem", { name: "Delete" }).click({ force: true });
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
    description?: string;
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

  await page.getByText("Part-time").click();

  await page.getByLabel("Job Source").click();
  await page.getByRole("option", { name: "Indeed" }).click();
  await expect(page.getByLabel("Job Source")).toContainText("Indeed");

  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill(
    opts.description ?? "E2E test job description.",
  );

  // Select a resume to avoid the P2003 FK violation that occurs when
  // the form submits resume="" (empty string is not a valid Resume ID).
  const resumeSelect = page.getByLabel("Select Resume");
  await resumeSelect.click();
  const firstResumeOption = page.getByRole("option").first();
  const hasResumeOption = await firstResumeOption
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (hasResumeOption) {
    await firstResumeOption.click();
  } else {
    await page.keyboard.press("Escape");
  }

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

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create → assert → cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Job CRUD", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure English locale so hardcoded labels (Draft, Indeed, etc.) match
    await page.context().addCookies([
      { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
    ]);
  });

  test("should create a new job with all fields", async ({ page }) => {
    const uid = Date.now().toString(36);
    const jobTitle = `E2E Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists (required to avoid FK violation on submit)
    await ensureResumeExists(page, resumeTitle);

    await navigateToJobs(page);
    await createJob(page, { title: jobTitle, company, location });

    // Navigate fresh to ensure client-side data is loaded after redirect
    await navigateToJobs(page);
    await expect(
      page.getByText(jobTitle).first(),
    ).toBeVisible({ timeout: 15000 });

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("should edit the job description and verify updated values", async ({
    page,
  }) => {
    const uid = Date.now().toString(36);
    const jobTitle = `E2E Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists (required to avoid FK violation on submit)
    await ensureResumeExists(page, resumeTitle);

    // Create
    await navigateToJobs(page);
    await createJob(page, { title: jobTitle, company, location });

    // Navigate fresh to ensure job list is loaded
    await navigateToJobs(page);
    await expect(
      page.getByRole("row", { name: jobTitle }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Edit
    await page
      .getByRole("row", { name: jobTitle })
      .getByTestId("job-actions-menu-btn")
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Edit Job" }).click();

    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
    await expect(page.getByLabel("Title")).toContainText(jobTitle);
    await expect(page.getByLabel("Company")).toContainText(company);
    await expect(page.getByLabel("Location")).toContainText(location);
    await expect(page.getByLabel("Job Source")).toContainText("Indeed");
    await expect(page.getByLabel("Select Job Status")).toContainText("Draft");

    await page.locator(".tiptap").first().click();
    await page.locator(".tiptap").first().fill(
      "Updated: E2E test description with React and TypeScript.",
    );
    await page.getByTestId("save-job-btn").click();

    // Wait for dialog to close, then navigate fresh
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({
      timeout: 15000,
    });
    await navigateToJobs(page);
    await expect(
      page.getByRole("row", { name: jobTitle }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("should delete the job and verify removal", async ({ page }) => {
    const uid = Date.now().toString(36);
    const jobTitle = `E2E Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists (required to avoid FK violation on submit)
    await ensureResumeExists(page, resumeTitle);

    // Create first
    await navigateToJobs(page);
    await createJob(page, { title: jobTitle, company, location });

    // Navigate fresh to ensure job list is loaded
    await navigateToJobs(page);
    await expect(
      page.getByRole("row", { name: jobTitle }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Delete
    await deleteJob(page, jobTitle);

    // Verify removed
    await expect(
      page.getByRole("row", { name: jobTitle }),
    ).not.toBeVisible({ timeout: 10000 });

    // Cleanup resume
    await deleteResume(page, resumeTitle);
  });
});
