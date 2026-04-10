import { expect, type Page } from "@playwright/test";

/** Generate a unique identifier for test data (e.g. "m1abc2d"). */
export function uniqueId(): string {
  return Date.now().toString(36);
}

/** Perform UI login. Only needed in tests that don't use storageState. */
export async function login(page: Page) {
  await page.getByPlaceholder("id@example.com").click();
  await page.getByPlaceholder("id@example.com").fill("admin@example.com");
  await page.getByLabel("Password").click();
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Login" }).click();
}

/** Wait for a toast notification matching the given pattern. */
export async function expectToast(
  page: Page,
  pattern: RegExp,
  timeout = 10000,
) {
  await expect(page.getByText(pattern).first()).toBeVisible({ timeout });
}

/**
 * Deterministic wait helper (M-T-04).
 *
 * Drop-in alternative to `page.waitForTimeout()` that waits for a concrete
 * observable condition rather than a fixed wall-clock duration.
 *
 * Usage:
 *   // Wait for a selector to appear
 *   await safeWait(page, { selector: '[data-testid="my-item"]' });
 *
 *   // Wait for a network response whose URL matches a pattern
 *   await safeWait(page, { responseUrl: /\/api\/staging/ });
 *
 *   // Wait for the page to reach a specific load state
 *   await safeWait(page, { loadState: "networkidle" });
 *
 *   // Wait for an arbitrary Playwright expectation to pass
 *   await safeWait(page, { condition: async () => {
 *     await expect(page.getByRole("dialog")).toBeVisible();
 *   }});
 *
 * Policy (see e2e/CONVENTIONS.md — Anti-Patterns):
 *   `page.waitForTimeout()` is documented by Playwright as an anti-pattern.
 *   Fixed delays are non-deterministic: they silently over-wait on fast machines
 *   and spuriously fail on slow ones (CI, low-memory VMs).  Always replace
 *   fixed waits with one of the condition variants above.
 *
 * @param page     The Playwright Page object.
 * @param options  Exactly one condition must be specified.
 * @param timeout  Overall cap in milliseconds (default 15 000).
 */
export async function safeWait(
  page: Page,
  options:
    | { selector: string; loadState?: never; responseUrl?: never; condition?: never }
    | { loadState: "load" | "domcontentloaded" | "networkidle"; selector?: never; responseUrl?: never; condition?: never }
    | { responseUrl: string | RegExp; selector?: never; loadState?: never; condition?: never }
    | { condition: () => Promise<void>; selector?: never; loadState?: never; responseUrl?: never },
  timeout = 15_000,
): Promise<void> {
  if (options.selector !== undefined) {
    await page.waitForSelector(options.selector, { state: "visible", timeout });
    return;
  }
  if (options.loadState !== undefined) {
    await page.waitForLoadState(options.loadState, { timeout });
    return;
  }
  if (options.responseUrl !== undefined) {
    await page.waitForResponse(options.responseUrl, { timeout });
    return;
  }
  if (options.condition !== undefined) {
    await options.condition();
    return;
  }
  throw new Error(
    "safeWait: exactly one of selector / loadState / responseUrl / condition must be provided",
  );
}

/**
 * Fill and select a combobox option, creating it if it does not already exist.
 * Uses 3-step fallback: exact match → partial match → create.
 *
 * M-T-04: internal `waitForTimeout` calls replaced with deterministic
 * `waitFor` / `waitForSelector` calls so the helper does not contribute
 * false-green test results on slow machines.
 */
export async function selectOrCreateComboboxOption(
  page: Page,
  label: string,
  searchPlaceholder: string,
  text: string,
  timeout = 3000,
) {
  await page.getByLabel(label).click();
  const searchInput = page.getByPlaceholder(searchPlaceholder);
  await searchInput.click();
  await searchInput.fill(text);

  // M-T-04: replaced waitForTimeout(600) — wait for the options list to
  // react to the typed text instead of a fixed 600 ms pause.
  await page
    .getByRole("option")
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => null); // list may stay empty if "Create:" is the only entry

  const exactOption = page.getByRole("option", { name: text, exact: true });
  const partialOption = page
    .getByRole("option", { name: new RegExp(text, "i") })
    .first();
  const createOption = page.getByText(`Create: ${text}`);

  try {
    await exactOption.waitFor({ state: "visible", timeout });
    await exactOption.click();
  } catch {
    try {
      await partialOption.waitFor({ state: "visible", timeout });
      await partialOption.click();
    } catch {
      await createOption.waitFor({ state: "visible", timeout });
      await createOption.click();
    }
  }

  // M-T-04: replaced waitForTimeout(300) — wait for the combobox to close
  // (i.e., the options list to disappear) rather than sleeping a fixed 300 ms.
  await page
    .getByRole("option")
    .first()
    .waitFor({ state: "hidden", timeout: 3000 })
    .catch(() => null); // acceptable if the list was never visible to begin with
}
