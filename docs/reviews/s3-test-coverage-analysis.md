# S3 CRM Core -- Test Coverage Analysis

**Scope:** S3 CRM Core -- Job Status Workflow (5.3) + Kanban Board (5.6)
**Date:** 2026-04-02
**Method:** Manual code review of all test and implementation files

---

## 1. Test Inventory

| Test File | Type | Tests | Scope |
|---|---|---|---|
| `__tests__/status-machine.spec.ts` | Unit | 16 | State machine logic (transitions, colors, order, side effects) |
| `__tests__/crm-actions.spec.ts` | Unit/Integration | 19 | CRM server actions (changeJobStatus, getKanbanBoard, updateKanbanOrder, getJobStatusHistory, getStatusDistribution, getValidTransitions) |
| `__tests__/job.actions.spec.ts` | Unit/Integration | 24 | Job aggregate actions (addJob, updateJob, deleteJob, getJobsList, updateJobStatus delegation) |
| `__tests__/JobsContainer.spec.tsx` | Component | 12 | Search/filter UI, debounce, load more, error handling |
| `e2e/crud/kanban.spec.ts` | E2E | 5 | View toggle, column display, transition dialog, persistence, keyboard navigation |
| **Total** | | **76** | |

### Test Pyramid Ratio

- **Unit:** 40 tests (53%) -- status-machine + server actions
- **Component:** 12 tests (16%) -- JobsContainer only
- **Integration:** 19 tests (25%) -- CRM actions with mocked Prisma
- **E2E:** 5 tests (7%) -- Kanban board happy paths

**Assessment:** The pyramid shape is reasonable at the unit layer but the component layer is severely underweight. Zero component tests exist for KanbanBoard, KanbanCard, KanbanColumn, StatusTransitionDialog, KanbanViewModeToggle, or KanbanEmptyState. The E2E layer covers existence-level checks but lacks workflow coverage.

---

## 2. Coverage by Implementation File

### 2.1 `src/lib/crm/status-machine.ts` -- WELL COVERED

All exported functions and constants are tested:

| Export | Tested | Notes |
|---|---|---|
| `VALID_TRANSITIONS` | Yes | All 7 standard + 2 legacy statuses verified |
| `isValidTransition()` | Yes | 12 valid, 12 invalid, self-transition, legacy, unknown status |
| `getValidTargets()` | Yes | Known status, unknown status, self-transition for interview |
| `STATUS_COLOR_NAMES` | Yes | All standard + legacy statuses |
| `STATUS_ORDER` | Yes | Exact order assertion |
| `COLLAPSED_BY_DEFAULT` | Yes | Includes rejected/archived, excludes active |
| `computeTransitionSideEffects()` | Yes | applied first/subsequent, interview, other statuses |

**Gap: None.** This is the strongest-tested file in S3.

### 2.2 `src/actions/job.actions.ts` (CRM functions) -- MODERATE COVERAGE

| Function | Auth Check | Happy Path | Error Paths | IDOR Ownership | Side Effects | Event Emission |
|---|---|---|---|---|---|---|
| `changeJobStatus` | Yes | Yes | NOT_FOUND (job, status), INVALID_TRANSITION | Implicit via mock | applied/appliedDate | Yes |
| `getKanbanBoard` | Yes | Yes (columns, grouping, collapsed) | No | N/A | N/A | N/A |
| `updateKanbanOrder` | Yes | Yes (reorder + transition) | INVALID_TRANSITION | Implicit via mock | No | No |
| `getJobStatusHistory` | Yes | Yes (formatting) | NOT_FOUND | Yes | N/A | N/A |
| `getStatusDistribution` | Yes | Yes (counts) | No | N/A | N/A | N/A |
| `getValidTransitions` | Yes | Yes | NOT_FOUND | Implicit | N/A | N/A |
| `updateJobStatus` (legacy) | Yes | Yes (delegation) | No | Via delegation | N/A | N/A |
| `addJob` | Yes | Yes (transaction + history) | Generic error | N/A | N/A | Yes |

### 2.3 `src/hooks/useKanbanState.ts` -- NO TESTS

Zero dedicated tests. The hook is complex with:
- localStorage persistence for view mode and collapsed columns
- Column building from jobs + statuses with STATUS_ORDER filtering
- Undo state management with setTimeout-based auto-clear
- SSR guard logic (mounted state)

