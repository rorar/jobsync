import { test as base, type Page, type TestInfo } from "@playwright/test";

/**
 * One place for the `test.extend` boilerplate that ordered teardown needs.
 *
 * `specs/e2e-test-infrastructure.allium`'s `FixtureOwnedTeardown` rule wants
 * cleanup owned by a Playwright fixture rather than a hand-written
 * `test.afterEach`, and `docs/adr/046-job-e2e-teardown-fixture-and-api-based-deletion.md`
 * took that step for the five Job specs. Each of them ended up with its own
 * verbatim copy of the same eight lines — the `base.extend<{ cleanup: void }>`
 * wrapper, the `await use()`, the `{ auto: true }` flag — differing only in the
 * body. Five copies of a mechanism is how the resume fixture got to six
 * (`e2e/CONVENTIONS.md` § "Shared Fixtures"), so it is collected here before it
 * spreads further.
 *
 * WHY A FACTORY AND NOT ONE SHARED EXTENDED `test`: the bodies are genuinely
 * per-file — different entities, different order, different timeout bumps — and
 * the ordering trap below means a body must never be assembled from parts. A
 * factory keeps the mechanism shared and the body whole.
 *
 * THE ORDERING TRAP THIS PRESERVES (`e2e/CONVENTIONS.md` § "Converting
 * `afterEach` to a Playwright fixture"): `afterEach` hooks always run BEFORE any
 * test-scoped fixture's teardown (`node_modules/playwright/lib/worker/workerMain.js:339`
 * vs. `:345`), with no interleaving on request. A spec whose cleanup deletes
 * several related models in a required order must therefore move that cleanup
 * ALL AT ONCE. This factory takes exactly one body and gives a caller no way to
 * pass half of one, which is the shape that breaks silently.
 *
 * SCOPE — this is internal E2E test infrastructure, NOT Module SDK surface.
 * It is deliberately not part of the App ↔ Connector ↔ Module contract: that
 * idiom governs the outbound ACL (`src/lib/connector/*`), and the E2E suite has
 * no dependency on it in either direction (`grep -rn "moduleRegistry\|ConnectorType"
 * e2e/` is empty, and stays that way). A connector module cannot import this
 * today and is not meant to: `playwright.config.ts:47-54` pins `testDir` to
 * `./e2e/smoke` and `./e2e/crud`, so nothing inside a connector module's own
 * directory is collected as a Playwright test at all — the co-located module test
 * convention (ROADMAP §8.7 Phase 0c) is a JEST glob
 * (`jest.config.ts:205`). Whether modules should get E2E coverage of their own
 * is an OPEN question in ROADMAP §8.0 ("Discovery: Self-Contained Module E2E
 * Coverage (offen)", three options, undecided); its two leading options both put
 * that coverage in ONE central manifest-driven spec, which would consume this
 * helper like any other spec under `e2e/` and needs no change here. Should the
 * third shape ever be chosen — per-module Playwright files importing this —
 * that is a decision to make deliberately, because it would turn this module
 * into a versioned public API and break Phase 0's "everything a module defines
 * lives in its own directory" (ROADMAP §8.7). Do not let it happen by import.
 */

/**
 * The per-file teardown body. Runs after the test, in place of the `afterEach`
 * it replaces, with the same page and the test's own `testInfo` — so an existing
 * `testInfo.setTimeout(testInfo.timeout + N)` bump carries over unchanged
 * (`afterEach` and fixture teardown share the same `afterHooksSlot`,
 * `workerMain.js:329,339,345`).
 */
export type CleanupBody = (page: Page, testInfo: TestInfo) => Promise<void>;

/**
 * A `test` whose every test runs `cleanup` afterwards, whether it passed or not.
 *
 * Replaces a file-wide `test.afterEach`. `auto: true` is what makes it file-wide
 * without any test naming it, matching the implicit behaviour of the hook it
 * replaces; `void` is the fixture's value type because nothing consumes it.
 *
 * Use it as the file's `test`:
 *
 * ```ts
 * const test = testWithCleanup(async (page, testInfo) => {
 *   testInfo.setTimeout(testInfo.timeout + 60_000);
 *   // the entire former afterEach body, same steps, same order
 * });
 * ```
 *
 * Bind it at module scope ABOVE every `test.describe` / `test.beforeEach` in the
 * file: once a module-scope `const test` exists, every `test.` reference in that
 * module resolves to it, and a hook registered above the declaration throws
 * `ReferenceError: Cannot access 'test' before initialization` at load time.
 * That failure is loud and immediate. The quiet one is keeping a second binding
 * to the base `test` alive and registering some hooks on each — then the file
 * has two unrelated test declarations and the hooks silently do not apply. Do
 * not import `test` from `@playwright/test` in a file that uses this.
 */
export function testWithCleanup(cleanup: CleanupBody) {
  return base.extend<{ cleanup: void }>({
    cleanup: [
      async ({ page }, use, testInfo) => {
        await use();
        await cleanup(page, testInfo);
      },
      { auto: true },
    ],
  });
}
