import { test, expect, type Page } from "@playwright/test";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";
import { uniqueId } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function navigateToAutomations(page: Page) {
  await page.goto("/dashboard/automations");
  await page.waitForLoadState("domcontentloaded");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

// Retries are pointless here and would be actively misleading. The second test
// below deactivates JSearch and cannot restore it (the module is credential-
// gated, so activateModule refuses), and `syncRegistryFromDb` reads
// ModuleRegistration once per process (src/actions/module.actions.ts:437). A
// retry therefore runs against a process the first attempt already mutated and
// fails on its own `wasActive` precondition — every time, by construction.
// `retries` is 0 locally but 2 under CI (playwright.config.ts:14), which would
// turn one honest failure into three and hide which attempt was real.
// scripts/test-e2e.sh starts a fresh server per RUN, which fixes the run-level
// case; it cannot fix the attempt-level one.
test.describe.configure({ retries: 0 });

test.describe("Automation Wizard — Dynamic Module Selector", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should show available modules in the job board selector", async ({
    page,
  }) => {
    const uid = uniqueId();
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists so the "Create Automation" button is enabled
    await ensureResumeExists(page, resumeTitle);

    await navigateToAutomations(page);

    // Open the automation wizard
    await page.getByRole("button", { name: /Create Automation/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create Automation/i }),
    ).toBeVisible({ timeout: 10000 });

    // Open the Job Board selector dropdown
    await page.getByRole("combobox", { name: /Job Board/i }).click();

    // Wait for async getActiveModules to load the options
    await page.getByRole("option").first().waitFor({ state: "visible", timeout: 10000 });

    // Verify that the core active modules appear as options
    await expect(
      page.getByRole("option", { name: /EURES/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("option", { name: /Arbeitsagentur/i }),
    ).toBeVisible({ timeout: 5000 });

    // Close the dialog to prevent leftover state
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Cleanup
    await deleteResume(page, resumeTitle);
  });

  test("should only show active modules in the selector", async ({
    page,
  }) => {
    const uid = uniqueId();
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists
    await ensureResumeExists(page, resumeTitle);

    // Navigate to settings and find a module toggle on the API Keys page.
    // EURES/Arbeitsagentur have CredentialType.NONE and do NOT appear here.
    // JSearch appears on both the API Keys page AND the automation wizard.
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "API Keys", exact: true }).click();

    // Wait for module switches to render (getCredentialModules is async)
    await page.getByRole("switch").first().waitFor({ state: "visible", timeout: 15000 });

    const jsearchSwitch = page.getByRole("switch", {
      name: /Toggle JSearch module/i,
    });

    // Assert, don't probe. `isVisible()` does not wait, so on a slow render it
    // returns false and the whole test body below would be skipped silently —
    // green while executing nothing. A switch is rendered for every credential
    // module, so its absence is a real failure worth seeing.
    await expect(
      jsearchSwitch,
      "JSearch module switch missing on the API Keys settings page",
    ).toBeVisible({ timeout: 15000 });

    const wasActive = await jsearchSwitch.isChecked();

    // The subject of this test is that DEACTIVATING JSearch removes it from
    // the wizard. Starting from an already-inactive module would assert that
    // an absent option is absent — passing while proving nothing — so the
    // precondition is loud rather than skipped. Usual cause: a previous run
    // deactivated JSearch and left it that way (this test deliberately does
    // not restore it — see the note at the end of the test).
    //
    // Nothing resets the state any more, because nothing has to: every run gets
    // a fresh copy of a template built from prisma/seed.ts + prisma/seed-e2e.ts
    // (scripts/e2e-db.sh, ADR-045), and NEITHER seed writes a
    // ModuleRegistration row — so the run database starts with the table empty
    // and the manifest default (active) applies. Deactivation writes a row into
    // a database that dies with the run.
    //
    // Two ways the precondition can still be false, both per-PROCESS rather
    // than per-database: a second run against the SAME dev server, since
    // syncRegistryFromDb latches on `dbSynced` and reads the table once per
    // process (src/actions/module.actions.ts:437) — scripts/test-e2e.sh starts a
    // fresh server for exactly this reason — and E2E_REUSE_SERVER=1, which both
    // reuses the process AND keeps prisma/dev.db.
    expect(
      wasActive,
      "JSearch must start ACTIVE or this test proves nothing; the run database starts with no ModuleRegistration rows (scripts/e2e-db.sh), so a false here means this dev-server PROCESS already deactivated it — re-run without E2E_REUSE_SERVER=1",
    ).toBe(true);

    // Deactivate JSearch. Unconditional: the assertion above admits no other
    // value for wasActive.
    await jsearchSwitch.click();
    await expect(jsearchSwitch).not.toBeChecked({ timeout: 5000 });

    // Now open the automation wizard — JSearch should NOT appear
    await navigateToAutomations(page);
    await page
      .getByRole("button", { name: /Create Automation/i })
      .click();
    await expect(
      page.getByRole("heading", { name: /Create Automation/i }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("combobox", { name: /Job Board/i }).click();

    // JSearch should NOT be a selectable option (it was deactivated)
    await expect(
      page.getByRole("option", { name: /JSearch/i }),
    ).not.toBeVisible({ timeout: 3000 });

    // Close dialogs
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // No per-test restore of the module state, deliberately. Module state is
    // GLOBAL (ModuleRegistration has no user column), but it is written to a
    // database that does not outlive the run: the next run copies the template
    // again, and the template has no ModuleRegistration rows, so the
    // manifest-declared default reapplies (scripts/e2e-db.sh, ADR-045).
    // Per-test restoration only ever existed because that was not true.
    //
    // A UI restore is impossible here regardless: JSearch is credential-gated
    // (credential.type "api_key", required: true, credential.moduleId
    // "rapidapi"), and activateModule refuses with
    // settings.moduleActivationRequiresCredential unless a default, an
    // envFallback (RAPIDAPI_KEY) or a stored ApiKey row exists. This host has
    // none, so the restore block that used to sit here could only ever fail —
    // a permanently red step everyone learns to ignore.
    //
    // Honest consequence: JSearch stays INACTIVE for the remainder of THIS
    // dev-server process, because syncRegistryFromDb latches on `dbSynced` and
    // reads the table once per process. Nothing else depends on it — the
    // sibling test above asserts only EURES and Arbeitsagentur (both
    // CredentialType.NONE), and no other e2e spec mentions JSearch.

    // Cleanup
    await deleteResume(page, resumeTitle);
  });
});
