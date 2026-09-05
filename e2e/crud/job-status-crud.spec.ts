import { test, expect, type Page } from "@playwright/test";
import {
  selectOrCreateComboboxOption,
  expectToast,
  rowsByText,
  uniqueId,
} from "../helpers";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";

/**
 * Welle 4 (F-AJ-09 / dynamic Kanban) happy-path: a user creates a custom status
 * in Settings → Statuses, sets it on a new job, and sees it as its own Kanban
 * column. Proves the per-user status flows end-to-end: Settings → form picker →
 * dynamic Kanban derivation. storageState handles auth.
 */

// ---------------------------------------------------------------------------
// Teardown (E2E-B24 / E2E-B25 / E2E-B38)
// ---------------------------------------------------------------------------
//
// WHAT THIS FILE WAS LEAKING, AND WHY IT LOOKED CLEAN
// Both tests below passed on the 2026-09-05 run and left behind, per the kept
// run database: 2 Jobs, 1 JobStatus, 2 JobTitles, 2 Companies, 2 Locations.
// The cleanup was there and it was skipped, silently, by the same defect in
// both blocks:
//
//     const row = page.getByRole("row", …).first();
//     if (await row.count()) { …delete… }
//
// `Locator.count()` does NOT auto-wait. It answers about the DOM as it is at
// that instant, and the instant is immediately after a `goto`, before the jobs
// table has rendered its rows — so `count()` returned 0 and the whole delete
// was skipped with no error and no warning. The same shape guarded the confirm
// dialog (`if (await confirm.count())`), which is even tighter: the AlertDialog
// cannot exist yet on the line after the click that opens it.
//
// The first test compounded it: step 3 switches the view to KANBAN and its
// cleanup never switched back, so there were no `role="row"` rows for it to
// find at all, at any point, at any speed.
//
// Every probe below therefore waits for the thing it is asking about, and
// asserts an OUTCOME rather than a click. Nothing is guarded by a bare
// `count()`.
//
// WHY IT ALL MOVED INTO AN afterEach
// Cleanup at the end of a test body is the path a failed assertion skips
// (`scripts/check-e2e-residue.sh` names this shape in its header). Deletion is
// not the subject of either test here, so there is nothing to lose by moving it
// out and a whole failure mode to gain by doing so.
//
// Six-part pattern, as documented in `keyboard-ux.spec.ts`, with the two shared
// admin-table deleters now in `../helpers/admin-reference-cleanup`:
//   1. ARRAYS, not scalars.
//   2. Registration sits where the row is WRITTEN and BEFORE the call that
//      writes it — a create that then fails its assertion has still leaked.
//   3. De-registration only on a PROVEN delete (nothing here de-registers,
//      because no test body deletes anything any more).
//   4. The afterEach swaps the registries out before its first await.
//   5. It navigates itself.
//   6. Two tiers — the deleters swallow, the hook re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
let createdJobs: string[] = [];
let createdStatuses: string[] = [];
let createdJobTitles: string[] = [];
let createdCompanies: string[] = [];
let createdLocations: string[] = [];

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific)
// ---------------------------------------------------------------------------

async function gotoStatusSettings(page: Page) {
  await page.goto("/dashboard/settings?section=statuses");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-status-btn").waitFor({ state: "visible", timeout: 15000 });
}

async function createStatus(page: Page, label: string) {
  await page.getByLabel("Status name").fill(label);
  await page.getByTestId("add-status-btn").click();
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 10000 });
}

async function gotoMyJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible", timeout: 15000 });
}

async function ensureTableView(page: Page) {
  const tableRadio = page.getByRole("radio", { name: "Table" });
  try {
    await tableRadio.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return; // toggle not rendered — nothing to switch
  }
  if ((await tableRadio.getAttribute("aria-checked")) !== "true") {
    await tableRadio.click();
    await expect(tableRadio).toHaveAttribute("aria-checked", "true");
  }
}

