import { test, expect, type Page } from "@playwright/test";
import { ensureEnglishLocale, expectToast, uniqueId } from "../helpers";
import { ensureResumeExists, deleteResume } from "../helpers/resume-fixture";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * CORRECTION, 2026-09-08. "The helper itself is sound" was WRONG, and the
 * paragraph above is kept only so the correction has something to point at.
 * `deleteAutomation`'s Trash2 selector was `.lucide-trash-2`, which cannot
 * match the class lucide-react renders (`lucide-trash2` — see the derivation at
 * the selector). The click could therefore only ever expire, and the catch
 * swallowed it, so EVERY test in this file leaked its automation on the GREEN
 * path — which is the `Automation +5` measured on a 112/112 production run and
 * the `Resume +5` carrying the same five uids behind it. The 5/5-green /
 * zero-rows observation of 2026-09-03 was not reproduced by the four runs of
 * 2026-09-07/08 and should not be relied on. This net is still required for the
 * failing path; it was never the whole of what was missing.
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

/**
 * Delete the automation named `name`, and name the step that lost it.
 *
 * It still never throws: this is a cleanup net, and a throwing teardown
 * replaces the real test failure with its own. What changed is that a
 * swallowed failure is no longer SILENT. Every await below is preceded by an
 * assignment to `step`, so the catch can say which one threw — the question
 * E2E-B38 was left holding ("WHICH of its four steps fails is unmeasured").
 *
 * COMPLEMENTARY TO, NOT A COPY OF, THE afterEach WARNING BELOW. That one fires
 * once per name at the end of the test, after the net has had its own go, and
 * reports the OUTCOME: the row is still in the run database. This one fires per
 * failed ATTEMPT and reports the CAUSE: the await that lost it. On a leak you
 * get both, and the pair is what turns "something leaked" into "this step
 * broke". Grep the run for `deleteAutomation failed:`.
 *
 * The two probes in the catch are there because the error alone cannot separate
 * the two most plausible losers:
 *   matches    — `getByText(name)` is unscoped and NOT `.first()`, so two
 *                matching elements make the disappearance assertion a
 *                strict-mode violation rather than a surviving row. A `2` here
 *                and a `0` from the count in the afterEach mean opposite things.
 *   dialogOpen — a confirm click the server refused leaves the AlertDialog on
 *                screen, and Radix then blanks the accessibility tree behind it,
 *                so every later read reports "not there" about a row that is
 *                (E2E-B40). That failure surfaces at a LATER step than the one
 *                that caused it, which is exactly what a step name alone would
 *                mislead about.
 *
 * `navigateToAutomations` moved INSIDE the try. It was the one statement of
 * this helper that could throw out of it, which contradicted the contract the
 * catch below claims and — since five of the callers are the second-to-last
 * statement of a test body — could fail a test from its own cleanup.
 */
