# E2E Test Conventions

Read this before writing any E2E test. These conventions exist because we learned them the hard way.

## Directory Structure

```
e2e/
  smoke/          ← Auth-free tests (no storageState)
  crud/           ← Authenticated CRUD tests (storageState from global-setup)
  helpers/        ← Shared utilities (import from here, never duplicate)
  global-setup.ts ← One-time login, saves e2e/.auth/user.json
  .auth/          ← gitignored, created by global-setup
```

## Writing a New CRUD Test

Every CRUD test file goes in `e2e/crud/`. Every test is **self-contained**: it creates its own data, asserts, and cleans up. No test depends on another test's data.

### Template

```typescript
import { test, expect, type Page } from "@playwright/test";
import { selectOrCreateComboboxOption, expectToast } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers (aggregate-specific, NOT shared)
// ---------------------------------------------------------------------------

async function navigateToMyPage(page: Page) {
  await page.goto("/dashboard/mypage");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("add-item-btn").waitFor({ state: "visible" });
}

async function createItem(page: Page, title: string) {
  // ... create logic
}

async function deleteItem(page: Page, title: string) {
  // ... delete logic
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// storageState handles authentication — no login needed

test.describe("MyAggregate CRUD", () => {
  test("should create and verify an item", async ({ page }) => {
    const uid = uniqueId();  // NOT Date.now() inline: uniqueId adds the worker index
    const title = `E2E Item ${uid}`;

    await navigateToMyPage(page);
    await createItem(page, title);

    await expect(
      page.getByRole("row", { name: new RegExp(title, "i") }).first(),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup
    await deleteItem(page, title);
  });
});
```

### Key Rules

1. **Unique data per test**: Always use `uniqueId()` from `e2e/helpers/` (timestamp base-36 plus the worker index — the timestamp alone collided across parallel workers, E2E-B29) for unique names. Never hardcode test data names like "Test Job 1".

2. **Cleanup in every test**: Every test that creates data must delete it. If the test can fail before cleanup, use the pattern:
   ```typescript
   // Prefer inline cleanup at the end of each test.
   // If you need guaranteed cleanup even on failure:
   let createdTitle: string | undefined;
   test.afterEach(async ({ page }) => {
     if (createdTitle) await deleteItem(page, createdTitle);
   });
   ```

3. **No `test.describe.serial`**: Forbidden. If you think you need it, your tests aren't self-contained. Fix the tests.

4. **No `login()` in CRUD tests**: storageState handles auth. Just navigate directly.

5. **No `test.beforeEach` with login or navigation to dashboard**: Each test navigates to its own page via its own `navigateTo*()` helper.

6. **Import shared helpers**: Don't duplicate `selectOrCreateComboboxOption`, `expectToast`, `login`, or `uniqueId`. Import from `../helpers`.

7. **Keep aggregate-specific helpers local**: `navigateToJobs()`, `createJob()`, `deleteJob()` stay in `job-crud.spec.ts`. Only truly generic helpers go in `helpers/index.ts`.

## Writing a New Smoke Test

Smoke tests go in `e2e/smoke/`. They test auth flows or unauthenticated pages. They do NOT use storageState.

```typescript
import { test, expect, type Page } from "@playwright/test";

// Smoke tests may define their own login() since they TEST the auth flow
async function login(page: Page) {
  await page.getByPlaceholder("id@example.com").fill("admin@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Login" }).click();
}

test("should log in and reach dashboard", async ({ page }) => {
  await page.goto("/signin");
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/);
});
```

## Shared Helpers (`e2e/helpers/index.ts`)

Available imports:

| Helper | Purpose |
|---|---|
| `uniqueId()` | timestamp base-36 + worker index (E2E-B29: the timestamp alone collided across parallel workers) — unique test data suffix |
| `login(page)` | UI login — only for smoke tests |
| `expectToast(page, pattern, timeout?)` | Assert toast notification visible |
| `selectOrCreateComboboxOption(page, label, placeholder, text, timeout?)` | 3-step combobox: exact → partial → create |
| `safeWait(page, options, timeout?)` | Deterministic wait — replaces `waitForTimeout`. See below. |
| `rowsByText(page, text)` | Table rows from the DOM, not the accessibility tree — the locator for "the row is gone". See below. |

