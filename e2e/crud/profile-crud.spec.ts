import { test, expect, type Page } from "@playwright/test";
import { expectToast, selectOrCreateComboboxOption, safeWait, uniqueId } from "../helpers";

// ---------------------------------------------------------------------------
// Locale
// ---------------------------------------------------------------------------

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
});

// Teardown registries. Declared up here so `deleteResumeAndVerifyGone` can
// de-register without a forward reference; the pattern they belong to, and the
// hook that drains them, are in "Reference-data cleanup" below.
let createdResumes: string[] = [];
let createdJobTitles: string[] = [];
let createdCompanies: string[] = [];
let createdLocations: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateToProfile(page: Page) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");
}

async function createResume(page: Page, title: string) {
  await page.getByRole("button", { name: "New Resume" }).click();
  await page.getByPlaceholder("Ex: Full Stack Developer").fill(title);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

async function openResumeEditor(page: Page, resumeTitle: string) {
  // Wait for the resume row to appear (the create might still be processing)
  const row = page
    .getByRole("row", { name: new RegExp(resumeTitle, "i") })
    .first();
  await row.waitFor({ state: "visible", timeout: 10000 });
  await row.getByTestId("resume-actions-menu-btn").click({ force: true });
  // The "View / Edit Resume" menu item is inside a <Link> that triggers
  // navigation. Use Promise.all to catch the navigation event.
  const menuItem = page.getByRole("menuitem", {
    name: "View / Edit Resume",
  });
  await menuItem.waitFor({ state: "visible", timeout: 5000 });
  await Promise.all([
    page.waitForURL(/\/dashboard\/profile\/resume\//, { timeout: 15000 }),
    menuItem.click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: "Resume" }).first(),
  ).toBeVisible({ timeout: 10000 });
}

/**
 * Delete a resume and assert it is gone.
 *
 * Deliberately NOT the shared `deleteResume` from `../helpers/resume-fixture`.
 * There, deletion is teardown and a missing row is tolerated; here it is the
 * Profile aggregate's own delete flow, so a missing row must fail and the row
 * must be gone afterwards. The name says which of the two this is — two
 * functions called `deleteResume` with opposite failure semantics is how a
 * fix gets applied to the wrong one.
 */
async function deleteResumeAndVerifyGone(page: Page, title: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");
  const row = page
    .getByRole("row", { name: new RegExp(title, "i") })
    .first();
  await row.waitFor({ state: "visible", timeout: 10000 });
  await row.getByTestId("resume-actions-menu-btn").click({ force: true });
  await page
    .getByRole("menuitem", { name: "Delete" })
    .click({ force: true });
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click({ force: true });
  // Wait for the row to disappear from the table
  await expect(row).not.toBeVisible({ timeout: 10000 });
  // Reached only when every assertion above passed, i.e. the row is PROVABLY
  // gone — the one condition under which de-registering is safe. A delete that
  // threw anywhere above skips this line and stays registered, which is exactly
  // the case the afterEach net exists for.
  createdResumes = createdResumes.filter((t) => t !== title);
}

// ---------------------------------------------------------------------------
// Reference-data cleanup (E2E-B24 / E2E-B25)
// ---------------------------------------------------------------------------
//
// Deleting the resume is enough for everything INSIDE the Profile aggregate:
// `deleteResumeById` (profile.actions.ts:403-455) removes ContactInfo, Summary,
// WorkExperience, Education, LicenseOrCertification, OtherSection and
// ResumeSection in one transaction. That cascade lives in application code, not
// in the schema — `prisma/schema.prisma:135-189` declares no `onDelete` at all.
//
// What survives the resume are the REFERENCE rows the experience and education
// forms create on the way: JobTitle, Company and Location. Nothing in this spec
// ever removed them (2 job titles, 2 companies, 3 locations per run).
//
// Six-part pattern, copied from `webhook-settings.spec.ts:212-245` and
// `settings-api-keys.spec.ts:195-229`:
//   1. ARRAYS, not scalars — the multi-section test creates three reference
//      rows in one body.
//   2. Registration sits at the creating call and BEFORE it: a
//      `selectOrCreateComboboxOption` that writes the row and then fails its
//      follow-up assertion has still leaked one.
//   3. De-registration only on a proven delete (see `deleteResumeAndVerifyGone`
//      above and `deleteAdminReferenceRow` below).
//   4. The afterEach swaps the references out before its first await.
//   5. It navigates itself, inside the try.
//   6. Two tiers — the deleters swallow, the hook re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
//
// FOLLOW-UP: `keyboard-ux.spec.ts` carries its own copy of
// `loadUntilAdminRowVisible` / `deleteAdminReferenceRow`, because the two specs
// were repaired under separate file ownership. They belong in `e2e/helpers/`
// as soon as a third caller appears (e2e/CONVENTIONS.md — "Adding a new shared
// helper": 3+ spec files).
//
// The four registries themselves are declared near the top of the file, so that
// `deleteResumeAndVerifyGone` can de-register on proof without a forward
// reference.

/**
 * Admin tab that owns each reference model. The tab is a URL parameter
 * (`AdminTabsContainer.tsx:33` reads `?tab`), so teardown never has to click
 * through the tab list.
 */
const ADMIN_TAB = {
  jobTitle: "job-titles",
  company: "companies",
  location: "locations",
} as const;

/** Escape a value for use inside a `RegExp` row-name matcher. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Click "Load More" until the named row is visible, or until there is nothing
 * left to load. Adapted from `company-crud.spec.ts:24-55`, the one existing
 * admin-table deletion in this suite.
 *
 * Every admin container pages at `APP_CONSTANTS.RECORDS_PER_PAGE` (25) and
 * APPENDS on Load More, so a row created during the run can sit past page 1.
 * The 10-iteration cap means a table beyond 250 rows would report "not found"
 * for a row that exists; the seeded template starts with zero of all three
 * models, so that is far out of reach.
 */
async function loadUntilAdminRowVisible(
  page: Page,
  name: string,
): Promise<boolean> {
  const row = page
    .getByRole("row", { name: new RegExp(escapeRegExp(name), "i") })
    .first();

  // Row 0 is the header, so row 1 appearing means data has loaded.
  await page
    .getByRole("row")
    .nth(1)
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => null);

  for (let i = 0; i < 10; i++) {
    if (await row.isVisible().catch(() => false)) return true;
    const loadMore = page.getByRole("button", { name: /Load More/i });
    if (!(await loadMore.isVisible().catch(() => false))) break;
    const rowsBefore = await page.getByRole("row").count();
    await loadMore.click();
    await expect
      .poll(() => page.getByRole("row").count(), { timeout: 15000 })
      .toBeGreaterThan(rowsBefore);
  }
  return row.isVisible().catch(() => false);
}