This is stubbed/mocked away in `JobsContainer.spec.tsx` via:
```ts
jest.mock("@/hooks/useKanbanState", () => ({
  ...jest.requireActual("@/hooks/useKanbanState"),
  getPersistedViewMode: () => "table" as const,
}));
```

### 2.4 `src/components/kanban/KanbanBoard.tsx` -- NO COMPONENT TESTS

This is a 529-line component with significant logic:
- DnD event handling (dragStart, dragOver, dragEnd, dragCancel)
- Transition validity checking during drag
- Toast notifications for valid/invalid transitions
- Undo logic with server roundtrip
- Mobile tab view with status change dropdown
- Desktop DnD with accessibility announcements

**Tested only via:** E2E (existence checks) and mocked out in JobsContainer tests.

### 2.5 `src/components/kanban/KanbanCard.tsx` -- NO COMPONENT TESTS

Untested rendering logic:
- Due date calculations (overdue, due today, due soon)
- Tag overflow display (+N)
- Match score badge
- Drag handle accessibility attributes
- Link navigation

### 2.6 `src/components/kanban/KanbanColumn.tsx` -- NO COMPONENT TESTS

Untested:
- Collapsed vs expanded rendering
- Drop target visual states (valid, invalid, active)
- Empty column display
- SortableContext item list construction

### 2.7 `src/components/kanban/StatusTransitionDialog.tsx` -- NO COMPONENT TESTS

Untested:
- Note input with max length (500 chars)
- Confirm/cancel behavior
- Pending state (disabled inputs, loading spinner)
- Status badge color rendering
- Note trimming on submit

### 2.8 `src/components/kanban/KanbanViewModeToggle.tsx` -- NO COMPONENT TESTS

Untested:
- Radio group keyboard navigation (ArrowLeft/Right/Up/Down)
- localStorage persistence call
- ARIA attributes (role, aria-checked, tabIndex)

### 2.9 `src/components/kanban/KanbanEmptyState.tsx` -- NO COMPONENT TESTS

Untested:
- Conditional "Add Job" button rendering
- i18n string rendering

### 2.10 `src/lib/events/event-types.ts` -- PARTIALLY TESTED

The `createEvent` function is tested implicitly via mock assertions in crm-actions.spec.ts and job.actions.spec.ts. The `DomainEventType` enum and `JobStatusChangedPayload` are type-checked at compile time but no runtime tests verify the payload shape contract.

---

## 3. Gap Analysis

### CRITICAL

**GAP-01: No component tests for any Kanban component (6 components)**

- **Severity:** Critical
- **What is untested:** KanbanBoard, KanbanCard, KanbanColumn, StatusTransitionDialog, KanbanViewModeToggle, KanbanEmptyState -- all have zero component-level tests.
- **Risk:** Regressions in rendering logic, accessibility attributes, DnD behavior, and user interactions will be undetected. The KanbanBoard alone has ~250 lines of callback logic that is only exercised by E2E tests which are slow and flaky.
- **Recommendation:** Add component tests for each:
  - `KanbanBoard.spec.tsx` -- DnD handlers (mock dnd-kit context), transition dialog opening on valid/invalid drops, toast messages, mobile status change dropdown, empty/loading states
  - `KanbanCard.spec.tsx` -- Due date badge rendering (overdue, today, soon, future), tag overflow, match score display, drag handle presence
  - `KanbanColumn.spec.tsx` -- Collapsed pill rendering, expanded column rendering, drop target CSS classes, empty column text
  - `StatusTransitionDialog.spec.tsx` -- Note input, confirm/cancel callbacks, pending state, note trimming
  - `KanbanViewModeToggle.spec.tsx` -- Click toggles, keyboard navigation, ARIA state
  - `KanbanEmptyState.spec.tsx` -- Conditional button rendering

**GAP-02: No tests for useKanbanState hook**

