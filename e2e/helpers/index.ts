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

/**
 * Wait for a toast notification matching the given pattern.
 *
 * E2E-B20: the match is scoped to the Radix toast viewport, not to the page.
 * `page.getByText()` matches anywhere in the document, so this helper was
 * routinely satisfied by the row the test had just created, by a heading, or by
 * a status badge — the assertion went green without a toast ever appearing. Two
 * call sites were provably in that state: `module-settings.spec.ts` asserts
 * /Active|activated/i on a page that renders an "Active"/"Inactive" badge for
 * every module row (ApiKeySettings.tsx:416), and `settings-api-keys.spec.ts`
 * asserts /revoked/i on a page that renders a "Revoked" badge
 * (PublicApiKeySettings.tsx:274).
 *
 * The anchor is the viewport's landmark role. `<ToastViewport />` in
 * src/components/ui/toaster.tsx:34 passes no `label`, so Radix applies its own
 * default `"Notifications ({hotkey})"` with `hotkey = ["F8"]`
 * (@radix-ui/react-toast/dist/index.mjs:69-70, :176-177). That literal never
 * passes through our i18n, so the anchor is stable in all four locales. Toasts
 * portal into the `<ol>` nested inside that region (index.mjs:79, :193), so
 * every visible toast is a descendant of it.
 *
 * The trailing " (" is load-bearing: NotificationDropdown.tsx:352 renders a
 * SECOND `role="region"` whose accessible name is exactly "Notifications"
 * (notifications.title, en). Anchoring on /^Notifications/ alone would also
 * select the notification dropdown whenever a test leaves it open.
 *
 * A page-wide `getByRole("status")` is the obvious alternative and is wrong: a
 * dozen sr-only live regions in src/ carry that role and announce the very text
 * these tests match on (ComboBox.tsx:195, StatusStageCombobox.tsx:179,
 * ContactPicker.tsx:248, CompanyPicker.tsx:235, skeleton.tsx:75, ...), and Radix
 * additionally portals a VisuallyHidden role="status" announce copy of each
 * toast to document.body, outside the viewport (index.mjs:365-372).
 *
 * Known limitation, deliberately out of scope: this narrows WHERE we look, not
 * WHAT we match. Toasts live for 5 s (toaster.tsx:19), so a test that fires two
 * actions in quick succession can still be satisfied by the previous toast that
 * is still on screen — `module-settings.spec.ts` is the live example, since
 * /Active/i is a substring of "Inactive". Telling two simultaneous toasts apart
 * is inherent to text matching; a call site that needs it should assert on
 * something unique to its own message.
 */
export async function expectToast(
  page: Page,
  pattern: RegExp,
  timeout = 10000,
) {
  await expect(
    page
      .getByRole("region", { name: /^Notifications \(/ })
      .getByText(pattern)
      .first(),
  ).toBeVisible({ timeout });
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
  // Retained for arg-position compatibility only. Since the 2026-06-12 i18n
  // form-control change, the Combobox search placeholder is derived from the
  // translated label ("Create or search <Label>"), so callers no longer need to
  // pass it — it is computed from `label` below.
  _legacySearchPlaceholder: string,
  text: string,
  timeout = 3000,
) {
  // exact: true — a stale CompanyLogo renders role="img" aria-label="<company
  // name>" (e.g. "E2E Company abc"), and a substring getByLabel("Company")
  // would strict-mode-collide with it. The combobox trigger's accessible name
  // is exactly the FormLabel ("Company"/"Title"/…), so an exact match selects
  // the control without matching any logo on the page behind the dialog.
  await page.getByLabel(label, { exact: true }).click();
  // Placeholder is "Create or search <Label>" (forms.createOrSearchPlaceholder,
  // en) — derived from the same translated noun used as the trigger's label.
  const searchInput = page.getByPlaceholder(`Create or search ${label}`);
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

  // Wait for the popover to actually close — i.e. the search input to disappear.
  // We must NOT key this on getByRole("option") being hidden: the "Create: …"
  // row is the CommandEmpty (NOT role="option"), so on the create path (no
  // matching options) the option locator is already "hidden" and we'd return
  // immediately — BEFORE the async onCreateOption → field.onChange resolves —
  // letting the caller submit the form with an empty value. The popover only
  // closes (search input unmounts) after the create completes and the value is
  // set, so waiting on the search input covers both the select and create paths.
  await searchInput
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => null);
}
