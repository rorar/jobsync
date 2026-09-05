import { expect, type Page } from "@playwright/test";
import { rowsByText } from "./index";

/**
 * Teardown for the REFERENCE rows a spec writes on its way to something else.
 *
 * Every combobox `Enter` and every `Create: …` click in this suite writes a row
 * that outlives the dialog it was typed into — a `JobTitle`, `Company`,
 * `Location` or `Tag`. Nothing in the aggregate's own delete flow removes them:
 * deleting a Job removes the Job, not the JobTitle it points at. Measured
 * against the run database kept from the 2026-09-05 full run — a run Playwright
 * reported with two unexpected results, neither of them in these files — five
 * specs between them left 13 JobTitle, 14 Company, 13 Location and 1 Tag row
 * behind. All of it on the GREEN path.
 *
 * WHY THIS IS A SHARED FILE AND NOT A SIXTH COPY
 * ----------------------------------------------
 * `keyboard-ux.spec.ts` and `profile-crud.spec.ts` each carry a private copy of
 * the two functions below, because they were repaired under separate file
 * ownership, and BOTH carry a FOLLOW-UP comment saying the pair belongs in
 * `e2e/helpers/` as soon as a third caller appears (e2e/CONVENTIONS.md —
 * "Adding a new shared helper": 3+ spec files). `job-crud`, `job-detail-panels`,
 * `job-status-crud` and `contact-company-link` are callers three through six,
 * so this is that file.
 *
 * The two copies have ALREADY diverged, which is the argument rather than a
 * detail: `profile-crud`'s `loadUntilAdminRowVisible` still reads the table
 * through `getByRole("row")`, the exact locator E2E-B40 is about, while
 * `keyboard-ux`'s was converted to a DOM locator. One of the two is blind in a
 * way the other is not, and neither reader can tell without diffing them. This
 * file is the converted shape. Migrating those two onto it is a follow-up for
 * whoever owns them; until then there are three implementations rather than
 * six, and only one of them is added to.
 *
 * ENGLISH ONLY. The Delete control is selected by `aria-label="Delete"`
 * (`common.delete`, en). Every caller must have set `NEXT_LOCALE=en`.
 */

/**
 * Admin tab that owns each reference model. The tab is a URL parameter
 * (`AdminTabsContainer.tsx:33` reads `?tab`), so teardown never has to click
 * through the tab list. Values verified against `AdminTabsContainer.tsx:37-55`.
 */
export const ADMIN_TAB = {
  jobTitle: "job-titles",
  company: "companies",
  location: "locations",
  tag: "skills",
} as const;

export type AdminReferenceTab = (typeof ADMIN_TAB)[keyof typeof ADMIN_TAB];

/** One admin table's worth of names to remove. */
export type ReferenceGroup = {
  tab: AdminReferenceTab;
  names: string[];
};

/**
 * Click "Load More" until the named row is visible, or until there is nothing
 * left to load. Returns whether the row is on screen at the end.
 *
 * Every admin container pages at `APP_CONSTANTS.RECORDS_PER_PAGE` (25) and
 * APPENDS on Load More (`JobTitlesContainer.tsx:94`, `CompaniesContainer.tsx:114`,
 * `JobLocationsContainer.tsx:94`, `TagsContainer.tsx:91`), so a row created
 * during the run can sit past page 1. The 10-iteration cap means a table beyond
 * 250 rows would report "not found" for a row that exists; the seeded template
 * starts with zero of all four models, so that is far out of reach.
 *
 * EVERY read below is a DOM locator, and none of them may become a `getByRole`
 * (E2E-B40). This helper is called in a loop over several names against the
 * same table, and a delete that the server refused leaves its AlertDialog on
 * screen; Radix's `hideOthers()` (`@radix-ui/react-dialog/dist/index.mjs:137`)
 * then sets `aria-hidden="true"` on the table behind it and the accessibility
 * tree is EMPTY for that whole window. A role locator would report "row not
 * found" for every remaining name — and `deleteAdminReferenceRow` reads that as
 * "the row was never written", so the leak would be reported as cleaned. The
 * blinding is silent, permanent and green, which is why it is spelled out here
 * rather than left to the reader of `getByRole`.
 */
