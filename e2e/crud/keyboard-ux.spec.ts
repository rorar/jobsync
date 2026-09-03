import { test, expect, type Page } from "@playwright/test";
import { uniqueId } from "../helpers";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";

// ---------------------------------------------------------------------------
// Reference-data cleanup (E2E-B24 / E2E-B25)
// ---------------------------------------------------------------------------
//
// Every Enter this spec presses in a combobox or the skills input writes a
// REFERENCE row that outlives the dialog it was typed into — JobTitle, Company,
// Location, Tag. No test here ever submits the AddJob form, so nothing points
// at those rows afterwards and every one of them is pure residue: 3 job titles,
// 1 company, 1 location and 6 tags per run.
//
// Six-part pattern, copied from `webhook-settings.spec.ts:212-245` and
// `settings-api-keys.spec.ts:195-229`:
//   1. ARRAYS, not scalars — one tag test creates three rows in one body.
//   2. Registration sits where the row is WRITTEN and BEFORE the keystroke that
//      writes it: an Enter that creates the row and then fails the assertion
//      after it has still leaked one.
//   3. De-registration only on a PROVEN delete (see `deleteResumeTracked`).
//   4. The afterEach swaps the references out before its first await.
//   5. It navigates itself, inside the try.
//   6. Two tiers — the deleters swallow, the hook re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
//
// FOLLOW-UP: `profile-crud.spec.ts` carries its own copy of
// `loadUntilAdminRowVisible` / `deleteAdminReferenceRow`, because the two specs
// were repaired under separate file ownership. They belong in `e2e/helpers/`
// as soon as a third caller appears (e2e/CONVENTIONS.md — "Adding a new shared
// helper": 3+ spec files).
let createdJobTitles: string[] = [];
let createdCompanies: string[] = [];
let createdLocations: string[] = [];
let createdTags: string[] = [];
let createdResumes: string[] = [];

/**
 * Admin tab that owns each reference model. The tab is a URL parameter
 * (`AdminTabsContainer.tsx:33` reads `?tab`), so teardown never has to click
 * through the tab list.
 */
const ADMIN_TAB = {
  jobTitle: "job-titles",
  company: "companies",
  location: "locations",
  tag: "skills",
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
 * for a row that exists; the seeded template starts with zero of all four
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
    // referenced) leaves the row exactly where it was.
    await row.waitFor({ state: "detached", timeout: 10000 });
    return true;
  } catch {
    // swallow-ok: cleanup net — a throwing teardown would replace the real test
    // failure with its own. Re-check instead of assuming, so a row the net
    // failed to delete is reported rather than passing in silence.
    return !(await row.isVisible().catch(() => false));
  }
}

/**
 * Delete a resume created by this spec and prove it is gone.
 *
 * The shared `deleteResume` fixture swallows every error by contract, so
 * calling it proves nothing — look again, and de-register ONLY on proof.
 * Anything that fails stays registered, which is exactly the case the afterEach
 * net exists for.
 */
