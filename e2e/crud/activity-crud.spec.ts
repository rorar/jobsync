import { test, expect, type Page } from "@playwright/test";
import { selectOrCreateComboboxOption, uniqueId, safeWait, expectToast } from "../helpers";

// storageState handles authentication — no per-test login needed

async function navigateToActivities(page: Page) {
  await page.goto("/dashboard/activities");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-activity-btn").waitFor({ state: "visible" });
}

async function stopRunningActivity(page: Page) {
  const stopButton = page.getByRole("button", { name: "Stop Activity" });
  try {
    await stopButton.waitFor({ state: "visible", timeout: 3000 });
    await stopButton.click({ force: true });
    await expect(stopButton).not.toBeVisible({ timeout: 10000 });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  } catch {
    // swallow-ok: idempotent precondition — there may be no running activity
    // to stop, and that absence is the state this helper wants.
  }
}

/**
 * ONE activity type for the whole file — and the same string task-crud uses.
 *
 * `ActivityType` has NO delete path anywhere in the application:
 * `src/actions/activity.actions.ts` exports `getAllActivityTypes` and
 * `createActivityType` (an upsert at :41) and nothing else, `grep -rn
 * "activityType\.delete" src/` is empty, and no screen offers the affordance.
 * A type a spec creates is therefore undeletable through the UI, which is the
 * whole of E2E-B24's `ActivityType +5`: four distinct names here plus
 * `E2E Testing` in task-crud.
 *
 * Since the rows cannot be removed, the only lever left is not to create five
 * of them. `createActivityType` upserts on the value, so every spec that names
 * the same type reuses one row: the count drops from +5 to +1 and the
 * remaining row is honest debt, not four copies of it. It is also faster —
 * `selectOrCreateComboboxOption` takes the cheap exact-match path once the
 * option exists (E2E-B32 measured ~11-25 s for the create path).
 *
 * No test asserts on the type name; it is only ever fed to the combobox.
 */
const E2E_ACTIVITY_TYPE = "E2E Activity Type";

/**
 * Names of the activities created by the test currently running.
 *
 * Every test below deletes its activity inline as its last action — the path a
 * thrown assertion skips (E2E-B37 measured this exact shape leaving a row
 * behind). `createActivity` registers here itself so no caller can forget, and
 * `deleteActivity` de-registers only once the row is provably gone, so the
 * afterEach net below only ever deletes what genuinely leaked.
 *
 * An ARRAY, not a scalar: a test that creates two activities must not leak all
 * but the last. Module scope is per-worker (workers are separate processes
 * running their tests serially) and the hook swaps the reference out, so
 * nothing bleeds into the next test.
 */
let createdActivityNames: string[] = [];

async function createActivity(
  page: Page,
  activityName: string,
  activityType: string,
  startTime: string,
  endTime: string,
) {
  // Register BEFORE creating: a create that fails after the row was written
  // has still leaked one.
  createdActivityNames.push(activityName);

  // Click "Add New Activity" button
  await page.getByTestId("add-activity-btn").click({ force: true });
  // Dialog title: t("activities.addNewActivity") = "Add New Activity"
  await expect(
    page.getByRole("heading", { name: /Add New Activity/ }),
  ).toBeVisible();

  // Fill activity name — placeholder: t("activities.activityNamePlaceholder")
  await page
    .getByPlaceholder("Ex: Job Search, Learning skill, etc")
    .fill(activityName);

  // Select activity type via combobox
  // FormLabel text is t("activities.activityType") = "Activity Type"
  // ComboBox search placeholder: "Create or Search activityType"
  await selectOrCreateComboboxOption(
    page,
    "Activity Type",
    "Create or Search activityType",
    activityType,
  );
  // M-T-04 follow-up: replaced waitForTimeout(300) — wait for the combobox to
  // close after selection rather than sleeping a fixed 300 ms.
  await safeWait(page, { loadState: "domcontentloaded" });

  // Set start time — placeholder: t("activities.timePlaceholder") = "hh:mm AM/PM"
  const startTimeInput = page.getByPlaceholder("hh:mm AM/PM").first();
  await startTimeInput.clear();
  await startTimeInput.fill(startTime);

  // Set end time
  const endTimeInput = page.getByPlaceholder("hh:mm AM/PM").last();
  await endTimeInput.clear();
  await endTimeInput.fill(endTime);

  // Submit the form
  await page.getByTestId("save-activity-btn").click();

  // Wait for dialog to close
  await expect(
    page.getByRole("heading", { name: /Add New Activity/ }),
  ).not.toBeVisible({ timeout: 10000 });
}