export async function loadUntilAdminRowVisible(
  page: Page,
  name: string,
): Promise<boolean> {
  const row = rowsByText(page, name).first();
  // `tr` under any table on the page: the count only has to MOVE for the
  // Load More poll below, so it does not matter that the header is included.
  const allRows = page.locator("table tr");

  // Row 0 is the header, so row 1 appearing means data has loaded.
  await allRows
    .nth(1)
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => null);

  for (let i = 0; i < 10; i++) {
    if (await row.isVisible().catch(() => false)) return true;
    const loadMore = page.getByRole("button", { name: /Load More/i });
    if (!(await loadMore.isVisible().catch(() => false))) break;
    const rowsBefore = await allRows.count();
    await loadMore.click();
    await expect
      .poll(() => allRows.count(), { timeout: 15000 })
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
 *
 * `name` is matched as a case-insensitive SUBSTRING of the row's text
 * (`rowsByText` → `hasText`), so it must be specific enough to identify one
 * row. A `uniqueId()` suffix is what makes that true; a bare label like
 * "TypeScript" would also match "Advanced TypeScript" and delete a row this
 * spec does not own.
 */
export async function deleteAdminReferenceRow(
  page: Page,
  name: string,
): Promise<boolean> {
  // DOM locator, not `getByRole`. Every read below that touches the TABLE — the
  // trigger, the proof, and the re-check in the catch — happens with the
  // DeleteAlertDialog open or closing, and Radix sets `aria-hidden` on the
  // table behind it, so a role locator matches NOTHING for that window and
  // every phrasing of "the row is gone" is satisfied by a row still on screen
  // and still in the database (E2E-B40, `rowsByText` in e2e/helpers).
  // `hasText` takes the string literally, so `escapeRegExp` goes.
  const row = rowsByText(page, name).first();
  try {
    if (!(await loadUntilAdminRowVisible(page, name))) return true;
    // DOM locator again, and for the same reason as `loadUntilAdminRowVisible`:
    // this read happens against the TABLE, which is what Radix blanks. The
    // button carries `aria-label={t("common.delete")}` (JobTitlesTable.tsx:94,
    // CompaniesTable.tsx:122, JobLocationsTable.tsx:95, TagsTable.tsx:100), so
    // this selects exactly what `getByRole` did.
    await row.locator('button[aria-label="Delete"]').first().click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    // `DeleteAlertDialog` renders Cancel + Delete; the destructive one is
    // `AlertDialogAction`, labelled `common.delete` ("Delete", en).
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    // The row disappearing is the proof, not the toast: the container calls its
    // reload only on success, so a delete the server REFUSED leaves the row
    // exactly where it was. The server refuses while anything still points at
    // the row — `deleteJobTitleById` (jobtitle.actions.ts:110-145),
    // `deleteCompanyById` (company.actions.ts:337-375) and `deleteTagById`
    // (tag.actions.ts:88-113) each count the referencing Jobs, WorkExperiences
    // and Questions first. That is why callers delete the JOB before calling
    // this, and why a surviving job surfaces here as a warning rather than
    // silently.
    await row.waitFor({ state: "detached", timeout: 10000 });
    return true;
  } catch {
    // swallow-ok: cleanup net — a throwing teardown would replace the real test
    // failure with its own. Re-check instead of assuming, so a row the net
    // failed to delete is reported rather than passing in silence.
    //
    // Dismiss whatever is still on screen before that re-check and before the
    // next name in the loop. Two of the three ways this catch is reached leave
    // an AlertDialog OPEN: the row is still referenced, so `DeleteAlertDialog`
    // renders no destructive action at all (`DeleteAlertDialog.tsx:47` —
    // `{deleteAction && <AlertDialogAction/>}`) and the click above times out;
    // or the delete was refused server-side and the row never detached. An open
    // dialog is not inert — Radix blanks the accessibility tree behind it and
    // its overlay swallows the pointer, so the NEXT name would fail to click
    // its own Delete button and be reported as a second leak that never
    // existed. Escape is the dialog's own documented dismissal.
    await page.keyboard.press("Escape").catch(() => null);
    await page
      .getByRole("alertdialog")
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => null);
    return !(await row.isVisible().catch(() => false));
  }
}

/**
 * Navigate to each admin tab in turn and delete the named rows, warning about
 * any that survive.
 *
 * Never throws, including on navigation. It is called from `afterEach` hooks,
 * and a hook that throws replaces the real test failure with its own — the
 * reader then triages teardown instead of the defect. Tier two of the two-tier
 * contract: `deleteAdminReferenceRow` swallows, this re-checks and reports.
 *
 * Empty groups are skipped without navigating, so a test that created nothing
 * costs nothing.
 *
 * @param spec Prefix for the warnings, e.g. `"job-crud"`. It is the only thing
 *   tying a line in a 20-minute run's stdout back to the file that wrote it.
 */
export async function sweepReferenceGroups(
  page: Page,
  groups: ReferenceGroup[],
  spec: string,
): Promise<void> {
  try {
    for (const { tab, names } of groups) {
      if (names.length === 0) continue;
      await page.goto(`/dashboard/admin?tab=${tab}`);
      await page.waitForLoadState("domcontentloaded");
      for (const name of names) {
        if (!(await deleteAdminReferenceRow(page, name))) {
          console.warn(`[${spec}] leaked ${tab} row survived cleanup: ${name}`);
        }
      }
    }
  } catch (error) {
    // swallow-ok: cleanup net — this runs from `afterEach` hooks, and a hook
    // that throws replaces the real test failure with its own. The marker is
    // read by `__tests__/e2e-no-swallowed-assertions.spec.ts`, which scans
    // every `.ts` under `e2e/` including this one; the try body happens to
    // contain no `expect(` today, so the check would skip it, but a helper
    // several specs call should not depend on that staying true.
    //
    // The names are printed with the error: without them the reader knows
    // cleanup broke but not what is now in the database.
    console.warn(
      `[${spec}] reference-data sweep failed: ${String(error)} — ` +
        `possibly leaked: ${JSON.stringify(groups.filter((g) => g.names.length))}`,
    );
  }
}
