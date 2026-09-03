import { test, expect, type Page } from "@playwright/test";
import {
  expectToast,
  rowsByText,
  safeWait,
  selectOrCreateComboboxOption,
  uniqueId,
} from "../helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateToTasks(page: Page) {
  await page.goto("/dashboard/tasks");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-task-btn").waitFor({ state: "visible" });
}

/**
 * The same activity type activity-crud uses, and for the same reason.
 *
 * `ActivityType` has no delete path anywhere in the application (see the long
 * note on `E2E_ACTIVITY_TYPE` in `activity-crud.spec.ts`), so the only lever on
 * E2E-B24's `ActivityType +5` is to stop creating five distinct rows.
 * `createActivityType` (`src/actions/activity.actions.ts:41`) upserts on the
 * value, so both specs naming this string share one row. Nothing asserts on it.
 */
const E2E_ACTIVITY_TYPE = "E2E Activity Type";

/**
 * Titles of the tasks created by the test currently running.
 *
 * Every test deletes its task inline as its last action — the path a thrown
 * assertion skips (E2E-B37 measured that shape leaving a row behind).
 * `createTask` registers here itself so no caller can forget, and `deleteTask`
 * de-registers only once the row is provably gone, so the afterEach net below
 * only ever deletes what genuinely leaked.
 *
 * An ARRAY, not a scalar: a test that creates two tasks must not leak all but
 * the last. Module scope is per-worker (workers are separate processes running
 * their tests serially) and the hook swaps the reference out, so nothing bleeds
 * into the next test.
 */
let createdTaskTitles: string[] = [];

/**
 * Names of the ACTIVITIES this spec causes to exist — a separate list because
 * they are a separate aggregate with a separate screen, and because the Task
 * cannot be removed until the Activity is.
 *
 * `startActivityFromTask` (`src/actions/task.actions.ts:343-350`) creates an
 * `Activity` named after the task, and `deleteTaskById` (:261-267) then REFUSES
 * to delete that task for as long as it exists (`tasks.cannotDeleteWithActivity`);
 * `Activity.taskId` is an optional relation with no cascade
 * (`prisma/schema.prisma:512-513`), so deleting the task would not remove the
 * activity anyway. Cleanup order is therefore Activity first, Task second —
 * the reverse silently achieves neither, which is E2E-B24's `Activity +1`.
 */
let startedActivityNames: string[] = [];

async function createTask(
  page: Page,
  title: string,
  options?: { activityType?: string },
) {
  // Register BEFORE creating: a create that fails after the row was written
  // has still leaked one.
  createdTaskTitles.push(title);

  await page.getByTestId("add-task-btn").click({ force: true });
  await expect(page.getByTestId("task-form-dialog-title")).toBeVisible();

  const titleInput = page.getByPlaceholder("Enter task title");
  await titleInput.waitFor({ state: "visible" });
  await titleInput.clear();
  await titleInput.fill(title);
  await titleInput.blur();

  if (options?.activityType) {
    // Use the shared combobox helper (proven for the job/activity comboboxes)
    // instead of an ad-hoc force-click. The previous force-click on the cmdk
    // option did not reliably fire its onSelect, so activityTypeId was left
    // unset (NULL) — which then made startActivityFromTask fail with
    // taskNeedsActivityType. The helper opens via getByLabel, selects the exact
    // option (or creates), and waits deterministically.
    await selectOrCreateComboboxOption(
      page,
      "Activity Type",
      "",
      options.activityType,
    );
  }

  const saveBtn = page.getByTestId("save-task-btn");
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expect(page.getByTestId("task-form-dialog-title")).not.toBeVisible({
    timeout: 10000,
  });
}

async function stopRunningActivity(page: Page) {
  await page.goto("/dashboard/activities");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-activity-btn").waitFor({ state: "visible" });
  const stopButton = page.getByRole("button", { name: "Stop" });
  try {
    await stopButton.waitFor({ state: "visible", timeout: 3000 });
    await stopButton.click({ force: true });
    await expect(stopButton).not.toBeVisible({ timeout: 10000 });
  } catch {
    // swallow-ok: idempotent precondition — there may be no running activity.
  }
}

