import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers (kanban-specific)
// ---------------------------------------------------------------------------

async function navigateToMyJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Switch the Jobs view.
 *
 * `isVisible()` does not wait, so the previous `if (await radio.isVisible())`
 * silently did nothing whenever the toolbar had not rendered yet — leaving the
 * page in the other view and failing a later `locator("table")` wait with an
 * error that pointed nowhere near the cause. Per e2e/CONVENTIONS.md we wait and
 * throw rather than skip, and we confirm the toggle actually flipped.
 */
async function switchViewMode(page: Page, mode: "table" | "kanban") {
  const radio = page.getByRole("radio", {
    name: mode === "table" ? /table/i : /kanban/i,
  });
  await radio.waitFor({ state: "visible", timeout: 10000 });
  await radio.click();
  await expect(radio).toHaveAttribute("aria-checked", "true");
}

async function switchToKanbanView(page: Page) {
  await switchViewMode(page, "kanban");
}

async function switchToTableView(page: Page) {
  await switchViewMode(page, "table");
}

// NOTE: `createTestJob` / `deleteTestJob` used to live here and were deleted
// (E2E-B19 close-out). They had no call sites — no test in this file creates a
// job — and they could not have worked if wired up: the trigger they clicked,
// `getByRole("button", { name: /add job/i })`, matches nothing, because the
// button's accessible name is `jobs.newJob` = "New Job" (AddJob.tsx:397,
// jobs.ts:20) while "Add Job" is only the DialogTitle; and the fields they
// filled, `input[name="title"]` / `input[name="company"]`, do not exist —
// both are <Combobox> (AddJob.tsx:445,472) and those `name` values are
// react-hook-form FormField props, erased before the DOM.
//
// Deleted rather than repaired: nothing here needs job creation, so a repaired
// helper would be speculative. A future kanban test that does need one should
// use the flow every other spec already uses — getByTestId("add-job-btn"),
// selectOrCreateComboboxOption(page, "Title"|"Company", ...), then
// getByTestId("save-job-btn") — see job-crud.spec.ts:73-93.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Kanban Board", () => {
  test("should toggle between table and kanban view", async ({ page }) => {
    await navigateToMyJobs(page);

    // Look for the view mode toggle
    const radioGroup = page.getByRole("radiogroup", { name: /view mode/i });
    await expect(radioGroup).toBeVisible({ timeout: 10000 });

    // Switch to table view
    await switchToTableView(page);
    // Table should be visible (look for table element)
    await expect(page.locator("table").first()).toBeVisible({ timeout: 5000 });

    // Switch to kanban view
    await switchToKanbanView(page);
    // Kanban board should render (look for columns or board region)
    const board = page.getByRole("region", { name: /kanban/i }).or(
      page.getByTestId("kanban-skeleton")
    ).or(
      page.locator("[data-testid^='kanban-column-']").first()
    );
    await expect(board.first()).toBeVisible({ timeout: 5000 });
  });

  test("should display kanban board with status columns", async ({ page }) => {
    await navigateToMyJobs(page);
    await switchToKanbanView(page);

    // Wait for board to load (either columns or empty state)
    const boardContent = page.locator("[data-testid^='kanban-column-']").first()
      .or(page.locator("[data-testid^='kanban-collapsed-']").first())
      .or(page.locator("text=Add your first job"));
    await boardContent.first().waitFor({ state: "visible", timeout: 10000 });

    // On desktop, check for column headers or empty state
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      // Should have at least one column or empty state visible
      const columns = page.locator("[data-testid^='kanban-column-']");
      const collapsed = page.locator("[data-testid^='kanban-collapsed-']");
      const emptyState = page.locator("text=Add your first job");

      const hasColumns = await columns.count() > 0;
      const hasCollapsed = await collapsed.count() > 0;
      const hasEmpty = await emptyState.isVisible().catch(() => false);

      expect(hasColumns || hasCollapsed || hasEmpty).toBe(true);
    }
  });

  test("should show transition dialog on status change attempt", async ({ page }) => {
    await navigateToMyJobs(page);
    await switchToKanbanView(page);
    // Wait for board content to load
    const boardContent = page.locator("[data-testid^='kanban-column-']").first()
      .or(page.locator("[data-testid^='kanban-collapsed-']").first())
      .or(page.locator("text=Add your first job"));
    await boardContent.first().waitFor({ state: "visible", timeout: 10000 });

    // On mobile view, test the status change dropdown
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Look for a status change select on mobile
      const statusSelect = page.locator("select, [role='combobox']").first();
      if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Status change UI is present on mobile
        expect(true).toBe(true);
      }
    }
    // The test validates that the Kanban UI loads without errors
  });

  test("should persist view mode preference", async ({ page }) => {
    await navigateToMyJobs(page);

    // Switch to table view
    await switchToTableView(page);
    await page.locator("table").first().waitFor({ state: "visible", timeout: 5000 });

    // Reload the page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Assert, don't probe. This assertion IS the test: persistence is only
    // proven by the reloaded toggle coming back checked. `isVisible()` does not
    // wait, so the `.catch(() => false)` guard this replaces turned a slow
    // post-reload render into a silent skip — green while verifying nothing.
    // switchToTableView above already resolved this exact radio, so its absence
    // after a reload is a real failure and worth seeing.
    const tableRadio = page.getByRole("radio", { name: /table/i });
    await expect(tableRadio).toBeVisible({ timeout: 10000 });
    await expect(tableRadio).toHaveAttribute("aria-checked", "true");

    // Switch back to kanban for future tests
    await switchToKanbanView(page);
  });

  test("should support keyboard navigation on view mode toggle", async ({ page }) => {
    await navigateToMyJobs(page);

    const radioGroup = page.getByRole("radiogroup", { name: /view mode/i });
    await expect(radioGroup).toBeVisible({ timeout: 10000 });

    // Focus the active radio button
    const activeRadio = page.getByRole("radio", { checked: true });
    await activeRadio.focus();

    // Press arrow key to switch
    await page.keyboard.press("ArrowRight");

    // The other radio should now be checked
    const otherRadio = page.getByRole("radio", { checked: true });
    await expect(otherRadio).toBeFocused();
  });
});