/** Every row in the activities table whose text contains `activityName`. */
function activityRows(page: Page, activityName: string) {
  return page.getByRole("row", { name: new RegExp(activityName, "i") });
}

async function deleteActivity(page: Page, activityName: string) {
  const activityRow = activityRows(page, activityName).first();
  // The ActivitiesTable dropdown trigger has sr-only text "Toggle menu"
  await activityRow
    .getByRole("button", { name: "Toggle menu" })
    .click({ force: true });
  // Menu item text is t("common.delete") = "Delete"
  await page.getByRole("menuitem", { name: /Delete/ }).click({ force: true });
  // Confirm deletion in DeleteAlertDialog — button text is t("common.delete") = "Delete"
  await page.getByRole("button", { name: "Delete" }).click({ force: true });

  // Clicking is not deleting. ActivitiesTable.deleteActivity (:58-72) toasts and
  // then calls reloadActivities(), so the row leaving the table is the first
  // signal that the server action actually resolved — and waiting for it is
  // what stops the request being abandoned when the page closes at end of
  // test. That is not a hypothetical: task-crud's deleteTask ended on the click
  // and leaked 6 of the 7 tasks it created (E2E-B24).
  await expect(activityRows(page, activityName)).toHaveCount(0, {
    timeout: 15000,
  });

  // Gone for real — drop it from the tracking so the afterEach does not
  // re-delete a row that no longer exists. Anything that threw above skips this
  // line and stays tracked, which is exactly the case the net exists for.
  createdActivityNames = createdActivityNames.filter(
    (n) => n !== activityName,
  );
}

/**
 * Teardown-only deleter: same clicks, no assertions, never throws.
 *
 * Deliberately NOT `deleteActivity`: that one is the flow the tests exercise
 * and must fail loudly when a step does not work, whereas teardown must stay
 * silent so it cannot turn one failed test into a failed run.
 */
async function purgeActivity(page: Page, activityName: string) {
  const row = activityRows(page, activityName).first();
  try {
    await row.waitFor({ state: "visible", timeout: 5000 });
    await row
      .getByRole("button", { name: "Toggle menu" })
      .click({ force: true });
    await page.getByRole("menuitem", { name: /Delete/ }).click({ force: true });
    await page.getByRole("button", { name: "Delete" }).click({ force: true });
    await activityRows(page, activityName)
      .first()
      .waitFor({ state: "detached", timeout: 15000 });
  } catch {
    // swallow-ok: cleanup net — the activity may already be gone, and a
    // throwing hook would replace the real test failure with its own. The
    // afterEach re-checks and warns, so a failure here is not silent.
  }
}

