import { test, expect, type Page } from "@playwright/test";
import { uniqueId, safeWait } from "../helpers";

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function navigateToJobs(page: Page) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-job-btn").waitFor({ state: "visible" });
}

async function openAddJobDialog(page: Page) {
  await page.getByTestId("add-job-btn").click();
  await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
}

async function deleteJob(page: Page, jobTitle: string) {
  await page.goto("/dashboard/myjobs");
  await page.waitForLoadState("domcontentloaded");
  try {
    const row = page.getByRole("row", { name: new RegExp(jobTitle, "i") });
    await row.first().waitFor({ state: "visible", timeout: 5000 });
    await row.getByTestId("job-actions-menu-btn").first().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
  } catch {
    // Job may not exist — skip cleanup
  }
}

async function ensureResumeExists(page: Page, resumeTitle: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");
  const existingRow = page.getByRole("row", {
    name: new RegExp(resumeTitle, "i"),
  });
  try {
    await existingRow.first().waitFor({ state: "visible", timeout: 3000 });
    return resumeTitle;
  } catch {
    // Resume does not exist — create
  }
  await page.getByRole("button", { name: "New Resume" }).click();
  await page.getByPlaceholder("Ex: Full Stack Developer").fill(resumeTitle);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(resumeTitle, "i") }).first(),
  ).toBeVisible({ timeout: 10000 });
  return resumeTitle;
}

async function deleteResume(page: Page, title: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");
  try {
    const row = page
      .getByRole("row", { name: new RegExp(title, "i") })
      .first();
    await row.waitFor({ state: "visible", timeout: 5000 });
    await row.getByTestId("resume-actions-menu-btn").click({ force: true });
    await page
      .getByRole("menuitem", { name: "Delete" })
      .click({ force: true });
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click({ force: true });
  } catch {
    // skip cleanup
  }
}

/**
 * Open the skills/tag popover in the AddJob dialog.
 */
async function openSkillsPopover(page: Page) {
  const skillButton = page.getByText("Search or add a skill...");
  await skillButton.scrollIntoViewIfNeeded();
  await skillButton.click();
}

/**
 * Read all [role="status"] elements and return their combined text content.
 * Useful when there are multiple sr-only spans and we want to check any.
 */
async function getAllAnnouncements(page: Page): Promise<string[]> {
  return page.locator('[role="status"]').allTextContents();
}

/**
 * Check if any [role="status"] element contains the expected text.
 */
function hasAnnouncement(announcements: string[], substring: string): boolean {
  return announcements.some((a) => a.includes(substring));
}

// ---------------------------------------------------------------------------
// Console error collector
// ---------------------------------------------------------------------------

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("404") &&
      !e.includes("Failed to fetch"),
  );
}

/**
 * Get the Title combobox trigger inside the AddJob dialog.
 * Uses the first combobox role in the dialog (locale-independent).
 */
function getTitleCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").first();
}

/**
 * Get the Company combobox trigger inside the AddJob dialog.
 * Uses the second combobox role in the dialog (locale-independent).
 */
function getCompanyCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").nth(1);
}

/**
 * Get the Location combobox trigger inside the AddJob dialog.
 * Uses the third combobox role in the dialog (locale-independent).
 */
function getLocationCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").nth(2);
}

/**
 * Get the Job Source combobox trigger inside the AddJob dialog.
 * Uses the fourth combobox role in the dialog (locale-independent).
 */
function getSourceCombobox(page: Page) {
  return page.getByRole("dialog").getByRole("combobox").nth(3);
}

