import { test, expect, type Page } from "@playwright/test";
import { selectOrCreateComboboxOption, expectToast, uniqueId } from "../helpers";

/**
 * Welle 4 (F-AJ-09 / dynamic Kanban) happy-path: a user creates a custom status
 * in Settings → Statuses, sets it on a new job, and sees it as its own Kanban
 * column. Proves the per-user status flows end-to-end: Settings → form picker →
 * dynamic Kanban derivation. storageState handles auth.
 */

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific)
// ---------------------------------------------------------------------------

async function gotoStatusSettings(page: Page) {
  await page.goto("/dashboard/settings?section=statuses");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-status-btn").waitFor({ state: "visible", timeout: 15000 });
}

async function createStatus(page: Page, label: string) {
  await page.getByLabel("Status name").fill(label);
  await page.getByTestId("add-status-btn").click();
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 10000 });
}

async function gotoMyJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible", timeout: 15000 });
}

async function ensureTableView(page: Page) {
  const tableRadio = page.getByRole("radio", { name: "Table" });
  try {
    await tableRadio.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return; // toggle not rendered — nothing to switch
  }
  if ((await tableRadio.getAttribute("aria-checked")) !== "true") {
    await tableRadio.click();
    await expect(tableRadio).toHaveAttribute("aria-checked", "true");
  }
}

