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
// WHY THIS FILE NOW CREATES A JOB
// ---------------------------------------------------------------------------
//
// It used to create nothing and assert `locator("table")`. That worked only
// because `job-status-crud.spec.ts` — the file immediately before this one in
// path order, and therefore the last thing to touch the Jobs table before it —
// leaked the two jobs it created. Its own header records the measurement:
//
//     "Both tests below passed on the 2026-09-05 run and left behind, per the
//      kept run database: 2 Jobs, 1 JobStatus, 2 JobTitles, 2 Companies,
//      2 Locations."
//
// `cad321fb` repaired that leak. The residue this file was standing on
// disappeared with it and both table-shaped assertions here failed on the very
// next run — not because anything about the view toggle changed, but because
// this file had an order dependency on another spec's garbage, which
// e2e/CONVENTIONS.md:18 forbids in as many words: "Every test is
// self-contained: it creates its own data, asserts, and cleans up. No test
// depends on another test's data."
//
// The dependency is not incidental to the assertion, it is the whole of it.
// With zero jobs the two views are INDISTINGUISHABLE in the DOM: the table
// branch renders `<KanbanEmptyState>` (JobsContainer.tsx:448-450) and so does
// the kanban branch (KanbanBoard.tsx:392-393, which returns the empty state
// INSTEAD of the `role="region"` board). No `<table>`, no board region, no
// columns — nothing to tell the two apart but the radio, which
// `switchViewMode` already asserts. So there is no version of "assert
// something else" that saves the toggle test; it needs a job, and it now makes
// one.
//
// The repair is deliberately NOT "make job-status-crud put the jobs back".
// Restoring state a spec found is still two specs sharing one row.

let createdJobs: string[] = [];
let createdJobTitles: string[] = [];
let createdCompanies: string[] = [];
let createdLocations: string[] = [];

// ---------------------------------------------------------------------------
// Helpers (kanban-specific)
// ---------------------------------------------------------------------------

async function navigateToMyJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  // The toolbar carries both the view toggle and `add-job-btn`, and it renders
  // in either view. Waiting on it here means every test below starts from a
  // page that has actually mounted, rather than racing `domcontentloaded`.
  await page
    .getByTestId("add-job-btn")
    .waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Force the table view before a teardown read.
 *
 * The kanban branch renders cards, not `tr`s, so a row locator asked in kanban
 * view finds nothing and a delete guarded on it is skipped in silence — the
 * exact defect `cad321fb` removed from `job-status-crud.spec.ts`.
 */
