import { expect, type Page } from "@playwright/test";

/**
 * Generate a unique identifier for test data (e.g. "m1abc2dw0").
 *
 * Millisecond timestamp plus the WORKER that produced it. The timestamp alone
 * was the whole identifier until 2026-09-02 (E2E-B29), which is safe only while
 * one worker runs: `playwright.config.ts` sets `fullyParallel: true` with
 * `workers: 3` locally and CLAUDE.md documents `E2E_WORKERS=4`, so three
 * workers entering this function in the same millisecond produced the same
 * name — and the suite's protection against collision IS the name
 * (e2e/CONVENTIONS.md, and `UniqueTestData` in the spec).
 *
 * `process.env.TEST_PARALLEL_INDEX` rather than `test.info().parallelIndex`:
 * the env var is set by the worker process (playwright/lib/worker/workerMain.js)
 * and is therefore readable from module scope, where `test.info()` throws.
 * Outside a Playwright worker it is absent, and "0" is then correct — there is
 * no second worker to collide with.
 */
export function uniqueId(): string {
  const worker = process.env.TEST_PARALLEL_INDEX ?? "0";
  return `${Date.now().toString(36)}w${worker}`;
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
 * It is an ATTRIBUTE selector rather than getByRole, and that is deliberate.
 * getByRole consults the accessibility tree. Radix's modal Dialog calls
 * hideOthers() (@radix-ui/react-dialog/dist/index.mjs:137), whose aria-hidden
 * helper walks document.body's children and sets aria-hidden="true" on every
 * one that is not an ancestor of the portal — with no exemption for live
 * regions. Our <ToastViewport/> is rendered IN PLACE inside the app root
 * (toaster.tsx:34, dashboard/layout.tsx:47) and is never portalled: react-toast
 * uses Portal only for the sr-only announce clone (index.mjs:480), while the
 * viewport itself is a plain DismissableLayer.Branch (:171-180). So it is
 * exactly such a sibling, and under getByRole it would be invisible to
 * Playwright for as long as any modal is open — a timeout for every toast
 * asserted before its dialog has closed, while the toast sits there on screen.
 * CSS attribute matching never consults that tree.
 *
 * The trade-off is real rather than free: this also gives up the role engine's
 * implicit "is in the accessibility tree" filter. Here that is exactly what we
 * want, but it is a semantic change, not a pure refactor.
 *
 * A page-wide `getByRole("status")` is the obvious alternative and is wrong: a
 * dozen sr-only live regions in src/ carry that role and announce the very text
 * these tests match on (ComboBox.tsx:195, StatusStageCombobox.tsx:179,
 * ContactPicker.tsx:248, CompanyPicker.tsx:235, skeleton.tsx:75, ...), and Radix
 * additionally portals a VisuallyHidden role="status" announce copy of each
 * toast to document.body, outside the viewport (index.mjs:365-372).
 *
 * Known limitation this helper cannot fix: it narrows WHERE we look, not WHAT
 * we match. A pattern is safe only if it can match NEITHER of two things:
 *
 *   (a) the NEIGHBOURING action's success message — toasts live 5 s
 *       (toaster.tsx), so a test that acts twice in quick succession can be
 *       satisfied by the first toast. This is the visible hazard; it costs you
 *       a missed assertion.
 *
 *   (b) any FAILURE message the SAME action can produce. This one is worse: it
 *       turns a broken flow green rather than merely skipping a check. Today
 *       every call site is clear of it, but by luck rather than design —
 *       `handleError` (src/lib/utils.ts:60-90) discards the thrown
 *       `error.message` and returns the caller's generic key, so a rejection
 *       surfaces as e.g. "Failed to delete API key" (no "deleted"). The moment
 *       anyone surfaces the real message, `/deleted/i` at
 *       settings-api-keys.spec.ts:136 becomes a false positive the same day,
 *       because `api.keyMustBeRevoked` already reads "API key must be revoked
 *       before it can be deleted".
 * Toasts live for 5 s (toaster.tsx:19), so a test that fires two
 * actions in quick succession can still be satisfied by the PREVIOUS toast,
 * which is still on screen. Telling two simultaneous toasts apart is inherent
 * to text matching, so the obligation sits with the caller: pass a pattern that
 * cannot match the neighbouring action's message.
 *
 * Worked example for (a): `module-settings.spec.ts` matched /Active/i against
 * "Inactive" and /activated/i against "deactivated". Fixed by moving to
 * /Module activated\./i and /Module deactivated\./i, mutually exclusive because
 * the discriminating "de" sits between "Module " and "activated". Use that shape
 * for any toggle-style assertion; the short generic patterns — /deleted/i,
 * /updated/i, /revoked/i — are the ones to check first.
 */
export async function expectToast(
  page: Page,
  pattern: RegExp,
  timeout = 10000,
) {
  await expect(
    page
      .locator('[role="region"][aria-label^="Notifications ("]')
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

  const exactOption = page.getByRole("option", { name: text, exact: true });
  const partialOption = page
    .getByRole("option", { name: new RegExp(text, "i") })
    .first();
  const createOption = page.getByText(`Create: ${text}`);

  // M-T-04: replaced waitForTimeout(600) — wait for the options list to react
  // to the typed text instead of a fixed 600 ms pause.
  //
  // Race the "Create:" entry against the option list. Waiting only for an
  // option burns the FULL 5 s whenever creation is the only possible outcome,
  // because the create entry is not an option (see the popover-close comment
  // below). That was free while the suite ran against a database full of
  // leftovers, where almost every value already existed. Since every run now
  // starts from a seeded template, creating is the common case, not the rare
  // one: profile-crud's multi-section test creates four values and went from
  // 14.2 s to a 60 s timeout on the first run against a fresh database.
  await Promise.race([
    page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 }),
    createOption.waitFor({ state: "visible", timeout: 5000 }),
  ]).catch(() => null);

  // Fast path for the create case. The race above already proves the list has
  // settled, so a snapshot is safe here — and it skips two 3 s waits that can
  // only ever expire. Falls through to the original chain when anything is
  // ambiguous, so the slow path still governs every case it used to.
  if (
    (await createOption.isVisible().catch(() => false)) &&
    (await page.getByRole("option").count()) === 0
  ) {
    await createOption.click();
  } else {
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