/**
 * Rows carrying this file's evidence that a deletion happened — DOM locators,
 * deliberately not `getByRole("row")`, because every one of those reads happens
 * while a modal is open or closing. `rowsByText` (e2e/helpers/index.ts) carries
 * the mechanism and E2E-B40's measurement; this file is where it was measured.
 *
 * Only the deletion helpers need it. The inline `getByRole("row", …)` in the
 * test bodies runs with no modal open, where the role engine remains the better
 * default.
 */
function taskRows(page: Page, title: string) {
  return rowsByText(page, title);
}

/** Every row in the activities table whose text contains `activityName`. */
function activityRows(page: Page, activityName: string) {
  return rowsByText(page, activityName);
}

async function deleteTask(page: Page, title: string) {
  // Wait for the task row to be visible before interacting
  await expect(taskRows(page, title).first()).toBeVisible({ timeout: 10000 });

  await page
    .getByRole("row", { name: new RegExp(title, "i") })
    .getByTestId("task-actions-menu-btn")
    .first()
    .click({ force: true });
  await page.getByRole("menuitem", { name: "Delete" }).click({ force: true });

  // Wait for the alert dialog to appear before clicking Delete
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click({ force: true });

  // Proof #1 — the SERVER answered. `TasksContainer.onDeleteTask` (:132-147)
  // toasts `tasks.deletedSuccess` only after `deleteTaskById` has resolved, and
  // `expectToast` finds the viewport through a CSS attribute selector, so no
  // modal can hide it from the assertion.
  //
  // This is the line that makes the helper true. Without it `deleteTask`
  // returned while the action was still in flight, the test ended, and the page
  // closed under the request — `deleteTask` is the LAST statement of six of the
  // seven tests that create a task, and exactly those six rows were in the run
  // database afterwards. The seventh waited for this toast and is the one that
  // deleted.
  //
  // It is also the only place a REFUSED delete can surface: `deleteTaskById`
  // returns `tasks.cannotDeleteWithActivity` for a task that still has an
  // activity, which renders a DESTRUCTIVE toast this pattern does not match. A
  // refusal now fails the test instead of reading as a disappearing row.
  await expectToast(page, /Task has been deleted/);

  // Proof #2 — and the list agrees. Worth keeping, worth nothing alone: until
  // `taskRows` became a DOM locator this assertion was satisfied by the modal's
  // own `aria-hidden` (E2E-B40), which is how six leaked rows passed as gone.
  await expect(taskRows(page, title)).toHaveCount(0, { timeout: 15000 });

  // Gone for real — drop it from the tracking so the afterEach does not
  // re-delete a row that no longer exists. Anything that threw above skips this
  // line and stays tracked, which is exactly the case the net exists for.
  createdTaskTitles = createdTaskTitles.filter((t) => t !== title);
}

/**
 * Delete the activity named `activityName` from the activities table.
 *
 * Used inline (loudly) because on the green path the task deletion that follows
 * DEPENDS on it having worked — see `startedActivityNames`.
 */
async function deleteActivity(page: Page, activityName: string) {
  const row = activityRows(page, activityName).first();
  // getAllActivities filters on `endTime: { not: null }`
  // (activity.actions.ts:69-72), so a still-RUNNING activity is not in this
  // table at all. Assert the row first: without it the failure surfaces as a
  // missing "Toggle menu" button and reads like a markup problem rather than
  // "the stop never landed".
  await expect(row).toBeVisible({ timeout: 15000 });
  // The ActivitiesTable dropdown trigger has sr-only text "Toggle menu"
  await row.getByRole("button", { name: "Toggle menu" }).click({ force: true });
  await page.getByRole("menuitem", { name: /Delete/ }).click({ force: true });
  // DeleteAlertDialog's confirm button is t("common.delete") = "Delete"
  await page.getByRole("button", { name: "Delete" }).click({ force: true });

  // Same two proofs as `deleteTask`, and needed here more: the task deletion
  // that follows DEPENDS on this one having landed, so an activity delete left
  // in flight surfaces later as `tasks.cannotDeleteWithActivity` on a different
  // line. `ActivitiesTable` (:64) toasts `activities.deletedSuccess` after the
  // action resolves.
  await expectToast(page, /Activity has been deleted/);
  await expect(activityRows(page, activityName)).toHaveCount(0, {
    timeout: 15000,
  });

  startedActivityNames = startedActivityNames.filter(
    (n) => n !== activityName,
  );
}