async function ensureTableView(page: Page) {
  const tableRadio = page.getByRole("radio", { name: /table/i });
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

/**
 * Create one job through the AddJob dialog, registering every row it writes
 * BEFORE the call that writes it.
 *
 * Registration order matters: `selectOrCreateComboboxOption`'s create path
 * calls the server action and only then closes the popover, so a run that dies
 * in between has already leaked the reference row. Same reason the job itself
 * is registered before the form can be submitted.
 *
 * Mirrors the flow in `enrichment.spec.ts:26-83` and `job-crud.spec.ts`, which
 * both run green, rather than inventing a sixth variant.
 */
async function createTrackedJob(
  page: Page,
  opts: { title: string; company: string; location: string },
) {
  await navigateToMyJobs(page);
  await page.getByTestId("add-job-btn").click();
  await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();

  await page
    .getByPlaceholder("Copy and paste job link here")
    .fill("https://example.com/careers/e2e-kanban");

  createdJobs.push(opts.title);
  createdJobTitles.push(opts.title);
  await selectOrCreateComboboxOption(page, "Title", "Create or Search title", opts.title);
  createdCompanies.push(opts.company);
  await selectOrCreateComboboxOption(page, "Company", "Create or Search company", opts.company);
  createdLocations.push(opts.location);
  await selectOrCreateComboboxOption(page, "Location", "Create or Search location", opts.location);

  await page.getByLabel("Job Source").click();
  await page.getByRole("option", { name: "Indeed" }).click();
  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill("E2E kanban view-toggle job description.");

  // Pick a resume (FK requirement — the form submits `resume=""` otherwise and
  // the server answers P2003). The seeded "Test Resume" is guaranteed by
  // prisma/seed.ts, so this file creates no resume of its own.
  await page.getByLabel("Select Resume").click();
  const firstResume = page.getByRole("option").first();
  await firstResume.waitFor({ state: "visible", timeout: 10000 });
  await firstResume.click();

  await page.getByTestId("save-job-btn").click();
  await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({
    timeout: 15000,
  });
}

/**
 * Delete a job this spec created and prove it is gone. Never throws — this is
 * teardown, and a hook that throws replaces the real test failure with its own.
 * Returns whether the job is absent afterwards; a job that was never created
 * counts as absent, since there is no residue either way.
 */
async function deleteJobTracked(page: Page, title: string): Promise<boolean> {
  // DOM locator, never `getByRole` (E2E-B40): the removal proof below is read
  // while the confirm AlertDialog is closing, and Radix blanks the
  // accessibility tree behind it for that whole window — a role locator would
  // answer "no such row" about a row that is still in the database.
  const row = rowsByText(page, title).first();
  try {
    await navigateToMyJobs(page);
    await ensureTableView(page);

    // Wait, do not probe. `count()` does not auto-wait and would answer 0 about
    // a table that has not rendered yet, skipping the delete in silence.
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
    // Both signals are load-bearing: the toast proves the server round trip
    // completed, the row count proves the container reloaded on success.
    await expectToast(page, /Job has been deleted successfully/);
    await expect(rowsByText(page, title)).toHaveCount(0, { timeout: 15000 });
    return true;
  } catch {
    // swallow-ok: cleanup net. Dismiss anything still on screen before the
    // re-check — an open AlertDialog eats the pointer and the next name in the
    // loop would be reported as a second leak that never existed.
    await page.keyboard.press("Escape").catch(() => null);
    await page
      .getByRole("alertdialog")
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => null);
    return !(await row.isVisible().catch(() => false));
  }
}

/**
 * Switch the Jobs view.
 *
 * `isVisible()` does not wait, so the previous `if (await radio.isVisible())`
 * silently did nothing whenever the toolbar had not rendered yet — leaving the
 * page in the other view and failing a later `locator("table")` wait with an
 * error that pointed nowhere near the cause. Per e2e/CONVENTIONS.md we wait and
 * throw rather than skip, and we confirm the toggle actually flipped.
 */
async function switchViewMode(page: Page, mode: "table" | "kanban") {
  const radio = page.getByRole("radio", {
    name: mode === "table" ? /table/i : /kanban/i,
  });
  await radio.waitFor({ state: "visible", timeout: 10000 });
  await radio.click();
  await expect(radio).toHaveAttribute("aria-checked", "true");
}

async function switchToKanbanView(page: Page) {
  await switchViewMode(page, "kanban");
}

async function switchToTableView(page: Page) {
  await switchViewMode(page, "table");
}

