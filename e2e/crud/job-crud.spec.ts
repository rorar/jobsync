import { test, expect, type Page } from "@playwright/test";
import { expectToast, rowsByText, selectOrCreateComboboxOption, uniqueId } from "../helpers";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";

// ---------------------------------------------------------------------------
// Reference-data cleanup (E2E-B24 / E2E-B25)
// ---------------------------------------------------------------------------
//
// `deleteJob` removes the Job. It does not remove the `JobTitle`, `Company` and
// `Location` rows the AddJob comboboxes wrote on the way there, and neither
// does anything else in this file — so seven green tests left 8 job titles,
// 9 companies (the seventh test also creates a recruiting agency) and 8
// locations in the 2026-09-05 run database. That run had two unexpected
// results; neither of them was in this file. The leak is the GREEN path.
//
// The pattern is the one `keyboard-ux.spec.ts` documents, with the two shared
// deleters now in `../helpers/admin-reference-cleanup`:
//   1. ARRAYS, not scalars — one `createJob` writes three rows, and the
//      recruiter test writes a fourth.
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
  // A hook shares the test's 60 s budget (playwright.config.ts:23) — and these
  // bodies have already bought themselves 60 s extra, so teardown is competing
  // with a body that is allowed to be slow. This one can visit three admin
  // tables. Buy the extra time explicitly; keep it small enough that a body
  // which has itself become slow still surfaces.
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

  // The Job is deleted by the body — `deleteJob` proves removal rather than
  // assuming it — and that ORDER is required rather than tidy:
  // `deleteJobTitleById` (jobtitle.actions.ts:110-145) and `deleteCompanyById`
  // (company.actions.ts:337-375) both count referencing Jobs first and refuse
  // while one remains. On a red run the job survives and the sweep warns about
  // three rows instead of silently leaving them, which is the honest outcome.
  //
  // The recruiting agency is the exception to the comment `deleteJob`'s caller
  // used to carry ("left in place — there is no company hard-delete flow"):
  // there is one, in the admin Companies tab, and it is what the sweep uses.
  await sweepReferenceGroups(page, groups, "job-crud");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateToJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  // The add-job button proves the page shell is interactive. We deliberately
  // do NOT wait for "networkidle" here: the dashboard holds a persistent
  // scheduler SSE connection (/api/scheduler/status), so the page never reaches
  // network idle and the wait would always time out. Tests that assert specific
  // rows wait for those rows explicitly.
  await page.getByTestId("add-job-btn").waitFor({ state: "visible" });
}

/**
 * Force the Table view. The Jobs view mode (Table | Kanban) is persisted in
 * localStorage (useKanbanState), so a stale storageState can leave the page in
 * Kanban, which has no `role="row"` rows for the row-based delete flow.
 *
 * Scope note: we deliberately do NOT call this from `navigateToJobs`. When the
 * table is populated it renders a `columnheader` named "Company", which would
 * collide with the dialog's "Company" combobox in the unscoped
 * `selectOrCreateComboboxOption` (`getByLabel("Company")` → strict-mode
 * violation). `createJob` therefore runs in whatever the persisted view is
 * (Kanban shows cards, no column header → no collision), and only `deleteJob`
 * — which queries `role="row"` and never `getByLabel` — switches to Table.
 *
 * Idempotent: clicking the already-active radio is a no-op, and the toggle is
 * absent in the empty state, so we guard with a short visibility probe.
 */