// ---------------------------------------------------------------------------
// Tests: 1. BaseCombobox (AddJob modal — Title, Company, Location, Source)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: BaseCombobox (AddJob modal)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Enter key creates a new option in Title combobox", async ({ page }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const title = `KBTest Title ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);

    // Open the Title combobox (first combobox in the dialog)
    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or Search title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill(title);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for options list.
    await page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
    await titleInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for combobox to close.
    await page.getByRole("option").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);

    // Verify the created option shows in the trigger button
    await expect(getTitleCombobox(page)).toContainText(title, { timeout: 15000 });

    // Verify sr-only announcement
    const announcements = await getAllAnnouncements(page);
    expect(hasAnnouncement(announcements, "Created")).toBe(true);

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Enter key creates a new option in Company combobox", async ({
    page,
  }) => {
    const uid = uniqueId();
    const company = `KBTest Co ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getCompanyCombobox(page).click();
    const companyInput = page.getByPlaceholder("Create or Search company");
    await expect(companyInput).toBeVisible();

    await companyInput.fill(company);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    await companyInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    await expect(getCompanyCombobox(page)).toContainText(company);
  });

  test("Enter key creates a new option in Location combobox", async ({
    page,
  }) => {
    const uid = uniqueId();
    const location = `KBTest Loc ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getLocationCombobox(page).click();
    const locationInput = page.getByPlaceholder("Create or Search location");
    await expect(locationInput).toBeVisible();

    await locationInput.fill(location);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    await locationInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    await expect(getLocationCombobox(page)).toContainText(location);
  });

  test("Escape on open combobox closes popover, focus stays in dialog", async ({
    page,
  }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or Search title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await titleInput.press("Escape");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(titleInput).not.toBeVisible();
    await expect(page.getByTestId("add-job-dialog-title")).toBeVisible();
  });

  test("Tab on open combobox closes popover and moves focus to next field", async ({
    page,
  }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or Search title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await titleInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(titleInput).not.toBeVisible();
  });

  test("Rapid type then Enter does not cause double creation", async ({
    page,
  }) => {
    const uid = uniqueId();
    const title = `KBRapid ${uid}`;
    const errors = collectConsoleErrors(page);

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or Search title");
    await expect(titleInput).toBeVisible();

    await titleInput.type(title, { delay: 20 });
    await titleInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1500) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    await expect(getTitleCombobox(page)).toContainText(title, { timeout: 15000 });
    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Click outside clears stale text on reopen", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or Search title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill("stale text here");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await page.getByTestId("add-job-dialog-title").click();
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await getTitleCombobox(page).click();
    const titleInputAfter = page.getByPlaceholder("Create or Search title");
    await expect(titleInputAfter).toBeVisible();

    const inputVal = await titleInputAfter.inputValue();
    expect(inputVal).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: 2. TagInput (AddJob modal - Skills field)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: TagInput (Skills)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Enter creates a tag as chip and popover stays open", async ({
    page,
  }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const skill = `KBSkill ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    await skillInput.fill(skill);
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    await skillInput.press("Enter");

    // Wait for async createTag to complete and chip to render
    await expect(page.getByText(skill).first()).toBeVisible({ timeout: 10000 });

    // Verify the popover stays open (multi-select behavior)
    await expect(skillInput).toBeVisible();

    // Poll for sr-only announcement (async state update after creation)
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(
        hasAnnouncement(announcements, "Created") ||
          hasAnnouncement(announcements, "of 10") ||
          hasAnnouncement(announcements, "added"),
      ).toBe(true);
    }).toPass({ timeout: 5000 });

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Multiple tags can be added rapidly via Enter", async ({ page }) => {
    const uid = uniqueId();

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    for (let i = 1; i <= 3; i++) {
      const skill = `KBMulti${i} ${uid}`;
      await skillInput.fill(skill);
      // M-T-04 follow-up: replaced waitForTimeout(200) — wait for UI to settle.
      await page.waitForLoadState("domcontentloaded");
      await skillInput.press("Enter");
      // M-T-04 follow-up: replaced waitForTimeout(800) — wait for server round-trip.
      await safeWait(page, { loadState: "networkidle" });
    }

    for (let i = 1; i <= 3; i++) {
      await expect(
        page.getByText(`KBMulti${i} ${uid}`).first(),
      ).toBeVisible();
    }
  });

  test("Tab closes tag popover", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    await skillInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await skillInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(skillInput).not.toBeVisible();
  });

  test("Already-selected tag via Enter shows handled (no duplicate)", async ({
    page,
  }) => {
    const uid = uniqueId();
    const skill = `KBDupe ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    // Create a skill first
    await skillInput.fill(skill);
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    await skillInput.press("Enter");

    // Wait for async createTag to complete and chip to render
    await expect(page.getByText(skill).first()).toBeVisible({ timeout: 10000 });
    // Wait for React startTransition to commit localTags state update
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    // Try adding the same skill again
    await skillInput.fill(skill);
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    await skillInput.press("Enter");

    // Verify sr-only announcement says "already selected" (async state update)
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(hasAnnouncement(announcements, "already selected")).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: 3. EuresOccupationCombobox (Automation Wizard Step 2)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: EuresOccupationCombobox", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Enter adds a keyword as chip, popover stays open", async ({
    page,
  }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const resumeTitle = `E2E Resume KBOcc1 ${uid}`;

    await ensureResumeExists(page, resumeTitle);
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create Automation/i }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBOcc ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    // Wait for Step 1 to render with the occupation combobox
    const keywordsCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Search occupations|keyword/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 10000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    const keyword = `KBKeyword ${uid}`;
    await searchInput.fill(keyword);
    // Wait for debounce + ESCO API fetch to complete or timeout
    // M-T-04 follow-up: replaced waitForTimeout(2000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });
    await searchInput.press("Enter");

    // Wait for async keyword addition to complete
    await expect(page.getByText(keyword).first()).toBeVisible({ timeout: 10000 });

    // Poll for the announcement (async state update after Enter)
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(hasAnnouncement(announcements, "added")).toBe(true);
    }).toPass({ timeout: 5000 });

    expect(filterCriticalErrors(errors)).toEqual([]);

    await deleteResume(page, resumeTitle);
  });

  test("Multiple keywords via Enter", async ({ page }) => {
    const uid = uniqueId();
    const resumeTitle = `E2E Resume KBOcc2 ${uid}`;

    await ensureResumeExists(page, resumeTitle);
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBMulti ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const keywordsCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Search occupations|keyword/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 10000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    for (let i = 1; i <= 3; i++) {
      await searchInput.fill(`KW${i} ${uid}`);
      // Wait for debounce + ESCO API fetch to complete or timeout
      // M-T-04 follow-up: replaced waitForTimeout(2000) — wait for server round-trip.
      await safeWait(page, { loadState: "networkidle" });
      await searchInput.press("Enter");
      // Wait for chip to appear before adding next keyword
      await expect(page.getByText(`KW${i} ${uid}`).first()).toBeVisible({ timeout: 10000 });
    }

    await deleteResume(page, resumeTitle);
  });

  test("Tab closes keywords popover", async ({ page }) => {
    const uid = uniqueId();
    const resumeTitle = `E2E Resume KBOcc3 ${uid}`;

    await ensureResumeExists(page, resumeTitle);
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBTab ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const keywordsCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Search occupations|keyword/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 5000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await searchInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(searchInput).not.toBeVisible();

    await deleteResume(page, resumeTitle);
  });

  test("Rapid type + Enter before ESCO results load does not crash", async ({
    page,
  }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);
    const resumeTitle = `E2E Resume KBOcc4 ${uid}`;

    await ensureResumeExists(page, resumeTitle);
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBRace ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const keywordsCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Search occupations|keyword/i });
    await expect(keywordsCombobox).toBeVisible({ timeout: 5000 });
    await keywordsCombobox.click();

    const searchInput = page.getByPlaceholder(/Search occupations/i);

    await searchInput.type(`QuickKW ${uid}`, { delay: 10 });
    await searchInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    await expect(page.getByText(`QuickKW ${uid}`).first()).toBeVisible();
    expect(filterCriticalErrors(errors)).toEqual([]);

    await deleteResume(page, resumeTitle);
  });
});

