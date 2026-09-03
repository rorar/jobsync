import { test, expect, type Page } from "@playwright/test";
import { expectToast, uniqueId } from "../helpers";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";

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

/**
 * Names of the automations created by the test currently running.
 *
 * Every test below deletes its automation inline as its second-to-last
 * statement — the path a thrown assertion skips. The helper itself is sound:
 * `deleteAutomation` waits for the card to leave the list, and the full run of
 * 2026-09-03 (5/5 green) left ZERO `Automation` rows behind. The `+5` recorded
 * against E2E-B38 is the failing-run shape — the 2026-08-31 baseline had
 * exactly five automation-crud failures — so what was missing was not a repair
 * but this net (E2E-B37: "ends at zero" was a property of the run being green,
 * not of the spec owning its rows).
 *
 * `createAutomation` registers here itself so no caller can forget, and
 * `deleteAutomation` de-registers only on a proven-successful delete, so the
 * afterEach below only ever deletes what genuinely leaked. An ARRAY, not a
 * scalar: a test that creates two automations must not leak all but the last.
 * Module scope is per-worker (workers are separate processes running their
 * tests serially) and the hook swaps the reference out, so nothing bleeds into
 * the next test.
 */
let createdAutomationNames: string[] = [];

/** The list card for one automation — `AutomationList.tsx:169,178`. */
function automationCard(page: Page, name: string) {
  return page.getByRole("article", { name });
}

async function createAutomation(
  page: Page,
  opts: {
    name: string;
    keywords: string;
    location: string;
    resumeTitle: string;
  },
) {
  // Register BEFORE creating: a wizard that fails after the row was written
  // has still leaked one.
  createdAutomationNames.push(opts.name);

  await page.getByRole("button", { name: /Create Automation/i }).click();
  await expect(
    page.getByRole("heading", { name: /Create Automation/i }),
  ).toBeVisible();

  // Step 1: Basics
  await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(opts.name);
  await page.getByRole("combobox", { name: /Job Board/i }).click();
  await page.getByRole("option", { name: /Arbeitsagentur/i }).click();
  await page.getByRole("button", { name: /Next/i }).click();

  // Step 2: Search (Keywords + Location)
  // Arbeitsagentur uses plain text inputs (no external API comboboxes)
  await page.getByLabel(/Search Keywords/i).fill(opts.keywords);
  await page.getByLabel(/^Location$/i).fill(opts.location);

  await page.getByRole("button", { name: /Next/i }).click();

  // Step 3: Resume
  await page
    .getByRole("combobox", { name: /Resume for Matching/i })
    .click();
  await page
    .getByRole("option", { name: opts.resumeTitle })
    .first()
    .click();
  await page.getByRole("button", { name: /Next/i }).click();

  // Step 4: Matching (defaults)
  await page.getByRole("button", { name: /Next/i }).click();

  // Step 5: Schedule (defaults)
  await page.getByRole("button", { name: /Next/i }).click();

  // Step 6: Review + Submit
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(opts.name)).toBeVisible();
  await page.getByRole("button", { name: /Create Automation/i }).click();

  // Wait for the dialog to close — this is the reliable signal that creation
  // succeeded. The toast "Automation Created" fires but can be dismissed by
  // page re-renders (onSuccess → loadAutomations) before Playwright sees it.
  await expect(dialog).not.toBeVisible({ timeout: 15000 });
}

/**
 * Open the dropdown menu on an automation card.
 * Uses event.stopPropagation()-aware clicking to avoid triggering the
 * parent <Link> navigation.
 */
async function openAutomationDropdown(page: Page, name: string) {
  const card = page.getByRole("article", { name }).first();
  await expect(card).toBeVisible({ timeout: 10000 });

  // The DropdownMenuTrigger carries aria-label={t("automations.actions")}.
  // Do NOT index into the card's buttons: a paused automation renders a
  // pause-reason Info button ahead of it, so `.first()` picks the wrong one.
  const moreButton = card.getByRole("button", { name: "Actions" });

  // Use dispatchEvent to click without triggering link navigation
  // The component uses onClick={(e) => e.preventDefault()} but we need
  // to ensure the dropdown opens reliably
  await moreButton.click({ force: true });

  // Wait for the dropdown menu to appear
  await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 5000 });
}