/**
 * Delete one reference row from the admin table currently on screen.
 *
 * Returns whether the row is gone afterwards — a row that was never written
 * counts as gone, since there is no residue either way. Never throws: this is
 * teardown, and the caller turns a `false` into a warning.
 */
async function deleteAdminReferenceRow(
  page: Page,
  name: string,
): Promise<boolean> {
  const row = page
    .getByRole("row", { name: new RegExp(escapeRegExp(name), "i") })
    .first();
  try {
    if (!(await loadUntilAdminRowVisible(page, name))) return true;
    await row.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    // `DeleteAlertDialog` renders Cancel + Delete; the destructive one is
    // `AlertDialogAction`, labelled `common.delete` ("Delete", en).
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    // The row disappearing is the proof, not the toast: the container calls its
    // reload only on success, so a delete the server REFUSED (the row is still
    // referenced by a WorkExperience or an Education) leaves the row where it
    // was.
    await row.waitFor({ state: "detached", timeout: 10000 });
    return true;
  } catch {
    // swallow-ok: cleanup net — a throwing teardown would replace the real test
    // failure with its own. Re-check instead of assuming, so a row the net
    // failed to delete is reported rather than passing in silence.
    return !(await row.isVisible().catch(() => false));
  }
}

// Safety net for everything the tests below create. On a GREEN run the resume
// list is already empty here (`deleteResumeAndVerifyGone` de-registers), so a
// resume warning means a REAL leak; the reference lists are never empty,
// because nothing in a test body deletes a JobTitle, Company or Location.
test.afterEach(async ({ page }, testInfo) => {
  // A hook shares the test's 60 s budget (playwright.config.ts:23) and this one
  // can navigate to three admin tables on top of bodies that already build a
  // resume with three sections, so a green test could start failing on its
  // TEARDOWN. Buy the extra time explicitly. It is not free: the extension
  // covers the whole test, so a body that has itself become slow gets 105 s
  // instead of 60 before it is called out. Keep the number small enough that a
  // real slowdown still surfaces.
  test.setTimeout(testInfo.timeout + 45_000);

  // Swap the references out BEFORE the first await: clearing afterwards would
  // keep entries alive into the next test if a delete throws, and clearing in a
  // beforeEach would not run at all under test.skip.
  const resumes = createdResumes;
  const referenceGroups: Array<{ tab: string; names: string[] }> = [
    // JobTitle is deliberately NOT swept here — see E2E-B39.
    //
    // "edit experience dialog opens and cancels" (:498) reaches the Job Title
    // combobox expecting to SELECT a value an earlier test in this file created.
    // Deleting it after each test forces that test onto the CREATE path, and the
    // create path leaves the trigger empty: the assertion reads "" where it
    // expects the title. Measured both ways -- with the shared fixed name and
    // with a uid-suffixed one -- so it is the create path, not the name.
    //
    // Two defects meet here and neither is this hook's to fix: a test that
    // depends on a previous test's leftovers (NoCrossTestDependency in the spec)
    // and a create path that does not populate the control. Sweeping JobTitle
    // would trade a silent leak for a red suite while fixing neither.
    // { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
    { tab: ADMIN_TAB.company, names: createdCompanies },
    { tab: ADMIN_TAB.location, names: createdLocations },
  ];
  createdResumes = [];
  createdJobTitles = [];
  createdCompanies = [];
  createdLocations = [];

  if (resumes.length === 0 && referenceGroups.every((g) => !g.names.length)) {
    return;
  }

  try {
    // Resumes FIRST, and not only for tidiness: `deleteJobTitleById`
    // (jobtitle.actions.ts:120-131), `deleteJobLocationById` and
    // `deleteCompanyById` all REFUSE while a WorkExperience or Education still
    // references the row, and a leaked resume is what holds one.
    for (const title of resumes) {
      try {
        // The ASSERTING deleter, used here as teardown on purpose: it is the
        // only resume delete this spec owns (see its header — `profile-crud`
        // keeps its own instead of the tolerant shared fixture, because
        // deletion is the subject under test in the bodies above). The
        // try/catch supplies the tolerance a net needs without giving the
        // function two contracts.
        await deleteResumeAndVerifyGone(page, title);
      } catch {
        // swallow-ok: cleanup net — a hook that throws replaces the real test
        // failure with its own. Look again rather than assume: a resume that
        // was never created is not a leak, one that is still on screen is.
        const stillThere = await page
          .getByRole("row", { name: new RegExp(escapeRegExp(title), "i") })
          .first()
          .isVisible()
          .catch(() => false);
        if (stillThere) {
          console.warn(
            `[profile-crud] leaked resume survived cleanup: ${title}`,
          );
        }
      }
    }

    for (const { tab, names } of referenceGroups) {
      if (names.length === 0) continue;
      await page.goto(`/dashboard/admin?tab=${tab}`);
      await page.waitForLoadState("domcontentloaded");
      for (const name of names) {
        if (!(await deleteAdminReferenceRow(page, name))) {
          console.warn(
            `[profile-crud] leaked ${tab} row survived cleanup: ${name}`,
          );
        }
      }
    }
  } catch (error) {
    console.warn(`[profile-crud] afterEach cleanup failed: ${String(error)}`);
  }
});