async function openEditDialog(page: Page, jobTitle: string) {
  await gotoMyJobs(page);
  await ensureTableView(page);
  await page
    .getByRole("row", { name: new RegExp(jobTitle, "i") })
    .getByTestId("job-actions-menu-btn")
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Edit Job" }).click();
  await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Teardown helpers
// ---------------------------------------------------------------------------

/**
 * Delete a job created by this spec and prove it is gone.
 *
 * Returns whether the job is absent afterwards — a job that was never created
 * counts as absent, since there is no residue either way. Never throws: this is
 * teardown, and the caller turns a `false` into a warning.
 *
 * `ensureTableView` is not optional here even though it looks it. The first
 * test leaves the view in Kanban, which renders cards rather than `tr`s, and
 * the previous cleanup's row locator found nothing there and reported success.
 */
async function deleteJobTracked(page: Page, title: string): Promise<boolean> {
  // DOM locator, never `getByRole` (E2E-B40): the readiness probe below and the
  // removal proof at the end are both read while the confirm AlertDialog is
  // open or animating out, and Radix's `hideOthers()` empties the accessibility
  // tree behind it for that whole window. A role locator answers "no such row"
  // about a row that is still on screen and still in the database — which is
  // exactly how a delete that never happened reads as one that did.
  const row = rowsByText(page, title).first();
  try {
    await gotoMyJobs(page);
    await ensureTableView(page);

    // Wait, do not probe. The predecessor asked `count()` on the line after a
    // navigation; `count()` does not auto-wait, so it answered 0 about a table
    // that had not rendered yet and the delete was skipped in silence. A job
    // that genuinely does not exist costs this timeout once, in teardown.
    const present = await row
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!present) return true;

    await row.getByTestId("job-actions-menu-btn").first().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    // The server's answer, then the view's — both are load-bearing. The toast
    // (`jobs.deletedSuccess`, JobsContainer.tsx:236) comes from the completed
    // round trip and is what stops the request being abandoned when the page
    // closes; the row count comes from the reload the container only performs
    // on success. Neither alone proves the row is gone.
    await expectToast(page, /Job has been deleted successfully/);
    await expect(rowsByText(page, title)).toHaveCount(0, { timeout: 15000 });
    return true;
  } catch {
    // swallow-ok: cleanup net. Dismiss anything still on screen first — an open
    // AlertDialog blanks the tree behind it and its overlay eats the pointer, so
    // the NEXT name in the loop would fail to click its own control and be
    // reported as a second leak that never existed.
    await page.keyboard.press("Escape").catch(() => null);
    await page
      .getByRole("alertdialog")
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => null);
    return !(await row.isVisible().catch(() => false));
  }
}

/**
 * Delete a custom JobStatus created by this spec and prove it is gone.
 *
 * Call AFTER `deleteJobTracked`. The server's `deleteJobStatus`
 * (jobStatus.actions.ts:357-360) treats a status as in-use when either a Job or
 * a `JobStatusHistory` row still points at it, and `JobStatusHistory` cascades
 * on `Job` delete (`prisma/schema.prisma`), so removing the job clears both
 * counts and this takes the plain-confirm path.
 *
 * Both dialogs are handled, because the client and the server disagree about
 * what "in use" means: `DeleteStatusDialog` picks its shape from
 * `status.jobCount` ALONE (JobStatusSettings.tsx:662), while the action also
 * counts history. A status with history but no jobs therefore shows the simple
 * confirm and is then REFUSED — which is why the outcome is asserted rather
 * than the click.
 */
