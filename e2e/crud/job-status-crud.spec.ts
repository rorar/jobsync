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
});