- **Severity:** Critical
- **What is untested:** Column building logic, localStorage persistence (view mode + collapsed columns), undo state management with timeout, SSR guard, sort order within columns.
- **Risk:** The hook is the core state manager for the Kanban board. Bugs in column grouping, collapse persistence, or undo timing will be undetected.
- **Recommendation:** Add `__tests__/useKanbanState.spec.ts` using `@testing-library/react-hooks` (or `renderHook` from `@testing-library/react`):
  - Column construction from jobs/statuses in correct STATUS_ORDER
  - Jobs grouped by status value with correct sort (createdAt desc)
  - Collapsed columns initial state from localStorage
  - `toggleCollapse` updates state and persists to localStorage
  - Undo state auto-clears after 5 seconds
  - SSR guard returns defaults when window is undefined
  - Unknown status values fall back to "draft" color

### HIGH

**GAP-03: No test for SEC-S3-01 -- Foreign key injection via statusId**

- **Severity:** High
- **What is untested:** `changeJobStatus` accepts `newStatusId` as a raw string. The test at line 126 of `crm-actions.spec.ts` verifies the happy path but never tests that a valid-looking statusId that belongs to a different tenant cannot be used to inject a foreign status. The current implementation queries `prisma.jobStatus.findFirst({ where: { id: newStatusId } })` without a userId filter -- which is correct because JobStatus is a system table, but the test should explicitly verify this design decision.
- **Risk:** If JobStatus were ever made user-scoped, the lack of a userId filter would become an FK injection vulnerability.
- **Recommendation:** Add test to `crm-actions.spec.ts`:
  ```
  it("should validate newStatusId exists in the system status table", ...)
  ```
  Verify that a nonexistent statusId returns NOT_FOUND. Also add a documentation comment on the `findFirst` call explaining why no userId filter is needed.

**GAP-04: No test for SEC-S3-03 -- Unbounded limit in getJobsList**

- **Severity:** High
- **What is untested:** `getJobsList` accepts a `limit` parameter directly from the client with no upper bound enforcement. A caller can pass `limit: 999999` to dump the entire database.
- **Risk:** Denial-of-service via large page sizes. Memory exhaustion on the server.
- **Recommendation:** Two actions needed:
  1. **Fix the implementation:** Add `const safedLimit = Math.min(limit, 200);` (or similar cap) at the top of `getJobsList`.
  2. **Add test:**
     ```
     it("should cap limit to MAX_LIMIT when a large value is provided", async () => {
       await getJobsList(1, 999999);
       expect(prisma.job.findMany).toHaveBeenCalledWith(
         expect.objectContaining({ take: expect.any(Number) })
       );
       const actualTake = (prisma.job.findMany as jest.Mock).mock.calls[0][0].take;
       expect(actualTake).toBeLessThanOrEqual(200);
     });
     ```

**GAP-05: Incomplete test for SEC-S3-04 -- File.filePath exclusion**

- **Severity:** High
- **What is untested:** The test at `job.actions.spec.ts:396-414` verifies that `getJobDetails` uses `File: { select: { id: true, fileName: true, fileType: true } }` (which excludes `filePath`). However, this is an implementation-detail assertion on the mock call shape. There is no negative test asserting that `filePath` is NOT present in the returned data.
- **Risk:** If someone adds `filePath: true` to the select, the existing test would still pass (it only checks for the presence of the shape, not the absence of filePath).
- **Recommendation:** Add an explicit assertion:
  ```
  it("should NOT include File.filePath in the response (SEC-S3-04)", async () => {
    // ... mock setup ...
    const result = await getJobDetails("2");
    const selectArg = (prisma.job.findFirst as jest.Mock).mock.calls[0][0];
    const fileSelect = selectArg.include.Resume.include.File.select;
    expect(fileSelect.filePath).toBeUndefined();
    expect(Object.keys(fileSelect)).toEqual(["id", "fileName", "fileType"]);
  });
  ```

**GAP-06: No test for updateKanbanOrder sortOrder validation**

- **Severity:** High
- **What is untested:** `updateKanbanOrder` validates `newSortOrder` at lines 799-800 (`Number.isFinite`, non-negative). No test covers these validation paths.
- **Risk:** Malicious or buggy clients could inject NaN, Infinity, or negative sort orders. The validation exists in code but has no regression protection.
- **Recommendation:** Add to `crm-actions.spec.ts`:
  ```
  it("should reject NaN sortOrder", ...)
  it("should reject negative sortOrder", ...)
  it("should reject Infinity sortOrder", ...)
  ```