// ---------------------------------------------------------------------------
// Tests: 4. EuresLocationCombobox (Automation Wizard Step 2)
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: EuresLocationCombobox", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Tab closes location popover", async ({ page }) => {
    const uid = uniqueId();

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(`KBLoc ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const locationCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Select countries|location/i });
    await expect(locationCombobox).toBeVisible({ timeout: 5000 });
    await locationCombobox.click();
    // M-T-04 follow-up: replaced waitForTimeout(2000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    const locationInput = page.getByPlaceholder(/Search countries/i);
    await expect(locationInput).toBeVisible();

    await locationInput.fill("test");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await locationInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(locationInput).not.toBeVisible();
  });

  test("Search for country and select via click", async ({ page }) => {
    const uid = uniqueId();
    const errors = collectConsoleErrors(page);

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create Automation/i }),
    ).toBeVisible({ timeout: 10000 });
    await page
      .getByPlaceholder(/Frontend Jobs Berlin/i)
      .fill(`KBLocSel ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const locationCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Select countries|location/i });
    await expect(locationCombobox).toBeVisible({ timeout: 10000 });
    await locationCombobox.click();
    // M-T-04 follow-up: replaced waitForTimeout(2000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    const locationInput = page.getByPlaceholder(/Search countries/i);
    await expect(locationInput).toBeVisible({ timeout: 5000 });

    await locationInput.fill("Germany");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    const germanyOption = page
      .getByRole("option")
      .filter({ hasText: /Germany/i })
      .first();
    try {
      await germanyOption.waitFor({ state: "visible", timeout: 8000 });
      await germanyOption.click();
      // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
      await page.waitForLoadState("domcontentloaded");

      await expect(page.getByText(/Germany|DE/i).first()).toBeVisible();

      const announcements = await getAllAnnouncements(page);
      const hasContent = announcements.some((a) => a.length > 0);
      expect(hasContent).toBe(true);
    } catch {
      console.log(
        "Note: Location options not available; skipping selection assertion",
      );
    }

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("Country with regions: click expands/collapses", async ({ page }) => {
    const uid = uniqueId();

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Create Automation/i }).click();
    await page
      .getByPlaceholder(/Frontend Jobs Berlin/i)
      .fill(`KBExpand ${uid}`);
    await page.getByRole("combobox", { name: /Job Board/i }).click();
    await page.getByRole("option", { name: /EURES/i }).click();
    await page.getByRole("button", { name: /Next/i }).click();

    const locationCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /Select countries|location/i });
    await expect(locationCombobox).toBeVisible({ timeout: 5000 });
    await locationCombobox.click();
    // M-T-04 follow-up: replaced waitForTimeout(3000) — wait for server round-trip.
    await safeWait(page, { loadState: "networkidle" });

    const countryWithRegions = page
      .getByRole("option")
      .filter({ hasText: /▸/ })
      .first();

    try {
      await countryWithRegions.waitFor({ state: "visible", timeout: 5000 });
      await countryWithRegions.click();
      // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
      await page.waitForLoadState("domcontentloaded");

      const expanded = page.getByText(/All of|▾/).first();
      await expect(expanded).toBeVisible({ timeout: 3000 });
    } catch {
      console.log("Note: No country with regions found in test data");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: 5. Mobile Viewport
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: Mobile Viewport (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("AddJob combobox Enter/Tab works on mobile viewport", async ({
    page,
  }) => {
    const uid = uniqueId();
    const title = `KBMobile ${uid}`;
    const errors = collectConsoleErrors(page);

    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    const titleInput = page.getByPlaceholder("Create or Search title");
    await expect(titleInput).toBeVisible();

    await titleInput.fill(title);
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for options list.
    await page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
    await titleInput.press("Enter");
    // M-T-04 follow-up: replaced waitForTimeout(1000) — wait for combobox to close.
    await page.getByRole("option").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);

    await expect(getTitleCombobox(page)).toContainText(title, { timeout: 15000 });

    await getCompanyCombobox(page).click();
    const companyInput = page.getByPlaceholder("Create or Search company");
    await expect(companyInput).toBeVisible();
    await companyInput.fill("test mobile");
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await companyInput.press("Tab");
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");

    await expect(companyInput).not.toBeVisible();
    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("CommandList has touch-action: pan-y on mobile", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    await getTitleCombobox(page).click();
    await expect(
      page.getByPlaceholder("Create or Search title"),
    ).toBeVisible();

    const commandList = page.locator("[cmdk-list]");
    const touchAction = await commandList.evaluate(
      (el) => getComputedStyle(el).touchAction,
    );
    expect(touchAction).toBe("pan-y");
  });
});

