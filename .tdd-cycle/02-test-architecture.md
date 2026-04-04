# Test Architecture Design -- S4 Blind Spot / DAU / Edge Case Findings

**Date:** 2026-04-02
**Scope:** 13 findings from S4 review (F1-partial, F5, F6, F7, F8, F9, F10, DAU-1, DAU-2, DAU-7, EDGE-2, EDGE-3, EDGE-5)
**Test runner:** Jest + jsdom (existing `jest.config.ts`)
**Conventions:** Follow existing `describe/it` patterns from `crm-actions.spec.ts` and `job.actions.spec.ts`


## 1. Test File Structure

All new tests integrate into the existing `__tests__/` flat directory. New files are created only where a finding targets code with no existing test file. Findings targeting code already covered by an existing spec extend that file.

```
__tests__/
  crm-actions.spec.ts          -- EXTEND  (DAU-2, DAU-7)
  job.actions.spec.ts           -- EXTEND  (F5, F8)
  status-machine.spec.ts        -- no changes (already comprehensive)
  dictionaries.spec.ts          -- EXTEND  (F1-partial, F7)
  kanban-card.spec.tsx          -- NEW     (F9)
  kanban-empty-state.spec.tsx   -- NEW     (EDGE-3)
  kanban-board.spec.tsx         -- NEW     (DAU-1, EDGE-5)
  useKanbanState.spec.ts        -- NEW     (EDGE-2)
  toast-close-a11y.spec.tsx     -- NEW     (F6)
  addJobForm.schema.spec.ts     -- EXTEND  (F10 -- existing file)
```

### Rationale

Each new file targets a single component or hook, following the existing 1:1 convention (e.g., `useAutomationWizard.spec.ts` tests the `useAutomationWizard` hook). CRM server action tests stay in `crm-actions.spec.ts` because they were introduced as CRM-specific tests separate from the original `job.actions.spec.ts`.


## 2. Mock Strategy

### 2.1 Server Action Tests (F5, F8, DAU-2, DAU-7)

These tests mock exactly the same dependencies as the existing `crm-actions.spec.ts` and `job.actions.spec.ts`. No new mock patterns required.

```
Mocked:
  @prisma/client          -- PrismaClient factory mock (existing pattern)
  @/utils/user.utils      -- getCurrentUser mock
  next/cache              -- revalidatePath mock
  @/lib/events            -- emitEvent, createEvent mock

NOT mocked (real code under test):
  @/lib/crm/status-machine -- isValidTransition, computeTransitionSideEffects
```

**F5 (updateJob state machine):** The existing `job.actions.spec.ts` mocks `@/lib/crm/status-machine` with `isValidTransition: jest.fn().mockReturnValue(true)`. The F5 test must *unmock* or *conditionally mock* the status machine to test that `updateJob` calls through to it. Two strategies:

- **Strategy A (preferred):** Add tests to `job.actions.spec.ts` within a nested `describe` that uses `jest.requireActual` for the status machine module inside a `beforeEach`, then restores the mock after.
- **Strategy B:** Create a separate `describe` block at file bottom that calls `jest.unmock("@/lib/crm/status-machine")` and re-imports the action. This is cleaner but requires `jest.isolateModules`.

Since `updateJob` currently does NOT enforce the state machine (it writes `statusId` directly via `prisma.job.update`), the F5 test will initially be a **RED test** -- it will fail, proving the bug exists. The implementation fix will make it pass.

**F8 (addJob statusId validation):** Same mock setup as existing `addJob` tests. The test verifies that passing a `status` value that does not correspond to a real `jobStatus` row returns an error. Mock `prisma.jobStatus.findFirst` to return `null`.

**DAU-2 (compare-and-swap):** Extends `changeJobStatus` describe block. Adds `expectedFromStatusId` parameter tests. Mock `prisma.job.findFirst` to return a job with a specific `statusId`, then call `changeJobStatus` with a mismatched `expectedFromStatusId` to verify rejection.

**DAU-7 (getKanbanBoard returns ALL jobs):** Extends `getKanbanBoard` describe block. Mock `prisma.job.findMany` and verify it is called WITHOUT `skip`/`take` pagination params. Contrast with `getJobsList` which uses pagination.