async function ensureTableView(page: Page) {
  const tableRadio = page.getByRole("radio", { name: "Table" });
  try {
    await tableRadio.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return; // toggle not rendered (e.g. empty state) — nothing to switch
  }
  if ((await tableRadio.getAttribute("aria-checked")) !== "true") {
    await tableRadio.click();
    await expect(tableRadio).toHaveAttribute("aria-checked", "true");
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
    clearDueDate?: boolean;
    salaryMin?: string;
    salaryMax?: string;
    /** Welle 3 F-AJ-07: select an existing person as point of contact (option label). */
    contactName?: string;
    contactRole?: string;
    /** Welle 3 F-AJ-08: recruiter triangle — recruiting agency company name (create-flow). */
    recruitingCompany?: string;
    /** Welle 3 F-AJ-08: relationship type option label (e.g. "Recruiting agency"). */
    relationshipType?: string;
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
  await expect(page.getByLabel("Title", { exact: true })).toContainText(
    opts.title,
  );

  createdCompanies.push(opts.company);
  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    opts.company,
  );
  await expect(page.getByLabel("Company", { exact: true })).toContainText(
    opts.company,
  );

  createdLocations.push(opts.location);
  await selectOrCreateComboboxOption(
    page,
    "Location",
    "Create or Search location",
    opts.location,
  );
  await expect(page.getByLabel("Location", { exact: true })).toContainText(
    opts.location,
  );

  await page.getByText("Part-time").click();

  await page.getByLabel("Job Source").click();
  await page.getByRole("option", { name: "Indeed" }).click();
  await expect(page.getByLabel("Job Source")).toContainText("Indeed");

  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill(
    opts.description ?? "E2E test job description.",
  );

  // Welle 2 Phase 3: structured salary (range mode is the default). Optional.
  if (opts.salaryMin !== undefined) {
    await page.getByLabel("Minimum").fill(opts.salaryMin);
  }
  if (opts.salaryMax !== undefined) {
    await page.getByLabel("Maximum").fill(opts.salaryMax);
  }

  // F-AJ-04: the due date is optional. Clear the default (+3 days) value via
  // the DatePicker's Clear action and assert the trigger reverts to the
  // empty placeholder.
  if (opts.clearDueDate) {
    await page.getByTestId("due-date-trigger").click();
    await page.getByRole("button", { name: "Clear date" }).click();
    await expect(page.getByTestId("due-date-trigger")).toContainText(
      "Pick a date",
    );
  }

  // Select a resume to avoid the P2003 FK violation that occurs when
  // the form submits resume="" (empty string is not a valid Resume ID).
  // Wait for resumes to load before attempting selection.
  const resumeSelect = page.getByLabel("Select Resume");
  await resumeSelect.click();
  const firstResumeOption = page.getByRole("option").first();
  await firstResumeOption.waitFor({ state: "visible", timeout: 10000 });
  await firstResumeOption.click();

  // Welle 3 F-AJ-07: optionally pick an existing person as point of contact.
  if (opts.contactName) {
    await page.getByRole("combobox", { name: "Select contact..." }).click();
    await page.getByPlaceholder("Search contacts...").fill(opts.contactName);
    await page
      .getByRole("option", { name: new RegExp(opts.contactName, "i") })
      .first()
      .click();
    if (opts.contactRole) {
      // Role is a Select (SelectFormCtrl → Radix), not a text field: its
      // trigger is a role="combobox" button carrying
      // aria-label={t("forms.selectPlaceholder")} = "Select Role", which is why
      // a substring getByLabel("Role") resolved to it and fill() then rejected
      // it as "not an <input>". Pick the option instead.
      await page.getByRole("combobox", { name: "Select Role" }).click();
      await page
        .getByRole("option", { name: opts.contactRole, exact: true })
        .click();
    }
  }

  // Welle 3 F-AJ-08: optionally set the recruiter triangle. The recruiting
  // agency is a creatable Combobox (field.name="recruitingCompany"); a unique
  // agency name has no matching option, so we create it via the CommandEmpty
  // "Create:" affordance. handleCreateOption unshifts the result + calls
  // field.onChange, so the trigger immediately shows the new agency label.
  if (opts.recruitingCompany) {
    // Registered before the popover opens. The catch branch below clicks
    // "Create:", which writes a second `Company` row — one this file's
    // `deleteJob` never touched and which used to be left behind deliberately
    // (see the caller's old note about there being no hard-delete flow). The
    // admin Companies tab is that flow, so the row is swept like any other.
    createdCompanies.push(opts.recruitingCompany);
    await page.getByLabel("Recruiting Agency", { exact: true }).click();
    const rcSearch = page.getByPlaceholder("Create or search Recruiting Agency");
    await rcSearch.fill(opts.recruitingCompany);
    const existing = page.getByRole("option", {
      name: opts.recruitingCompany,
      exact: true,
    });
    try {
      await existing.waitFor({ state: "visible", timeout: 2000 });
      await existing.click();
    } catch {
      await page.getByText(/^Create:/).click();
    }
    await expect(page.getByLabel("Recruiting Agency", { exact: true })).toContainText(
      opts.recruitingCompany,
      { timeout: 10000 },
    );
  }

  // relationshipType is a SelectFormCtrl; its trigger aria-label is
  // `Select ${label}` → "Select Relationship".
  if (opts.relationshipType) {
    await page.getByLabel("Select Relationship", { exact: true }).click();
    await page
      .getByRole("option", { name: opts.relationshipType, exact: true })
      .click();
    await expect(page.getByLabel("Select Relationship", { exact: true })).toContainText(
      opts.relationshipType,
    );
  }

  await page.getByTestId("save-job-btn").click();

  // Wait for the dialog to close (confirms save + redirect completed)
  await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({
    timeout: 15000,
  });
}

