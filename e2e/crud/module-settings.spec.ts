import { test, expect, type Page } from "@playwright/test";
import { expectToast } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set NEXT_LOCALE=en cookie so the app renders in English. */
async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function navigateToApiKeysSettings(page: Page) {
  await page.goto("/dashboard/settings");
  await page.waitForLoadState("domcontentloaded");

  // Click the "API Keys" sidebar item to show module cards
  await page.getByRole("button", { name: "API Keys", exact: true }).click();

  // Wait for the module cards to load (loading spinner disappears)
  await page.locator("[role='switch']").first().waitFor({ state: "visible", timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no per-test login needed

test.describe("Module Settings — Activation Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await ensureEnglishLocale(page);
  });

  test("should toggle module activation status", async ({ page }) => {
    await navigateToApiKeysSettings(page);

    // Find the Ollama module toggle — it does not require a real API key
    const ollamaSwitch = page.getByRole("switch", {
      name: /Toggle Ollama module/i,
    });
    await expect(ollamaSwitch).toBeVisible({ timeout: 10000 });

    // Read the initial checked state
    const initialChecked = await ollamaSwitch.isChecked();

    if (initialChecked) {
      // Currently active — deactivate it
      await ollamaSwitch.click();
      await expectToast(page, /Inactive|deactivated/i);

      // Verify the switch reflects the new state
      await expect(ollamaSwitch).not.toBeChecked({ timeout: 5000 });

      // Re-activate to restore original state
      await ollamaSwitch.click();
      await expectToast(page, /Active|activated/i);
      await expect(ollamaSwitch).toBeChecked({ timeout: 5000 });
    } else {
      // Currently inactive — activate it
      await ollamaSwitch.click();
      await expectToast(page, /Active|activated/i);

      // Verify the switch reflects the new state
      await expect(ollamaSwitch).toBeChecked({ timeout: 5000 });

      // Deactivate to restore original state
      await ollamaSwitch.click();
      await expectToast(page, /Inactive|deactivated/i);
      await expect(ollamaSwitch).not.toBeChecked({ timeout: 5000 });
    }
  });

  test("should display status text matching the toggle state", async ({
    page,
  }) => {
    await navigateToApiKeysSettings(page);

    const ollamaSwitch = page.getByRole("switch", {
      name: /Toggle Ollama module/i,
    });
    await expect(ollamaSwitch).toBeVisible({ timeout: 10000 });

    // The card that contains the Ollama switch should show status text
    const ollamaCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: /Ollama/i });
    await expect(ollamaCard).toBeVisible();

    const isChecked = await ollamaSwitch.isChecked();
    if (isChecked) {
      await expect(ollamaCard.getByText("Active")).toBeVisible();
    } else {
      await expect(ollamaCard.getByText("Inactive")).toBeVisible();
    }
  });
});
