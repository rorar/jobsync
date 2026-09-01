import { expect, type Page } from "@playwright/test";
import { expectToast } from "./index";

/**
 * Shared resume fixture.
 *
 * Six specs need a resume to exist before they can do anything at all: the
 * AddJob form defaults `resume=""` and hits a P2003 FK violation on submit, and
 * the "Create Automation" button stays disabled until the profile has one. Each
 * of those specs used to carry its own near-identical copy of the two functions
 * below.
 *
 * That duplication is not cosmetic. `898a5119` (2026-04-06) added a second
 * submit button ("Save & Open") to the Create Resume dialog *and* renamed the
 * success toast. The repair had to be found in six places, was found in two,
 * and the suite stayed broken for five months. One copy is one place to fix.
 *
 * `profile-crud.spec.ts` deliberately does NOT import these — deleting a resume
 * is the behaviour under test there, not teardown. See the comment on its own
 * `deleteResumeAndVerifyGone`.
 */

/**
 * Ensure a resume titled `resumeTitle` exists, creating it if it does not.
 * Returns the title, so callers can hand it straight to a form.
 *
 * Leaves the browser on `/dashboard/profile`; every caller navigates onwards.
 *
 * `confirmWith` selects the signal that proves a *newly created* resume landed
 * (the early-return path always waits for the row):
 *
 * - `"toast"` (default) — the success toast, i.e. the server action resolved.
 * - `"row"` — the resume's own row in the table, i.e. the list has re-rendered.
 *   A later signal, and the only one `keyboard-ux` has ever used. Turning it on
 *   for the other five would be adding an assertion they never made.
 */
export async function ensureResumeExists(
  page: Page,
  resumeTitle: string,
  { confirmWith = "toast" }: { confirmWith?: "toast" | "row" } = {},
): Promise<string> {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");

  const existingRow = page.getByRole("row", {
    name: new RegExp(resumeTitle, "i"),
  });
  try {
    await existingRow.first().waitFor({ state: "visible", timeout: 3000 });
    return resumeTitle;
  } catch {
    // Resume does not exist yet — create one
  }

  await page.getByRole("button", { name: "New Resume" }).click();
  await page.getByPlaceholder("Ex: Full Stack Developer").fill(resumeTitle);
  // exact: true — the form also has a "Save & Open" button; without exact the
  // "Save" matcher is ambiguous (strict-mode violation).
  await page.getByRole("button", { name: "Save", exact: true }).click();

  if (confirmWith === "row") {
    await expect(existingRow.first()).toBeVisible({ timeout: 10000 });
  } else {
    await expectToast(page, /Resume created successfully/i);
  }
  return resumeTitle;
}

/**
 * Delete the resume titled `title`, tolerating its absence.
 *
 * This is teardown: a cleanup step that throws would mask the assertion failure
 * that left the data behind in the first place, so a missing row is not an
 * error here.
 */
export async function deleteResume(page: Page, title: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");
  const row = page
    .getByRole("row", { name: new RegExp(title, "i") })
    .first();
  try {
    await row.waitFor({ state: "visible", timeout: 5000 });
    await row.getByTestId("resume-actions-menu-btn").click({ force: true });
    await page.getByRole("menuitem", { name: "Delete" }).click({ force: true });
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click({ force: true });
  } catch {
    // Resume may not exist — skip cleanup
  }
}
