import { test, expect, type Page } from "@playwright/test";
import { ensureEnglishLocale, uniqueId, selectOrCreateComboboxOption, rowsByText } from "../helpers";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";

// ---------------------------------------------------------------------------
// Reference-data cleanup (E2E-B38)
// ---------------------------------------------------------------------------
//
// This file had NO teardown of any kind — the only spec under e2e/crud that
// writes reference rows and owns none of them. `createJob` below writes four:
// a `JobTitle`, a `Company` and a `Location` through
// `selectOrCreateComboboxOption`, plus a `JobSource` — the row `Manual`, which
// is CREATED rather than selected, because `prisma/seed.ts:20-30` seeds nine
// sources and none of them is called that, and `AddJob.tsx:578-595` declares
// the control `creatable` with an `onCreateOption` that calls
// `createJobSource(label)`. `deleteJob` removes the Job and nothing else, so
// all four survive every run — the GREEN path included, which is what
// distinguishes this file from the specs that leak only when a body throws.
//
// The pattern is the shared one (`../helpers/admin-reference-cleanup`), as used
// by job-crud, job-detail-panels, job-status-crud and contact-company-link:
//   1. ARRAYS, not scalars — one `createJob` writes four rows.
//   2. Registration sits where the row is WRITTEN and BEFORE the call that
//      writes it: a `selectOrCreateComboboxOption` that creates the row and then
//      fails its follow-up assertion has still leaked one.
//   3. De-registration only on a PROVEN delete — there is none here, because
//      no test body deletes anything any more.
//   4. The afterEach swaps the registries out before its first await.
//   5. It navigates itself, inside the sweep.
//   6. Two tiers — the deleters swallow, the sweep re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
//
// THE JOB IS DRAINED BY THE HOOK TOO (E2E-B38)
// It used to be the last statement of the one body that creates one, and the
// comment there gave two reasons for keeping it inline. Neither survives:
//
//   "the reference sweep needs it gone FIRST" — true, and it is an ORDERING
//   requirement, not a location one. The hook can sequence: it drains the job
//   before it sweeps, which is the same order the body achieved and holds on the
//   failing path as well. The old shape satisfied the ordering only when the
//   body reached its last line.
//
//   "`deleteJob` asserts removal — it is a proof, not a best-effort" — true of
//   the path that reaches it, and there is no such path when an assertion above
//   fails: no proof AND no delete. The two-tier wrapper keeps the proof intact
//   (`deleteJob` still asserts the toast and the row count) and converts a throw
//   into a `false` the hook re-checks and reports. That is strictly more than
//   the body had, not less.
//
// What the old shape cost: `deleteJobSourceById` (jobSource.actions.ts:77-89),
// `deleteJobTitleById` and `deleteCompanyById` all refuse while a Job references
// the row, so one failed assertion in that body produced a `[residue] FAIL`
// naming four models it had nothing to do with.
//
// `"Manual"` is the one name here without a `uniqueId()` suffix, and
// `deleteAdminReferenceRow` matches a case-insensitive SUBSTRING of the row's
// text, so it is worth stating why that is safe rather than leaving it to be
// discovered: the sources table renders label + value + count, and no seeded
// source (Indeed, LinkedIn, Company Career Page, Glassdoor, Google,
// ZipRecruiter, EURES, Arbeitsagentur, JSearch — prisma/seed.ts:20-30) contains
// "manual" in either field. A tenth seeded source that did would make this
// delete the wrong row.
let createdJobs: string[] = [];
let createdJobTitles: string[] = [];
let createdCompanies: string[] = [];
let createdLocations: string[] = [];
let createdJobSources: string[] = [];

// The Resume the first body builds as a precondition. Registered here rather
// than deleted at the end of the body for the reason job-detail-panels.spec.ts
// records: the body's LAST statements are cleanup, and a cleanup step that
// throws abandons every step after it — `deleteJob` throwing would take
// `deleteResume` with it. e2e/CONVENTIONS.md names the shape in its
// anti-pattern table: "Cleanup only at the end of the test body" ->
// "test.afterEach for critical cleanup".
let createdResumes: string[] = [];