**Adding a new shared helper**: Only add helpers used by 3+ spec files. If it's aggregate-specific, keep it local.

### Proving a deletion takes two assertions, and one wrong locator

A modal makes the page invisible to `getByRole`. Radix's Dialog and AlertDialog
call `hideOthers()` (`@radix-ui/react-dialog/dist/index.mjs:137`), which sets
`aria-hidden="true"` on every child of `document.body` outside the dialog
portal. Role locators consult the accessibility tree, so for as long as a
confirm dialog is open or animating out they match **nothing** — and every
phrasing of "the row is gone" passes against a row that is still on screen:

```ts
// WRONG — all three are satisfied by aria-hidden rather than by a deletion
await expect(page.getByRole("row", { name: title })).toHaveCount(0);
await expect(row).not.toBeVisible();
await row.waitFor({ state: "detached" });
```

```ts
// RIGHT — the server's answer, then the view's
await expectToast(page, /Task has been deleted/);      // came from the round trip
await expect(rowsByText(page, title)).toHaveCount(0);  // DOM, immune to the modal
```

Both halves are load-bearing. `rowsByText` reads the DOM, which only refreshes
once the container's reload lands, so on its own it says nothing about whether
the SERVER answered — without the toast the helper returns while the action is
still in flight and the page closes under the request. And the toast on its own
does not prove the list updated.

This cost six leaked tasks per run, plus three resumes and their children,
invisible behind a green suite (E2E-B40) — including one fix for the same
symptom in another table that used the blinded locator and therefore changed
nothing. `expectToast` is already immune for the same reason and documents it
at length.


## Shared Fixtures (`e2e/helpers/*.ts`)

`helpers/index.ts` holds *generic* primitives. A **fixture** — a page flow one aggregate owns but
several others need as a precondition — gets its own file next to it and is imported directly.

| Fixture | Import from | Used by |
|---|---|---|
| `ensureResumeExists(page, title, { confirmWith? })` / `deleteResume(page, title)` | `../helpers/resume-fixture` | `job-crud`, `job-detail-panels`, `enrichment`, `automation-crud`, `automation-wizard-modules`, `keyboard-ux` |

**Never copy a fixture into a spec.** Six private copies of the resume fixture is how `898a5119`
— one commit that added a second submit button to the Create Resume dialog and renamed the
success toast — stayed half-repaired for five months: the fix had to be found six times and was
found twice.

If your spec needs a different post-state, add a **named option** to the shared fixture rather
than a copy (`confirmWith: "toast" | "row"` exists for exactly that reason). If the difference is
not a post-state but a different *contract* — e.g. `profile-crud` asserts that deletion succeeded
instead of tolerating a missing row — keep a local function and give it a name that says so
(`deleteResumeAndVerifyGone`), so nobody later unifies the two by name.

## No `waitForTimeout` Policy (M-T-04)

`page.waitForTimeout()` is an **anti-pattern** documented by Playwright itself.
Fixed-duration waits are non-deterministic:

- On fast machines they waste time unnecessarily.
- On slow machines (CI, NixOS VMs with 8 GB RAM, no swap) they silently expire
  before the UI has settled, producing flaky failures.
- They mask real performance regressions — a slow render that happens to fit
  inside 800 ms today might not tomorrow.

### Replace `waitForTimeout` with `safeWait`

```typescript
import { safeWait } from "../helpers";

// BAD — fixed 800 ms sleep:
await page.waitForTimeout(800);

// GOOD — wait for the element that proves the UI has settled:
await safeWait(page, { selector: '[data-testid="staging-list-item"]' });

// GOOD — wait for a network response:
await safeWait(page, { responseUrl: /\/api\/staging/ });

// GOOD — wait for full page load:
await safeWait(page, { loadState: "domcontentloaded" });

// NEVER on a /dashboard/* page — see "networkidle is unreachable" below:
// await safeWait(page, { loadState: "networkidle" });

// GOOD — arbitrary Playwright assertion:
await safeWait(page, {
  condition: async () => {
    await expect(page.getByRole("dialog")).toBeVisible();
  },
});
```