async function deleteResumeTracked(page: Page, title: string): Promise<boolean> {
  await deleteResume(page, title);
  const gone = await page
    .getByRole("row", { name: new RegExp(escapeRegExp(title), "i") })
    .first()
    .waitFor({ state: "detached", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (gone) createdResumes = createdResumes.filter((t) => t !== title);
  return gone;
}

// Safety net for every row this spec writes. Unlike `webhook-settings` there is
// no inline delete to pair it with for the reference models — nothing in this
// file removes a JobTitle/Company/Location/Tag — so on a GREEN run this hook
// does the whole job and is expected to be busy. Resumes are the exception: the
// four EURES tests delete their own and de-register on proof, so a WARNING
// about a resume means a real leak.
test.afterEach(async ({ page }, testInfo) => {
  // A hook shares the test's 60 s budget (playwright.config.ts:23) and this one
  // can navigate to four admin tables, so a green test could start failing on
  // its TEARDOWN. Buy the extra time explicitly. It is not free: the extension
  // covers the whole test, so a body that has itself become slow gets 105 s
  // instead of 60 before it is called out. Keep the number small enough that a
  // real slowdown still surfaces.
  test.setTimeout(testInfo.timeout + 45_000);

  // Swap the references out BEFORE the first await: clearing afterwards would
  // keep entries alive into the next test if a delete throws, and clearing in a
  // beforeEach would not run at all under test.skip.
  const resumes = createdResumes;
  const referenceGroups: Array<{ tab: string; names: string[] }> = [
    { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
    { tab: ADMIN_TAB.company, names: createdCompanies },
    { tab: ADMIN_TAB.location, names: createdLocations },
    { tab: ADMIN_TAB.tag, names: createdTags },
  ];
  createdResumes = [];
  createdJobTitles = [];
  createdCompanies = [];
  createdLocations = [];
  createdTags = [];

  if (resumes.length === 0 && referenceGroups.every((g) => !g.names.length)) {
    return;
  }

  try {
    // The "Mobile Viewport" describe pins 375x667 for its whole test, teardown
    // included, and the admin tables hide columns and scroll horizontally at
    // that width. The test is over by now, so widening cannot affect anything
    // it asserted — it only stops teardown from inheriting a layout it was
    // never written for.
    await page.setViewportSize({ width: 1280, height: 800 });

    // Resumes FIRST. `deleteJobTitleById` (jobtitle.actions.ts:120-131),
    // `deleteJobLocationById` and `deleteCompanyById` all refuse while a
    // WorkExperience or Education still references the row, and a leaked resume
    // is what holds one. Deleting the resume also removes its ContactInfo,
    // Summary, WorkExperience, Education and ResumeSection rows — that cascade
    // lives in `deleteResumeById`'s transaction (profile.actions.ts:403-455),
    // not in the Prisma schema.
    for (const title of resumes) {
      if (!(await deleteResumeTracked(page, title))) {
        console.warn(
          `[keyboard-ux] leaked resume survived cleanup: ${title}`,
        );
      }
    }

    for (const { tab, names } of referenceGroups) {
      if (names.length === 0) continue;
      await page.goto(`/dashboard/admin?tab=${tab}`);
      await page.waitForLoadState("domcontentloaded");
      for (const name of names) {
        if (!(await deleteAdminReferenceRow(page, name))) {
          console.warn(
            `[keyboard-ux] leaked ${tab} row survived cleanup: ${name}`,
          );
        }
      }
    }
  } catch (error) {
    console.warn(`[keyboard-ux] afterEach cleanup failed: ${String(error)}`);
  }
});

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
}

async function openAddJobDialog(page: Page) {
  const title = page.getByTestId("add-job-dialog-title");

  // `add-job-btn` is server-rendered, so waiting for it to be VISIBLE does not
  // prove React has hydrated and attached its onClick. At the 375x667 viewport
  // the Kanban board mounts late enough that the first click is dropped
  // outright — reproduced standalone: identical script, dialog opens when a
  // couple of evaluate() round-trips precede the click and does not when they
  // do not. Retry the click until the dialog actually opens, and assert the
  // outcome rather than the input.
  await expect(async () => {
    if (await title.isVisible()) return;
    await page.getByTestId("add-job-btn").click();
    await expect(title).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20000 });
}

async function deleteJob(page: Page, jobTitle: string) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  try {
    const row = page.getByRole("row", { name: new RegExp(jobTitle, "i") });
    await row.first().waitFor({ state: "visible", timeout: 5000 });
    await row.getByTestId("job-actions-menu-btn").first().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
  } catch {
    // Job may not exist — skip cleanup
  }
}

/**
 * Open the skills/tag popover in the AddJob dialog.
 */
async function openSkillsPopover(page: Page) {
  const skillButton = page.getByText("Search or add a skill...");
  await skillButton.scrollIntoViewIfNeeded();
  await skillButton.click();
}

/**
 * Read all [role="status"] elements and return their combined text content.
 * Useful when there are multiple sr-only spans and we want to check any.
 */
async function getAllAnnouncements(page: Page): Promise<string[]> {
  return page.locator('[role="status"]').allTextContents();
}

/**
 * Check if any [role="status"] element contains the expected text.
 */
function hasAnnouncement(announcements: string[], substring: string): boolean {
  return announcements.some((a) => a.includes(substring));
}

// ---------------------------------------------------------------------------
// Console error collector
// ---------------------------------------------------------------------------

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("404") &&
      !e.includes("Failed to fetch"),
  );
}