/**
 * Make every task visible regardless of status.
 *
 * `TasksContainer` seeds `statusFilter` from `DEFAULT_STATUS_FILTER` on every
 * mount (:78-80) and does not persist it, so a `page.goto` resets the filter to
 * In Progress + Needs Attention. Two tests below leave their task in `complete`
 * — invisible to the teardown net unless the filter is widened first. Silent:
 * this only ever runs from teardown.
 */
async function revealAllTaskStatuses(page: Page) {
  try {
    await page
      .getByRole("button", { name: "Status", exact: true })
      .click({ force: true });
    for (const label of ["Complete", "Cancelled"]) {
      const item = page.getByRole("menuitemcheckbox", { name: label });
      await item.waitFor({ state: "visible", timeout: 5000 });
      // Read aria-checked rather than isChecked(): the state lives on the
      // attribute for a menuitemcheckbox, and a toggle that is already on must
      // not be clicked back off.
      if ((await item.getAttribute("aria-checked")) === "true") continue;
      await item.click({ force: true });
    }
    await page.keyboard.press("Escape");
  } catch {
    // swallow-ok: teardown convenience — a task that stays hidden is reported
    // by the afterEach's re-check, and a throwing hook would replace the real
    // test failure with its own.
  }
}

/**
 * Teardown-only deleters: same clicks, no assertions, never throw.
 *
 * Deliberately NOT `deleteTask` / `deleteActivity`: those are used inline where
 * a failed step must fail the test, whereas teardown must stay silent so it
 * cannot turn one failed test into a failed run.
 */
async function purgeTask(page: Page, title: string) {
  try {
    const row = taskRows(page, title).first();
    await row.waitFor({ state: "visible", timeout: 5000 });
    await row.getByTestId("task-actions-menu-btn").click({ force: true });
    await page.getByRole("menuitem", { name: "Delete" }).click({ force: true });
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click({ force: true });
    // `toHaveCount(0)` rather than `waitFor({ state: "detached" })`: detached is
    // also true of a locator that matches nothing, so under the old role-based
    // `taskRows` it resolved instantly against the modal's `aria-hidden` and the
    // net "succeeded" without deleting anything (E2E-B40). The throw stays
    // inside the try — teardown must report, not fail the run.
    await expect(taskRows(page, title)).toHaveCount(0, { timeout: 15000 });
  } catch {
    // swallow-ok: cleanup net — the task may already be gone, and a throwing
    // hook would replace the real test failure with its own. The afterEach
    // re-checks and warns, so a failure here is not silent.
  }
}