### 2.2 i18n Dictionary Tests (F1-partial, F7)

These tests import the real dictionary modules and `PRISMA_ERROR_MAP` / `handleError`. No mocks needed -- these are pure data validation tests.

```
Mocked:    nothing
Imported:  @/i18n/dictionaries (getDictionary, t)
           @/lib/utils (PRISMA_ERROR_MAP is not exported, so test indirectly)
```

**F1-partial approach:** Since `PRISMA_ERROR_MAP` is not exported, the test takes a different approach. It hardcodes the known error keys that the map references (`errors.duplicateEntry`, `errors.notFound`, `errors.referenceError`, `errors.fetchFailed`) and asserts they all exist in all 4 locale dictionaries. This is a **contract test** -- if someone adds a new key to `PRISMA_ERROR_MAP`, this test must be updated.

Alternative: Export `PRISMA_ERROR_MAP` from `utils.ts` (or extract to a separate constants file) and import it in the test. This is more maintainable but requires a production code change.

**F7 approach:** Collect all `msg` default parameter values from `handleError` call sites across server actions. The test asserts each either (a) exists as a dictionary key, or (b) is explicitly documented as an untranslated internal prefix. Since `handleError` msg values are fallback strings shown only when no Prisma error code is matched, they currently use English like "Failed to create job. " -- the test documents which ones are NOT i18n keys.

### 2.3 Component Tests (F6, EDGE-3, F9)

Component tests use `@testing-library/react` with jsdom. They follow the existing component test pattern from `__tests__/AddEducation.spec.tsx`.

```
Mocked:
  @/i18n                  -- useTranslations mock returning { t: key => key, locale: "en" }
  @dnd-kit/sortable       -- useSortable mock (for KanbanCard)
  next/link               -- passthrough div

NOT mocked:
  The component itself
  @testing-library/react  -- render, screen, fireEvent
```

**F6 (toast close button a11y):** Renders `ToastClose` directly and asserts the sr-only text is an i18n key, not hardcoded "Dismiss". This is a static assertion test against the source file -- alternatively, render the component and query for `sr-only` text content.

**EDGE-3 (KanbanEmptyState CTA):** Render with and without `onAddJob` prop. Assert the button appears/disappears.

**F9 (KanbanCard due-date midnight crossing):** The `getToday` function in KanbanCard sets hours to `0,0,0,0`. The edge case is when `dueDate` is midnight today -- `today > dueDate` is `false` since both are midnight, so `isOverdue` is correctly `false`. But `daysUntilDue` is `0`, so `isDueToday` is `true`. The test verifies this boundary and also tests when `dueDate` is `23:59:59.999` on the previous day (should be overdue).

Since `getToday` is module-scoped, mock `Date` at the test level using `jest.useFakeTimers`.

### 2.4 Hook Tests (EDGE-2, DAU-1)

Hook tests use `@testing-library/react`'s `renderHook`.

```
Mocked:
  localStorage            -- jest.spyOn(Storage.prototype, ...) or jsdom default
  @/lib/crm/status-machine -- real module (not mocked)

NOT mocked:
  useKanbanState hook itself
```

**EDGE-2 (unknown status values):** Pass jobs with a `Status.value` that does not exist in `STATUS_ORDER` or `STATUS_COLORS`. Verify the hook does not crash and the job is excluded or assigned to a fallback column.

**DAU-1 (drag during pending transition):** This is a component-level test on `KanbanBoard`. It requires testing that when `isPending` is `true`, the DnD sensors are disabled or drag events are ignored. Since `KanbanBoard` manages `isPending` internally, the test triggers a drag, starts a transition (mocked `changeJobStatus` returns a delayed promise), and verifies a second drag during that time is blocked.

### 2.5 Integration Tests (EDGE-5, F10)

**EDGE-5 (within-column drag):** This is tested at the `KanbanBoard` component level. Simulate a drag where source and target are the same column. Current code does `if (sourceColumn === targetColumn) return;` -- the test verifies no server call is made and no error is shown. The finding asks for feedback -- the test documents current behavior.

**F10 (form schema default vs DB):** The `AddJobFormSchema` has `.default("draft")` for status. But the actual DB seed uses `"bookmarked"` as the default status. The test asserts the schema default matches a known valid status value. This is a schema-level unit test.