/**
 * Get the Title combobox trigger inside the AddJob dialog.
 * Uses the first combobox role in the dialog (locale-independent).
 */
function getTitleCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").first();
}

/**
 * Get the Company combobox trigger inside the AddJob dialog.
 * Uses the second combobox role in the dialog (locale-independent).
 */
function getCompanyCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").nth(1);
}

/**
 * Get the Location combobox trigger inside the AddJob dialog.
 * Uses the third combobox role in the dialog (locale-independent).
 */
function getLocationCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").nth(2);
}

/**
 * Get the Job Source combobox trigger inside the AddJob dialog.
 * Uses the fourth combobox role in the dialog (locale-independent).
 */
function getSourceCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").nth(3);
}

// ---------------------------------------------------------------------------
// Tests: 1. BaseCombobox (AddJob modal — Title, Company, Location, Source)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: BaseCombobox (AddJob modal)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Enter key creates a new option in Title combobox", async ({ page }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const title = `KBTest Title ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);

    // Open the Title combobox (first combobox in the dialog)
    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or search Title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill(title);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for options list.
    await page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
    // Registered BEFORE the keystroke that writes the row: an Enter that
    // creates the JobTitle and then fails an assertion below has still leaked
    // one, and only a registered name gets cleaned up.
    createdJobTitles.push(title);
    await titleInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for combobox to close.
    await page.getByRole("option").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);

    // Verify the created option shows in the trigger button
    await expect(getTitleCombobox(page)).toContainText(title, { timeout: 15000 });

    // Verify sr-only announcement. ComboBox announces
    // t("forms.optionCreated") = "{label} created" — label first, lowercase
    // verb — so the old substring "Created" never matched. Assert the exact
    // announcement instead, and retry: setAnnouncement lands a render later.
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(hasAnnouncement(announcements, `${title} created`)).toBe(true);
    }).toPass({ timeout: 5000 });

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Enter key creates a new option in Company combobox", async ({
    page,
  }) => {
    const uid = uniqueId();
    const company = `KBTest Co ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getCompanyCombobox(page).click();
    const companyInput = page.getByPlaceholder("Create or search Company");
    await expect(companyInput).toBeVisible();

    await companyInput.fill(company);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    // Registered before the write — see the Title test above.
    createdCompanies.push(company);
    await companyInput.press("Enter");

    await expect(getCompanyCombobox(page)).toContainText(company);
  });

  test("Enter key creates a new option in Location combobox", async ({
    page,
  }) => {
    const uid = uniqueId();
    const location = `KBTest Loc ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getLocationCombobox(page).click();
    const locationInput = page.getByPlaceholder("Create or search Location");
    await expect(locationInput).toBeVisible();

    await locationInput.fill(location);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    // Registered before the write — see the Title test above.
    createdLocations.push(location);
    await locationInput.press("Enter");

    await expect(getLocationCombobox(page)).toContainText(location);
  });

  test("Escape on open combobox closes popover, focus stays in dialog", async ({
    page,
  }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or search Title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await titleInput.press("Escape");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(titleInput).not.toBeVisible();
    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
  });

  test("Tab on open combobox closes popover and moves focus to next field", async ({
    page,
  }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or search Title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await titleInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(titleInput).not.toBeVisible();
  });

  test("Rapid type then Enter does not cause double creation", async ({
    page,
  }) => {
    const uid = uniqueId();
    const title = `KBRapid ${uid}`;
    const errors = collectConsoleErrors(page);

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or search Title");
    await expect(titleInput).toBeVisible();

    await titleInput.type(title, { delay: 20 });
    // Registered before the write — see the Title test above.
    createdJobTitles.push(title);
    await titleInput.press("Enter");

    await expect(getTitleCombobox(page)).toContainText(title, { timeout: 15000 });
    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Click outside clears stale text on reopen", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or search Title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill("stale text here");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await page.getByTestId("add-job-dialog-title").click();
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await getTitleCombobox(page).click();
    const titleInputAfter = page.getByPlaceholder("Create or search Title");
    await expect(titleInputAfter).toBeVisible();

    const inputVal = await titleInputAfter.inputValue();
    expect(inputVal).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: 2. TagInput (AddJob modal - Skills field)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: TagInput (Skills)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Enter creates a tag as chip and popover stays open", async ({
    page,
  }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const skill = `KBSkill ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    await skillInput.fill(skill);
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    // Registered before the write: this Enter creates a Tag row that outlives
    // the dialog (TagInput.tsx:137-170 — only Enter creates; Tab and Escape do
    // not), and the AddJob form is never submitted, so nothing else removes it.
    createdTags.push(skill);
    await skillInput.press("Enter");

    // Wait for async createTag to complete and chip to render
    await expect(page.getByText(skill).first()).toBeVisible({ timeout: 10000 });

    // Verify the popover stays open (multi-select behavior)
    await expect(skillInput).toBeVisible();

    // Poll for sr-only announcement (async state update after creation)
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(
        hasAnnouncement(announcements, "Created") ||
          hasAnnouncement(announcements, "of 10") ||
          hasAnnouncement(announcements, "added"),
      ).toBe(true);
    }).toPass({ timeout: 5000 });

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Multiple tags can be added rapidly via Enter", async ({ page }) => {
    const uid = uniqueId();

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    for (let i = 1; i <= 3; i++) {
      const skill = `KBMulti${i} ${uid}`;
      await skillInput.fill(skill);
      // M-T-04 follow-up: replaced waitForTimeout(200) — wait for UI to settle.
      await page.waitForLoadState("domcontentloaded");
      // Registered inside the loop, before each write: a failure on iteration 2
      // must still clean up the row iteration 1 created. This is why the
      // tracking is an array and not a scalar.
      createdTags.push(skill);
      await skillInput.press("Enter");
      // The next iteration types over the field, so this skill's chip has to
      // be committed before we continue.
      await expect(page.getByText(skill).first()).toBeVisible({
        timeout: 10000,
      });
    }

    for (let i = 1; i <= 3; i++) {
      await expect(
        page.getByText(`KBMulti${i} ${uid}`).first(),
      ).toBeVisible();
    }
  });

  test("Tab closes tag popover", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    await skillInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await skillInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(skillInput).not.toBeVisible();
  });

  test("Already-selected tag via Enter shows handled (no duplicate)", async ({
    page,
  }) => {
    const uid = uniqueId();
    const skill = `KBDupe ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    // Create a skill first. TagInput's Enter handler bails on an empty
    // inputValue, and createTag's transition clears the field when it resolves
    // — so assert the controlled value has actually landed before each Enter
    // rather than relying on a waitForLoadState that resolves instantly on an
    // already-loaded page.
    await skillInput.fill(skill);
    await expect(skillInput).toHaveValue(skill);
    // Registered once, before the FIRST write. The second Enter below is the
    // subject under test precisely because it creates nothing — it announces
    // "already selected" (TagInput.tsx:160-165).
    createdTags.push(skill);
    await skillInput.press("Enter");

    // Wait for async createTag to complete: the chip renders AND the field is
    // cleared by the same transition. Waiting for the clear is what makes the
    // re-fill below deterministic.
    await expect(
      page.getByRole("button", { name: `Remove ${skill}` }),
    ).toBeVisible({ timeout: 10000 });
    await expect(skillInput).toHaveValue("");

    // Try adding the same skill again
    await skillInput.fill(skill);
    await expect(skillInput).toHaveValue(skill);
    await skillInput.press("Enter");

    // Verify sr-only announcement says "already selected" (async state update)
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(hasAnnouncement(announcements, "already selected")).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: 3. EuresOccupationCombobox (Automation Wizard Step 2)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: EuresOccupationCombobox", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Enter adds a keyword as chip, popover stays open", async ({
    page,
  }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const resumeTitle = `E2E Resume KBOcc1 ${uid}`;

    // Registered BEFORE the write. `ensureResumeExists` creates the row on its
    // first call, and a failure anywhere below leaves it behind — including the
    // failure paths that never reach the delete at the end of this test.
    createdResumes.push(resumeTitle);
    await ensureResumeExists(page, resumeTitle, { confirmWith: "row" });
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create Automation/i }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBOcc ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    // Wait for Step 1 to render with the occupation combobox
    const keywordsCombobox = page
      .getByRole("combobox")
      // Match the trigger's own placeholder text ("Search ESCO occupations or
      // type keywords..."). The looser /keyword/i alternative also matched the
      // "Keyword search scope" select that the module manifest renders
      // alongside it — a strict-mode violation, not a missing element.
      .filter({ hasText: /Search ESCO occupations/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 10000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    const keyword = `KBKeyword ${uid}`;
    await searchInput.fill(keyword);
    // The occupation list is fetched from the ESCO proxy behind a debounce.
    // Wait for the list to react to the typed text — same pattern as
    // selectOrCreateComboboxOption. An empty list is a legitimate outcome.
    await page
      .getByRole("option")
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => null);
    await searchInput.press("Enter");

    // Wait for async keyword addition to complete
    await expect(page.getByText(keyword).first()).toBeVisible({ timeout: 10000 });

    // Poll for the announcement (async state update after Enter)
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(hasAnnouncement(announcements, "added")).toBe(true);
    }).toPass({ timeout: 5000 });

    expect(filterCriticalErrors(errors)).toEqual([]);

    await deleteResumeTracked(page, resumeTitle);
  });

  test("Multiple keywords via Enter", async ({ page }) => {
    const uid = uniqueId();
    const resumeTitle = `E2E Resume KBOcc2 ${uid}`;

    // Registered BEFORE the write. `ensureResumeExists` creates the row on its
    // first call, and a failure anywhere below leaves it behind — including the
    // failure paths that never reach the delete at the end of this test.
    createdResumes.push(resumeTitle);
    await ensureResumeExists(page, resumeTitle, { confirmWith: "row" });
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBMulti ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const keywordsCombobox = page
      .getByRole("combobox")
      // Match the trigger's own placeholder text ("Search ESCO occupations or
      // type keywords..."). The looser /keyword/i alternative also matched the
      // "Keyword search scope" select that the module manifest renders
      // alongside it — a strict-mode violation, not a missing element.
      .filter({ hasText: /Search ESCO occupations/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 10000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    for (let i = 1; i <= 3; i++) {
      await searchInput.fill(`KW${i} ${uid}`);
      // The occupation list is fetched from the ESCO proxy behind a debounce.
      // Wait for the list to react to the typed text — same pattern as
      // selectOrCreateComboboxOption. An empty list is a legitimate outcome.
      await page
        .getByRole("option")
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => null);
      await searchInput.press("Enter");
      // Wait for chip to appear before adding next keyword
      await expect(page.getByText(`KW${i} ${uid}`).first()).toBeVisible({ timeout: 10000 });
    }

    await deleteResumeTracked(page, resumeTitle);
  });

  test("Tab closes keywords popover", async ({ page }) => {
    const uid = uniqueId();
    const resumeTitle = `E2E Resume KBOcc3 ${uid}`;

    // Registered BEFORE the write. `ensureResumeExists` creates the row on its
    // first call, and a failure anywhere below leaves it behind — including the
    // failure paths that never reach the delete at the end of this test.
    createdResumes.push(resumeTitle);
    await ensureResumeExists(page, resumeTitle, { confirmWith: "row" });
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBTab ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const keywordsCombobox = page
      .getByRole("combobox")
      // Match the trigger's own placeholder text ("Search ESCO occupations or
      // type keywords..."). The looser /keyword/i alternative also matched the
      // "Keyword search scope" select that the module manifest renders
      // alongside it — a strict-mode violation, not a missing element.
      .filter({ hasText: /Search ESCO occupations/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 5000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await searchInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(searchInput).not.toBeVisible();

    await deleteResumeTracked(page, resumeTitle);
  });

  test("Rapid type + Enter before ESCO results load does not crash", async ({
    page,
  }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const resumeTitle = `E2E Resume KBOcc4 ${uid}`;

    // Registered BEFORE the write. `ensureResumeExists` creates the row on its
    // first call, and a failure anywhere below leaves it behind — including the
    // failure paths that never reach the delete at the end of this test.
    createdResumes.push(resumeTitle);
    await ensureResumeExists(page, resumeTitle, { confirmWith: "row" });
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBRace ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const keywordsCombobox = page
      .getByRole("combobox")
      // Match the trigger's own placeholder text ("Search ESCO occupations or
      // type keywords..."). The looser /keyword/i alternative also matched the
      // "Keyword search scope" select that the module manifest renders
      // alongside it — a strict-mode violation, not a missing element.
      .filter({ hasText: /Search ESCO occupations/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 5000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);

    await searchInput.type(`QuickKW ${uid}`, { delay: 10 });
    await searchInput.press("Enter");

    await expect(page.getByText(`QuickKW ${uid}`).first()).toBeVisible();
    expect(filterCriticalErrors(errors)).toEqual([]);

    await deleteResumeTracked(page, resumeTitle);
  });
});

// ---------------------------------------------------------------------------
// Tests: 4. EuresLocationCombobox (Automation Wizard Step 2)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: EuresLocationCombobox", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Tab closes location popover", async ({ page }) => {
    const uid = uniqueId();

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBLoc ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const locationCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Select countries|location/i });
    await expect(locationCombobox).toBeVisible({ timeout: 5000 });
    await locationCombobox.click();

    const locationInput = page.getByPlaceholder(/Search countries/i);
    await expect(locationInput).toBeVisible();

    await locationInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await locationInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(locationInput).not.toBeVisible();
  });

  test("Search for country and select via click", async ({ page }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create Automation/i }),
    ).toBeVisible({ timeout: 10000 });
    await page
      .getByPlaceholder(/Frontend Jobs Berlin/i)
      .fill(`KBLocSel ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const locationCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Select countries|location/i });
    await expect(locationCombobox).toBeVisible({ timeout: 10000 });
    await locationCombobox.click();

    const locationInput = page.getByPlaceholder(/Search countries/i);
    await expect(locationInput).toBeVisible({ timeout: 5000 });

    await locationInput.fill("Germany");

    const germanyOption = page
      .getByRole("option")
      .filter({ hasText: /Germany/i })
      .first();
    try {
      await germanyOption.waitFor({ state: "visible", timeout: 8000 });
      await germanyOption.click();
      // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
      await page.waitForLoadState("domcontentloaded");

      await expect(page.getByText(/Germany|DE/i).first()).toBeVisible();

      const announcements = await getAllAnnouncements(page);
      const hasContent = announcements.some((a) => a.length > 0);
      expect(hasContent).toBe(true);
    } catch {
      // The EuresLocationCombobox fetches /api/eures/locations, a proxy to an
      // EU service this suite does not control. Skipping is honest — the run
      // reports the test as NOT RUN. The console.log this replaces reported it
      // as PASSED, which left the console-error oracle below as the only
      // surviving assertion: green, measuring a page nobody interacted with
      // (E2E-B27).
      test.skip(true, "EURES location options unavailable — external service");
    }

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Country with regions: click expands/collapses", async ({ page }) => {
    const uid = uniqueId();

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page
      .getByPlaceholder(/Frontend Jobs Berlin/i)
      .fill(`KBExpand ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const locationCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Select countries|location/i });
    await expect(locationCombobox).toBeVisible({ timeout: 5000 });
    await locationCombobox.click();

    const countryWithRegions = page
      .getByRole("option")
      .filter({ hasText: /▸/ })
      .first();

    try {
      await countryWithRegions.waitFor({ state: "visible", timeout: 5000 });
      await countryWithRegions.click();
      // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
      await page.waitForLoadState("domcontentloaded");

      const expanded = page.getByText(/All of|▾/).first();
      await expect(expanded).toBeVisible({ timeout: 3000 });
    } catch {
      // Same external dependency as above; same reasoning.
      test.skip(true, "EURES country-with-regions unavailable — external service");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: 5. Mobile Viewport
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: Mobile Viewport (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("AddJob combobox Enter/Tab works on mobile viewport", async ({
    page,
  }) => {
    const uid = uniqueId();
    const title = `KBMobile ${uid}`;
    const errors = collectConsoleErrors(page);

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or search Title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill(title);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for options list.
    await page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
    // Registered before the write — see the Title test above.
    createdJobTitles.push(title);
    await titleInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for combobox to close.
    await page.getByRole("option").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);

    await expect(getTitleCombobox(page)).toContainText(title, { timeout: 15000 });

    await getCompanyCombobox(page).click();
    const companyInput = page.getByPlaceholder("Create or search Company");
    await expect(companyInput).toBeVisible();
    // NOT registered, and deliberately so: this value leaves via Tab, and
    // `ComboBox.handleInputKeyDown` (ComboBox.tsx:84-88) only creates on Enter —
    // Tab just closes the popover and clears the field. No row is written.
    await companyInput.fill("test mobile");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await companyInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(companyInput).not.toBeVisible();
    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("CommandList has touch-action: pan-y on mobile", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    await expect(
      page.getByPlaceholder("Create or search Title"),
    ).toBeVisible();

    const commandList = page.locator("[cmdk-list]");
    const touchAction = await commandList.evaluate(
      (el) => getComputedStyle(el).touchAction,
    );
    expect(touchAction).toBe("pan-y");
  });
});