async function deleteAutomation(page: Page, name: string) {
  // Read by the catch. Keep the assignments immediately above the await they
  // describe; a name that has drifted from its await is worse than none.
  let step = "navigate";
  try {
    await navigateToAutomations(page);

    step = "open-dropdown";
    await openAutomationDropdown(page, name);

    step = "click-delete-menuitem";
    // Click "Delete" menu item — identified by Trash2 icon (locale-independent).
    //
    // `lucide-trash2`, with NO hyphen before the digit. lucide-react builds the
    // class as `lucide-${toKebabCase(iconName)}`
    // (node_modules/lucide-react/dist/esm/createLucideIcon.js:17) and its
    // toKebabCase only hyphenates a lowercase/digit followed by an UPPERCASE
    // letter (`/([a-z0-9])([A-Z])/`, dist/esm/shared/src/utils.js:8). The icon
    // name is the literal "Trash2" (dist/esm/icons/trash-2.js:10), which
    // contains no such pair, so it lowercases to "trash2" — while "Pencil",
    // "Pause" and "Play", the three sibling selectors in this file, are
    // single-word and come out right by accident of having no digit.
    // `.lucide-trash-2` therefore matched NOTHING, `.click()` expired against
    // `actionTimeout: 10_000` (playwright.config.ts:41), and the catch below
    // swallowed it — five green tests, five leaked automations, five resumes
    // held undeletable behind them (profile.actions.ts:389-398).
    // Both spellings are matched so a future lucide that hyphenates digits
    // cannot silently reintroduce the same bug.
    await page
      .getByRole("menuitem")
      .filter({ has: page.locator(".lucide-trash2, .lucide-trash-2") })
      .click();

    step = "confirm-dialog-appears";
    await expect(page.getByRole("alertdialog")).toBeVisible();

    step = "click-confirm";
    // Click the destructive action button (last button in the alert dialog
    // footer). AlertDialogContent renders Cancel then Action and no close "X"
    // (src/components/ui/alert-dialog.tsx:101-127, AutomationList.tsx:322-331),
    // so `.last()` is the destructive one.
    await page
      .getByRole("alertdialog")
      .getByRole("button")
      .last()
      .click();

    step = "confirm-dialog-closes";
    // Wait for the alert dialog to close (Radix closes it immediately)
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: 10000 });

    step = "card-disappears";
    // The server action runs async after Radix closes the dialog.
    // Wait for the automation to disappear from the list (onRefresh reloads it).
    // `onRefresh` runs only on success (AutomationList.tsx:129-131), so a
    // refused delete surfaces here rather than at the click above.
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 15000 });

    // Gone for real (card no longer in the list) — drop it from the tracking so
    // the afterEach does not re-delete a row that is already gone. Anything
    // that threw above skips this line and stays tracked, which is exactly the
    // case the net exists for.
    createdAutomationNames = createdAutomationNames.filter((n) => n !== name);
  } catch (error) {
    // swallow-ok: cleanup net — the automation may already be gone, and a
    // throwing teardown would replace the real test failure with its own. The
    // warning below is what stops that being silent; it does not rethrow.
    //
    // One line, collapsed whitespace: Playwright errors are multi-line with a
    // call log, and the next reader greps a JSON report for this prefix.
    const detail = String(error).replace(/\s+/g, " ").slice(0, 400);
    // Neither probe may throw — this is the catch of a net. `count()` is a
    // snapshot (no auto-wait), `isVisible()` is strict and can throw on a
    // multi-match, hence the guards.
    const matches = await page
      .getByText(name)
      .count()
      .catch(() => -1);
    const dialogOpen = await page
      .getByRole("alertdialog")
      .isVisible()
      .catch(() => false);
    console.warn(
      `[automation-crud] deleteAutomation failed: step=${step} name=${name} ` +
        `matches=${matches} dialogOpen=${dialogOpen} error=${detail}`,
    );
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
  test.afterEach(async ({ page }, testInfo) => {
    // The after-hooks run on their OWN fresh budget — `max(project, test)`,
    // not what the body left over (`playwright/lib/worker/workerMain.js:328-329`;
    // corrected 2026-09-09, this comment used to claim the opposite), and this
    // one does not sweep a table — it replays the whole UI delete flow per
    // leaked name: `openAutomationDropdown` waits 10 s for the card and 5 s for
    // the menu (:125,:138), then the dialog's close is 10 s and the card's
    // disappearance 15 s (:224,:231), on top of a `navigateToAutomations`. One
    // leaked name can therefore cost more than the 45 s `job-crud.spec.ts:43`
    // and `profile-crud.spec.ts:167` buy for a three-table sweep, so this takes
    // the 60 s the other three siblings use (`job-detail-panels.spec.ts:58`,
    // `kanban.spec.ts:258`, `enrichment.spec.ts:65`). `kanban` is the one it is
    // copied from: that hook is the other per-row UI delete LOOP rather than a
    // table sweep, so its cost is shaped like this one's. Keep the number small
    // enough that a body which has itself become slow still surfaces.
    //
    // It sits above the early return deliberately: the green path returns
    // without awaiting anything, so the extension costs nothing there, and the
    // leaked path is the only one that reaches the deletes — which is precisely
    // the path this hook exists for.
    //
    // What it does NOT do, because the sibling specs' comments say otherwise
    // and they are wrong: it does not rescue budget the body used up. Playwright
    // gives the after-hooks a FRESH slot — `afterHooksSlot = { timeout:
    // calculateMaxTimeout(project.timeout, testInfo.timeout), elapsed: 0 }`,
    // `playwright/lib/worker/workerMain.js:328-329` — so teardown never inherits
    // the body's spend, and a body that overran has already timed out before
    // this line runs. What this call buys is the DIFFERENCE: the hook starts
    // with `max(project, test)` and this raises it, live, because
    // `timeoutManager.setTimeout` writes to the currently running slot and
    // re-arms the deadline (`timeoutManager.js:105-110`). This teardown needs
    // the extra: per leaked name it pays a 10 s card wait, a 5 s menu wait, a
    // 10 s dialog close and a 15 s disappearance wait.
    test.setTimeout(testInfo.timeout + 60_000);

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
      // swallow-ok: afterEach cleanup net — a throwing hook would replace the real
      // test failure with its own; the warning below names what may be left behind.
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