async function openEditDialog(page: Page, jobTitle: string) {
  await gotoMyJobs(page);
  await ensureTableView(page);
  await page
    .getByRole("row", { name: new RegExp(jobTitle, "i") })
    .getByTestId("job-actions-menu-btn")
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Edit Job" }).click();
  await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Custom JobStatus → dynamic Kanban", () => {
  test("create a status, set it on a job, see its Kanban column", async ({ page }) => {
    const uid = uniqueId();
    const statusLabel = `E2E Stage ${uid}`;
    const jobTitle = `E2E StatusJob ${uid}`;
    const company = `E2E Co ${uid}`;
    const location = `E2E Loc ${uid}`;

    // 1. Create a custom status in Settings (defaults to the first stage).
    await gotoStatusSettings(page);
    await createStatus(page, statusLabel);

    // 2. Create a job and choose the new status in the grouped picker.
    await gotoMyJobs(page);
    await page.getByTestId("add-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();

    await page
      .getByPlaceholder("Copy and paste job link here")
      .fill("https://example.com/careers/e2e-status");
    await selectOrCreateComboboxOption(page, "Title", "Create or Search title", jobTitle);
    await selectOrCreateComboboxOption(page, "Company", "Create or Search company", company);
    await selectOrCreateComboboxOption(page, "Location", "Create or Search location", location);
    await page.getByLabel("Job Source").click();
    await page.getByRole("option", { name: "Indeed" }).click();
    await page.locator(".tiptap").click();
    await page.locator(".tiptap").fill("E2E custom-status job description.");

    // Pick a resume (FK requirement).
    await page.getByLabel("Select Resume").click();
    const firstResume = page.getByRole("option").first();
    await firstResume.waitFor({ state: "visible", timeout: 10000 });
    await firstResume.click();

    // The grouped status combobox: open and choose the custom status.
    await page.getByTestId("status-combobox-trigger").click();
    await page.getByRole("option", { name: statusLabel }).click();
    await expect(page.getByTestId("status-combobox-trigger")).toContainText(statusLabel);

    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 3. In the Kanban view, the custom status has its own column.
    await gotoMyJobs(page);
    // The view toggle is a role="radio" segmented control; ensure Kanban is active.
    const kanbanToggle = page.getByRole("radio", { name: "Kanban" });
    if (await kanbanToggle.count()) {
      await kanbanToggle.first().click().catch(() => {});
    }
    await expect(page.getByText(statusLabel, { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });

    // 4. Cleanup — delete the job, then the (now history-only) status via the
    //    move-and-delete reassign dialog. Best-effort so a cleanup hiccup does
    //    not mask the assertions above.
    try {
      await gotoMyJobs(page);
      const row = page.getByRole("row", { name: new RegExp(jobTitle, "i") }).first();
      if (await row.count()) {
        await row.getByRole("button").last().click();
        await page.getByRole("menuitem", { name: /delete/i }).click();
        const confirm = page.getByRole("button", { name: /^delete$/i });
        if (await confirm.count()) await confirm.first().click();
        await expectToast(page, /deleted/i).catch(() => {});
      }
    } catch {
      /* best-effort cleanup */
    }

    try {
      await gotoStatusSettings(page);
      const value = statusLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const del = page.getByTestId(`status-delete-${value}`);
      if (await del.count()) {
        await del.first().click();
        // In-use (history) → move-and-delete dialog with a reassign picker.
        const reassign = page.getByTestId("reassign-select");
        if (await reassign.count()) {
          await reassign.click();
          await page.getByRole("option").first().click();
          await page.getByTestId("move-and-delete-btn").click();
        } else {
          // Not-in-use → simple confirm.
          await page.getByTestId("delete-confirm-btn").click().catch(() => {});
        }
      }
    } catch {
      /* best-effort cleanup */
    }
  });

  test("re-selecting the current interviewing status logs a new round (self-transition)", async ({
    page,
  }) => {
    test.setTimeout(180_000); // create + 2 edits + detail nav on a cold dev server
    const uid = uniqueId();
    const jobTitle = `E2E RoundJob ${uid}`;
    const company = `E2E RoundCo ${uid}`;
    const location = `E2E RoundLoc ${uid}`;

    // 1. Create a job (seeded default = Bookmarked; addJob writes 1 initial history entry).
    await gotoMyJobs(page);
    await page.getByTestId("add-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
    await page
      .getByPlaceholder("Copy and paste job link here")
      .fill("https://example.com/careers/e2e-round");
    await selectOrCreateComboboxOption(page, "Title", "Create or Search title", jobTitle);
    await selectOrCreateComboboxOption(page, "Company", "Create or Search company", company);
    await selectOrCreateComboboxOption(page, "Location", "Create or Search location", location);
    await page.getByLabel("Job Source").click();
    await page.getByRole("option", { name: "Indeed" }).click();
    await page.locator(".tiptap").click();
    await page.locator(".tiptap").fill("E2E self-transition round job description.");
    await page.getByLabel("Select Resume").click();
    const firstResume = page.getByRole("option").first();
    await firstResume.waitFor({ state: "visible", timeout: 10000 });
    await firstResume.click();
    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 2. Edit → move to Interview (forward transition; no round toggle yet because
    //    the status is CHANGING). Writes the 2nd history entry (bookmarked→interview).
    await openEditDialog(page, jobTitle);
    await page.getByTestId("status-combobox-trigger").click();
    // Interviewing is an applied stage, so the option's accessible name is
    // "Interview <marks-applied badge>" — match by substring, not exact.
    await page.getByRole("option", { name: /Interview/ }).first().click();
    await expect(page.getByTestId("status-combobox-trigger")).toContainText("Interview");
    // Status is changing → the round toggle must NOT be shown.
    await expect(page.getByTestId("log-interview-round-container")).toHaveCount(0);
    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 3. Edit again → status is ALREADY Interview → the explicit round toggle appears.
    //    Toggle it on + save → writes the 3rd history entry (interview→interview round).
    await openEditDialog(page, jobTitle);
    await expect(page.getByTestId("status-combobox-trigger")).toContainText("Interview");
    const roundToggle = page.getByTestId("log-interview-round-container");
    await expect(roundToggle).toBeVisible();
    await roundToggle.getByRole("switch").click();
    await page.getByTestId("save-job-btn").click();
    await expect(page.getByTestId("add-job-dialog-title")).not.toBeVisible({ timeout: 15000 });

    // 4. Open the job detail → Status History lists THREE entries: initial (bookmarked),
    //    the bookmarked→interview move, and the interview→interview round.
    await gotoMyJobs(page);
    await ensureTableView(page);
    const detailHref = await page
      .getByRole("row", { name: new RegExp(jobTitle, "i") })
      .getByRole("link", { name: new RegExp(jobTitle, "i") })
      .first()
      .getAttribute("href");
    expect(detailHref).toMatch(/\/dashboard\/myjobs\//);
    await page.goto(detailHref!);
    await page.waitForLoadState("domcontentloaded");
    // The Status History card title proves we're on the detail page with the timeline.
    await expect(page.getByText("Status History").first()).toBeVisible({ timeout: 15000 });
    const historyList = page.getByRole("list", { name: "Status History" });
    await expect(historyList).toBeVisible({ timeout: 15000 });
    await expect(historyList.getByRole("listitem")).toHaveCount(3);

    // 5. Cleanup — delete the job (best-effort).
    try {
      await gotoMyJobs(page);
      await ensureTableView(page);
      const row = page.getByRole("row", { name: new RegExp(jobTitle, "i") }).first();
      if (await row.count()) {
        await row.getByTestId("job-actions-menu-btn").first().click();
        await page.getByRole("menuitem", { name: /delete/i }).click();
        const confirm = page.getByRole("button", { name: /^delete$/i });
        if (await confirm.count()) await confirm.first().click();
        await expectToast(page, /deleted/i).catch(() => {});
      }
    } catch {
      /* best-effort cleanup */
    }
  });
});