async function deleteStatusTracked(page: Page, label: string): Promise<boolean> {
  // Located by `aria-label` (`jobStatus.deleteStatus` = "Delete {label}", en)
  // rather than by the `status-delete-<value>` testid, because the value is a
  // SERVER-side slug — `slugifyStatusValue` may append a suffix to avoid a
  // collision — and re-deriving it in the test is a guess that fails silently.
  // A CSS attribute selector is also a DOM read, so the "it is gone" check
  // below survives the closing dialog (E2E-B40).
  // `.first()` is not defensive padding: `Locator.waitFor()` enforces strict
  // mode, so a locator that ever matched two nodes would throw here instead of
  // waiting, and the throw would be swallowed by the catch below and reported
  // as a leak. One button is rendered per status (the disabled/enabled branches
  // at JobStatusSettings.tsx:228/246 are a ternary, not both), but the deleter
  // should not depend on that staying true.
  const deleteBtn = page
    .locator(`button[aria-label="Delete ${label}"]`)
    .first();
  try {
    await gotoStatusSettings(page);
    const present = await deleteBtn
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!present) return true;
    await deleteBtn.click();

    // Race the two dialog shapes rather than probing for one. `count()` on the
    // line after the click that opens the dialog is the bug this file had.
    const reassign = page.getByTestId("reassign-select");
    const simpleConfirm = page.getByTestId("delete-confirm-btn");
    await Promise.race([
      reassign.waitFor({ state: "visible", timeout: 8000 }),
      simpleConfirm.waitFor({ state: "visible", timeout: 8000 }),
    ]).catch(() => null);

    if (await reassign.isVisible().catch(() => false)) {
      // In-use → move-and-delete. Reached only when the job delete above did
      // not succeed, so this is the salvage path, not the expected one.
      await reassign.click();
      await page.getByRole("option").first().click();
      await page.getByTestId("move-and-delete-btn").click();
    } else {
      await simpleConfirm.click();
    }

    await expectToast(page, /Status deleted/);
    await deleteBtn.waitFor({ state: "detached", timeout: 10000 });
    return true;
  } catch {
    // swallow-ok: cleanup net — see `deleteJobTracked`.
    await page.keyboard.press("Escape").catch(() => null);
    return !(await deleteBtn.isVisible().catch(() => false));
  }
}