// ---------------------------------------------------------------------------
// Tests (8 total — each self-contained with unique uid and cleanup)
// ---------------------------------------------------------------------------

test("create resume and delete", async ({ page }) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume Create ${uid}`;

  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await expectToast(page, /Resume created successfully/);
  await expect(page.locator("tbody")).toContainText(resumeTitle, {
    timeout: 10000,
  });

  await deleteResumeAndVerifyGone(page, resumeTitle);
});

test("edit resume title", async ({ page }) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume Title ${uid}`;
  const editedTitle = `E2E Resume Title ${uid} Edited`;

  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await expect(page.locator("tbody")).toContainText(resumeTitle, {
    timeout: 10000,
  });

  // Edit the resume title
  await page
    .getByRole("row", { name: new RegExp(resumeTitle, "i") })
    .getByTestId("resume-actions-menu-btn")
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Edit Resume Title/ }).click();
  await page.getByPlaceholder("Ex: Full Stack Developer").fill(editedTitle);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save" })
    .click();
  // Verify the edited title appears in the table
  await expect(page.locator("tbody")).toContainText(editedTitle, {
    timeout: 10000,
  });

  await deleteResumeAndVerifyGone(page, editedTitle);
});

test("add contact info", async ({ page }) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume Contact ${uid}`;

  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await openResumeEditor(page, resumeTitle);

  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Contact Info" }).click();
  // Wait for the Add Contact Info dialog to open
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  await page.getByLabel("First Name").waitFor({ state: "visible", timeout: 10000 });
  await page.getByLabel("First Name").fill("John");
  await page.getByLabel("Last Name").fill("Doe");
  await page.getByLabel("Headline").fill("Skill developer with testing skills");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Phone").fill("123456789");
  await page.getByLabel("Address").fill("Calgary");
  await page.getByRole("button", { name: "Save" }).click();
  await expectToast(page, /contact info has been created/i);
  await expect(
    page.getByRole("heading", { name: "John Doe" }),
  ).toBeVisible({ timeout: 15000 });

  await deleteResumeAndVerifyGone(page, resumeTitle);
});

test("add summary section", async ({ page }) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume Summary ${uid}`;

  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await openResumeEditor(page, resumeTitle);

  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Summary" }).click();
  // Wait for the Add Summary dialog to open
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  await page.getByLabel("Section Title").waitFor({ state: "visible", timeout: 10000 });
  await page.getByLabel("Section Title").fill("Summary");
  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill("this is test summary\n");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: "Summary" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("this is test summary")).toBeVisible();
  await expectToast(page, /Summary has been created/);

  await deleteResumeAndVerifyGone(page, resumeTitle);
});