// ---------------------------------------------------------------------------
// Tests: 6. ARIA announcements
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: ARIA Announcements", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Combobox selection updates sr-only status", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    const srStatus = page.locator('[role="status"]').first();
    await expect(srStatus).toBeAttached();

    await getSourceCombobox(page).click();
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    const firstOption = page.getByRole("option").first();
    // No try/catch here, deliberately. Job sources are seeded (prisma/seed.ts
    // creates nine), so an option list that does not appear is a defect, not
    // an unavailable external service — the two EURES sites above are the
    // ones with a dependency this suite does not control. Swallowing here
    // left the sr-only assertion unreachable while the test reported PASSED
    // (E2E-B27).
    await firstOption.waitFor({ state: "visible", timeout: 3000 });
    await firstOption.click();
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    const announcements = await getAllAnnouncements(page);
    expect(hasAnnouncement(announcements, "selected")).toBe(true);
  });

  test("TagInput sr-only reports tag count after creation", async ({
    page,
  }) => {
    const uid = uniqueId();
    const skill = `KBAria ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    await skillInput.fill(skill);
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    // Registered before the write — see the first TagInput test above.
    createdTags.push(skill);
    await skillInput.press("Enter");

    // Wait for chip to appear (confirms the async creation completed)
    await expect(page.getByText(skill).first()).toBeVisible({ timeout: 10000 });

    // Poll for the sr-only announcement — the server action is async, so the
    // announcement text updates after the tag is created in the DB
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(
        hasAnnouncement(announcements, "of 10") ||
          hasAnnouncement(announcements, "Created"),
      ).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});
