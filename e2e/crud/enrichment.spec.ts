import { test, expect, type Page } from "@playwright/test";
import { uniqueId, selectOrCreateComboboxOption, rowsByText } from "../helpers";
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
//      nothing in a test body deletes a reference row.
//   4. The afterEach swaps the registries out before its first await.
//   5. It navigates itself, inside the sweep.
//   6. Two tiers — the deleters swallow, the sweep re-checks and warns. Nothing
//      rethrows: a hook that throws replaces the real test failure with its own.
//
// `"Manual"` is the one name here without a `uniqueId()` suffix, and
// `deleteAdminReferenceRow` matches a case-insensitive SUBSTRING of the row's
// text, so it is worth stating why that is safe rather than leaving it to be
// discovered: the sources table renders label + value + count, and no seeded
// source (Indeed, LinkedIn, Company Career Page, Glassdoor, Google,
// ZipRecruiter, EURES, Arbeitsagentur, JSearch — prisma/seed.ts:20-30) contains
// "manual" in either field. A tenth seeded source that did would make this
// delete the wrong row.
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
  // A hook shares the test's 60 s budget (playwright.config.ts:34) and this one
  // can visit the profile page and four admin tables on top of a body that
  // already builds a resume and a job. Buy the extra time explicitly rather
  // than let a green test start failing on its teardown; keep it small enough
  // that a body which has itself become slow still surfaces.
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
  const resumes = createdResumes;
  createdJobTitles = [];
  createdCompanies = [];
  createdLocations = [];
  createdJobSources = [];
  createdResumes = [];

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

  // The Job is deleted by the body, and that ORDER is required rather than
  // tidy: `deleteJobTitleById` (jobtitle.actions.ts:110-145),
  // `deleteCompanyById` (company.actions.ts:337-375) and `deleteJobSourceById`
  // (jobSource.actions.ts:77-89) each count the referencing Jobs first and
  // refuse while one remains. On a red run the job survives and the sweep warns
  // about four rows instead of silently leaving them — the honest outcome, not
  // a second bug.
  await sweepReferenceGroups(page, groups, "enrichment");
});

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific)
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

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

    // Cleanup. The Job is deleted here rather than in the afterEach because the
    // reference sweep needs it gone FIRST (see the hook), and because
    // `deleteJob` asserts removal — it is a proof, not a best-effort. The
    // resume is removed by the afterEach: it used to be this line, and a
    // `deleteJob` that threw took it with it.
    await deleteJob(page, jobTitle);
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
