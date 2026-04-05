import { test, expect, type Page } from "@playwright/test";
import { uniqueId, selectOrCreateComboboxOption } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

/** Navigate to My Jobs page and ensure Table view is active. */
async function navigateToJobsTable(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible" });
  await page.waitForTimeout(1500);

  // Always switch to Table view by clicking the Table radio button
  const tableRadio = page.getByRole("radio", { name: /table/i });
  await tableRadio.waitFor({ state: "visible", timeout: 5000 });
  await tableRadio.click();

  // Wait for the table element to appear
  await page.locator("table").first().waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(1500);
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

  // Select a Job Source to pass validation
  await page.getByLabel("Job Source").click();
  const sourceOption = page.getByRole("option", { name: "Indeed" });
  try {
    await sourceOption.waitFor({ state: "visible", timeout: 3000 });
    await sourceOption.click();
  } catch {
    // "Indeed" option not found — try creating it
    const createIndeed = page.getByText("Create: Indeed");
    try {
      await createIndeed.waitFor({ state: "visible", timeout: 2000 });
      await createIndeed.click();
    } catch {
      // Already selected or other issue — continue
    }
  }
  await page.waitForTimeout(300);

  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill("E2E detail panel test description.");

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

/** Delete a job from the table view. */
async function deleteJob(page: Page, jobTitle: string) {
  await navigateToJobsTable(page);
  const cells = page.getByText(new RegExp(jobTitle, "i"));
  await expect(cells.first()).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("row", { name: new RegExp(jobTitle, "i") })
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

/** Navigate to job detail by clicking the job title link in the table. */
async function navigateToJobDetail(page: Page, jobTitle: string) {
  await navigateToJobsTable(page);

  // Wait for the job to appear in the table
  const jobLink = page
    .getByRole("link", { name: new RegExp(jobTitle, "i") })
    .first();
  await expect(jobLink).toBeVisible({ timeout: 15000 });

  // Click the job title link and wait for URL to change to the detail page
  await jobLink.click();
  await page.waitForURL(/\/dashboard\/myjobs\/[a-f0-9-]+$/, {
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
}

/**
 * Change a job's status via the table actions menu.
 * Uses the "Change Status" sub-menu in the row actions dropdown.
 */
async function changeJobStatus(
  page: Page,
  jobTitle: string,
  newStatus: string,
) {
  await navigateToJobsTable(page);
  await expect(
    page.getByText(new RegExp(jobTitle, "i")).first(),
  ).toBeVisible({ timeout: 15000 });

  // Open the row actions menu
  await page
    .getByRole("row", { name: new RegExp(jobTitle, "i") })
    .getByTestId("job-actions-menu-btn")
    .first()
    .click();

  // Hover over "Change Status" to open the sub-menu
  await page
    .getByRole("menuitem", { name: /Change Status/i })
    .hover();

  // Wait for the sub-content to appear and click the target status
  await page
    .getByRole("menuitem", { name: new RegExp(`^${newStatus}$`, "i") })
    .click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Job Detail Panels", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("enrichment status panel renders on job detail page", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const uid = uniqueId();
    const jobTitle = `E2E Detail ${uid}`;
    const company = `E2E Co ${uid}`;
    const location = `E2E Loc ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists (required to avoid FK violation on submit)
    await ensureResumeExists(page, resumeTitle);

    // Create a job
    await navigateToJobsTable(page);
    await createJob(page, { title: jobTitle, company, location });

    // Navigate to job detail
    await navigateToJobDetail(page, jobTitle);

    // Verify the Enrichment Status Panel is visible
    // The panel has a CardTitle "Enrichment Status"
    await expect(
      page.getByText("Enrichment Status").first(),
    ).toBeVisible({ timeout: 15000 });

    // The panel should show either:
    // 1. Empty state with "No enrichment data" message and trigger button
    // 2. Results list with dimension entries
    // Check for either state (both indicate the panel loaded successfully)
    const emptyState = page.getByText(/No enrichment data/i);
    const triggerButton = page.getByRole("button", {
      name: /Trigger Enrichment/i,
    });
    const resultsList = page.locator("[class*='rounded-md border']").filter({
      hasText: /Logo|Deep Link/i,
    });

    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasTriggerBtn = await triggerButton.first().isVisible().catch(() => false);
    const hasResults = (await resultsList.count()) > 0;

    // At least one of these should be visible — proving the panel loaded
    expect(hasEmptyState || hasTriggerBtn || hasResults).toBe(true);

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("status history timeline renders on job detail page", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const uid = uniqueId();
    const jobTitle = `E2E Timeline ${uid}`;
    const company = `E2E TimelineCo ${uid}`;
    const location = `E2E TimelineLoc ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists
    await ensureResumeExists(page, resumeTitle);

    // Create a job
    await navigateToJobsTable(page);
    await createJob(page, { title: jobTitle, company, location });

    // Navigate to job detail
    await navigateToJobDetail(page, jobTitle);

    // Verify the Status History card is visible
    await expect(
      page.getByText("Status History").first(),
    ).toBeVisible({ timeout: 15000 });

    // The timeline should show at least the initial status entry
    // or an empty state. Both indicate the component loaded successfully.
    const timeline = page.getByRole("list", { name: /Status History/i });
    const emptyState = page.getByText(/No status changes/i);

    const hasTimeline = await timeline.isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    // At least one should be visible
    expect(hasTimeline || hasEmptyState).toBe(true);

    // If the timeline has entries, verify structure
    if (hasTimeline) {
      const items = timeline.getByRole("listitem");
      const itemCount = await items.count();
      expect(itemCount).toBeGreaterThanOrEqual(1);
    }

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("status history timeline shows status change after update", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const uid = uniqueId();
    const jobTitle = `E2E StatusChg ${uid}`;
    const company = `E2E StatusCo ${uid}`;
    const location = `E2E StatusLoc ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists
    await ensureResumeExists(page, resumeTitle);

    // Create a job (default status is "Draft")
    await navigateToJobsTable(page);
    await createJob(page, { title: jobTitle, company, location });

    // Change the job status to "Applied"
    await changeJobStatus(page, jobTitle, "Applied");

    // Wait a moment for the status change to be persisted
    await page.waitForTimeout(2000);

    // Navigate to job detail to see the timeline
    await navigateToJobDetail(page, jobTitle);

    // Verify the Status History card is visible
    await expect(
      page.getByText("Status History").first(),
    ).toBeVisible({ timeout: 15000 });

    // The timeline should now show at least the status change entry
    const timeline = page.getByRole("list", { name: /Status History/i });
    await expect(timeline).toBeVisible({ timeout: 10000 });

    // Verify we can see "Applied" in the timeline (the new status)
    await expect(
      timeline.getByText("Applied").first(),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });
});