**GAP-07: No test for changeJobStatus note length validation**

- **Severity:** High
- **What is untested:** `changeJobStatus` enforces `note.length > 500` at line 610. No test covers this validation.
- **Risk:** The 500-char server-side enforcement (which mirrors the UI `maxLength={500}` in StatusTransitionDialog) has no regression protection.
- **Recommendation:** Add to `crm-actions.spec.ts`:
  ```
  it("should reject notes longer than 500 characters", async () => {
    const longNote = "a".repeat(501);
    const result = await changeJobStatus("job-1", "status-applied", longNote);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_ERROR");
  });
  ```

### MEDIUM

**GAP-08: No test for updateKanbanOrder event emission on cross-column drag**

- **Severity:** Medium
- **What is untested:** `updateKanbanOrder` with `newStatusId` emits `JobStatusChanged` domain event (lines 869-878). The test at line 311 verifies the status transition succeeds but does not verify event emission.
- **Risk:** Event-driven side effects (notifications, dashboard updates) could silently break.
- **Recommendation:** Add assertion for `emitEvent` call in the cross-column drag test case.

**GAP-09: No test for getKanbanBoard with legacy status jobs**

- **Severity:** Medium
- **What is untested:** If a job has a legacy status value like "saved" or "draft", `getKanbanBoard` groups by `Status.value`. If the value is not in `STATUS_ORDER`, the column would be silently dropped.
- **Risk:** Jobs with legacy statuses become invisible on the Kanban board.
- **Recommendation:** Add test with a job whose status value is "draft" or "saved" and verify it appears in the appropriate column or is handled gracefully.

**GAP-10: No test for getStatusDistribution with orphaned statusIds**

- **Severity:** Medium
- **What is untested:** If `groupBy` returns a `statusId` that does not exist in the `jobStatus` table, the `.filter(d => d !== null)` at line 993 drops it. No test covers this edge case.
- **Recommendation:** Add test where `groupBy` returns a statusId not in the status table and verify it is excluded without error.

**GAP-11: No test for concurrent status transitions**

- **Severity:** Medium
- **What is untested:** Two concurrent `changeJobStatus` calls on the same job. The implementation uses `$transaction` but does not use optimistic locking (no version check). The second call could succeed with an outdated `currentStatusValue`.
- **Risk:** Race condition where two transitions from the same source status both succeed, bypassing the state machine.
- **Recommendation:** This is documented in the S3 deferred items. At minimum, add a comment-test that documents the known limitation:
  ```
  it.todo("should handle concurrent status transitions with optimistic locking");
  ```

**GAP-12: E2E Kanban test does not verify actual drag-and-drop workflow**

- **Severity:** Medium
- **What is untested:** The E2E kanban.spec.ts tests check that columns render and the toggle works, but no test actually performs a drag-and-drop operation and verifies the status transition dialog appears.
- **Risk:** The core DnD workflow -- the primary interaction pattern for the Kanban board -- has no E2E coverage.
- **Recommendation:** Add E2E test:
  1. Create a test job (bookmarked)
  2. Switch to Kanban view
  3. Perform drag from "Bookmarked" column to "Applied" column
  4. Verify StatusTransitionDialog appears
  5. Click confirm
  6. Verify job appears in "Applied" column
  7. Clean up

**GAP-13: No test for KanbanBoard undo flow**

- **Severity:** Medium
- **What is untested:** After a successful transition, the board shows a toast with an "Undo" action button. Clicking undo calls `changeJobStatus(job.id, fromStatus.id)`. This reverse-transition and its cleanup are untested at every level (unit, component, E2E).
- **Recommendation:** Add component test for KanbanBoard that mocks `changeJobStatus` twice (forward + reverse) and verifies undo behavior.

### LOW

**GAP-14: No test for KanbanBoard mobile status change dropdown**

- **Severity:** Low
- **What is untested:** The mobile tab view renders a `<Select>` per job card that calls `handleMobileStatusChange`. The E2E test at line 139 has a conditional that only runs on mobile viewports and checks for the select's existence, not its functionality.
- **Recommendation:** Add component test for mobile status change: render KanbanBoard at mobile viewport, verify Select renders, change value, verify transition dialog opens.

**GAP-15: No test for KanbanBoard accessibility announcements**