test.afterEach(async ({ page }, testInfo) => {
  // The after-hooks run on their OWN fresh budget — `max(project, test)`,
  // not what the body left over (`playwright/lib/worker/workerMain.js:328-329`;
  // corrected 2026-09-09, this comment used to claim the opposite) and this one
  // can visit My Jobs, the profile page and four admin tables on top of a body
  // that already builds a resume and a job. Buy the extra time explicitly rather
  // than let a green test start failing on its teardown; keep it small enough
  // that a body which has itself become slow still surfaces.
  //
  // 60_000 is UNCHANGED by the job drain added below. The body that creates a
  // job raises its own timeout by 60 s, so for THAT test the hook's fresh slot
  // is max(60 s, 120 s) and this call makes 180 s, against typical teardown work
  // of ~10 s (one job, read off `deleteJobTracked`'s waits) + ~8 s (one resume)
  // + ~40 s (four admin tabs). The other two tests create no job and no resume,
  // so both loops are empty and `sweepReferenceGroups` skips every group without
  // navigating — their teardown cost is unchanged at one array read.
  test.setTimeout(testInfo.timeout + 60_000);

  // Swap the registries out BEFORE the first await: clearing afterwards would
  // keep entries alive into the next test if a delete throws, and clearing in a
  // beforeEach would not run at all under test.skip.
  const groups = [
    { tab: ADMIN_TAB.jobTitle, names: createdJobTitles },
    { tab: ADMIN_TAB.company, names: createdCompanies },
    { tab: ADMIN_TAB.location, names: createdLocations },
    { tab: ADMIN_TAB.source, names: createdJobSources },
  ];
  const jobs = createdJobs;
  const resumes = createdResumes;
  createdJobs = [];
  createdJobTitles = [];
  createdCompanies = [];
  createdLocations = [];
  createdJobSources = [];
  createdResumes = [];

  try {
    // JOBS FIRST, and that ORDER is required rather than tidy:
    // `deleteJobTitleById` (jobtitle.actions.ts:110-145), `deleteCompanyById`
    // (company.actions.ts:337-375) and `deleteJobSourceById`
    // (jobSource.actions.ts:77-89) each count the referencing Jobs first and
    // refuse while one remains. The body used to satisfy this ordering by
    // deleting the job on its last line, which held only on the green path; the
    // sequencing lives here now, so it holds on the failing path too.
    for (const title of jobs) {
      if (!(await deleteJobTracked(page, title))) {
        console.warn(`[enrichment] leaked job survived cleanup: ${title}`);
      }
    }
  } catch (error) {
    // swallow-ok: cleanup net — a hook that throws replaces the real test
    // failure with its own. `deleteJobTracked` already swallows and re-checks,
    // so reaching here means something outside it broke; say so.
    console.warn(`[enrichment] afterEach cleanup failed: ${String(error)}`);
  }

  // `deleteResume` TOLERATES absence by contract (helpers/resume-fixture.ts),
  // so on a red run this costs one navigation and reports nothing — it cannot
  // turn a failing test into a differently-failing one. It CAN still be refused
  // for a reason of its own: `deleteResumeById` (profile.actions.ts:389-398)
  // returns `profile.resumeHasAutomations` while an Automation points at the
  // resume. Nothing in this file creates one, so that path is not expected
  // here; it is named because the same helper is shared with specs where it is.
  for (const title of resumes) {
    await deleteResume(page, title);
  }

  // Reference rows last, for the reason given above the job loop. If a job DOES
  // survive its own drain, the sweep still warns about four rows rather than
  // silently leaving them — the honest outcome, not a second bug, and now
  // preceded by a `leaked job survived cleanup` line naming the cause.
  await sweepReferenceGroups(page, groups, "enrichment");
});

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific)
// ---------------------------------------------------------------------------

async function navigateToJobs(page: Page) {
  // Force table view via localStorage before navigation
  await page.addInitScript(() => {
    localStorage.setItem("jobsync-myjobs-view-mode", "table");
  });
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible" });
}

