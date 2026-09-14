import { test, expect, type Page } from "@playwright/test";
import {
  expectToast,
  rowsByText,
  selectOrCreateComboboxOption,
  uniqueId,
} from "../helpers";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";

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
  // DOM locator: the "gone" assertion below is read while the DeleteAlertDialog
  // is closing, and a role locator matches nothing at all for that window
  // (`rowsByText` in e2e/helpers, E2E-B40).
  const row = rowsByText(page, title).first();
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
  // The SERVER's answer, then the view's. `ResumeTable` (:70-76) toasts
  // `profile.resumeDeleted` only after the action resolved, so this is also what
  // stops the request being abandoned when the page closes at end of test.
  await expectToast(page, /Resume deleted successfully/);
  await expect(rowsByText(page, title)).toHaveCount(0, { timeout: 10000 });
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
//      above and `deleteAdminReferenceRow` in `../helpers/admin-reference-cleanup`).
//   4. The afterEach swaps the references out before its first await.
//   5. It navigates itself, inside the try.
//   6. Two tiers — the deleters swallow, the hook re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
//
// The FOLLOW-UP that used to stand here — "they belong in e2e/helpers/ as soon
// as a third caller appears" — has been discharged: callers three through six
// arrived at once, and the two deleters now live in
// `../helpers/admin-reference-cleanup`. `keyboard-ux.spec.ts` was the last
// private copy and was migrated on 2026-09-09, so there is now exactly ONE
// implementation of these two functions in the suite.
//
// The four registries themselves are declared near the top of the file, so that
// `deleteResumeAndVerifyGone` can de-register on proof without a forward
// reference.

// Admin reference-data cleanup now lives in `../helpers/admin-reference-cleanup`.
// This file carried the SIXTH copy of `loadUntilAdminRowVisible` /
// `deleteAdminReferenceRow`, and its copy was the UNREPAIRED one — it still read
// the admin table through `getByRole("row")`, and this file consumed that `false`
// as "the row was never written", so a leak was reported as cleaned (E2E-B40).
// The FOLLOW-UP note above predicted a third caller; five arrived at once, so the
// helper moved and this is the deletion that follows.
// `escapeRegExp` went with it: `hasText` takes the string literally.

