import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

/**
 * Ensure at least one resume exists (required for the "Create Automation"
 * button to be enabled). Creates a uniquely named resume if needed.
 */
async function ensureResumeExists(
  page: Page,
  resumeTitle: string,
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
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    /Resume title has been/,
    { timeout: 10000 },
  );
  return resumeTitle;
}

async function deleteResume(page: Page, title: string) {
  await page.goto("/dashboard/profile");
  await page.waitForLoadState("domcontentloaded");
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
  await page.waitForLoadState("domcontentloaded");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Automation Wizard — Dynamic Module Selector", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should show available modules in the job board selector", async ({
    page,
  }) => {
    const uid = Date.now().toString(36);
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists so the "Create Automation" button is enabled
    await ensureResumeExists(page, resumeTitle);

    await navigateToAutomations(page);

    // Open the automation wizard
    await page.getByRole("button", { name: /Create Automation/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create Automation/i }),
    ).toBeVisible({ timeout: 10000 });

    // Open the Job Board selector dropdown
    await page.getByRole("combobox", { name: /Job Board/i }).click();

    // Verify that the core active modules appear as options
    await expect(
      page.getByRole("option", { name: /EURES/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("option", { name: /Arbeitsagentur/i }),
    ).toBeVisible({ timeout: 5000 });

    // Close the dialog to prevent leftover state
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Cleanup
    await deleteResume(page, resumeTitle);
  });

  test("should only show active modules in the selector", async ({
    page,
  }) => {
    const uid = Date.now().toString(36);
    const resumeTitle = `E2E Resume ${uid}`;

    // Ensure a resume exists
    await ensureResumeExists(page, resumeTitle);

    // First: navigate to settings and deactivate EURES
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "API Keys", exact: true }).click();
    await page
      .locator("[role='switch']")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    const euresSwitch = page.getByRole("switch", {
      name: /Toggle EURES module/i,
    });

    // Only proceed if EURES switch exists (it may not if EURES has no
    // credential entry — in that case it is always active and the toggle
    // is not shown on the API Keys page)
    const euresSwitchVisible = await euresSwitch
      .isVisible()
      .catch(() => false);

    if (euresSwitchVisible) {
      const wasActive = await euresSwitch.isChecked();

      if (wasActive) {
        // Deactivate EURES
        await euresSwitch.click();
        await expect(euresSwitch).not.toBeChecked({ timeout: 5000 });
      }

      // Now open the automation wizard — EURES should NOT appear
      await navigateToAutomations(page);
      await page
        .getByRole("button", { name: /Create Automation/i })
        .click();
      await expect(
        page.getByRole("heading", { name: /Create Automation/i }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("combobox", { name: /Job Board/i }).click();

      // EURES should NOT be a selectable option (it was deactivated)
      await expect(
        page.getByRole("option", { name: /EURES/i }),
      ).not.toBeVisible({ timeout: 3000 });

      // Close dialogs
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");

      // Restore: re-activate EURES
      await page.goto("/dashboard/settings");
      await page.waitForLoadState("domcontentloaded");
      await page.getByRole("button", { name: "API Keys", exact: true }).click();
      await page
        .locator("[role='switch']")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });

      const euresSwitchAfter = page.getByRole("switch", {
        name: /Toggle EURES module/i,
      });
      await euresSwitchAfter.click();
      await expect(euresSwitchAfter).toBeChecked({ timeout: 5000 });
    }

    // Cleanup
    await deleteResume(page, resumeTitle);
  });
});