- **Severity:** Low
- **What is untested:** Lines 355-388 of KanbanBoard.tsx define DnD-kit accessibility announcements (onDragStart, onDragOver, onDragEnd, onDragCancel). These string templates with `.replace()` calls are untested.
- **Recommendation:** Component test or snapshot test for announcement text generation with mock jobs/statuses.

**GAP-16: No test for getPersistedViewMode SSR fallback**

- **Severity:** Low
- **What is untested:** `getPersistedViewMode()` returns "kanban" when `typeof window === "undefined"`. The mock in JobsContainer.spec.tsx overrides it to return "table".
- **Recommendation:** Add unit test in `useKanbanState.spec.ts` that verifies the SSR fallback.

**GAP-17: PERF-01 DnD linear scan not benchmarked**

- **Severity:** Low
- **What is untested:** `getJobColumn()` in KanbanBoard does a linear scan through all columns to find which column contains a job. For boards with many jobs this could be slow during drag events.
- **Recommendation:** Add a micro-benchmark test (or at minimum a comment-test documenting the O(n) complexity):
  ```
  it.todo("PERF-01: getJobColumn linear scan — consider Map lookup for > 500 jobs");
  ```

---

## 4. Test Quality Assessment

### Strengths

1. **status-machine.spec.ts** uses parameterized tests (`it.each`) with comprehensive valid/invalid transition matrices. This is exemplary test design -- behavior-focused, not implementation-focused.

2. **crm-actions.spec.ts** properly tests the ActionResult contract (success/failure, errorCode, data shape). Tests cover auth, not-found, and invalid-transition error paths.

3. **job.actions.spec.ts** verifies that `addJob` creates initial status history and emits domain events -- covering the S3 integration of CRM into the existing job aggregate.

4. **JobsContainer.spec.tsx** thoroughly tests the debounce behavior with fake timers and the search/filter combination matrix. Good use of `userEvent.setup({ delay: null })` for async event simulation.

### Weaknesses

1. **Over-reliance on mock implementation details** in crm-actions.spec.ts. Tests verify `prisma.$transaction` was called (line 636) rather than verifying the actual data contract. If the implementation switches from `$transaction` to separate calls, the test breaks even if behavior is identical.

2. **Incomplete Prisma mock fidelity.** The mock `$transaction` in crm-actions.spec.ts passes a callback-style implementation but the actual Prisma `$transaction` has a different signature (it receives a `PrismaClient`-like transaction object). Tests could pass with incorrect usage.

3. **E2E tests are existence-based, not workflow-based.** The kanban.spec.ts tests verify elements exist but do not exercise the core user flows (drag-drop, status transition, undo). Several tests use `.catch(() => false)` guards that silently pass when elements are missing.

4. **No negative/boundary tests for input validation** in server actions. The note length check, sortOrder validation, and limit cap (if added) have no tests.

5. **Test isolation concern in JobsContainer.spec.tsx.** The mock for `useKanbanState` forces table mode, meaning the KanbanBoard rendering path is never exercised in component tests. This creates a false sense of coverage.

---

## 5. Summary

| Metric | Value |
|---|---|
| Total tests | 76 |
| Implementation files tested | 3 of 10 (status-machine, job.actions, JobsContainer) |
| Implementation files with zero tests | 7 (all Kanban components + useKanbanState hook) |
| Critical gaps | 2 (no Kanban component tests, no hook tests) |
| High gaps | 5 (FK injection, unbounded limit, filePath leak, sortOrder validation, note length validation) |
| Medium gaps | 6 (event emission, legacy status, orphaned status, concurrency, E2E DnD, undo) |
| Low gaps | 4 (mobile, accessibility, SSR fallback, perf benchmark) |

### Priority Recommendations

1. **Immediate (before next session):** Add useKanbanState hook tests (GAP-02) and StatusTransitionDialog component tests (GAP-01 partial). These cover the most logic with the least setup.
2. **High priority:** Add server action validation tests for note length (GAP-07), sortOrder (GAP-06), and unbounded limit fix + test (GAP-04).
3. **Next iteration:** Add remaining Kanban component tests (GAP-01), E2E DnD workflow test (GAP-12), and security-specific assertions (GAP-03, GAP-05).