// Safety net for everything the tests below create. On a GREEN run the resume
// list is already empty here (`deleteResumeAndVerifyGone` de-registers), so a
// resume warning means a REAL leak; the reference lists are never empty,
// because nothing in a test body deletes a JobTitle, Company or Location.
test.afterEach(async ({ page }, testInfo) => {
  // This hook can navigate to four admin tables, so buy it extra time.
  //
  // CORRECTED 2026-09-09 — the previous version of this comment said a hook
  // "shares the test's 60 s budget" and that the extension therefore lets a slow
  // BODY off with 105 s. Both halves are wrong, and the source says so:
  // Playwright gives the after-hooks a fresh slot, `afterHooksSlot = { timeout:
  // calculateMaxTimeout(project.timeout, testInfo.timeout), elapsed: 0 }`
  // (`playwright/lib/worker/workerMain.js:328-329`), so teardown never inherits
  // what the body spent, and a body that overran has already timed out before
  // this line is reached. The call raises the DIFFERENCE above that fresh
  // maximum, taking effect immediately because `timeoutManager.setTimeout`
  // writes to the running slot and re-arms its deadline
  // (`timeoutManager.js:105-110`). Keep the number small enough that a real
  // teardown slowdown still surfaces.
  test.setTimeout(testInfo.timeout + 45_000);

  // Swap the references out BEFORE the first await: clearing afterwards would
  // keep entries alive into the next test if a delete throws, and clearing in a
  // beforeEach would not run at all under test.skip.
  const resumes = createdResumes;
  // No explicit annotation: `sweepReferenceGroups` takes `AdminReferenceTab`,
  // the union of the four admin tab slugs, and a widened `string` here would
  // not assign to it. Inference off `ADMIN_TAB` keeps the literal types.
  const referenceGroups = [
    // SUPERSEDED 2026-09-08 — JobTitle IS swept today, see line 225. This block is
    // a chronological log kept on purpose (its own closing note asks for that), so
    // read it to the end before acting: the decision below was reversed at
    // "RE-ENABLED 2026-09-08". The original heading — "JobTitle is deliberately NOT
    // swept here, see E2E-B39" — stood as this block's first line until 2026-09-14
    // and was copied, as current, into docs/handoff-2026-09-14-post-job-teardown-
    // migration.md §3.3 and into scripts/check-e2e-residue.sh's reasoning. A stale
    // headline over a reversed decision is read by everyone who skims.
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
    //
    // 2026-09-04: "the create path leaves the trigger empty" is CONDITIONAL, not
    // a property of the path. This spec run alone is 16/16 green and creates the
    // title on that same path; run after task-crud + activity-crud, "add work
    // experience" fails on it — twice, and identically on the unmodified
    // baseline. The row is written either way. So whatever empties the trigger
    // depends on what ran before, which is a stronger reason to leave the sweep
    // off until E2E-B39 is understood rather than a weaker one.
    //
    // RE-ENABLED 2026-09-08. The condition that paragraph set has been met:
    // E2E-B39 is understood and fixed. It was never a test-isolation problem —
    // `ComboBox` called `options.unshift(result)` on an array its PARENT owns
    // (`ComboBox.tsx:63`) while deriving the trigger's text from that same
    // array, so a parent that refetched dropped the created row and the trigger
    // rendered `""`. Fixed in the component by `3fe7412a`, with a regression
    // test in `__tests__/ComboBox.spec.tsx` verified red against the unfixed
    // version. The 2026-09-04 measurement above therefore predates the fix by
    // two days, and the suite has since run 112/112 green with "add work
    // experience" passing.
    //
    // What this buys: `Software Developer` and `Senior Engineer` stop leaking,
    // which is part of E2E-B38's measured `JobTitle +3`. If "add work
    // experience" or "edit experience dialog opens and cancels" goes red in a
    // FULL run (not a single-spec run — the failure was order-dependent),
    // comment this line out again and say so here rather than removing this
    // note; that would be evidence E2E-B39's fix is incomplete, which is worth
    // more than the sweep.
    { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
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
        // DOM locator, for the same reason as the converted re-check above:
        // this catch runs when `deleteResumeAndVerifyGone` threw, and the most
        // likely reason it threw is that the DeleteAlertDialog is still on
        // screen — exactly the window in which a role locator matches nothing
        // and reports "not there" about a row that is (E2E-B40). This warning
        // is the ONLY signal left on this path: `createdResumes` was emptied
        // before the loop, so nothing retries.
        const stillThere = await rowsByText(page, title)
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

    await sweepReferenceGroups(page, referenceGroups, "profile-crud");
  } catch (error) {
    // swallow-ok: afterEach cleanup net — a throwing hook would replace the real
    // test failure with its own; the warning below names what may be left behind.
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
  // uid-suffixed, and NOT so that teardown can find it — cleanup in this file
  // is registry-driven (`createdJobTitles.push` below). The suffix is what
  // keeps one worker's teardown from deleting a reference row another worker's
  // form is still using; the full argument is on `locationText` in "add
  // education and edit school name".
  const jobText = `Software Developer ${uid}`;

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

  const companyText = `company test ${uid}`;
  createdCompanies.push(companyText);
  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    companyText,
  );
  await expect(page.getByLabel("Company")).toContainText(companyText);

  const locationText = `location test ${uid}`;
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
  // uid-suffixed — same reason as in "add work experience"; the full argument
  // is on `locationText` in "add education and edit school name". Note that
  // `jobText` is also concatenated into a `getByText(jobText + "Edit")` below,
  // which still holds: that locator wants the heading's text immediately
  // followed by the Edit button's, and the suffix is INSIDE the heading.
  const jobText = `Software Developer ${uid}`;

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

  const companyText = `company test ${uid}`;
  createdCompanies.push(companyText);
  await selectOrCreateComboboxOption(
    page,
    "Company",
    "Create or Search company",
    companyText,
  );
  await expect(page.getByLabel("Company")).toContainText(companyText);

  const locationText = `location test ${uid}`;
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
  // `schoolName` is uid-suffixed for a DIFFERENT reason from the three below
  // it. `Education.school` is a free-text column, not a reference model — it is
  // registered in no registry and never reaches `deleteAdminReferenceRow`, so
  // the cross-worker delete hazard does not apply to it. What does apply is the
  // READ side: it is asserted through `getByRole("heading", { name: schoolName })`,
  // and that option matches a case-insensitive SUBSTRING, so a bare `"MIT"` is
  // satisfied by a heading reading "Summit" or "Smith". Three characters is not
  // an assertion.
  const schoolName = `MIT ${uid}`;
  // `degreeName` and `fieldOfStudy` are deliberately NOT suffixed: they are
  // free-text columns like `school`, but unlike it they are only ever FILLED —
  // nothing asserts on them and nothing deletes by them, so neither hazard
  // above exists.
  const degreeName = "Master of Science";
  const fieldOfStudy = "Computer Science";
  // uid-suffixed — these three DO reach `deleteAdminReferenceRow` through the
  // registries below. The full argument is on `locationText` in "add education
  // and edit school name".
  const jobTitle = `Senior Engineer ${uid}`;
  const companyName = `E2E Corp ${uid}`;
  const locationText = `Boston ${uid}`;
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

  // THE ARGUMENT FOR THE `${uid}` SUFFIX ON EVERY REFERENCE NAME IN THIS FILE.
  // The other sites point here rather than repeat it.
  //
  // First, what the suffix is NOT for. A note here used to read "uid-suffixed so
  // teardown can delete it"; that was wrong twice over — the line under it was a
  // fixed literal, and teardown never depended on the name's shape. Cleanup in
  // this file is REGISTRY-driven (`createdLocations.push` below, swept by the
  // afterEach), so it deletes what a test RECORDED, not what a pattern matches.
  //
  // What it IS for is concurrency. `deleteAdminReferenceRow` matches a
  // case-insensitive SUBSTRING of the row's text, so a fixed name is the same
  // string in every concurrent copy of this file: under `E2E_WORKERS>1` one
  // worker's teardown deletes the Location row another worker's form is at that
  // moment pointing at, and the second worker fails somewhere that names neither
  // the first worker nor the delete. The suite runs single-worker by default
  // (`scripts/test-e2e.sh`), which is the only reason this was never seen.
  //
  // FIXED 2026-09-09 (handoff T6). Every reference name this file creates —
  // JobTitle, Company, Location — now carries `${uid}`, so no two workers write
  // or delete the same row. It costs nothing on the read side: every assertion
  // over these values already went through the VARIABLE, never a repeated
  // literal, so there was no assertion to keep in step. Free-text columns are
  // treated separately at their own sites (`schoolName`, `degreeName`,
  // `fieldOfStudy` in "multi-section integration").
  //
  // The one thing to keep in mind when adding a name here: it is fed to
  // `selectOrCreateComboboxOption`, which builds `new RegExp(text, "i")` for its
  // partial-option match, so the value must stay free of regex metacharacters.
  // `uniqueId()` is base36 plus `w<worker>`, so a space-joined suffix is safe.
  const locationText = `Cambridge ${uid}`;
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