## 3. Fixture Design

### 3.1 New Fixtures in `src/lib/data/testFixtures.ts`

```typescript
// ── CRM Status Fixtures (full set for state machine testing) ─────────

export const mockJobStatuses: JobStatus[] = [
  { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" },
  { id: "status-applied",    label: "Applied",    value: "applied" },
  { id: "status-interview",  label: "Interview",  value: "interview" },
  { id: "status-offer",      label: "Offer",      value: "offer" },
  { id: "status-accepted",   label: "Accepted",   value: "accepted" },
  { id: "status-rejected",   label: "Rejected",   value: "rejected" },
  { id: "status-archived",   label: "Archived",   value: "archived" },
];

// ── Kanban Job Fixture (minimal for card rendering) ──────────────────

export const mockKanbanJob: JobResponse = {
  ...mockJob,
  dueDate: new Date("2026-04-05T00:00:00.000Z"),
  matchScore: 85,
  tags: [
    { id: "tag-1", label: "React", value: "react", createdBy: mockUser.id },
    { id: "tag-2", label: "Remote", value: "remote", createdBy: mockUser.id },
  ],
};

// ── Job with Unknown Status (edge case testing) ──────────────────────

export const mockJobUnknownStatus: JobResponse = {
  ...mockJob,
  Status: { id: "status-unknown", label: "Custom", value: "custom_status" },
};

// ── Job Due Today (midnight boundary) ────────────────────────────────

export const mockJobDueToday: JobResponse = {
  ...mockJob,
  dueDate: new Date(), // set to today at midnight in test via jest.useFakeTimers
};
```

### 3.2 Reuse Existing Fixtures

The following existing fixtures are reused directly:

- `mockUser` -- all server action tests
- `mockJob` -- base for Kanban card tests
- `mockJobStatus` -- single status fixture
- `mockJobTitle`, `mockCompany`, `mockJobLocation` -- addJob/updateJob tests

The `mockStatuses` array defined inline in `crm-actions.spec.ts` should be extracted to `testFixtures.ts` as `mockJobStatuses` and imported. Both `crm-actions.spec.ts` and `job.actions.spec.ts` currently define their own inline status arrays -- the shared fixture eliminates this duplication.


## 4. Test Naming Conventions

Follow the existing patterns established in `crm-actions.spec.ts` and `status-machine.spec.ts`.

### 4.1 Server Action Tests

```
describe("CRM Server Actions")
  describe("changeJobStatus")
    it("should reject if expectedFromStatusId does not match current status (compare-and-swap)")
    it("should succeed when expectedFromStatusId matches current status")
    it("should succeed when expectedFromStatusId is omitted (backward-compatible)")

describe("jobActions")
  describe("updateJob")
    it("should enforce state machine when status changes")
    it("should allow update without status change (no state machine check)")
    it("should reject invalid status transition during update")
  describe("addJob")
    it("should reject when statusId does not exist in database")
    it("should succeed with valid statusId that exists in database")
  describe("getKanbanBoard")
    it("should return ALL jobs without pagination (no skip/take)")
```

### 4.2 Dictionary Tests

```
describe("error key completeness")
  it("all PRISMA_ERROR_MAP message keys exist in all 4 locale dictionaries")
  it("errors.fetchFailed exists in all 4 locale dictionaries")

describe("handleError msg prefixes")
  it.each(msgPrefixes)("msg '%s' is either an i18n key or documented as internal")
```

### 4.3 Component Tests

```
describe("ToastClose accessibility")
  it("should render accessible label using i18n key, not hardcoded English")

describe("KanbanEmptyState")
  it("should render CTA button when onAddJob prop is provided")
  it("should not render CTA button when onAddJob prop is omitted")
  it("should call onAddJob handler when CTA button is clicked")

describe("KanbanCard due date display")
  it("should show 'due today' badge when dueDate is midnight today")
  it("should show 'overdue' badge when dueDate is before today")
  it("should show 'due soon' badge when dueDate is within 3 days")
  it("should handle dueDate at 23:59:59.999 on previous day as overdue")
  it("should not show any due date indicator when dueDate is null")
```

