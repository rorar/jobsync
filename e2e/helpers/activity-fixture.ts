import { expect, type Page } from "@playwright/test";
import { expectToast, rowsByText } from "./index";

/**
 * Shared activity fixture.
 *
 * `activity-crud` and `task-crud` both delete activities: the first as the
 * behaviour under test, the second because `deleteTaskById` refuses while
 * `task.activity` exists (`src/actions/task.actions.ts:261-267`), so a task test
 * must stop and remove its activity before it can remove its task. Same table,
 * same three clicks, same two proofs — and until 2026-09-14, two private copies.
 *
 * They had drifted, and over each other's gaps:
 *
 * - `task-crud`'s copy had the pre-assert below and `activity-crud`'s did not.
 * - `activity-crud`'s copy carried the E2E-B40 rationale on `toHaveCount(0)` and
 *   `task-crud`'s did not — although task-crud is where E2E-B40 was measured, and
 *   its own leak (6 of 7 tasks, reported green) is the evidence that comment
 *   exists to preserve.
 *
 * That is the exact failure mode `e2e/CONVENTIONS.md` § "Shared Fixtures" already
 * records for the resume fixture ("the fix had to be found six times and was
 * found twice"). Two copies are below the threshold anyone greps for, which is
 * why this pair survived the pass that unified the other six.
 *
 * Merged here without choosing between them: the pre-assert applies to both
 * callers (it is a precondition, not a post-state, so `CONVENTIONS.md`'s
 * "add a named option" guidance does not apply), and both comments are kept.
 *
 * Bookkeeping stays with the caller. Each spec tracks its created activities in
 * its own module-scoped array under its own name (`createdActivityNames` in
 * `activity-crud`, `startedActivityNames` in `task-crud`), and each wraps the
 * loud deleter in a local `deleteActivityTracked` that de-registers after it
 * returns — the same `X` / `XTracked` split `resume-fixture`'s `deleteResume` and
 * `keyboard-ux`'s `deleteResumeTracked` already use. Anything that throws in here
 * therefore skips the caller's de-registration and stays tracked, which is
 * exactly the case the teardown net exists for.
 */

/**
 * The activity's row(s) in the activities table, matched by visible text.
 *
 * A DOM locator, deliberately, not `getByRole("row")`. Radix marks the rest of
 * the page `aria-hidden` while a modal is open or closing, so the role engine
 * reports zero rows for that whole window — an assertion that the row is GONE is
 * then satisfied by the dialog being open rather than by the delete having
 * landed. `rowsByText` (`e2e/helpers/index.ts`) has the mechanism and the
 * measurement: E2E-B40, found in `task-crud`, whose leak the `deleteActivity`
 * comment already cited while repeating its cause.
 */
export function activityRows(page: Page, activityName: string) {
  return rowsByText(page, activityName);
}

/**
 * Delete the activity named `activityName` from the activities table, loudly.
 *
 * Throws on any failed step. Callers use this where the deletion is part of what
 * the test asserts, or where a later step depends on it having landed — in
 * `task-crud` the task deletion that follows does, and an activity delete left in
 * flight surfaces there as `tasks.cannotDeleteWithActivity` on a different line.
 *
 * For teardown use `purgeActivity` instead: a throwing hook would replace the
 * real test failure with its own.
 */
export async function deleteActivity(page: Page, activityName: string) {
  const row = activityRows(page, activityName).first();

  // `getAllActivities` filters on `endTime: { not: null }`
  // (`src/actions/activity.actions.ts:69-72`), so a still-RUNNING activity is not
  // in this table at all. Assert the row first: without it the failure surfaces
  // as a missing "Toggle menu" button and reads like a markup problem rather
  // than "the stop never landed".
  await expect(row).toBeVisible({ timeout: 15000 });

  // The ActivitiesTable dropdown trigger has sr-only text "Toggle menu"
  await row.getByRole("button", { name: "Toggle menu" }).click({ force: true });
  // Menu item text is t("common.delete") = "Delete"
  await page.getByRole("menuitem", { name: /Delete/ }).click({ force: true });
  // DeleteAlertDialog's confirm button is t("common.delete") = "Delete"
  await page.getByRole("button", { name: "Delete" }).click({ force: true });

  // Clicking is not deleting, and the row leaving the table is not enough
  // either — that was this comment's original claim, and task-crud has since
  // measured it wrong. `ActivitiesTable.deleteActivity` (:58-72) toasts
  // `activities.deletedSuccess` only after the server action resolved, and
  // `expectToast` reads the toast viewport through a CSS attribute selector, so
  // no modal can hide it. Waiting for it is what stops the request being
  // abandoned when the page closes at end of test.
  await expectToast(page, /Activity has been deleted/);

  // And the list agrees. Only meaningful since `activityRows` became a DOM
  // locator: under the role engine this assertion was satisfied by the modal's
  // own `aria-hidden`, which is how task-crud leaked 6 of the 7 tasks it created
  // while reporting green (E2E-B40).
  await expect(activityRows(page, activityName)).toHaveCount(0, {
    timeout: 15000,
  });
}

/**
 * Teardown-only deleter: same clicks, no assertions, never throws.
 *
 * Deliberately NOT `deleteActivity`: that one is the flow the tests exercise and
 * must fail loudly when a step does not work, whereas teardown must stay silent
 * so it cannot turn one failed test into a failed run. Both callers re-check
 * afterwards and warn, so a failure here is not silent.
 */
export async function purgeActivity(page: Page, activityName: string) {
  try {
    const row = activityRows(page, activityName).first();
    await row.waitFor({ state: "visible", timeout: 5000 });
    await row.getByRole("button", { name: "Toggle menu" }).click({ force: true });
    await page.getByRole("menuitem", { name: /Delete/ }).click({ force: true });
    await page.getByRole("button", { name: "Delete" }).click({ force: true });
    // `toHaveCount(0)` rather than `waitFor({ state: "detached" })`: detached is
    // also true of a locator that matches nothing, so under the old role-based
    // `activityRows` this resolved instantly against the modal's `aria-hidden`
    // and the net "succeeded" without deleting anything (E2E-B40).
    await expect(activityRows(page, activityName)).toHaveCount(0, {
      timeout: 15000,
    });
  } catch {
    // swallow-ok: cleanup net — the activity may already be gone, and a throwing
    // hook would replace the real test failure with its own.
  }
}