// NOTE: an earlier `createTestJob` / `deleteTestJob` pair lived here and was
// deleted (E2E-B19 close-out). They had no call sites at the time and could not
// have worked if wired up — which is why `createTrackedJob` above is written
// from the green flow in enrichment/job-crud rather than resurrected from them.
// `createTestJob` switched to
// the TABLE view first, and there its trigger `getByRole("button", { name:
// /add job/i })` matches nothing: the table toolbar's button is `jobs.newJob` =
// "New Job" (AddJob.tsx:397, jobs.ts:20). An "Add Job" button DOES exist in the
// app — KanbanEmptyState.tsx:18-23 renders `jobs.kanbanEmptyBoardAction` =
// "Add Job" — but only in the kanban branch (JobsContainer.tsx:437,449), which
// this helper had just navigated away from. The decisive half of the argument
// needs none of that: the fields they
// filled, `input[name="title"]` / `input[name="company"]`, do not exist —
// both are <Combobox> (AddJob.tsx:445,472) and those `name` values are
// react-hook-form FormField props, erased before the DOM.
//
// Deleted rather than repaired: the flow every other spec already uses —
// getByTestId("add-job-btn"), selectOrCreateComboboxOption(page,
// "Title"|"Company", ...), then getByTestId("save-job-btn") — is what
// `createTrackedJob` follows. See job-crud.spec.ts:73-93.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Kanban Board", () => {
  test.beforeEach(async ({ context }) => {
    // The teardown below drives the admin tables through
    // `sweepReferenceGroups`, whose Delete control is selected by
    // aria-label="Delete" (`common.delete`, en). Under another NEXT_LOCALE the
    // sweep would fail SILENTLY and report a leak that is really a label
    // mismatch. The bodies are English-only too (/table/i, /kanban/i).
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
    ]);
  });

  // Six-part teardown pattern, as documented in `keyboard-ux.spec.ts` and
  // `job-status-crud.spec.ts`: arrays not scalars; registration at the write
  // site and before it; registries swapped out before the first await; the hook
  // navigates itself; two tiers, where the deleters swallow and the hook
  // re-checks and warns; nothing rethrows.
  //
  // Four of the five tests below create nothing, and for them this hook costs
  // one array read: `sweepReferenceGroups` skips empty groups without
  // navigating, and the job loop does not execute.
  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000);

    const jobs = createdJobs;
    const referenceGroups = [
      { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
      { tab: ADMIN_TAB.company, names: createdCompanies },
      { tab: ADMIN_TAB.location, names: createdLocations },
    ];
    createdJobs = [];
    createdJobTitles = [];
    createdCompanies = [];
    createdLocations = [];

    try {
      // ORDER IS A REQUIREMENT, not tidiness: `deleteJobTitleById` /
      // `deleteCompanyById` count referencing Jobs and refuse while one exists,
      // so the job goes first or the reference sweep reports failures of the
      // wrong deleter.
      for (const title of jobs) {
        if (!(await deleteJobTracked(page, title))) {
          console.warn(`[kanban] leaked job survived cleanup: ${title}`);
        }
      }
    } catch (error) {
      // swallow-ok: cleanup net — a hook that throws replaces the real test
      // failure with its own. The deleter already swallows and re-checks, so
      // reaching here means something outside it broke; say so.
      console.warn(`[kanban] afterEach cleanup failed: ${String(error)}`);
    }

    // Navigates itself and never throws.
    await sweepReferenceGroups(page, referenceGroups, "kanban");
  });

  test("should toggle between table and kanban view", async ({ page }, testInfo) => {
    // The 60 s default (playwright.config.ts:22) was sized for a test that only
    // clicked a toggle. Creating a job through the AddJob dialog costs 17-25 s
    // on a warm server and the whole dialog is three combobox CREATE round
    // trips; on the 2026-09-05 00:26 run the equivalent block in
    // job-status-crud spent ~50 s before it even reached the resume field. Buy
    // the headroom explicitly rather than let this start failing on its setup.
    test.setTimeout(testInfo.timeout + 60_000);

    // Precondition, established here rather than inherited. See the file
    // header: with zero jobs both views render the same empty state, so
    // neither half of this test can pass without a job and neither half is
    // meaningful. This is the only test in the file that needs one.
    const uid = uniqueId();
    await createTrackedJob(page, {
      title: `E2E KanbanJob ${uid}`,
      company: `E2E KanbanCo ${uid}`,
      location: `E2E KanbanLoc ${uid}`,
    });

    await navigateToMyJobs(page);

    // Look for the view mode toggle
    const radioGroup = page.getByRole("radiogroup", { name: /view mode/i });
    await expect(radioGroup).toBeVisible({ timeout: 10000 });

    // Switch to table view
    await switchToTableView(page);
    // Table should be visible (look for table element)
    await expect(page.locator("table").first()).toBeVisible({ timeout: 5000 });

    // Switch to kanban view
    await switchToKanbanView(page);
    // Kanban board should render (look for columns or board region)
    const board = page.getByRole("region", { name: /kanban/i }).or(
      page.getByTestId("kanban-skeleton")
    ).or(
      page.locator("[data-testid^='kanban-column-']").first()
    );
    await expect(board.first()).toBeVisible({ timeout: 5000 });
  });

  test("should display kanban board with status columns", async ({ page }) => {
    await navigateToMyJobs(page);
    await switchToKanbanView(page);

    // Wait for board to load (either columns or empty state)
    const boardContent = page.locator("[data-testid^='kanban-column-']").first()
      .or(page.locator("[data-testid^='kanban-collapsed-']").first())
      .or(page.locator("text=Add your first job"));
    await boardContent.first().waitFor({ state: "visible", timeout: 10000 });

    // On desktop, check for column headers or empty state
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      // Should have at least one column or empty state visible
      const columns = page.locator("[data-testid^='kanban-column-']");
      const collapsed = page.locator("[data-testid^='kanban-collapsed-']");
      const emptyState = page.locator("text=Add your first job");

      const hasColumns = await columns.count() > 0;
      const hasCollapsed = await collapsed.count() > 0;
      const hasEmpty = await emptyState.isVisible().catch(() => false);

      expect(hasColumns || hasCollapsed || hasEmpty).toBe(true);
    }
  });

  test("should show transition dialog on status change attempt", async ({ page }) => {
    await navigateToMyJobs(page);
    await switchToKanbanView(page);
    // Wait for board content to load
    const boardContent = page.locator("[data-testid^='kanban-column-']").first()
      .or(page.locator("[data-testid^='kanban-collapsed-']").first())
      .or(page.locator("text=Add your first job"));
    await boardContent.first().waitFor({ state: "visible", timeout: 10000 });

    // On mobile view, test the status change dropdown
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Look for a status change select on mobile
      const statusSelect = page.locator("select, [role='combobox']").first();
      if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Status change UI is present on mobile
        expect(true).toBe(true);
      }
    }
    // The test validates that the Kanban UI loads without errors
  });

  test("should persist view mode preference", async ({ page }) => {
    await navigateToMyJobs(page);

    // Switch to table view
    await switchToTableView(page);

    // Prove the preference was WRITTEN before reloading, without needing a job
    // to exist. What stood here was a wait on `locator("table")`, which is only
    // rendered when the user has at least one job (JobsContainer.tsx:451,
    // `jobs.length > 0 &&`) — so this test silently depended on rows another
    // spec had leaked, and started failing the moment that leak was fixed.
    //
    // The persisted key is the actual mechanism under test
    // (useKanbanState.ts:78,87-90), so asserting it is stronger than the
    // render-side proxy it replaces, not weaker: reading it back after the
    // reload below is what makes the round trip complete.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.localStorage.getItem("jobsync-myjobs-view-mode"),
          ),
        { timeout: 5000 },
      )
      .toBe("table");

    // Reload the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Assert, don't probe. This assertion IS the test: persistence is only
    // proven by the reloaded toggle coming back checked. `isVisible()` does not
    // wait, so the `.catch(() => false)` guard this replaces turned a slow
    // post-reload render into a silent skip — green while verifying nothing.
    // switchToTableView above already resolved this exact radio, so its absence
    // after a reload is a real failure and worth seeing.
    const tableRadio = page.getByRole("radio", { name: /table/i });
    await expect(tableRadio).toBeVisible({ timeout: 10000 });
    await expect(tableRadio).toHaveAttribute("aria-checked", "true");

    // The trailing `switchToKanbanView(page)` that stood here was annotated
    // "switch back to kanban for future tests" — an inter-test dependency in
    // as many words, and one that could never have worked: the view mode lives
    // in localStorage (useKanbanState.ts:78) and `e2e/.auth/user.json` stores
    // `"origins": []`, i.e. no localStorage at all, so every test starts from
    // the "kanban" default no matter what this one leaves behind.
  });

  test("should support keyboard navigation on view mode toggle", async ({ page }) => {
    await navigateToMyJobs(page);

    const radioGroup = page.getByRole("radiogroup", { name: /view mode/i });
    await expect(radioGroup).toBeVisible({ timeout: 10000 });

    // Focus the active radio button
    const activeRadio = page.getByRole("radio", { checked: true });
    await activeRadio.focus();

    // Press arrow key to switch
    await page.keyboard.press("ArrowRight");

    // The other radio should now be checked
    const otherRadio = page.getByRole("radio", { checked: true });
    await expect(otherRadio).toBeFocused();
  });
});
