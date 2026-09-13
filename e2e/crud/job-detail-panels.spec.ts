import { test as base, expect, type Page } from "@playwright/test";
import {
  ensureEnglishLocale,
  uniqueId,
  selectOrCreateComboboxOption,
  expectToast,
} from "../helpers";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";
import { deleteJobViaApi } from "../helpers/job-fixture";

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
//      no test body deletes anything any more.
//   4. The teardown fixture swaps the registries out before its first await.
//   5. It navigates itself, inside the sweep.
//   6. Two tiers — the deleters swallow, the sweep re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
//
// THE JOB IS DRAINED BY THE HOOK TOO (E2E-B38)
// Each body used to end on `await deleteJob(page, jobTitle)`, which is the path
// a failed assertion skips. The consequence was not one extra row: the sweep
// below cannot delete a JobTitle, Company or Location while a Job still points
// at it (see the hook), so one failed assertion produced a `[residue] FAIL`
// naming three models that had nothing to do with it and carrying no finding id
// to explain them. Deletion is not the subject of any test here, so there is
// nothing to lose by moving it out and that whole failure mode to gain.
let createdJobs: string[] = [];
let createdJobTitles: string[] = [];
let createdCompanies: string[] = [];
let createdLocations: string[] = [];
// The Resume each body builds as a precondition. It is registered here rather
// than deleted at the end of the body because the body's LAST statements are
// cleanup, and a cleanup step that throws abandons every step after it. That is
// not hypothetical: in the 2026-09-06 11:40 run `deleteJob` threw on this file's
// third test and `deleteResume` — the next line — never ran, so
// `E2E Resume mtpm2megw0` survived into the run database and the residue gate
// reported it under `Resume +6 (E2E-B25)`, a finding it has nothing to do with.
// e2e/CONVENTIONS.md names the shape in its anti-pattern table: "Cleanup only at
// the end of the test body" → "test.afterEach for critical cleanup".
let createdResumes: string[] = [];