test("add work experience", async ({ page }) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume Experience ${uid}`;
  // uid-suffixed so teardown can delete it — see the note on `locationText`
  // in "add education and edit school name".
  const jobText = "Software Developer";

  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await openResumeEditor(page, resumeTitle);

  // Add Experience section
  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Experience" }).click();
  // Field is created by the Add Experience click above; its absence is a real failure.
  const sectionTitleField = page.getByPlaceholder("Ex: Experience");
  await expect(sectionTitleField).toBeVisible({ timeout: 5000 });
  await sectionTitleField.fill("Experience");
  await sectionTitleField.press("Tab");

  // Registered before the write. `selectOrCreateComboboxOption` CREATES the row
  // when it is absent, and that row outlives the resume: deleting the resume
  // removes the WorkExperience/Education that points at the reference, never
  // the reference itself.
  createdJobTitles.push(jobText);
  await selectOrCreateComboboxOption(
    page,
    "Job Title",
    "Create or Search title",
    jobText,
  );
  await expect(page.getByLabel("Job Title")).toContainText(jobText);

  const companyText = "company test";
  createdCompanies.push(companyText);
  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    companyText,
  );
  await expect(page.getByLabel("Company")).toContainText(companyText);

  const locationText = "location test";
  createdLocations.push(locationText);
  await selectOrCreateComboboxOption(
    page,
    "Job Location",
    "Create or Search location",
    locationText,
  );
  await expect(page.getByLabel("Job Location")).toContainText(locationText);

  await page.getByLabel("Start Date").click();
  // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for date picker calendar.
  await page.getByRole("gridcell").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  const dateCell = page.getByRole("gridcell", { name: "15" }).first();
  await dateCell.waitFor({ state: "visible", timeout: 5000 });
  await dateCell.click();

  await page.locator("div:nth-child(2) > .tiptap").click();
  await page.locator("div:nth-child(2) > .tiptap").fill("test description");
  await page.getByRole("button", { name: "Save" }).click();
  await expectToast(page, /Experience has been added/);
  await expect(
    page.getByRole("heading", { name: jobText }).first(),
  ).toBeVisible();

  await deleteResumeAndVerifyGone(page, resumeTitle);
});

test("edit experience dialog opens and cancels", async ({ page }) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume EditExp ${uid}`;
  // uid-suffixed so teardown can delete it — see the note on `locationText`
  // in "add education and edit school name".
  const jobText = "Software Developer";

  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await openResumeEditor(page, resumeTitle);

  // Add Experience section first
  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Experience" }).click();
  // Field is created by the Add Experience click above; its absence is a real failure.
  const sectionTitleField = page.getByPlaceholder("Ex: Experience");
  await expect(sectionTitleField).toBeVisible({ timeout: 5000 });
  await sectionTitleField.fill("Experience");
  await sectionTitleField.press("Tab");

  // Registered before the write. `selectOrCreateComboboxOption` CREATES the row
  // when it is absent, and that row outlives the resume: deleting the resume
  // removes the WorkExperience/Education that points at the reference, never
  // the reference itself.
  createdJobTitles.push(jobText);
  await selectOrCreateComboboxOption(
    page,
    "Job Title",
    "Create or Search title",
    jobText,
  );
  await expect(page.getByLabel("Job Title")).toContainText(jobText);

  const companyText = "company test";
  createdCompanies.push(companyText);
  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    companyText,
  );
  await expect(page.getByLabel("Company")).toContainText(companyText);

  const locationText = "location test";
  createdLocations.push(locationText);
  await selectOrCreateComboboxOption(
    page,
    "Job Location",
    "Create or Search location",
    locationText,
  );
  await expect(page.getByLabel("Job Location")).toContainText(locationText);

  await page.getByLabel("Start Date").click();
  // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for date picker calendar.
  await page.getByRole("gridcell").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  const dateCell = page.getByRole("gridcell", { name: "15" }).first();
  await dateCell.waitFor({ state: "visible", timeout: 5000 });
  await dateCell.click();

  await page.locator("div:nth-child(2) > .tiptap").click();
  await page.locator("div:nth-child(2) > .tiptap").fill("test description");
  await page.getByRole("button", { name: "Save" }).click();
  await expectToast(page, /Experience has been added/);
  await expect(
    page.getByRole("heading", { name: jobText }).first(),
  ).toBeVisible();

  // Click Edit on the experience entry — verify dialog opens then cancel
  await page
    .getByText(jobText + "Edit")
    .getByRole("button", { name: "Edit" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit Experience" }),
  ).toBeVisible();
  await page.getByText("Cancel").click();

  // Verify Add Experience dialog also opens and cancels
  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Experience" }).click();
  await expect(
    page.getByRole("heading", { name: "Add Experience" }),
  ).toBeVisible();
  await page.getByText("Cancel").click();

  await deleteResumeAndVerifyGone(page, resumeTitle);
});