### 4.4 Hook Tests

```
describe("useKanbanState")
  it("should handle jobs with unknown status values without crashing")
  it("should exclude jobs with unknown status from all columns")
  it("should use fallback color from STATUS_COLORS.draft for unknown statuses")

describe("KanbanBoard")
  it("should prevent drag interaction while a status transition is pending")
  it("should silently ignore within-column drag (no server call, no error)")
```

### 4.5 Schema Tests

```
describe("AddJobFormSchema")
  it("should have a status default value that matches an actual DB status")
```


## 5. Execution Plan

### 5.1 Dependency Order

Tests have no inter-file runtime dependencies. Jest runs all spec files in parallel by default. However, there is a logical implementation order for writing these tests:

```
Phase 1 -- Pure Unit Tests (no component rendering, fastest feedback loop)
  1. __tests__/dictionaries.spec.ts        (F1-partial, F7)
  2. __tests__/status-machine.spec.ts       (no changes, baseline)
  3. __tests__/addJobForm.schema.spec.ts    (F10)

Phase 2 -- Server Action Tests (Prisma mocks, moderate complexity)
  4. __tests__/job.actions.spec.ts          (F5, F8)
  5. __tests__/crm-actions.spec.ts          (DAU-2, DAU-7)

Phase 3 -- Component & Hook Tests (jsdom rendering, highest complexity)
  6. __tests__/useKanbanState.spec.ts       (EDGE-2)
  7. __tests__/kanban-empty-state.spec.tsx   (EDGE-3)
  8. __tests__/kanban-card.spec.tsx          (F9)
  9. __tests__/toast-close-a11y.spec.tsx     (F6)
  10. __tests__/kanban-board.spec.tsx         (DAU-1, EDGE-5)
```

### 5.2 RED Tests vs GREEN Tests

Some tests will be RED (failing) by design because the code does not yet implement the fix. This is the correct TDD approach -- write the test first, then fix the code.

| Finding | Initial State | Why |
|---------|--------------|-----|
| F5 | RED | `updateJob` does not call state machine; test expects it to |
| F8 | RED | `addJob` does not validate statusId exists; test expects validation |
| DAU-2 | RED | `changeJobStatus` does not accept `expectedFromStatusId` parameter |
| F1-partial | RED | `errors.duplicateEntry`, `errors.referenceError`, `errors.fetchFailed` missing from dictionaries |
| F6 | RED | ToastClose has hardcoded "Dismiss" instead of i18n key |
| F10 | RED | Schema defaults to "draft" but DB uses "bookmarked" |
| DAU-7 | GREEN | `getKanbanBoard` already returns all jobs (verify existing behavior) |
| EDGE-2 | GREEN | `useKanbanState` already handles unknown statuses (jobs silently excluded) |
| EDGE-3 | GREEN | `KanbanEmptyState` already conditionally renders CTA |
| F9 | GREEN | `getToday` already normalizes to midnight (verify boundary) |
| EDGE-5 | GREEN | Within-column drag already returns early (document behavior) |
| DAU-1 | GREY | Depends on whether `isPending` actually blocks sensor input |
| F7 | GREEN | Documentation test -- catalogs current state |

### 5.3 Parallelization

```
bash scripts/test.sh --no-coverage --maxWorkers=4
```

All test files are independent. Jest's default parallel worker pool handles them. No serial constraints.

### 5.4 Running Order for TDD Cycle

For each RED test:

1. Write the failing test in the designated file
2. Run `bash scripts/test.sh --no-coverage --testPathPattern="<file>"` to confirm RED
3. Implement the minimal fix in production code
4. Run the same command to confirm GREEN
5. Refactor if needed (rename, extract, simplify)
6. Run full suite `bash scripts/test.sh --no-coverage` to confirm no regressions


## 6. Implementation Notes Per Finding

### F5: updateJob State Machine Enforcement

**File:** `__tests__/job.actions.spec.ts` (extend `describe("updateJob")`)

The current `updateJob` writes `statusId` directly to Prisma without checking the state machine. The test should:
1. Mock `prisma.job.findFirst` to return a job with `statusId: "status-bookmarked"`
2. Call `updateJob` with `status: "status-offer"` (bookmarked -> offer is invalid)
3. Assert the result is `{ success: false, errorCode: "INVALID_TRANSITION" }`

