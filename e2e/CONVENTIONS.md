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
    const uid = Date.now().toString(36);
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

1. **Unique data per test**: Always use `Date.now().toString(36)` for unique names. Never hardcode test data names like "Test Job 1".

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
| `uniqueId()` | `Date.now().toString(36)` — unique test data suffix |
| `login(page)` | UI login — only for smoke tests |
| `expectToast(page, pattern, timeout?)` | Assert toast notification visible |
| `selectOrCreateComboboxOption(page, label, placeholder, text, timeout?)` | 3-step combobox: exact → partial → create |

**Adding a new shared helper**: Only add helpers used by 3+ spec files. If it's aggregate-specific, keep it local.

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

## Environment Constraints

- **8 GB RAM, no swap** (until infra-issue #11 is resolved): Long serial runs (>10 min) can crash the dev server. Run tests in batches if needed.
- **NixOS**: Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium`
- **Dev server**: Agents may start it (`bun run dev`) but must **never stop it**.
- **SQLite**: Shared `dev.db` with no per-test isolation. Unique test data names are your only protection against collision.

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