test.afterEach(async ({ page }, testInfo) => {
  // A hook shares the test's 60 s budget (playwright.config.ts:23) and this one
  // deletes a job, a status and three admin-table rows across four navigations.
  // Buy the extra time explicitly rather than let a green test start failing on
  // its teardown; keep it small enough that a body which has itself become slow
  // still surfaces.
  test.setTimeout(testInfo.timeout + 60_000);

  // Swap the registries out BEFORE the first await: clearing afterwards would
  // keep entries alive into the next test if a delete throws, and clearing in a
  // beforeEach would not run at all under test.skip.
  const jobs = createdJobs;
  const statuses = createdStatuses;
  const referenceGroups = [
    { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
    { tab: ADMIN_TAB.company, names: createdCompanies },
    { tab: ADMIN_TAB.location, names: createdLocations },
  ];
  createdJobs = [];
  createdStatuses = [];
  createdJobTitles = [];
  createdCompanies = [];
  createdLocations = [];

  try {
    // ORDER IS A REQUIREMENT, not tidiness. Jobs first: `deleteJobStatus`
    // refuses while a Job or a JobStatusHistory row points at the status, and
    // `deleteJobTitleById` / `deleteCompanyById` each count referencing Jobs
    // and refuse the same way. Sweeping in any other order leaves rows behind
    // and reports them as failures of the wrong deleter.
    for (const title of jobs) {
      if (!(await deleteJobTracked(page, title))) {
        console.warn(`[job-status-crud] leaked job survived cleanup: ${title}`);
      }
    }
    for (const label of statuses) {
      if (!(await deleteStatusTracked(page, label))) {
        console.warn(
          `[job-status-crud] leaked job status survived cleanup: ${label}`,
        );
      }
    }
  } catch (error) {
    // swallow-ok: cleanup net — a hook that throws replaces the real test
    // failure with its own. Both deleters above already swallow and re-check,
    // so reaching here means something outside them broke; say so rather than
    // let it surface as a mystery failure of the test that just passed.
    console.warn(`[job-status-crud] afterEach cleanup failed: ${String(error)}`);
  }

  // Navigates itself and never throws.
  await sweepReferenceGroups(page, referenceGroups, "job-status-crud");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Custom JobStatus → dynamic Kanban", () => {
  test.beforeEach(async ({ context }) => {
    // Every label this spec drives is English ("Status name", "Indeed",
    // "Edit Job", "Interview"), and so are the teardown's "Delete {label}" and
    // "Delete" controls. The dependency was implicit until teardown made it
    // load-bearing: under another NEXT_LOCALE the body fails loudly, but the
    // sweep would fail SILENTLY and report a leak that is really a mismatch.
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
    ]);
  });

  test("create a status, set it on a job, see its Kanban column", async ({ page }) => {
    const uid = uniqueId();
    const statusLabel = `E2E Stage ${uid}`;
    const jobTitle = `E2E StatusJob ${uid}`;
    const company = `E2E Co ${uid}`;
    const location = `E2E Loc ${uid}`;

    // 1. Create a custom status in Settings (defaults to the first stage).
    await gotoStatusSettings(page);
    // Registered BEFORE the write. `createStatus` asserts the label appears; a
    // status that is created and then fails that assertion has still leaked one.
    createdStatuses.push(statusLabel);
    await createStatus(page, statusLabel);

    // 2. Create a job and choose the new status in the grouped picker.
    await gotoMyJobs(page);
    await page.getByTestId("add-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();

    await page
      .getByPlaceholder("Copy and paste job link here")
      .fill("https://example.com/careers/e2e-status");
    // Registered immediately before each call that can write the row: the
    // combobox helper's create path calls the server action and only then
    // closes the popover, so a run that dies in between has already leaked.
    // The JOB is registered before the form can be submitted, for the same
    // reason — the dialog closing is the first observable sign it exists.
    createdJobs.push(jobTitle);
    createdJobTitles.push(jobTitle);
    await selectOrCreateComboboxOption(page, "Title", "Create or Search title", jobTitle);
    createdCompanies.push(company);
    await selectOrCreateComboboxOption(page, "Company", "Create or Search company", company);
    createdLocations.push(location);
    await selectOrCreateComboboxOption(page, "Location", "Create or Search location", location);
    await page.getByLabel("Job Source").click();
    await page.getByRole("option", { name: "Indeed" }).click();
    await page.locator(".tiptap").click();
    await page.locator(".tiptap").fill("E2E custom-status job description.");

    // Pick a resume (FK requirement).
    await page.getByLabel("Select Resume").click();
    const firstResume = page.getByRole("option").first();
    await firstResume.waitFor({ state: "visible", timeout: 10000 });
    await firstResume.click();

    // The grouped status combobox: open and choose the custom status.
    await page.getByTestId("status-combobox-trigger").click();
    await page.getByRole("option", { name: statusLabel }).click();
    await expect(page.getByTestId("status-combobox-trigger")).toContainText(statusLabel);

    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 3. In the Kanban view, the custom status has its own column.
    await gotoMyJobs(page);
    // The view toggle is a role="radio" segmented control; ensure Kanban is active.
    // Asserted, not probed: a swallowed click would leave the table view up and
    // everything below would then be measured against the wrong view.
    const kanbanToggle = page.getByRole("radio", { name: "Kanban" }).first();
    await expect(kanbanToggle).toBeVisible();
    await kanbanToggle.click();
    // Anchor on the column itself, not on page-wide text: the table view renders
    // the same status label in its status cell, so a bare text match also passed
    // when the switch to Kanban never happened. `kanban-column-*` is emitted only
    // by KanbanColumn, and the heading filter ties the column to THIS status
    // rather than to whichever column happens to be first.
    const statusColumn = page
      .locator("[data-testid^='kanban-column-']")
      .filter({ has: page.getByRole("heading", { name: statusLabel, exact: true }) });
    await expect(statusColumn).toBeVisible({ timeout: 15000 });

    // 4. Cleanup is in the afterEach, deliberately. What stood here was two
    //    try/catch blocks that could not work: both guarded the delete on a bare
    //    `await locator.count()`, which does not auto-wait, so it answered 0
    //    about a table that had not rendered and the whole block was skipped in
    //    silence. This test also leaves the view in KANBAN, which has no `tr`s
    //    at all, so its row locator could never have matched. Both the job and
    //    the status survived the 2026-09-05 run from a test that PASSED. See
    //    "Teardown" at the top of this file.
  });

  test("re-selecting the current interviewing status logs a new round (self-transition)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 120_000); // create + 2 edits + detail nav on a cold dev server
    const uid = uniqueId();
    const jobTitle = `E2E RoundJob ${uid}`;
    const company = `E2E RoundCo ${uid}`;
    const location = `E2E RoundLoc ${uid}`;

    // 1. Create a job (seeded default = Bookmarked; addJob writes 1 initial history entry).
    await gotoMyJobs(page);
    await page.getByTestId("add-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
    await page
      .getByPlaceholder("Copy and paste job link here")
      .fill("https://example.com/careers/e2e-round");
    // Registered before the writes — see the first test for the reasoning.
    createdJobs.push(jobTitle);
    createdJobTitles.push(jobTitle);
    await selectOrCreateComboboxOption(page, "Title", "Create or Search title", jobTitle);
    createdCompanies.push(company);
    await selectOrCreateComboboxOption(page, "Company", "Create or Search company", company);
    createdLocations.push(location);
    await selectOrCreateComboboxOption(page, "Location", "Create or Search location", location);
    await page.getByLabel("Job Source").click();
    await page.getByRole("option", { name: "Indeed" }).click();
    await page.locator(".tiptap").click();
    await page.locator(".tiptap").fill("E2E self-transition round job description.");
    await page.getByLabel("Select Resume").click();
    const firstResume = page.getByRole("option").first();
    await firstResume.waitFor({ state: "visible", timeout: 10000 });
    await firstResume.click();
    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 2. Edit → move to Interview (forward transition; no round toggle yet because
    //    the status is CHANGING). Writes the 2nd history entry (bookmarked→interview).
    await openEditDialog(page, jobTitle);
    await page.getByTestId("status-combobox-trigger").click();
    // Interviewing is an applied stage, so the option's accessible name is
    // "Interview <marks-applied badge>" — match by substring, not exact.
    await page.getByRole("option", { name: /Interview/ }).first().click();
    await expect(page.getByTestId("status-combobox-trigger")).toContainText("Interview");
    // Status is changing → the round toggle must NOT be shown.
    await expect(page.getByTestId("log-interview-round-container")).toHaveCount(0);
    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 3. Edit again → status is ALREADY Interview → the explicit round toggle appears.
    //    Toggle it on + save → writes the 3rd history entry (interview→interview round).
    await openEditDialog(page, jobTitle);
    await expect(page.getByTestId("status-combobox-trigger")).toContainText("Interview");
    const roundToggle = page.getByTestId("log-interview-round-container");
    await expect(roundToggle).toBeVisible();
    await roundToggle.getByRole("switch").click();
    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 4. Open the job detail → Status History lists THREE entries: initial (bookmarked),
    //    the bookmarked→interview move, and the interview→interview round.
    await gotoMyJobs(page);
    await ensureTableView(page);
    const detailHref = await page
      .getByRole("row", { name: new RegExp(jobTitle, "i") })
      .getByRole("link", { name: new RegExp(jobTitle, "i") })
      .first()
      .getAttribute("href");
    expect(detailHref).toMatch(/\/dashboard\/myjobs\//);
    await page.goto(detailHref!);
    await page.waitForLoadState("domcontentloaded");
    // The Status History card title proves we're on the detail page with the timeline.
    await expect(page.getByText("Status History").first()).toBeVisible({ timeout: 15000 });
    const historyList = page.getByRole("list", { name: "Status History" });
    await expect(historyList).toBeVisible({ timeout: 15000 });
    await expect(historyList.getByRole("listitem")).toHaveCount(3);

    // 5. Cleanup is in the afterEach. What stood here failed for the same
    //    reason as the first test's: `if (await confirm.count())` on the line
    //    after the click that opens the AlertDialog is a question asked before
    //    the answer can exist, so the confirm was never clicked and the job
    //    survived a passing run. `E2E RoundJob mtovda41w0` is still in the
    //    2026-09-05 run database.
  });
});