**Production code change needed:** `updateJob` must fetch the current job's status, compare with the incoming status, and if different, validate via `isValidTransition` before writing.

### F8: addJob statusId Validation

**File:** `__tests__/job.actions.spec.ts` (extend `describe("addJob")`)

The test should:
1. Mock `prisma.jobStatus.findFirst` to return `null` for the given status ID
2. Call `addJob` with `status: "nonexistent-status-id"`
3. Assert the result is `{ success: false, errorCode: "NOT_FOUND" }`

**Production code change needed:** Add `prisma.jobStatus.findFirst({ where: { id: status } })` to the FK ownership verification block and check for `null`.

### DAU-2: Compare-and-Swap for changeJobStatus

**File:** `__tests__/crm-actions.spec.ts` (extend `describe("changeJobStatus")`)

Add an optional 4th parameter `expectedFromStatusId`. When provided, the action should compare it against `currentJob.statusId`. If they differ, return `{ success: false, errorCode: "CONFLICT" }`.

Three tests:
- Mismatch -> CONFLICT
- Match -> proceeds normally
- Omitted -> backward-compatible (no check)

### DAU-7: getKanbanBoard Returns All Jobs

**File:** `__tests__/crm-actions.spec.ts` (extend `describe("getKanbanBoard")`)

Assert that `prisma.job.findMany` is called WITHOUT `skip` or `take` arguments. This contrasts with `getJobsList` which passes pagination params. The test is a **characterization test** documenting the intentional difference.

### F1-partial: Error Key Completeness

**File:** `__tests__/dictionaries.spec.ts` (new describe block)

```typescript
const REQUIRED_ERROR_KEYS = [
  "errors.duplicateEntry",
  "errors.notFound",
  "errors.referenceError",
  "errors.fetchFailed",
  "errors.invalidTransition",
  "errors.noteTooLong",
  "errors.invalidSortOrder",
];

describe("error key completeness", () => {
  for (const key of REQUIRED_ERROR_KEYS) {
    it(`"${key}" exists in all 4 locale dictionaries`, () => {
      for (const locale of LOCALES) {
        const dict = getDictionary(locale);
        expect(dict[key]).toBeDefined();
        expect(dict[key]).not.toBe("");
      }
    });
  }
});
```

**Production code change needed:** Add `errors.duplicateEntry`, `errors.referenceError`, and `errors.fetchFailed` to all 4 locale dictionaries in `src/i18n/dictionaries.ts`.

### F7: handleError msg Prefixes Audit

**File:** `__tests__/dictionaries.spec.ts` (new describe block)

This test catalogs all `handleError` msg values used across server actions and checks whether they are i18n keys. Since they are currently English strings like "Failed to create job. ", the test documents them:

```typescript
const HANDLE_ERROR_PREFIXES = [
  "Failed to create job. ",
  "Failed to update job. ",
  "Failed to delete job.",
  "Failed to change job status.",
  "Failed to load Kanban board.",
  // ... (collected from all action files)
];

describe("handleError msg prefix audit", () => {
  it("catalogs all handleError msg values that are NOT i18n keys", () => {
    const dict = getDictionary("en");
    const nonI18nPrefixes = HANDLE_ERROR_PREFIXES.filter(
      (msg) => !dict[msg]
    );
    // Document current state -- these SHOULD become i18n keys
    expect(nonI18nPrefixes.length).toBeGreaterThan(0);
    // When all are converted, change this to:
    // expect(nonI18nPrefixes).toEqual([]);
  });
});
```

This is a **characterization test** that becomes a regression test once the i18n migration is done.

### F6: Toast Close Button Accessibility

**File:** `__tests__/toast-close-a11y.spec.tsx`

The `ToastClose` component has `<span className="sr-only">Dismiss</span>` -- hardcoded English. The test renders the component and asserts the sr-only text. Initially RED because the text is not an i18n key.

Note: Since `ToastClose` is a Shadcn UI component that does not use `useTranslations`, the fix requires either wrapping it or passing the label as a prop.

### EDGE-3: KanbanEmptyState CTA

**File:** `__tests__/kanban-empty-state.spec.tsx`