### `networkidle` is unreachable on every `/dashboard/*` page

Do not wait for `loadState: "networkidle"` anywhere behind the dashboard shell.
`src/components/Header.tsx` mounts `<SchedulerStatusBar/>`, whose
`useSchedulerStatus()` hook opens an `EventSource("/api/scheduler/status")`. The
route holds that stream open for ten minutes and the client reconnects
immediately when it closes, so there is always a pending request and Playwright's
"no network connections for 500 ms" condition never becomes true. The wait does
not merely run slowly — it can only ever time out.

`e2e/crud/job-crud.spec.ts` has carried this note since before the M-T-04 sweep;
the sweep nevertheless introduced 13 `networkidle` waits, which is where 9 of the
38 failures in the 2026-08-31 baseline came from.

Wait for the thing you actually mean instead:

| You meant | Wait for |
|---|---|
| "the page shell is interactive" | the landmark control, e.g. `getByTestId("add-job-btn")` |
| "the server action finished" | its success toast (`expectToast`) |
| "the list reloaded" | the row you expect, or a change in `getByRole("row").count()` |
| "the async options arrived" | `getByRole("option").first().waitFor(...).catch(() => null)` |

### Acceptable exceptions

`waitForTimeout` may be used **only** when:

1. The delay guards against a known browser animation whose completion has no
   observable DOM or network signal (e.g., a CSS transition with no class
   change at end). In that case, add a comment explaining why no condition
   exists.
2. A short debounce delay (≤ 100 ms) is needed to flush a React state batch
   that cannot be awaited through the DOM.

In both cases, keep the duration as short as possible and add a `// EXCEPTION:`
comment with the reason.

## Anti-Patterns

| Don't | Do | Why |
|---|---|---|
| `test.describe.serial(...)` | Independent tests with own data | Serial chains mask isolation bugs and block parallelization |
| `const title = "My Test Job"` | `const title = \`E2E Job ${uid}\`` | Hardcoded names collide when tests run in parallel |
| `test.beforeEach(login)` in crud/ | Nothing (storageState handles it) | Per-test login wastes ~3-4s per test |
| `async function login()` in crud file | Import from `../helpers` | 9x duplication is how we got here |
| `await page.waitForTimeout(5000)` | `await page.waitForSelector(...)` or `await expect(...).toBeVisible()` | Fixed waits are flaky and slow; event-based waits are deterministic |
| Cleanup only at end of test body | `test.afterEach` for critical cleanup | If assert fails, inline cleanup never runs |
| Tests that read other tests' data | Each test creates own data | Cross-test dependency = flaky in parallel |

## Reading a failure's artefacts

**`test-results/<test>/error-context.md` is NOT a snapshot of the moment the assertion
failed.** It is taken during teardown: `_takePageSnapshot` (`node_modules/playwright/lib/index.js:577`)
is called only from `willCloseBrowserContext` (`:575`) and `didFinishTest` (`:615`), never from the
failing action. By then this file's `test.afterEach` has navigated the page to
`/dashboard/admin?tab=…` to delete its reference rows, so the snapshot shows the ADMIN page and
says nothing about the state the assertion saw.

This has already produced one wrong diagnosis: E2E-B43 was first written up as "the shape of a
`TagInput` remount — no chips, popover closed", read out of a snapshot whose `heading "Skills Tags"`
is `admin.skillsTags` (`src/components/admin/TagsContainer.tsx`), i.e. a different page entirely.

What to use instead: **a trace**. `--trace=on` (or `retain-on-failure`) records a DOM snapshot per
action with timings, so the state BEFORE and AFTER the failing step is inspectable. Note that
tracing changes timing and can mask a race — if a flake stops reproducing under `--trace=on`, that
is itself information, not a fix.