async function createJob(
  page: Page,
  opts: {
    title: string;
    company: string;
    location: string;
    url?: string;
    source?: string;
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

  // Fill Job Source (required by Zod schema, .min(2)). This one is CREATED, not
  // selected — see the header: "Manual" is not among the nine seeded sources.
  const source = opts.source ?? "Manual";
  createdJobSources.push(source);
  await selectOrCreateComboboxOption(
    page,
    "Job Source",
    "Search source",
    source,
  );

  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill("E2E enrichment test description.");

  // Select a resume to avoid the P2003 FK violation
  const resumeSelect = page.getByLabel("Select Resume");
  await resumeSelect.click();
  const firstResumeOption = page.getByRole("option").first();
  await firstResumeOption.waitFor({ state: "visible", timeout: 10000 });
  await firstResumeOption.click();

  // Registered immediately before the click that writes the Job, and not
  // earlier. The four reference registrations above sit at the combobox that
  // writes THEIR row; this is the same rule applied to the Job, whose only write
  // site is this submit — `addJob` is reachable from nowhere else. The sibling
  // specs (kanban.spec.ts:111, job-status-crud.spec.ts:351) register up at the
  // Title combobox instead, which is also "before the write" but over-broadly: a
  // body that dies while picking a resume registers a Job that was never
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

async function deleteJob(page: Page, jobTitle: string) {
  await navigateToJobs(page);
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

  // A click is not an outcome — this copy had no proof at all, so a refused
  // delete returned as success and left the row behind. DOM locator, because
  // the read happens as the AlertDialog closes (E2E-B40).
  await expect(rowsByText(page, jobTitle)).toHaveCount(0, { timeout: 15000 });
}

/**
 * Teardown wrapper around `deleteJob`. Returns whether the job is absent
 * afterwards; never throws, because this is teardown and a hook that throws
 * replaces the real test failure with its own.
 *
 * This is what keeps the header's "it is a proof, not a best-effort" true after
 * the delete moved into the hook: `deleteJob` still asserts the row count, and
 * only the THROW is converted — into a `false` that the caller turns into a
 * named warning. Nothing about the assertion is relaxed.
 *
 * Deliberately WRAPS `deleteJob` rather than reimplementing the flow the way
 * `kanban.spec.ts:144-183` and `job-status-crud.spec.ts:133-180` do; those two
 * delete jobs ONLY in teardown, so one flow is all they need. The cost of
 * wrapping is the absence path: they probe `waitFor({ state: "visible" })` and
 * return early, while this one lets `deleteJob`'s own 15 s visibility wait
 * expire and reports through the catch. Same answer, once, in teardown.
 */
async function deleteJobTracked(page: Page, jobTitle: string): Promise<boolean> {
  // DOM locator, never `getByRole` (E2E-B40): the re-check below can be read
  // while a confirm AlertDialog is still open or animating out, and Radix blanks
  // the accessibility tree behind it for that whole window — a role locator
  // would answer "no such row" about a row that is still in the database.
  const row = rowsByText(page, jobTitle).first();
  try {
    await deleteJob(page, jobTitle);
    return true;
  } catch {
    // swallow-ok: cleanup net. Dismiss anything still on screen before the
    // re-check — an open AlertDialog eats the pointer, so the next name in the
    // loop would be reported as a second leak that never existed.
    await page.keyboard.press("Escape").catch(() => null);
    await page
      .getByRole("alertdialog")
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => null);
    return !(await row.isVisible().catch(() => false));
  }
}

async function navigateToEnrichmentSettings(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Click the "Enrichment" sidebar button
  await page
    .getByRole("button", { name: "Enrichment", exact: true })
    .click();

  // Wait for the enrichment section heading to be visible
  await page
    .getByText("Data Enrichment Modules")
    .waitFor({ state: "visible", timeout: 15000 });

  // ...and then for the module list. EnrichmentModuleSettings.tsx:207
  // early-returns a loading block containing that same heading, so the wait
  // above passes while the module cards are still unmounted.
  // Scoped to <main>: SchedulerStatusBar (Header.tsx:76, above <main> in
  // DOM order) renders its own .animate-spin whenever a scheduler run is
  // active, so an unscoped .first() would wait on the wrong element,
  // time out, and be swallowed by the .catch below.
  await page
    .getByRole("main")
    .locator(".animate-spin")
    .first()
    .waitFor({ state: "hidden", timeout: 15000 })
    .catch(() => {
      /* spinner may have already gone */
    });
}

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create -> assert -> cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Enrichment", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("company logo component renders after job creation", async ({
    page,
  }, testInfo) => {
    test.setTimeout(testInfo.timeout + 60_000); // Create + verify + cleanup can be slow

    const uid = uniqueId();
    const jobTitle = `E2E Job ${uid}`;
    const company = `E2E Company ${uid}`;
    const location = `E2E Location ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists (required to avoid FK violation on submit).
    // Registered BEFORE the create: a create that fails after the row was
    // written has still leaked one.
    createdResumes.push(resumeTitle);
    await ensureResumeExists(page, resumeTitle);

    // Create a job
    await navigateToJobs(page);
    await createJob(page, { title: jobTitle, company, location });

    // Navigate fresh to ensure client-side data is loaded after redirect
    await navigateToJobs(page);
    await expect(
      page.getByText(jobTitle).first(),
    ).toBeVisible({ timeout: 15000 });

    // Verify the CompanyLogo component renders in the job row.
    // The CompanyLogo uses role="img" for the initials avatar fallback.
    // Since we used a made-up company name, it will show initials (no real logo URL).
    const jobRow = page
      .getByRole("row", { name: new RegExp(jobTitle, "i") })
      .first();
    await expect(jobRow).toBeVisible();

    // The initials avatar has role="img" with the company name as aria-label
    const companyLogo = jobRow.getByRole("img", {
      name: new RegExp(company, "i"),
    });
    await expect(companyLogo).toBeVisible({ timeout: 10000 });

    // Verify the initials are rendered (first letters of first two words)
    // "E2E Company" -> "EC"
    await expect(companyLogo.locator("span")).toContainText("EC");

    // Cleanup is entirely in the afterEach now — the resume already was, and the
    // JOB as of this change. Both of the reasons the old comment here gave for
    // keeping the job inline are answered in the file header: the sweep's
    // ordering requirement is satisfied by draining jobs before sweeping, and
    // the removal proof is unchanged — `deleteJobTracked` wraps the same
    // asserting `deleteJob` and only converts its throw into a warning.
  });

  test("enrichment module settings are visible with activation toggles", async ({
    page,
  }) => {
    await navigateToEnrichmentSettings(page);

    // Verify the section heading and description
    await expect(
      page.getByText("Data Enrichment Modules"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Configure modules that automatically enrich company and job data",
      ),
    ).toBeVisible();

    // Verify module cards are displayed — the three enrichment modules
    // Logo.dev, Google Favicon, Link Preview Parser
    await expect(
      page.getByRole("heading", { name: "Logo.dev" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "Google Favicon" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Link Preview Parser" }),
    ).toBeVisible();

    // Verify each module has an activation toggle (Switch)
    // The switch aria-label uses the pattern "Toggle {name} module"
    await expect(
      page.getByRole("switch", { name: /Toggle Logo\.dev module/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /Toggle Google Favicon module/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", {
        name: /Toggle Link Preview Parser module/i,
      }),
    ).toBeVisible();

    // Verify the "No API key required" badge is shown
    const noKeyBadges = page.getByText("No API key required");
    await expect(noKeyBadges.first()).toBeVisible();
  });

  test("module activation toggle persists after reload", async ({ page }) => {
    await navigateToEnrichmentSettings(page);

    // Find the Google Favicon module toggle (credential-free, safe to toggle)
    const faviconToggle = page.getByRole("switch", {
      name: /Toggle Google Favicon module/i,
    });
    await expect(faviconToggle).toBeVisible({ timeout: 10000 });

    // Read initial state
    const wasActive = await faviconToggle.isChecked();

    if (wasActive) {
      // Deactivate: click toggle → confirmation dialog → confirm
      await faviconToggle.click();
      const confirmDialog = page.getByRole("alertdialog");
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      await confirmDialog
        .getByRole("button", { name: /deactivate|confirm/i })
        .click();

      // Assert the toggle itself flipped OFF. The Switch is fully controlled
      // (EnrichmentModuleSettings.tsx:295 `checked={module.status === "active"}`)
      // and that state is only set AFTER deactivateModule() resolves, so this is
      // a genuine post-condition. A page-wide /inactive/i match would also hit
      // the other modules' status badges (:290-292) and pick an arbitrary one.
      await expect(faviconToggle).not.toBeChecked({ timeout: 10000 });

      // Reload and verify toggle is OFF
      await navigateToEnrichmentSettings(page);
      const toggleAfterReload = page.getByRole("switch", {
        name: /Toggle Google Favicon module/i,
      });
      await expect(toggleAfterReload).toBeVisible({ timeout: 10000 });
      await expect(toggleAfterReload).not.toBeChecked();

      // Re-activate to restore original state, and assert the toggle flipped
      // back ON before the test ends (page-wide /active/i matched every
      // module's "Active" badge and could therefore never fail).
      await toggleAfterReload.click();
      await expect(toggleAfterReload).toBeChecked({ timeout: 10000 });
    } else {
      // Activate: click toggle (no confirmation needed)
      await faviconToggle.click();

      // Assert the toggle itself flipped ON — controlled by post-response
      // state, so this waits for activateModule() to actually succeed. A
      // page-wide /active/i match hits every module's "Active" badge and
      // is satisfied even if this module never activated.
      await expect(faviconToggle).toBeChecked({ timeout: 10000 });

      // Reload and verify toggle is ON
      await navigateToEnrichmentSettings(page);
      const toggleAfterReload = page.getByRole("switch", {
        name: /Toggle Google Favicon module/i,
      });
      await expect(toggleAfterReload).toBeVisible({ timeout: 10000 });
      await expect(toggleAfterReload).toBeChecked();

      // Deactivate to restore original state
      await toggleAfterReload.click();
      const confirmDialog = page.getByRole("alertdialog");
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      await confirmDialog
        .getByRole("button", { name: /deactivate|confirm/i })
        .click();
    }
  });
});