Three tests, all expected GREEN:
1. Render with `onAddJob` -- button visible
2. Render without `onAddJob` -- no button
3. Click button -- handler called

### F9: KanbanCard Due Date Midnight

**File:** `__tests__/kanban-card.spec.tsx`

Use `jest.useFakeTimers()` to control `Date`. Set system time to `2026-04-02T10:30:00.000Z`. Then test:
- `dueDate = 2026-04-02T00:00:00.000Z` (today midnight) -> "due today"
- `dueDate = 2026-04-01T23:59:59.999Z` (yesterday end) -> overdue
- `dueDate = 2026-04-05T00:00:00.000Z` (3 days ahead) -> "due soon"
- `dueDate = null` -> no badge

### EDGE-2: useKanbanState Unknown Status

**File:** `__tests__/useKanbanState.spec.ts`

Use `renderHook` to test the hook with a job whose `Status.value` is `"custom_status"`. Verify:
- No exception thrown
- The unknown job does not appear in any column
- Column count matches `STATUS_ORDER` length (only known statuses)

### DAU-1: Drag During Pending Transition

**File:** `__tests__/kanban-board.spec.tsx`

This is the most complex test. It requires:
1. Rendering the full `KanbanBoard` with mocked DnD context
2. Triggering a drag that opens the transition dialog
3. Confirming the transition (sets `isPending = true`)
4. Attempting another drag while pending
5. Asserting the second drag is blocked

Due to DnD library complexity, this may need to be a lighter test: verify that the `isPending` state disables sensors or that the handler returns early.

### EDGE-5: Within-Column Drag

**File:** `__tests__/kanban-board.spec.tsx`

Simulate a `DragEndEvent` where source column equals target column. Assert:
- No call to `changeJobStatus`
- No toast (error or success)
- The event is silently consumed

### F10: Schema Default vs DB Status

**File:** `__tests__/addJobForm.schema.spec.ts` (extend or create)

```typescript
describe("AddJobFormSchema status default", () => {
  it("should default to 'bookmarked' (matching DB seed)", () => {
    const result = AddJobFormSchema.parse({
      title: "t", company: "c", location: "l",
      type: "FT", source: "s", dueDate: new Date(),
      salaryRange: "x", jobDescription: "a".repeat(10),
    });
    expect(result.status).toBe("bookmarked");
  });
});
```

Initially RED because the schema defaults to `"draft"`.


## 7. Summary Matrix

| # | Finding | Test File | Test Type | Initial Color | Mock Complexity |
|---|---------|-----------|-----------|---------------|-----------------|
| 1 | F5 | job.actions.spec.ts | Unit (server action) | RED | Medium (real status-machine) |
| 2 | F8 | job.actions.spec.ts | Unit (server action) | RED | Low (existing mocks) |
| 3 | DAU-2 | crm-actions.spec.ts | Unit (server action) | RED | Low (existing mocks) |
| 4 | DAU-7 | crm-actions.spec.ts | Unit (server action) | GREEN | Low (existing mocks) |
| 5 | F1-partial | dictionaries.spec.ts | Unit (data) | RED | None |
| 6 | F7 | dictionaries.spec.ts | Unit (data) | GREEN | None |
| 7 | F6 | toast-close-a11y.spec.tsx | Component | RED | Low (render only) |
| 8 | EDGE-3 | kanban-empty-state.spec.tsx | Component | GREEN | Low (i18n mock) |
| 9 | F9 | kanban-card.spec.tsx | Component | GREEN | Medium (fake timers + dnd mock) |
| 10 | EDGE-2 | useKanbanState.spec.ts | Hook | GREEN | Low (renderHook) |
| 11 | DAU-1 | kanban-board.spec.tsx | Component | GREY | High (DnD + async) |
| 12 | EDGE-5 | kanban-board.spec.tsx | Component | GREEN | High (DnD events) |
| 13 | F10 | addJobForm.schema.spec.ts | Unit (schema) | RED | None |

**Total new test files:** 5
**Total extended test files:** 4
**Estimated new test cases:** 28-32
**RED tests (requiring code changes):** 7
**GREEN tests (verifying existing behavior):** 5
**GREY tests (outcome uncertain):** 1