async function deleteJob(page: Page, jobTitle: string) {
  await navigateToJobs(page);
  await ensureTableView(page); // delete is row-based; force Table regardless of persisted view
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

  // A click is not an outcome, and proving a deletion takes TWO assertions —
  // the server's answer, then the view's (e2e/CONVENTIONS.md, "Proving deletion
  // takes two assertions, one wrong locator"). The container reloads only on
  // success, so a delete the server REFUSED leaves the row exactly where it was
  // and this function still returned. That matters beyond the one test that
  // asserts removal itself: `deleteJob` is the inline cleanup of seven tests
  // here, and a silent refusal is how rows survive a run Playwright reported as
  // green — which is why `scripts/check-e2e-residue.sh` still carries
  // `Job:E2E-B38` in its known-debt list.
  //
  // This copy carried only the second half. The gap is not cosmetic: the two
  // failures are indistinguishable from the row's side and have opposite causes
  // —
  //
  //   no toast at all   → the round trip never happened; nothing was decided.
  //   destructive toast → the server decided, and refused.
  //
  // `job-detail-panels.spec.ts:262` documents the measurement that made the
  // distinction matter: a dev-server restart between the Delete click and the
  // server action landing, with no audit line and no error anywhere, reported
  // here as "the row is still there" and sent an investigation into cleanup
  // code that had done nothing wrong.
  //
  // 15 s rather than the helper's 10 s default, for the same reason given
  // there: the route can be cold behind a recompile, and a legitimate delete
  // must not be called a failure for being slow.
  await expectToast(page, /Job has been deleted successfully/, 15000);
  // DOM locator, never `getByRole`, because this read happens as the
  // AlertDialog closes (E2E-B40).
  await expect(rowsByText(page, jobTitle)).toHaveCount(0, { timeout: 15000 });
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

  test("should create a new job with all fields", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000); // first crud job compiles the Add Job route on the dev server → >60s
    const uid = uniqueId();
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

  test("should create a job with a structured salary range (Welle 2 Phase 3)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000); // Resume + full job + salary fields requires >60s on slow dev server
    const uid = uniqueId();
    const jobTitle = `E2E Salary Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    await ensureResumeExists(page, resumeTitle);

    await navigateToJobs(page);
    await createJob(page, {
      title: jobTitle,
      company,
      location,
      salaryMin: "50000",
      salaryMax: "70000",
    });

    // Job created with structured salary (dialog closed = save succeeded).
    await navigateToJobs(page);
    await expect(page.getByText(jobTitle).first()).toBeVisible({ timeout: 15000 });

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("should edit the job description and verify updated values", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000); // Create + Edit requires >60s on slow dev server
    const uid = uniqueId();
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
    await ensureTableView(page); // row assertions need Table; storageState may persist Kanban
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
    await expect(page.getByLabel("Title", { exact: true })).toContainText(
      jobTitle,
    );
    await expect(page.getByLabel("Company", { exact: true })).toContainText(
      company,
    );
    await expect(page.getByLabel("Location", { exact: true })).toContainText(
      location,
    );
    await expect(page.getByLabel("Job Source")).toContainText("Indeed");
    // Welle 4 (F-AJ-02): status is now the grouped StatusStageCombobox; the
    // trigger shows the default status label for a newly created job.
    await expect(page.getByTestId("status-combobox-trigger")).toContainText(
      "Bookmarked",
    );

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
    await ensureTableView(page); // row assertions need Table; storageState may persist Kanban
    await expect(
      page.getByRole("row", { name: jobTitle }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  test("should delete the job and verify removal", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000); // Create + Delete requires >60s on slow dev server
    const uid = uniqueId();
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
    await ensureTableView(page); // row assertions need Table; storageState may persist Kanban
    await expect(
      page.getByRole("row", { name: jobTitle }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Delete
    await deleteJob(page, jobTitle);

    // Verify removed. `deleteJob` now proves this too, but the assertion stays
    // here because removal is what THIS test is about — the helper's proof
    // exists for the six tests that call it only to clean up.
    await expect(rowsByText(page, jobTitle)).toHaveCount(0, { timeout: 10000 });

    // Cleanup resume
    await deleteResume(page, resumeTitle);
  });

  // F-AJ-04: due date is optional — a job can be created with no due date.
  test("should create a job with the due date cleared (F-AJ-04)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000);
    const uid = uniqueId();
    const jobTitle = `E2E NoDue ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    await ensureResumeExists(page, resumeTitle);

    await navigateToJobs(page);
    await createJob(page, {
      title: jobTitle,
      company,
      location,
      clearDueDate: true,
    });

    // Job persists despite having no due date.
    await navigateToJobs(page);
    await ensureTableView(page); // row assertions need Table; storageState may persist Kanban
    await expect(
      page.getByRole("row", { name: jobTitle }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Cleanup
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });

  // -------------------------------------------------------------------------
  // Welle 3 F-AJ-07: point-of-contact happy-path
  // -------------------------------------------------------------------------
  test("should create a job with a point of contact and surface it on the contact's Related Jobs", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000);
    const uid = uniqueId();
    const jobTitle = `E2E Contact Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;
    const firstName = `E2E${uid}`;
    const lastName = "Recruiter";
    const fullName = `${firstName} ${lastName}`;

    // 1. Create the person to be linked as point of contact.
    await page.goto("/dashboard/contacts");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "Add Contact" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill(firstName);
    await sheet.getByLabel("Last Name").fill(lastName);
    await sheet
      .getByPlaceholder("email@example.com")
      .fill(`${firstName.toLowerCase()}@e2e.test`);
    await sheet.getByRole("button", { name: "Add Contact" }).click();
    await expect(page.getByText(fullName).first()).toBeVisible({ timeout: 10000 });

    // 2. Create a job and pick that person as point of contact.
    await ensureResumeExists(page, resumeTitle);
    await navigateToJobs(page);
    await createJob(page, {
      title: jobTitle,
      company,
      location,
      contactName: fullName,
      contactRole: "Recruiter",
    });

    // 3. Verify the link surfaces on the contact's Related Jobs tab.
    await page.goto("/dashboard/contacts");
    await page.waitForLoadState("domcontentloaded");
    await page.getByText(fullName).first().click();
    await expect(
      page.getByRole("heading", { name: fullName, level: 1 }),
    ).toBeVisible({ timeout: 10000 });
    await page.getByRole("tab", { name: "Related Jobs" }).click();
    await expect(page.getByText(jobTitle).first()).toBeVisible({ timeout: 10000 });

    // 4. Cleanup (job + resume; archive the person — GDPR design, no hard delete).
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
    await page.goto("/dashboard/contacts");
    await page.waitForLoadState("domcontentloaded");
    await page.getByText(fullName).first().click();
    await page.getByRole("button", { name: "Archive" }).click();
    // A click is not an outcome, and this was the LAST line of the test: the
    // page closes the moment the body returns, so the archive request was being
    // abandoned in flight. Measured — `E2Emtov9xagw0 Recruiter` is still
    // `status: "active"` in the 2026-09-05 run database, from a test that
    // passed. "Reactivate" replacing "Archive" is the archived state's own
    // control (PersonDetail), so waiting for it is both the proof and the thing
    // that keeps the request alive. Same pattern as
    // `contact-company-link.spec.ts:87-93`.
    await expect(
      page.getByRole("button", { name: "Reactivate" }),
    ).toBeVisible({ timeout: 10000 });
  });

  // -------------------------------------------------------------------------
  // Welle 3 F-AJ-08: recruiter-triangle path
  // -------------------------------------------------------------------------
  //
  // WHY EDIT-PREFILL IS THE ASSERTION
  // The recruiter triangle (recruitingCompany + relationshipType) has no
  // read-only display surface yet — it is set only in the AddJob form and
  // exposed via the API. The deterministic in-app verification is therefore:
  // create a job with both fields, reopen the Edit dialog, and assert the form
  // prefilled them (AddJob.tsx maps editJob.RecruitingCompany / relationshipType
  // back into the form). This proves the write persisted AND the named relation
  // round-trips through JOB_*_SELECT.
  test("should create a job with a recruiter triangle and prefill it on edit (F-AJ-08)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000);
    const uid = uniqueId();
    const jobTitle = `E2E Recruiter Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;
    const agency = `E2E Agency ${uid}`;

    await ensureResumeExists(page, resumeTitle);

    await navigateToJobs(page);
    await createJob(page, {
      title: jobTitle,
      company,
      location,
      recruitingCompany: agency,
      relationshipType: "Recruiting agency",
    });

    // Reopen Edit and assert the recruiter triangle prefilled.
    await navigateToJobs(page);
    await ensureTableView(page);
    await expect(
      page.getByRole("row", { name: jobTitle }).first(),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("row", { name: jobTitle })
      .getByTestId("job-actions-menu-btn")
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Edit Job" }).click();

    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
    // relationshipType is the deterministic round-trip proof: it is an enum, so
    // it is ALWAYS present in the SelectFormCtrl options and prefills reliably
    // from editJob.relationshipType. Asserting it confirms the F-AJ-08 write →
    // JOB_*_SELECT → edit-form read path.
    await expect(page.getByLabel("Select Relationship", { exact: true })).toContainText(
      "Recruiting agency",
    );
    // NOTE: we deliberately do NOT assert the Recruiting Agency combobox shows
    // the agency name here. The company dropdown (`companies` prop) is the
    // top-N companies ordered by applied-job count (getCompanies: orderBy
    // jobsApplied._count desc + take limit). A freshly created agency has 0
    // applied jobs, so it can fall outside that window — the combobox then
    // shows its placeholder even though field.value (the agency id) IS set and
    // round-trips on save. The persistence itself is covered by unit tests and
    // by the create-time assertion above (line ~225). This is a pre-existing
    // characteristic of the shared company combobox, not specific to F-AJ-08.

    // Close the dialog before the row-based cleanup flow.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({
      timeout: 10000,
    });

    // Cleanup (job + resume). The agency Company is NOT left in place any more:
    // the claim that "there is no company hard-delete flow" was wrong — the
    // admin Companies tab has one, and the afterEach uses it. Deleting the JOB
    // first is what makes that possible, since `deleteCompanyById` refuses
    // while a Job still references the row.
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });
});