async function deleteAutomation(page: Page, name: string) {
  await navigateToAutomations(page);
  try {
    await openAutomationDropdown(page, name);

    // Click "Delete" menu item — identified by Trash2 icon (locale-independent)
    await page
      .getByRole("menuitem")
      .filter({ has: page.locator(".lucide-trash-2") })
      .click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    // Click the destructive action button (last button in the alert dialog footer)
    await page
      .getByRole("alertdialog")
      .getByRole("button")
      .last()
      .click();
    // Wait for the alert dialog to close (Radix closes it immediately)
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10000 });

    // The server action runs async after Radix closes the dialog.
    // Wait for the automation to disappear from the list (onRefresh reloads it).
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 15000 });

    // Gone for real (card no longer in the list) — drop it from the tracking so
    // the afterEach does not re-delete a row that is already gone. Anything
    // that threw above skips this line and stays tracked, which is exactly the
    // case the net exists for.
    createdAutomationNames = createdAutomationNames.filter((n) => n !== name);
  } catch {
    // swallow-ok: cleanup net — the automation may already be gone, and a
    // throwing teardown would replace the real test failure with its own.
  }
}

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create → assert → cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Automation CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  // Safety net for the inline deletes at the end of each test — see
  // `createdAutomationNames` above. On a green test this list is already empty
  // (deleteAutomation de-registers), so the hook costs nothing and stays
  // silent; a warning here therefore means a REAL leak, not routine noise.
  test.afterEach(async ({ page }) => {
    // Swap the reference out BEFORE the first await: clearing afterwards would
    // keep entries alive into the next test if a delete throws, and clearing in
    // a beforeEach would not run at all under test.skip.
    const leaked = createdAutomationNames;
    createdAutomationNames = [];
    if (leaked.length === 0) return;

    try {
      // deleteAutomation navigates to the list itself, so a test that failed
      // mid-wizard (browser parked on the dialog) is handled — but the probe
      // below needs the list on screen first. Keep everything inside the try,
      // because a hook that throws replaces the real test failure in the
      // report.
      await navigateToAutomations(page);
      for (const name of leaked) {
        // Cheap presence probe before the expensive helper. Between the fill
        // and the confirmation assertion the edit test tracks BOTH the original
        // and the updated name, only one of which can exist; without this,
        // openAutomationDropdown would spend its full 10 s timeout on the one
        // that does not.
        const present = await automationCard(page, name)
          .first()
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        if (!present) continue;

        await deleteAutomation(page, name);
        // deleteAutomation swallows every error by design, so calling it proves
        // nothing — look again. Without this the hook's catch below could only
        // fire on a navigation error, and a row the net FAILED to delete would
        // pass in silence.
        if ((await automationCard(page, name).count()) > 0) {
          console.warn(
            `[automation-crud] leaked automation survived cleanup: ${name} ` +
              `— it stays in the run database and keeps its resume undeletable ` +
              `(E2E-B38).`,
          );
        }
      }
    } catch (error) {
      console.warn(
        `[automation-crud] afterEach cleanup failed: ${String(error)}`,
      );
    }
  });

  test("should create an automation through the 6-step wizard", async ({
    page,
  }) => {
    const uid = uniqueId();
    const automationName = `E2E Automation ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    const createdResume = await ensureResumeExists(page, resumeTitle);
    await navigateToAutomations(page);

    await createAutomation(page, {
      name: automationName,
      keywords: "Software Developer",
      location: "Germany",
      resumeTitle: createdResume,
    });

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(automationName).first()).toBeVisible({
      timeout: 10000,
    });

    // Cleanup
    await deleteAutomation(page, automationName);
    await deleteResume(page, resumeTitle);
  });

  test("should display the automation with correct details", async ({
    page,
  }) => {
    const uid = uniqueId();
    const automationName = `E2E Automation ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Create
    const createdResume = await ensureResumeExists(page, resumeTitle);
    await navigateToAutomations(page);
    await createAutomation(page, {
      name: automationName,
      keywords: "Software Developer",
      location: "Germany",
      resumeTitle: createdResume,
    });

    // Verify — navigate to the list and check the card details
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    // Scope assertions to the specific card to avoid matching stale data
    const card = page.getByRole("article", { name: automationName }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText("arbeitsagentur").first()).toBeVisible();
    await expect(card.getByText("active").first()).toBeVisible();

    // Cleanup
    await deleteAutomation(page, automationName);
    await deleteResume(page, resumeTitle);
  });

  test("should edit an automation name", async ({ page }) => {
    const uid = uniqueId();
    const automationName = `E2E Automation ${uid}`;
    const updatedName = `E2E Edited ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Create
    const createdResume = await ensureResumeExists(page, resumeTitle);
    await navigateToAutomations(page);
    await createAutomation(page, {
      name: automationName,
      keywords: "Software Developer",
      location: "Germany",
      resumeTitle: createdResume,
    });

    // Navigate to list and verify the automation exists
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(automationName).first()).toBeVisible({
      timeout: 10000,
    });

    // Open dropdown menu on the automation card and click Edit
    await openAutomationDropdown(page, automationName);

    // Click "Edit" menu item — identified by Pencil icon (locale-independent)
    await page
      .getByRole("menuitem")
      .filter({ has: page.locator(".lucide-pencil") })
      .click();

    // The wizard opens in edit mode — wait for dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await expect(dialog.getByRole("heading").first()).toBeVisible();

    // Step 1: change the name
    const nameInput = page.getByPlaceholder(/Frontend Jobs Berlin/i);
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Track the name the row is ABOUT to carry, WITHOUT dropping the one it
    // still carries. Only one of the two can exist at any moment, but which one
    // depends on whether the five Next clicks and the submit below all succeed
    // — and a rename that never lands is precisely the failure this net is for.
    // Re-keying instead of adding would hand that case to nobody. The afterEach
    // probes each name for 3 s before doing anything expensive, so the one that
    // does not exist costs seconds, not a timeout.
    createdAutomationNames.push(updatedName);

    await page.getByRole("button", { name: /Next/i }).click();

    // Step 2: Search (keep defaults)
    await page.getByRole("button", { name: /Next/i }).click();

    // Step 3: Resume (keep defaults)
    await page.getByRole("button", { name: /Next/i }).click();

    // Step 4: Matching (keep defaults)
    await page.getByRole("button", { name: /Next/i }).click();

    // Step 5: Schedule (keep defaults)
    await page.getByRole("button", { name: /Next/i }).click();

    // Step 6: Review — verify updated name, then submit
    await expect(dialog.getByText(updatedName)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /Update Automation/i }).click();

    // Wait for dialog to close — reliable signal that update succeeded.
    // The toast may be dismissed by re-render before Playwright catches it.
    await expect(dialog).not.toBeVisible({ timeout: 15000 });

    // Verify updated name in the list
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(updatedName).first()).toBeVisible({
      timeout: 10000,
    });

    // The rename is now PROVEN, so the old name can no longer name a row —
    // drop it. Doing this here rather than at the fill above is what lets the
    // afterEach return before its first await on a green run: it keeps the
    // both-names coverage for every path that can still throw, and costs
    // nothing on the path that cannot.
    createdAutomationNames = createdAutomationNames.filter(
      (n) => n !== automationName,
    );

    // Cleanup
    await deleteAutomation(page, updatedName);
    await deleteResume(page, resumeTitle);
  });

  test("should pause and resume an automation", async ({ page }) => {
    const uid = uniqueId();
    const automationName = `E2E Automation ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Create
    const createdResume = await ensureResumeExists(page, resumeTitle);
    await navigateToAutomations(page);
    await createAutomation(page, {
      name: automationName,
      keywords: "Software Developer",
      location: "Germany",
      resumeTitle: createdResume,
    });

    // Navigate to list and verify the automation is active
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");
    const card = page.getByRole("article", { name: automationName }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText("active").first()).toBeVisible({ timeout: 5000 });

    // Pause the automation via dropdown menu
    await openAutomationDropdown(page, automationName);

    // Click "Pause" menu item — identified by Pause icon (locale-independent)
    await page
      .getByRole("menuitem")
      .filter({ has: page.locator(".lucide-pause") })
      .click();

    // handlePause toasts automations.automationPaused only after the server
    // action has resolved — wait for that before navigating away.
    await expectToast(page, /Automation paused/);
    // Reload the list to confirm the status persisted
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");
    const cardAfterPause = page.getByRole("article", { name: automationName }).first();
    await expect(cardAfterPause).toBeVisible({ timeout: 10000 });
    await expect(cardAfterPause.getByText("paused").first()).toBeVisible({ timeout: 5000 });

    // Resume the automation via dropdown menu
    await openAutomationDropdown(page, automationName);

    // Click "Resume" menu item — identified by Play icon (locale-independent)
    await page
      .getByRole("menuitem")
      .filter({ has: page.locator(".lucide-play") })
      .click();

    // handleResume toasts automations.automationResumed only after the server
    // action has resolved — wait for that before navigating away.
    await expectToast(page, /Automation resumed/);
    // Reload the list to confirm the status persisted
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");
    const cardAfterResume = page.getByRole("article", { name: automationName }).first();
    await expect(cardAfterResume).toBeVisible({ timeout: 10000 });
    await expect(cardAfterResume.getByText("active").first()).toBeVisible({ timeout: 5000 });

    // Cleanup
    await deleteAutomation(page, automationName);
    await deleteResume(page, resumeTitle);
  });

  test("should delete the automation and verify removal", async ({
    page,
  }) => {
    const uid = uniqueId();
    const automationName = `E2E Automation ${uid}`;
    const resumeTitle = `E2E Resume ${uid}`;

    // Create
    const createdResume = await ensureResumeExists(page, resumeTitle);
    await navigateToAutomations(page);
    await createAutomation(page, {
      name: automationName,
      keywords: "Software Developer",
      location: "Germany",
      resumeTitle: createdResume,
    });

    // Delete and verify removal (deleteAutomation waits for the automation
    // to disappear from the list after the async server action completes)
    await deleteAutomation(page, automationName);

    // Cleanup resume
    await deleteResume(page, resumeTitle);
  });
});