// ---------------------------------------------------------------------------
// Teardown fixture (FixtureOwnedTeardown — specs/e2e-test-infrastructure.allium:868)
// ---------------------------------------------------------------------------
//
// Playwright's `afterEach` hooks ALWAYS run before any fixture's teardown code
// — no exception (confirmed against Playwright's own source, 2026-09-13). The
// order below — Job(s) deleted first, THEN the JobTitle/Company/Location sweep
// — is REQUIRED rather than tidy: `deleteJobTitleById`/`deleteCompanyById`
// refuse while a Job still references them. Splitting Job deletion into a
// separate fixture while the rest stayed in a plain `afterEach` would silently
// break that ordering every time, so the entire former `afterEach` body lives
// in this one `auto: true` fixture instead. See `e2e/helpers/job-fixture.ts`
// for the full reasoning and why Job deletion itself moved to
// `DELETE /api/v1/jobs/:id`.
const test = base.extend<{ cleanup: void }>({
  cleanup: [
    async ({ page }, use, testInfo) => {
      await use();

      // The after-hooks run on their OWN fresh budget — `max(project, test)`,
      // not what the body left over (`playwright/lib/worker/workerMain.js:328-329`;
      // corrected 2026-09-09, this comment used to claim the opposite) and this
      // one can visit the profile page and three admin tables on top of bodies
      // that already build a resume and a job. Buy the extra time explicitly
      // rather than let a green test start failing on its teardown; keep it
      // small enough that a body which has itself become slow still surfaces.
      testInfo.setTimeout(testInfo.timeout + 60_000);

      // Swap the registries out BEFORE the first await: clearing afterwards
      // would keep entries alive into the next test if a delete throws, and
      // clearing in a beforeEach would not run at all under test.skip.
      const groups = [
        { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
        { tab: ADMIN_TAB.company, names: createdCompanies },
        { tab: ADMIN_TAB.location, names: createdLocations },
      ];
      const jobs = createdJobs;
      const resumes = createdResumes;
      createdJobs = [];
      createdJobTitles = [];
      createdCompanies = [];
      createdLocations = [];
      createdResumes = [];

      // JOBS FIRST, and that ORDER is required rather than tidy:
      // `deleteJobTitleById` (jobtitle.actions.ts:110-145) and
      // `deleteCompanyById` (company.actions.ts:337-375) both count the
      // referencing Jobs and refuse while one remains.
      for (const title of jobs) {
        try {
          await deleteJobViaApi(page, title);
        } catch (error) {
          // swallow-ok: cleanup net — a hook that throws replaces the real
          // test failure with its own. Caught per-title so one anomaly does
          // not abandon the rest of the loop (`deleteJobViaApi` throws a
          // specific, named error for every anomaly; see its doc comment).
          console.warn(
            `[job-detail-panels] leaked job survived cleanup: ${title} (${String(error)})`,
          );
        }
      }

      // Resume second. NOT for a dependency reason — that claim was here until
      // 2026-09-08 and was wrong. `Job.resumeId` is an OPTIONAL relation with no
      // `onDelete` (`prisma/schema.prisma:436-437`), and `deleteResumeById` guards
      // only against Automations, never against Jobs
      // (`src/actions/profile.actions.ts:389-398`), so a resume CAN go while its
      // job is still there. It sits here because this is where the bodies put it
      // relative to the job delete, and moving it would change behaviour for no
      // reason; only the sweep genuinely depends on an ordering.
      // `deleteResume` TOLERATES absence by contract (helpers/resume-fixture.ts), so
      // on a red run this costs one navigation and reports nothing — it cannot turn
      // a failing test into a differently-failing one.
      for (const title of resumes) {
        await deleteResume(page, title);
      }

      // Reference rows last, for the reason given above the job loop.
      await sweepReferenceGroups(page, groups, "job-detail-panels");
    },
    { auto: true },
  ],
});

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

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

  // Always switch to Table view by clicking the Table radio button.
  //
  // The flip is CONFIRMED, not just requested. A click is not a flip, and an
  // unverified one leaves the page in Kanban — where `MyJobsTable` is not
  // rendered at all (`JobsContainer.tsx:437-445` is a ternary), so every `tr`
  // read downstream finds nothing about jobs that exist. Clicking the radio
  // when it is already active is a no-op (`toolbar-radio-group.tsx:157-158`
  // guards on `if (!active)`), so this stays idempotent.
  const tableRadio = page.getByRole("radio", { name: /table/i });
  await tableRadio.waitFor({ state: "visible", timeout: 5000 });
  await tableRadio.click();
  await expect(tableRadio).toHaveAttribute("aria-checked", "true");
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

  // Registered immediately before the click that writes the Job, and not
  // earlier. The three reference registrations above sit at the combobox that
  // writes THEIR row; this is the same rule applied to the Job, whose only write
  // site is this submit — `addJob` is reachable from nowhere else. The sibling
  // specs (kanban.spec.ts:111, job-status-crud.spec.ts:351) register up at the
  // Title combobox instead, which is also "before the write" but over-broadly: a
  // body that dies while filling the Job Source registers a Job that was never
  // created, and the hook then pays a full absence timeout chasing it.
  //
  // The assertion after the click is NOT the registration point: a save that
  // succeeds and then fails the dialog-close wait has still written the row.
  createdJobs.push(opts.title);
  await page.getByTestId("save-job-btn").click();

  // Wait for the dialog to close (confirms save + redirect completed)
  await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({
    timeout: 15000,
  });
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

    // Ensure a resume exists (required to avoid FK violation on submit).
    // Registered BEFORE the call that can write it, for the reason the combobox
    // registrations in `createJob` spell out: a helper that creates the row and
    // then fails its follow-up assertion has still left one behind.
    createdResumes.push(resumeTitle);
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

    // Cleanup is entirely in the afterEach now — the resume since 2026-09-08,
    // the JOB as of this change. It used to be this line, which is the path a
    // failed assertion above skips; and a surviving Job then blocks the
    // reference sweep, so one red assertion produced three more red lines about
    // JobTitle, Company and Location. See the file header.
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

    // Ensure a resume exists (registered before the call — see the first test)
    createdResumes.push(resumeTitle);
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

    // Cleanup is entirely in the afterEach now — the resume since 2026-09-08,
    // the JOB as of this change. It used to be this line, which is the path a
    // failed assertion above skips; and a surviving Job then blocks the
    // reference sweep, so one red assertion produced three more red lines about
    // JobTitle, Company and Location. See the file header.
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

    // Ensure a resume exists (registered before the call — see the first test)
    createdResumes.push(resumeTitle);
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

    // Cleanup is entirely in the afterEach now — the resume since 2026-09-08,
    // the JOB as of this change. It used to be this line, which is the path a
    // failed assertion above skips; and a surviving Job then blocks the
    // reference sweep, so one red assertion produced three more red lines about
    // JobTitle, Company and Location. See the file header.
  });
});