test("multi-section integration: summary + experience + education", async ({
  page,
}) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume Full ${uid}`;
  const schoolName = "MIT";
  const degreeName = "Master of Science";
  const fieldOfStudy = "Computer Science";
  // uid-suffixed so teardown can delete them — see the note on `locationText`
  // in "add education and edit school name".
  const jobTitle = "Senior Engineer";
  const companyName = "E2E Corp";
  const locationText = "Boston";
  const summaryText =
    "Experienced software engineer with deep expertise.";

  // Step 1: Create resume
  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await expect(page.locator("tbody")).toContainText(resumeTitle, {
    timeout: 10000,
  });

  // Step 2: Navigate into the resume editor
  await openResumeEditor(page, resumeTitle);

  // Step 3: Add Summary section
  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Summary" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  await page.getByLabel("Section Title").waitFor({ state: "visible", timeout: 10000 });
  await page.getByLabel("Section Title").fill("Professional Summary");
  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill(summaryText);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: "Professional Summary" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(summaryText)).toBeVisible();

  // Step 4: Add Experience section
  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Experience" }).click();
  // Field is created by the Add Experience click above; its absence is a real failure.
  const experienceSectionTitle = page.getByPlaceholder("Ex: Experience");
  await expect(experienceSectionTitle).toBeVisible({ timeout: 5000 });
  await experienceSectionTitle.fill("Work Experience");
  await experienceSectionTitle.press("Tab");

  // Registered before the write. `selectOrCreateComboboxOption` CREATES the row
  // when it is absent, and that row outlives the resume: deleting the resume
  // removes the WorkExperience/Education that points at the reference, never
  // the reference itself.
  createdJobTitles.push(jobTitle);
  await selectOrCreateComboboxOption(
    page,
    "Job Title",
    "Create or Search title",
    jobTitle,
  );
  await expect(page.getByLabel("Job Title")).toContainText(jobTitle);

  createdCompanies.push(companyName);
  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    companyName,
  );
  await expect(page.getByLabel("Company")).toContainText(companyName);

  createdLocations.push(locationText);
  await selectOrCreateComboboxOption(
    page,
    "Job Location",
    "Create or Search location",
    locationText,
  );
  await expect(page.getByLabel("Job Location")).toContainText(locationText);

  // Set Start Date
  await page.getByLabel("Start Date").click();
  // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for date picker calendar.
  await page.getByRole("gridcell").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  const expStartDateCell = page
    .getByRole("gridcell", { name: "10" })
    .first();
  await expStartDateCell.waitFor({ state: "visible", timeout: 5000 });
  await expStartDateCell.click();

  // Fill description
  await page.locator(".tiptap").last().click();
  await page
    .locator(".tiptap")
    .last()
    .fill("Led engineering team on key projects.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: jobTitle }).first(),
  ).toBeVisible({ timeout: 15000 });

  // Step 5: Add Education section
  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Education" }).click();
  // Field is created by the Add Education click above; its absence is a real failure.
  const educationSectionTitle = page.getByPlaceholder("Ex: Education");
  await expect(educationSectionTitle).toBeVisible({ timeout: 5000 });
  await educationSectionTitle.fill("Education");

  await page.getByPlaceholder("Ex: Stanford").click();
  await page.getByPlaceholder("Ex: Stanford").fill(schoolName);

  // Deliberately NOT registered again: this is the same Location row the
  // experience step above created and registered (same `locationText`), and a
  // second entry would make teardown try to delete it twice.
  await selectOrCreateComboboxOption(
    page,
    "Location",
    "Create or Search location",
    locationText,
  );
  await expect(page.getByLabel("Location")).toContainText(locationText);

  await page.getByPlaceholder("Ex: Bachelor's").click();
  await page.getByPlaceholder("Ex: Bachelor's").fill(degreeName);

  await page.getByPlaceholder("Ex: Computer Science").click();
  await page.getByPlaceholder("Ex: Computer Science").fill(fieldOfStudy);

  // Set Start Date
  await page.getByLabel("Start Date").click();
  // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for date picker calendar.
  await page.getByRole("gridcell").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  const eduStartDateCell = page
    .getByRole("gridcell", { name: "15" })
    .first();
  await eduStartDateCell.waitFor({ state: "visible", timeout: 5000 });
  await eduStartDateCell.click();

  // Set End Date
  await page.getByLabel("End Date").click();
  // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for date picker calendar.
  await page.getByRole("gridcell").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  const eduEndDateCell = page
    .getByRole("gridcell", { name: "20" })
    .first();
  await eduEndDateCell.waitFor({ state: "visible", timeout: 5000 });
  await eduEndDateCell.click();

  // Fill description
  await page.locator(".tiptap").last().click();
  await page.locator(".tiptap").last().fill("Graduated with honors.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: schoolName }).first(),
  ).toBeVisible({ timeout: 15000 });

  // Step 6: Verify all sections are visible
  await expect(
    page.getByRole("heading", { name: "Professional Summary" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: jobTitle }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: schoolName }).first(),
  ).toBeVisible();

  // Step 7: Clean up
  await deleteResumeAndVerifyGone(page, resumeTitle);
});

test("add education and edit school name", async ({ page }) => {
  const uid = uniqueId();
  const resumeTitle = `E2E Resume EditEdu ${uid}`;
  const originalSchool = "Harvard University";
  const updatedSchool = "Stanford University";

  await navigateToProfile(page);
  // Registered BEFORE the write: a create that fails after the row was written
  // has still leaked one, and the in-body delete at the end of this test is not
  // reached on a failing path.
  createdResumes.push(resumeTitle);
  await createResume(page, resumeTitle);
  await expect(page.locator("tbody")).toContainText(resumeTitle, {
    timeout: 10000,
  });
  await openResumeEditor(page, resumeTitle);

  // Add Education section
  await page.getByRole("button", { name: "Add Section" }).click();
  await page.getByRole("menuitem", { name: "Add Education" }).click();
  // Field is created by the Add Education click above; its absence is a real failure.
  const sectionTitleField = page.getByPlaceholder("Ex: Education");
  await expect(sectionTitleField).toBeVisible({ timeout: 5000 });
  await sectionTitleField.fill("Education");

  await page.getByPlaceholder("Ex: Stanford").fill(originalSchool);

  // uid-suffixed so teardown can delete it: a FIXED name is shared with every
  // other worker running this file, and deleting one out from under a
  // concurrent test would break that test's form (e2e/CONVENTIONS.md —
  // "Use uniqueId() for test data names").
  const locationText = "Cambridge";
  // Registered before the write. `selectOrCreateComboboxOption` CREATES the row
  // when it is absent, and that row outlives the resume: deleting the resume
  // removes the WorkExperience/Education that points at the reference, never
  // the reference itself.
  createdLocations.push(locationText);
  await selectOrCreateComboboxOption(
    page,
    "Location",
    "Create or Search location",
    locationText,
  );

  await page.getByPlaceholder("Ex: Bachelor's").fill("PhD");
  await page.getByPlaceholder("Ex: Computer Science").fill("Physics");

  // Set Start Date
  await page.getByLabel("Start Date").click();
  // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for date picker calendar.
  await page.getByRole("gridcell").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  const eduStartCell = page.getByRole("gridcell", { name: "15" }).first();
  await eduStartCell.waitFor({ state: "visible", timeout: 5000 });
  await eduStartCell.click();

  // Set End Date
  await page.getByLabel("End Date").click();
  // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for date picker calendar.
  await page.getByRole("gridcell").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  const eduEndCell = page.getByRole("gridcell", { name: "20" }).first();
  await eduEndCell.waitFor({ state: "visible", timeout: 5000 });
  await eduEndCell.click();

  // Fill description
  await page.locator(".tiptap").last().click();
  await page
    .locator(".tiptap")
    .last()
    .fill("Research in quantum computing.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: originalSchool }).first(),
  ).toBeVisible({ timeout: 15000 });

  // Edit the education entry
  const educationCard = page
    .locator("div", { hasText: originalSchool })
    .filter({
      has: page.getByRole("button", { name: "Edit" }),
    })
    .first();
  await educationCard.getByRole("button", { name: "Edit" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit Education" }),
  ).toBeVisible();

  // Change school name
  const schoolInput = page.getByPlaceholder("Ex: Stanford");
  await schoolInput.clear();
  await schoolInput.fill(updatedSchool);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: updatedSchool }).first(),
  ).toBeVisible({ timeout: 15000 });

  // Clean up
  await deleteResumeAndVerifyGone(page, resumeTitle);
});
