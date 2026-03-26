import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure at least one resume exists (required for automation creation).
 * Creates a uniquely named resume if none with the given title exists.
 */
async function ensureResumeExists(
  page: Page,
  resumeTitle: string,
): Promise<string> {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("networkidle");

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
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    /Resume title has been/,
    { timeout: 10000 },
  );
  return resumeTitle;
}

async function deleteResume(page: Page, title: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("networkidle");
  const row = page
    .getByRole("row", { name: new RegExp(title, "i") })
    .first();
  try {
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
    // Resume may not exist — skip cleanup
  }
}

async function navigateToAutomations(page: Page) {
  await page.goto("/dashboard/automations");
  await page.waitForLoadState("networkidle");
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
  await page.getByRole("button", { name: /Create Automation/i }).click();
  await expect(
    page.getByRole("heading", { name: /Create Automation/i }),
  ).toBeVisible();

  // Step 1: Basics
  await page.getByPlaceholder(/Frontend Jobs Berlin/i).fill(opts.name);
  await page.getByRole("combobox", { name: /Job Board/i }).click();
  await page.getByRole("option", { name: /EURES/i }).click();
  await page.getByRole("button", { name: /Next/i }).click();

  // Step 2: Search (Keywords + Location)
  const keywordsCombobox = page
    .getByRole("combobox")
    .filter({ hasText: /Search occupations|keyword/i });
  if (await keywordsCombobox.isVisible().catch(() => false)) {
    await keywordsCombobox.click();
    const searchInput = page.getByPlaceholder(/Search occupations/i);
    await searchInput.fill(opts.keywords);
    await page.waitForTimeout(800);
    const firstOption = page.getByRole("option").first();
    try {
      await firstOption.waitFor({ state: "visible", timeout: 5000 });
      await firstOption.click();
    } catch {
      await searchInput.press("Enter");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  const locationCombobox = page
    .getByRole("combobox")
    .filter({ hasText: /Select countries|location/i });
  if (await locationCombobox.isVisible().catch(() => false)) {
    await locationCombobox.click();
    await page.waitForTimeout(2000);
    const locationInput = page.getByPlaceholder(/Search countries/i);
    await locationInput.fill(opts.location);
    await page.waitForTimeout(1000);
    const firstLocOption = page.getByRole("option").first();
    try {
      await firstLocOption.waitFor({ state: "visible", timeout: 8000 });
      await firstLocOption.click();
    } catch {
      // fallback
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
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
}

async function deleteAutomation(page: Page, name: string) {
  await navigateToAutomations(page);
  const card = page.locator("a", { hasText: name }).first();
  try {
    await card.waitFor({ state: "visible", timeout: 5000 });
    const moreButton = card.getByRole("button").first();
    await moreButton.click({ force: true });
    await page.getByRole("menuitem", { name: /Delete/i }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /Delete/i })
      .click();
    await expect(page.getByRole("status").first()).toContainText(
      /Automation deleted|deleted/i,
      { timeout: 10000 },
    );
  } catch {
    // Automation may not exist — skip cleanup
  }
}

// ---------------------------------------------------------------------------
// Tests — each test is self-contained (create → assert → cleanup)
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Automation CRUD", () => {
  test("should create an automation through the 6-step wizard", async ({
    page,
  }) => {
    const uid = Date.now().toString(36);
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

    await page.waitForTimeout(3000);
    const dialogStillOpen = await page
      .getByRole("dialog")
      .isVisible()
      .catch(() => false);
    if (dialogStillOpen) {
      await page.getByRole("button", { name: "Close" }).click();
    }

    await page.goto("/dashboard/automations");
    await page.waitForLoadState("networkidle");
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
    const uid = Date.now().toString(36);
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
    await page.waitForTimeout(3000);
    const dialogStillOpen = await page
      .getByRole("dialog")
      .isVisible()
      .catch(() => false);
    if (dialogStillOpen) {
      await page.getByRole("button", { name: "Close" }).click();
    }

    // Verify
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(automationName).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("eures").first()).toBeVisible();
    await expect(page.getByText("active").first()).toBeVisible();

    // Cleanup
    await deleteAutomation(page, automationName);
    await deleteResume(page, resumeTitle);
  });

  test("should edit an automation name", async ({ page }) => {
    const uid = Date.now().toString(36);
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
    await page.waitForTimeout(3000);
    const dialogStillOpen = await page
      .getByRole("dialog")
      .isVisible()
      .catch(() => false);
    if (dialogStillOpen) {
      await page.getByRole("button", { name: "Close" }).click();
    }

    // Navigate to list and verify the automation exists
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(automationName).first()).toBeVisible({
      timeout: 10000,
    });

    // Open dropdown menu on the automation card and click Edit
    const card = page.locator("a", { hasText: automationName }).first();
    const moreButton = card.getByRole("button").first();
    await moreButton.click({ force: true });
    await page.getByRole("menuitem", { name: /Edit/i }).click();

    // The wizard opens in edit mode — Step 1: change the name
    await expect(
      page.getByRole("heading", { name: /Edit Automation/i }),
    ).toBeVisible({ timeout: 8000 });
    const nameInput = page.getByPlaceholder(/Frontend Jobs Berlin/i);
    await nameInput.clear();
    await nameInput.fill(updatedName);
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
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(updatedName)).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /Update Automation/i }).click();

    // Verify toast and updated name in the list
    await expect(page.getByText(/Automation Updated/i).first()).toBeVisible({
      timeout: 10000,
    });
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(updatedName).first()).toBeVisible({
      timeout: 10000,
    });

    // Cleanup
    await deleteAutomation(page, updatedName);
    await deleteResume(page, resumeTitle);
  });

  test("should pause and resume an automation", async ({ page }) => {
    const uid = Date.now().toString(36);
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
    await page.waitForTimeout(3000);
    const dialogStillOpen = await page
      .getByRole("dialog")
      .isVisible()
      .catch(() => false);
    if (dialogStillOpen) {
      await page.getByRole("button", { name: "Close" }).click();
    }

    // Navigate to list and verify the automation is active
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("networkidle");
    const card = page.locator("a", { hasText: automationName }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText("active").first()).toBeVisible({ timeout: 5000 });

    // Pause the automation via dropdown menu
    const moreButton = card.getByRole("button").first();
    await moreButton.click({ force: true });
    await page.getByRole("menuitem", { name: /Pause/i }).click();

    // Verify toast and status change to "paused"
    await expect(page.getByText(/Automation paused/i).first()).toBeVisible({
      timeout: 10000,
    });
    // Reload the list to confirm the status persisted
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("networkidle");
    const cardAfterPause = page.locator("a", { hasText: automationName }).first();
    await expect(cardAfterPause).toBeVisible({ timeout: 10000 });
    await expect(cardAfterPause.getByText("paused").first()).toBeVisible({ timeout: 5000 });

    // Resume the automation via dropdown menu
    const moreButtonAfterPause = cardAfterPause.getByRole("button").first();
    await moreButtonAfterPause.click({ force: true });
    await page.getByRole("menuitem", { name: /Resume/i }).click();

    // Verify toast and status change back to "active"
    await expect(page.getByText(/Automation resumed/i).first()).toBeVisible({
      timeout: 10000,
    });
    // Reload the list to confirm the status persisted
    await page.goto("/dashboard/automations");
    await page.waitForLoadState("networkidle");
    const cardAfterResume = page.locator("a", { hasText: automationName }).first();
    await expect(cardAfterResume).toBeVisible({ timeout: 10000 });
    await expect(cardAfterResume.getByText("active").first()).toBeVisible({ timeout: 5000 });

    // Cleanup
    await deleteAutomation(page, automationName);
    await deleteResume(page, resumeTitle);
  });

  test("should delete the automation and verify removal", async ({
    page,
  }) => {
    const uid = Date.now().toString(36);
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
    await page.waitForTimeout(3000);
    const dialogStillOpen = await page
      .getByRole("dialog")
      .isVisible()
      .catch(() => false);
    if (dialogStillOpen) {
      await page.getByRole("button", { name: "Close" }).click();
    }

    // Delete
    await deleteAutomation(page, automationName);
    await expect(page.getByText(automationName)).not.toBeVisible({
      timeout: 10000,
    });

    // Cleanup resume
    await deleteResume(page, resumeTitle);
  });
});