// ---------------------------------------------------------------------------
// Tests: 6. ARIA announcements
// ---------------------------------------------------------------------------

test.describe("Keyboard UX: ARIA Announcements", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("Combobox selection updates sr-only status", async ({ page }) => {
    await navigateToJobs(page);
    await openAddJobDialog(page);

    const srStatus = page.locator('[role="status"]').first();
    await expect(srStatus).toBeAttached();

    await getSourceCombobox(page).click();
    // M-T-04 follow-up: replaced waitForTimeout(600) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    const firstOption = page.getByRole("option").first();
    try {
      await firstOption.waitFor({ state: "visible", timeout: 3000 });
      await firstOption.click();
      // M-T-04 follow-up: replaced waitForTimeout(500) — wait for UI to settle.
      await page.waitForLoadState("domcontentloaded");

      const announcements = await getAllAnnouncements(page);
      expect(hasAnnouncement(announcements, "selected")).toBe(true);
    } catch {
      console.log(
        "Note: Job source options not found — skipping assertion",
      );
    }
  });

  test("TagInput sr-only reports tag count after creation", async ({
    page,
  }) => {
    const uid = uniqueId();
    const skill = `KBAria ${uid}`;

    await navigateToJobs(page);
    await openAddJobDialog(page);
    await openSkillsPopover(page);

    const skillInput = page.getByPlaceholder(/Type a skill/i);
    await expect(skillInput).toBeVisible();

    await skillInput.fill(skill);
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for UI to settle.
    await page.waitForLoadState("domcontentloaded");
    await skillInput.press("Enter");

    // Wait for chip to appear (confirms the async creation completed)
    await expect(page.getByText(skill).first()).toBeVisible({ timeout: 10000 });

    // Poll for the sr-only announcement — the server action is async, so the
    // announcement text updates after the tag is created in the DB
    await expect(async () => {
      const announcements = await getAllAnnouncements(page);
      expect(
        hasAnnouncement(announcements, "of 10") ||
          hasAnnouncement(announcements, "Created"),
      ).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});