## Environment Constraints

- **8 GB RAM, no swap** (until infra-issue #11 is resolved): Long serial runs (>10 min) can crash the dev server. Run tests in batches if needed.
- **NixOS**: Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium`
- **Port**: one per worktree. The main checkout keeps 3737; a linked worktree derives its own (`scripts/lib-devserver.sh`), so two checkouts can run suites at the same time. Never hardcode 3737 in a spec or a helper — read `baseURL` from the Playwright config, which follows `E2E_BASE_URL`.
- **Dev server**: **Subagents** may start it (`bun run dev`) and must **never stop it** — parallel subagents once killed each other's server mid-run, and a worker cannot tell whether the process on :3737 belongs to a sibling three minutes into a suite. The orchestrator and the wrappers may stop it deliberately; they are the only parties that know nothing else is running. Read as a blanket ban the rule protects orphaned processes nobody owns. For E2E runs prefer `scripts/dev-e2e.sh` — it starts the dev server with `E2E_AUTH_RATE_LIMIT_BYPASS=1` so repeated logins (global-setup + the signin smoke test) don't trip the signin rate limiter (5/15min per IP). The bypass is prod-inert (gated on `NODE_ENV !== "production"`); never set it in production. See CLAUDE.md § Shared Rate-Limit Factory.
- **Production mode**: `E2E_PROD=1 ./scripts/test-e2e.sh` runs the suite against `next build` +
  `next start` (`scripts/prod-e2e.sh`, build via `scripts/e2e-prod-build.sh` into `.next-e2e/`).
  It exists because the dev server retains ~2,749 objects per request in React's development
  Flight bundle and Next's watchdog then restarts it mid-run, abandoning requests silently
  (`E2E-B42`). Neither the watchdog nor that bundle exists in a production server. What a spec
  author needs to know: **there is no auth bypass in this mode** — it is inert under
  `NODE_ENV=production` by design — so a run's signin budget is real. `global-setup.ts` mints
  the session cookie instead of signing in, leaving the two smoke tests as the only signins. If
  you add a spec that signs in, count it against 5 per 15 minutes per IP.
- **SQLite**: every run gets its **own** database, copied from a seeded template (`scripts/e2e-db.sh`); `prisma/dev.db` is never opened by the suite. Within a run the workers still share that copy, so unique test-data names remain your protection against collision — but nothing survives into the next run.
- **There is no stale-data purge any more, and none is needed.** It used to run in `globalSetup`
  only, which meant UI mode, watch mode and the test-runner MCP silently skipped it. The database
  is now provisioned per run by `./scripts/test-e2e.sh`, so a mode that bypasses `globalSetup`
  cannot inherit residue — but a mode that bypasses the WRAPPER runs against whatever
  `DATABASE_URL` your shell has, which is `prisma/dev.db`. Use the wrapper.

## One Spec Per Aggregate

Each domain aggregate has exactly one spec file. No duplicates.

| Aggregate | File |
|---|---|
| Job | `e2e/crud/job-crud.spec.ts` |
| Task | `e2e/crud/task-crud.spec.ts` |
| Activity | `e2e/crud/activity-crud.spec.ts` |
| Automation | `e2e/crud/automation-crud.spec.ts` |
| Question | `e2e/crud/question-crud.spec.ts` |
| Profile | `e2e/crud/profile-crud.spec.ts` |
| Webhook Settings | `e2e/crud/webhook-settings.spec.ts` |
| SMTP Settings | `e2e/crud/smtp-settings.spec.ts` |
| Push Settings | `e2e/crud/push-settings.spec.ts` |
| Auth | `e2e/smoke/signin.spec.ts` |
| Locale | `e2e/smoke/locale-switching.spec.ts` |

Adding a new aggregate? Create `e2e/crud/<aggregate>-crud.spec.ts`. One file, all CRUD tests for that aggregate.