test.describe("Activity CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await navigateToActivities(page);
    await stopRunningActivity(page);
  });

  // Safety net for the inline deletes at the end of each test — see
  // `createdActivityNames` above. On a green test this list is already empty
  // (deleteActivity de-registers), so the hook costs nothing and stays silent;
  // a warning here therefore means a REAL leak, not routine noise.
  test.afterEach(async ({ page }) => {
    // Swap the reference out BEFORE the first await: clearing afterwards would
    // keep entries alive into the next test if a delete throws, and clearing in
    // a beforeEach would not run at all under test.skip.
    const leaked = createdActivityNames;
    createdActivityNames = [];
    if (leaked.length === 0) return;

    try {
      // purgeActivity assumes the activities table is on screen. A test that
      // failed inside createActivity leaves the browser on the open form
      // dialog, so navigate first — and keep it inside the try, because a hook
      // that throws replaces the real test failure in the report.
      await navigateToActivities(page);
      // A still-running activity blocks nothing here, but the banner overlays
      // the table; stop it for the same reason the beforeEach does.
      await stopRunningActivity(page);
      for (const name of leaked) {
        await purgeActivity(page, name);
        // purgeActivity swallows every error by design, so calling it proves
        // nothing — look again. Without this the hook's catch below only fires
        // when navigateToActivities throws, and a row the net FAILED to delete
        // would pass in silence.
        if ((await activityRows(page, name).count()) > 0) {
          console.warn(
            `[activity-crud] leaked activity survived cleanup: ${name} ` +
              `— it stays in the run database (E2E-B24).`,
          );
        }
      }
    } catch (error) {
      console.warn(
        `[activity-crud] afterEach cleanup failed: ${String(error)}`,
      );
    }
  });

  const activityName = "E2E Job Application Research";
  const activityType = E2E_ACTIVITY_TYPE;
  const startTime = "09:00 AM";
  const endTime = "10:30 AM";

  test("should create a new activity", async ({ page }) => {
    await createActivity(page, activityName, activityType, startTime, endTime);

    // Verify the activity appears in the table
    await expect(
      page
        .getByRole("row", { name: new RegExp(activityName, "i") })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // Clean up
    await deleteActivity(page, activityName);
    await expectToast(page, /Activity has been deleted/);
  });

  test("should edit an activity", async ({ page }) => {
    const uid = uniqueId();
    const originalName = `E2E Activity ${uid}`;
    const originalType = E2E_ACTIVITY_TYPE;
    const updatedName = `E2E Activity Updated ${uid}`;

    // Create an activity to edit
    await createActivity(page, originalName, originalType, "09:00 AM", "10:00 AM");

    // Verify the activity appears in the table
    await expect(
      page
        .getByRole("row", { name: new RegExp(originalName, "i") })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // Open the dropdown menu on the activity row and click Edit
    const activityRow = page
      .getByRole("row", { name: new RegExp(originalName, "i") })
      .first();
    await activityRow
      .getByRole("button", { name: "Toggle menu" })
      .click({ force: true });
    await page
      .getByRole("menuitem", { name: /Edit/ })
      .click({ force: true });

    // The edit form should open (reuses the activity form dialog)
    const activityNameInput = page.getByPlaceholder(
      "Ex: Job Search, Learning skill, etc",
    );
    await expect(activityNameInput).toBeVisible({ timeout: 10000 });

    // Change the activity name
    await activityNameInput.clear();
    await activityNameInput.fill(updatedName);

    // Track the name the row is ABOUT to carry, WITHOUT dropping the one it
    // still carries: only one of the two can exist, but which one depends on
    // whether the save below succeeds, and a rename that never lands is exactly
    // the case the net is for. `purgeActivity` gives an absent name a bounded
    // 5 s probe, so tracking both costs seconds on the green path.
    createdActivityNames.push(updatedName);

    // Save the edit
    await page.getByTestId("save-activity-btn").click();

    // Wait for the dialog to close
    await expect(activityNameInput).not.toBeVisible({ timeout: 10000 });

    // Verify the updated name appears in the table
    await expect(
      page
        .getByRole("row", { name: new RegExp(updatedName, "i") })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // The rename is now PROVEN, so the old name can no longer name a row —
    // drop it. Doing this here rather than at the fill above keeps the
    // both-names coverage for every path that can still throw, and lets the
    // afterEach return before its first await on a green run.
    createdActivityNames = createdActivityNames.filter(
      (n) => n !== originalName,
    );

    // Cleanup — delete using the updated name
    await deleteActivity(page, updatedName);
    await expectToast(page, /Activity has been deleted/);
  });

  test("should create and then delete an activity", async ({ page }) => {
    const deleteActivityName = "E2E Delete Activity Test";
    const deleteActivityType = E2E_ACTIVITY_TYPE;
    await createActivity(
      page,
      deleteActivityName,
      deleteActivityType,
      "02:00 PM",
      "03:00 PM",
    );

    // Verify activity exists
    await expect(
      page
        .getByRole("row", { name: new RegExp(deleteActivityName, "i") })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // Delete the activity
    await deleteActivity(page, deleteActivityName);

    // Verify toast success message
    await expectToast(page, /Activity has been deleted/);
  });

  test("should create activity with different times", async ({ page }) => {
    const morningActivity = "E2E Morning Standup";
    const morningType = E2E_ACTIVITY_TYPE;
    await createActivity(
      page,
      morningActivity,
      morningType,
      "08:00 AM",
      "08:30 AM",
    );

    // Verify activity appears in the table
    await expect(
      page
        .getByRole("row", { name: new RegExp(morningActivity, "i") })
        .first(),
    ).toBeVisible({ timeout: 10000 });

    // Clean up
    await deleteActivity(page, morningActivity);
    await expectToast(page, /Activity has been deleted/);
  });
});
