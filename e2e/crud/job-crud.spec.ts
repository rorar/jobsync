import { test, expect, type Page } from "@playwright/test";
import { selectOrCreateComboboxOption } from "../helpers";

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
  // exact: true — the form also has a "Save & Open" button; without exact the
  // "Save" matcher is ambiguous (strict-mode violation).
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText(/Resume created successfully/i).first(),
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

  await selectOrCreateComboboxOption(
    page,
    "Title",
    "Create or Search title",
    opts.title,
  );
  await expect(page.getByLabel("Title", { exact: true })).toContainText(
    opts.title,
  );

  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    opts.company,
  );
  await expect(page.getByLabel("Company", { exact: true })).toContainText(
    opts.company,
  );

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
      await page.getByLabel("Role").fill(opts.contactRole);
    }
  }

  // Welle 3 F-AJ-08: optionally set the recruiter triangle. The recruiting
  // agency is a creatable Combobox (field.name="recruitingCompany"); a unique
  // agency name has no matching option, so we create it via the CommandEmpty
  // "Create:" affordance. handleCreateOption unshifts the result + calls
  // field.onChange, so the trigger immediately shows the new agency label.
  if (opts.recruitingCompany) {
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
    test.setTimeout(120_000); // first crud job compiles the Add Job route on the dev server → >60s
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

  test("should create a job with a structured salary range (Welle 2 Phase 3)", async ({
    page,
  }) => {
    test.setTimeout(120_000); // Resume + full job + salary fields requires >60s on slow dev server
    const uid = Date.now().toString(36);
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
  }) => {
    test.setTimeout(120_000); // Create + Edit requires >60s on slow dev server
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
    await expect(page.getByLabel("Select Status")).toContainText(
      "Bookmarked",
    ); // SelectFormCtrl aria-label = "Select " + t("jobs.status")="Status" (was
    // "Select Job Status" before the 2026-06-12 i18n label change). Default
    // status for a newly created job (no "Draft" status exists).

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

  test("should delete the job and verify removal", async ({ page }) => {
    test.setTimeout(120_000); // Create + Delete requires >60s on slow dev server
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
    await ensureTableView(page); // row assertions need Table; storageState may persist Kanban
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

  // F-AJ-04: due date is optional — a job can be created with no due date.
  test("should create a job with the due date cleared (F-AJ-04)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const uid = Date.now().toString(36);
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
  }) => {
    test.setTimeout(120_000);
    const uid = Date.now().toString(36);
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
  }) => {
    test.setTimeout(120_000);
    const uid = Date.now().toString(36);
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

    // Cleanup (job + resume). The agency company is left in place — there is no
    // company hard-delete flow, and it carries no PII.
    await deleteJob(page, jobTitle);
    await deleteResume(page, resumeTitle);
  });
});