async function purgeActivity(page: Page, activityName: string) {
  try {
    const row = activityRows(page, activityName).first();
    await row.waitFor({ state: "visible", timeout: 5000 });
    await row
      .getByRole("button", { name: "Toggle menu" })
      .click({ force: true });
    await page.getByRole("menuitem", { name: /Delete/ }).click({ force: true });
    await page.getByRole("button", { name: "Delete" }).click({ force: true });
    await expect(activityRows(page, activityName)).toHaveCount(0, {
      timeout: 15000,
    });
  } catch {
    // swallow-ok: cleanup net — as purgeTask above.
  }
}

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create → assert → cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Task CRUD", () => {
  // Safety net for the inline deletes at the end of each test — see
  // `createdTaskTitles` and `startedActivityNames` above. On a green test both
  // lists are already empty (the delete helpers de-register), so the hook costs
  // nothing and stays silent; a warning here therefore means a REAL leak, not
  // routine noise.
  test.afterEach(async ({ page }) => {
    // Swap the references out BEFORE the first await: clearing afterwards would
    // keep entries alive into the next test if a delete throws, and clearing in
    // a beforeEach would not run at all under test.skip.
    const leakedActivities = startedActivityNames;
    const leakedTasks = createdTaskTitles;
    startedActivityNames = [];
    createdTaskTitles = [];
    if (leakedActivities.length === 0 && leakedTasks.length === 0) return;

    try {
      // Activities FIRST — deleteTaskById refuses while task.activity exists.
      // A test that failed inside createTask leaves the browser on the open
      // form dialog, so navigate first; and keep everything inside the try,
      // because a hook that throws replaces the real test failure in the
      // report.
      if (leakedActivities.length > 0) {
        await stopRunningActivity(page);
        for (const name of leakedActivities) {
          await purgeActivity(page, name);
          // purgeActivity swallows every error by design, so calling it proves
          // nothing — look again. Without this the hook's catch below only
          // fires when navigation throws, and a row the net FAILED to delete
          // would pass in silence.
          if ((await activityRows(page, name).count()) > 0) {
            console.warn(
              `[task-crud] leaked activity survived cleanup: ${name} ` +
                `— it also blocks its task's deletion (E2E-B24).`,
            );
          }
        }
      }

      if (leakedTasks.length > 0) {
        await navigateToTasks(page);
        await revealAllTaskStatuses(page);
        for (const title of leakedTasks) {
          await purgeTask(page, title);
          if ((await taskRows(page, title).count()) > 0) {
            console.warn(
              `[task-crud] leaked task survived cleanup: ${title} ` +
                `— it stays in the run database (E2E-B24).`,
            );
          }
        }
      }
    } catch (error) {
      console.warn(`[task-crud] afterEach cleanup failed: ${String(error)}`);
    }
  });

  test("should create a new task and verify it appears in the list", async ({
    page,
  }) => {
    const uid = uniqueId();
    const taskTitle = `E2E Task ${uid}`;

    await navigateToTasks(page);
    await createTask(page, taskTitle);

    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup
    await deleteTask(page, taskTitle);
  });

  test("should edit the task title and verify updated values", async ({
    page,
  }) => {
    const uid = uniqueId();
    const taskTitle = `E2E Task ${uid}`;
    const updatedTitle = `E2E Task Updated ${uid}`;

    // Create
    await navigateToTasks(page);
    await createTask(page, taskTitle);
    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Edit
    await page
      .getByRole("row", { name: new RegExp(taskTitle, "i") })
      .getByTestId("task-actions-menu-btn")
      .first()
      .click({ force: true });
    await page
      .getByRole("menuitem", { name: "Edit Task" })
      .click({ force: true });

    await expect(page.getByTestId("task-form-dialog-title")).toBeVisible();
    const titleInput = page.getByPlaceholder("Enter task title");
    await titleInput.clear();
    await titleInput.fill(updatedTitle);
    await titleInput.blur();

    // Track the title the row is ABOUT to carry, WITHOUT dropping the one it
    // still carries: only one of the two can exist, but which one depends on
    // whether the save below succeeds, and a rename that never lands is exactly
    // the case the net is for. `purgeTask` gives an absent title a bounded 5 s
    // probe, so tracking both costs seconds on the green path.
    createdTaskTitles.push(updatedTitle);

    const saveBtn = page.getByTestId("save-task-btn");
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(page.getByTestId("task-form-dialog-title")).not.toBeVisible({
      timeout: 10000,
    });

    await expect(
      page.getByRole("row", { name: new RegExp(updatedTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // The rename is now PROVEN, so the old title can no longer name a row —
    // drop it. Doing this here rather than at the fill above keeps the
    // both-titles coverage for every path that can still throw, and lets the
    // afterEach return before its first await on a green run.
    createdTaskTitles = createdTaskTitles.filter((t) => t !== taskTitle);

    // Cleanup
    await deleteTask(page, updatedTitle);
  });

  test("should change task status via the actions menu", async ({ page }) => {
    const uid = uniqueId();
    const taskTitle = `E2E Task ${uid}`;

    // Create
    await navigateToTasks(page);
    await createTask(page, taskTitle);
    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Change status
    await page
      .getByRole("row", { name: new RegExp(taskTitle, "i") })
      .getByTestId("task-actions-menu-btn")
      .first()
      .click({ force: true });
    await page
      .getByRole("menuitem", { name: "Change Status" })
      .click({ force: true });
    await page
      .getByRole("menuitem", { name: "Needs Attention" })
      .click({ force: true });

    await expectToast(page, /Task status updated/);

    // Cleanup
    await deleteTask(page, taskTitle);
  });

  test("should delete the task and verify removal", async ({ page }) => {
    const uid = uniqueId();
    const taskTitle = `E2E Task ${uid}`;

    // Create
    await navigateToTasks(page);
    await createTask(page, taskTitle);
    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Delete. Both halves of the proof now live in `deleteTask` — asserting the
    // same toast again here would only race the same 5 s lifetime
    // (toaster.tsx:19) for information the helper already established.
    await deleteTask(page, taskTitle);

    await expect(taskRows(page, taskTitle)).toHaveCount(0, { timeout: 10000 });
  });

  // --- Migrated from tasks.spec.ts (unique tests) ---

  test("should filter tasks by status", async ({ page }) => {
    await navigateToTasks(page);

    // Click the Status filter button and wait for the dropdown to open
    // Retry the click if the dropdown doesn't open (handles hydration timing)
    const statusButton = page.getByRole("button", { name: "Status", exact: true });
    await expect(async () => {
      await statusButton.click();
      await expect(page.getByText("Filter by Status")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });

    const inProgressCheckbox = page.getByRole("menuitemcheckbox", {
      name: "In Progress",
    });
    await expect(inProgressCheckbox).toBeChecked();

    const needsAttentionCheckbox = page.getByRole("menuitemcheckbox", {
      name: "Needs Attention",
    });
    await expect(needsAttentionCheckbox).toBeChecked();

    const completeCheckbox = page.getByRole("menuitemcheckbox", {
      name: "Complete",
    });
    await expect(completeCheckbox).not.toBeChecked();

    await completeCheckbox.click();
    await expect(completeCheckbox).toBeChecked();
  });

  test("should toggle task completion via checkbox", async ({ page }) => {
    const uid = uniqueId();
    const taskTitle = `E2E Toggle ${uid}`;

    await navigateToTasks(page);
    await createTask(page, taskTitle);
    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    const taskRow = page
      .getByRole("row", { name: new RegExp(taskTitle, "i") })
      .first();
    await taskRow
      .getByRole("button", { name: "Mark as complete" })
      .click({ force: true });
    await expectToast(page, /Task status updated/);

    // Show completed tasks in filter to find and delete
    await page
      .getByRole("button", { name: "Status", exact: true })
      .click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Complete" }),
    ).toBeVisible({ timeout: 5000 });
    await page
      .getByRole("menuitemcheckbox", { name: "Complete" })
      .click();
    await page.keyboard.press("Escape");

    // Wait for the task list to reload with the new filter (includes completed tasks)
    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    await deleteTask(page, taskTitle);
  });

  test("should start activity from task and redirect to activities", async ({
    page,
  }) => {
    const uid = uniqueId();
    const taskTitle = `E2E Activity Task ${uid}`;

    await stopRunningActivity(page);
    await navigateToTasks(page);
    await createTask(page, taskTitle, { activityType: E2E_ACTIVITY_TYPE });
    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // M-T-04 follow-up: replaced waitForTimeout(2000) — wait for the creation
    // toast to disappear rather than sleeping a fixed 2 000 ms.
    await safeWait(page, {
      condition: async () => {
        // Target the creation toast by text, not getByRole("status") — the
        // NotificationBell aria-live region also has role="status" and would
        // never be "not visible".
        await expect(page.getByText(/Task has been created/i)).not.toBeVisible();
      },
    }).catch(() => null); // acceptable if toast already gone

    // Use the actions menu to start the activity instead of the hover button,
    // which has opacity-0 and may not be reliably clickable in all environments
    const taskRow = page
      .getByRole("row", { name: new RegExp(taskTitle, "i") })
      .first();
    await taskRow
      .getByTestId("task-actions-menu-btn")
      .click({ force: true });
    await page
      .getByRole("menuitem", { name: "Start Activity" })
      .click({ force: true });

    // The row is written by startActivityFromTask under the TASK's title
    // (task.actions.ts:345, `activityName: task.title`). Register it before the
    // outcome is known: an assertion that throws below has still leaked one.
    startedActivityNames.push(taskTitle);

    // startActivityFromTask both toasts AND redirects to /dashboard/activities;
    // the navigation can clear the toast before it's asserted, so the toast
    // check is best-effort and the redirect URL is the reliable success signal.
    await expectToast(page, /Activity started from task/).catch(() => null);
    await expect(page).toHaveURL(/\/dashboard\/activities/, { timeout: 15000 });

    // Stop the running activity. Wait for the banner to go: the stop is a
    // server action like any other, and the old code left it in flight.
    const stopBtn = page.getByRole("button", { name: "Stop" });
    await stopBtn.waitFor({ state: "visible", timeout: 10000 });
    await stopBtn.click({ force: true });
    await stopBtn.waitFor({ state: "hidden", timeout: 10000 });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Cleanup — ACTIVITY FIRST. Stopping an activity does not remove it, and
    // deleteTaskById refuses to delete a task that still has one
    // (task.actions.ts:261-267, `tasks.cannotDeleteWithActivity`). Deleting the
    // task first therefore achieved neither: the destructive toast went
    // unread, and BOTH rows survived the run. That is E2E-B24's `Activity +1`
    // and one of its `Task +6`.
    await deleteActivity(page, taskTitle);

    // Cleanup task
    await navigateToTasks(page);
    await deleteTask(page, taskTitle);
  });

  test("should not allow starting activity on completed task", async ({
    page,
  }) => {
    const uid = uniqueId();
    const taskTitle = `E2E Completed ${uid}`;

    await stopRunningActivity(page);
    await navigateToTasks(page);
    await createTask(page, taskTitle, { activityType: E2E_ACTIVITY_TYPE });
    await expect(
      page.getByRole("row", { name: new RegExp(taskTitle, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Mark as complete
    const taskRow = page
      .getByRole("row", { name: new RegExp(taskTitle, "i") })
      .first();
    await taskRow
      .getByRole("button", { name: "Mark as complete" })
      .click({ force: true });
    await expectToast(page, /Task status updated/);

    // Show completed tasks
    await page
      .getByRole("button", { name: "Status", exact: true })
      .click({ force: true });
    await page
      .getByRole("menuitemcheckbox", { name: "Complete" })
      .click({ force: true });
    await page.keyboard.press("Escape");

    // Try to start activity — should show error
    const completedRow = page
      .getByRole("row", { name: new RegExp(taskTitle, "i") })
      .first();
    await completedRow
      .getByTestId("task-actions-menu-btn")
      .click({ force: true });
    await page
      .getByRole("menuitem", { name: "Start Activity" })
      .click({ force: true });

    await expectToast(
      page,
      // Substring match: the message is "You can't start an activity from a
      // completed or cancelled task." (activities.cannotStartFromClosedTask).
      /start an activity from a completed or cancelled task/,
    );

    await deleteTask(page, taskTitle);
  });
});
