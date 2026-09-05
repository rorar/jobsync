import { test, expect, type Page } from "@playwright/test";
import {
  uniqueId,
  selectOrCreateComboboxOption,
  expectToast,
  rowsByText,
} from "../helpers";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";

// ---------------------------------------------------------------------------
// Reference-data cleanup (E2E-B24 / E2E-B25)
// ---------------------------------------------------------------------------
//
// Each of the three tests below builds a job through the AddJob comboboxes, and
// each combobox write leaves a REFERENCE row that the job does not own: a
// `JobTitle`, a `Company` and a `Location`. `deleteJob` removes the Job and
// nothing else — the rows it pointed at stay. Measured on the 2026-09-05 run,
// where all three tests PASSED and left nine rows behind (`E2E Detail`,
// `E2E Timeline`, `E2E StatusChg` and their `E2E Co`/`E2E Loc`/`E2E TimelineCo`
// /`E2E TimelineLoc`/`E2E StatusCo`/`E2E StatusLoc` companions).
//
// The pattern is the one `keyboard-ux.spec.ts` documents, with the two shared
// deleters now in `../helpers/admin-reference-cleanup`:
//   1. ARRAYS, not scalars — one body writes three rows.
//   2. Registration sits where the row is WRITTEN and BEFORE the call that
//      writes it: a `selectOrCreateComboboxOption` that creates the row and then
//      fails its follow-up assertion has still leaked one.
//   3. De-registration only on a PROVEN delete — there is none here, because
//      nothing in a test body deletes a reference row.
//   4. The afterEach swaps the registries out before its first await.
//   5. It navigates itself, inside the sweep.
//   6. Two tiers — the deleters swallow, the sweep re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
let createdJobTitles: string[] = [];
let createdCompanies: string[] = [];
let createdLocations: string[] = [];

test.afterEach(async ({ page }, testInfo) => {
  // A hook shares the test's 60 s budget (playwright.config.ts:23) and this one
  // can visit three admin tables on top of bodies that already build a resume
  // and a job. Buy the extra time explicitly rather than let a green test start
  // failing on its teardown; keep it small enough that a body which has itself
  // become slow still surfaces.
  test.setTimeout(testInfo.timeout + 45_000);

  // Swap the registries out BEFORE the first await: clearing afterwards would
  // keep entries alive into the next test if a delete throws, and clearing in a
  // beforeEach would not run at all under test.skip.
  const groups = [
    { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
    { tab: ADMIN_TAB.company, names: createdCompanies },
    { tab: ADMIN_TAB.location, names: createdLocations },
  ];
  createdJobTitles = [];
  createdCompanies = [];
  createdLocations = [];

  // The Job is deleted by the body, and that ORDER is required rather than
  // tidy: `deleteJobTitleById` (jobtitle.actions.ts:110-145) and
  // `deleteCompanyById` (company.actions.ts:337-375) both refuse while a Job
  // still references the row. On a red run the job survives and the sweep warns
  // about three rows instead of silently leaving them — which is the honest
  // outcome, not a second bug.
  await sweepReferenceGroups(page, groups, "job-detail-panels");
});

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

/**
 * Navigate to My Jobs and switch to Table view. Does NOT wait for a table.
 *
 * There is no table when the user has no jobs: JobsContainer.tsx:447-449 renders
 * KanbanEmptyState instead. Waiting for `table` here was an unstated dependency
 * on jobs left behind by earlier runs — invisible while the suite shared the
 * developer's database (which held four), and a hard failure of all three tests
 * in this file the first time it ran against a fresh one.
 *
 * Callers that need a row wait for that row, which is the assertion they
 * actually care about; callers that are about to CREATE the first job must not
 * wait for a table that cannot exist yet.
 */
async function navigateToJobsTable(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible" });

  // Always switch to Table view by clicking the Table radio button
  const tableRadio = page.getByRole("radio", { name: /table/i });
  await tableRadio.waitFor({ state: "visible", timeout: 5000 });
  await tableRadio.click();
}

/**
 * Same, plus the table itself — for callers that expect at least one job and
 * would otherwise race the render.
 */
async function navigateToPopulatedJobsTable(page: Page) {
  await navigateToJobsTable(page);
  await page.locator("table").first().waitFor({ state: "visible", timeout: 10000 });
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

  // Each name is registered immediately BEFORE the call that can write it. The
  // helper's create path calls the server action and only then closes the
  // popover, so a run that dies between the two — or that fails the
  // `toContainText` below — has already left the row behind. Registering after
  // a successful assertion would clean up exactly the cases that do not need it.
  createdJobTitles.push(opts.title);
  await selectOrCreateComboboxOption(
    page,
    "Title",
    "Create or Search title",
    opts.title,
  );
  await expect(page.getByLabel("Title")).toContainText(opts.title);

  createdCompanies.push(opts.company);
  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    opts.company,
  );
  await expect(page.getByLabel("Company")).toContainText(opts.company);

  createdLocations.push(opts.location);
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
  // M-T-04 follow-up: replaced waitForTimeout(300) — wait for combobox to close.
  await page.getByRole("option").first().waitFor({ state: "hidden", timeout: 3000 }).catch(() => null);

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
  await navigateToPopulatedJobsTable(page);
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

  // A click is not an outcome — this copy had no proof at all, so a refused
  // delete returned as success and left the row behind. DOM locator, because
  // the read happens as the AlertDialog closes (E2E-B40).
  await expect(rowsByText(page, jobTitle)).toHaveCount(0, { timeout: 15000 });
}

/** Navigate to job detail by clicking the job title link in the table. */
async function navigateToJobDetail(page: Page, jobTitle: string) {
  await navigateToPopulatedJobsTable(page);

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
  await page.waitForLoadState("domcontentloaded");
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
  await navigateToPopulatedJobsTable(page);
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

  // The status change is a server action; JobsContainer.onChangeJobStatus
  // toasts jobs.updatedSuccess only once it has resolved. That toast — not
  // "networkidle" — is what "the action completed" looks like from outside.
  await expectToast(page, /Job has been updated successfully/);
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
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000);

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

    // Assert with `or()` rather than three `isVisible()` probes. The panel
    // renders <EnrichmentStatusSkeleton> while `loading` is true, so a probe
    // taken the instant the card title appears reads all three as false and
    // fails a panel that was merely still fetching. `or()` retries.
    await expect(
      emptyState.or(triggerButton.first()).or(resultsList.first()),
    ).toBeVisible({ timeout: 15000 });

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("status history timeline renders on job detail page", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000);

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

    // Same reason as the enrichment panel above: retry instead of probing once.
    await expect(timeline.or(emptyState)).toBeVisible({ timeout: 15000 });

    // If the timeline has entries, verify structure
    if (await timeline.isVisible()) {
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
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000);

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
