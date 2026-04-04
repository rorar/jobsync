# S4 Test Scenario Matrix -- CRM Findings

## Document Purpose

Comprehensive test scenario matrix for 16 open findings from the S3 weed and blind spot
review. This document defines acceptance criteria, edge cases, test categorization, and
mock strategy for each finding. It does NOT contain implementation code.

---

## Table of Contents

1. [Finding Index](#1-finding-index)
2. [Acceptance Criteria by Finding](#2-acceptance-criteria-by-finding)
3. [Test Scenario Matrix](#3-test-scenario-matrix)
4. [Mock Strategy](#4-mock-strategy)
5. [Verification of Already-Fixed Items](#5-verification-of-already-fixed-items)

---

## 1. Finding Index

| ID | Severity | Root Cause | Summary |
|----|----------|------------|---------|
| F5 | HIGH | A | `updateJob` bypasses state machine -- statusId written directly to Prisma |
| F7 | MEDIUM | A | `handleError` prefix strings are hardcoded English (~128 callsites) |
| F6 | MEDIUM | B | Toast "Dismiss" sr-only text hardcoded English |
| F1-partial | MEDIUM | C | 3 PRISMA_ERROR_MAP keys missing from dictionaries |
| F8 | MEDIUM | D | `addJob` does not validate statusId existence |
| F10 | LOW | D | `AddJobFormSchema` defaults to "draft" but seed renames to "bookmarked" |
| F9 | LOW | E | `getToday()` stale past midnight in KanbanCard |
| DAU-1 | MEDIUM | DAU | Rapid double-drag has no drag lock during async transition |
| DAU-2 | HIGH | DAU | Two tabs, stale state -- no compare-and-swap on status change |
| DAU-7 | HIGH | DAU | 500+ jobs -- Kanban uses paginated getJobsList instead of getKanbanBoard |
| EDGE-2 | MEDIUM | Edge | Status value not in STATUS_ORDER -- jobs silently dropped from Kanban |
| EDGE-3 | MEDIUM | Edge | KanbanEmptyState rendered without onAddJob prop |
| EDGE-5 | MEDIUM | Edge | Within-column reorder is a no-op |

---

## 2. Acceptance Criteria by Finding

### F5 (HIGH) -- updateJob bypasses state machine

**Current behavior:** `updateJob` at line 481 of `job.actions.ts` writes `statusId: status`
directly to `prisma.job.update` without validating the transition through `isValidTransition`.
A user can change a job from "bookmarked" to "accepted" via the edit form, completely
circumventing the state machine that `changeJobStatus` enforces.

**Acceptance criteria:**

- AC-1: When `updateJob` is called with a `statusId` that differs from the current job's
  `statusId`, the transition MUST be validated via `isValidTransition(currentStatus.value,
  newStatus.value)`.
- AC-2: When the status transition is invalid, `updateJob` MUST return
  `{ success: false, errorCode: "INVALID_TRANSITION", message: "errors.invalidTransition" }`.
- AC-3: When the status transition is valid, `updateJob` MUST create a
  `JobStatusHistory` entry and compute side effects via `computeTransitionSideEffects`.
- AC-4: When `statusId` is unchanged (same as current), no transition validation is needed
  and no history entry is created. The update proceeds normally.
- AC-5: `updateJob` MUST emit a `JobStatusChanged` domain event when the status changes.

**Edge cases:**

- Status field is unchanged (same statusId as current) -- should pass through without
  transition validation.
- Status field is set to a non-existent statusId -- should return NOT_FOUND.
- Job does not exist or belongs to another user -- existing IDOR check covers this.
- Concurrent status change (two edit form submissions) -- second should fail if first
  changed the status to something that makes the second transition invalid.

---

### F7 (MEDIUM) -- handleError prefix strings are hardcoded English

**Current behavior:** `handleError(error, msg)` in `src/lib/utils.ts` receives a hardcoded
English string like `"Failed to fetch status list. "` from 128 callsites across 21 action
files. When the error is not a Prisma error with a mapped code, this raw English string is
returned as `message` in the `ActionResult`, which is then shown to users via toast.

**Acceptance criteria:**

- AC-1: Every `handleError` call in `src/actions/*.ts` MUST pass an i18n key (e.g.,
  `"errors.fetchStatusListFailed"`) instead of a hardcoded English string.
- AC-2: All i18n keys passed to `handleError` MUST exist in all 4 locale dictionaries
  (en, de, fr, es) with non-empty values.
- AC-3: The `handleError` function itself does NOT need to change -- it already passes `msg`
  through as `message` in the ActionResult. The consumer (toast) resolves the i18n key.
- AC-4: The dictionary consistency test (`dictionaries.spec.ts`) MUST catch any missing keys.

**Edge cases:**

- Keys that contain interpolation variables (currently none in error messages).
- Overlap with Prisma error map keys (errors.notFound, errors.duplicateEntry) -- avoid
  double-prefixing. The `handleError` fallback `msg` is only used when no Prisma code
  matches.

**Scope note:** This is a large refactoring (128 callsites). Test strategy focuses on
verifying the pattern, not testing every single callsite. A grep-based compliance test
ensures no hardcoded English remains in `handleError` calls.

---

### F6 (MEDIUM) -- Toast "Dismiss" hardcoded English

**Current behavior:** `src/components/ui/toast.tsx` line 88 contains:
```
<span className="sr-only">Dismiss</span>
```
The `common.dismiss` key exists in all 4 locale dictionaries but is not used here.

**Acceptance criteria:**

- AC-1: The ToastClose component MUST use the translated `common.dismiss` value instead
  of the hardcoded string "Dismiss".
- AC-2: Screen readers in all 4 locales MUST hear the translated dismiss text.

**Edge cases:**

- ToastClose is a Shadcn UI primitive -- it uses `forwardRef` and does not currently
  accept a `t` function. The fix must either accept a label prop or use the i18n hook.
- Since toast.tsx is a client component (`"use client"`), `useTranslations()` is valid.
- However, Shadcn primitives are typically not i18n-aware -- adding a hook here
  creates a dependency. An alternative is a prop-based approach where the Toaster
  component passes the translated label.

---

### F1-partial (MEDIUM) -- Missing dictionary keys for PRISMA_ERROR_MAP

**Current behavior:** `src/lib/utils.ts` PRISMA_ERROR_MAP references three i18n keys:
- `errors.duplicateEntry` (P2002)
- `errors.fetchFailed` (fetch failed handler)
- `errors.referenceError` (P2003)

None of these keys exist in any dictionary file. When these errors occur, the toast
shows the raw key string (e.g., "errors.duplicateEntry") instead of a human-readable
message.

**Acceptance criteria:**

- AC-1: Keys `errors.duplicateEntry`, `errors.fetchFailed`, and `errors.referenceError`
  MUST exist in all 4 locale dictionaries (en, de, fr, es) with non-empty, user-friendly
  translated values.
- AC-2: The existing key `errors.notFound` (P2025) already exists. Verify it is present
  in all 4 locales.
- AC-3: The dictionary consistency test MUST pass after adding these keys.

**Edge cases:**

- Keys must be in the correct namespace file (likely a new `errors` section in the core
  dictionary, or a new `errors.ts` namespace file).
- Values should be generic ("A record with this value already exists") not technical
  ("Prisma P2002 unique constraint violation").

---

### F8 (MEDIUM) -- addJob does not validate statusId existence

**Current behavior:** `addJob` at line 365 passes `statusId: status` directly to
`prisma.job.create` without first verifying that the statusId refers to a real
`JobStatus` record. If a client submits a fabricated statusId, Prisma will throw a
foreign key constraint error (P2003), which is caught by `handleError` but returns a
generic error. There is no explicit validation.

**Acceptance criteria:**

- AC-1: `addJob` MUST verify that the provided `statusId` exists in the `JobStatus` table
  before creating the job.
- AC-2: If the statusId does not exist, `addJob` MUST return
  `{ success: false, message: "errors.notFound", errorCode: "NOT_FOUND" }`.
- AC-3: The validation should use `prisma.jobStatus.findFirst({ where: { id: status } })`
  -- JobStatus is a system table, no userId filter needed.

**Edge cases:**

- Empty string statusId -- should fail validation.
- Valid UUID format but non-existent record -- should fail with NOT_FOUND.
- The default schema value "draft" is not a valid statusId (it is a value, not an id) --
  see F10 coupling.

---

### F10 (LOW) -- AddJobFormSchema defaults to "draft" but seed renames to "bookmarked"

**Current behavior:** `src/models/addJobForm.schema.ts` line 51:
```
.default("draft")
```
But the seed file (`prisma/seed.ts`) renames "draft" to "bookmarked" (legacy migration).
If the form submits the default without selecting a status, the statusId will be
"draft", which is not a valid status ID (it is a value, and IDs are UUIDs).

**Acceptance criteria:**

- AC-1: The `AddJobFormSchema` status field default MUST either be removed (require
  explicit selection) or set to a semantically correct default that the UI always
  overrides.
- AC-2: The form component that uses this schema MUST always provide the actual statusId
  from the status list, never relying on the schema default.
- AC-3: If the Zod schema default is kept for type safety, it MUST be documented that the
  form always overrides it.

**Edge cases:**

- Schema validation with default value -- `"draft"` passes `.min(2)` validation (length 5).
- Direct server action call with no status field -- Zod applies the default, which is
  "draft" (not a UUID, will fail FK constraint in Prisma).

---

### F9 (LOW) -- getToday() stale past midnight in KanbanCard

**Current behavior:** `src/components/kanban/KanbanCard.tsx` line 14-18:
```
const getToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};
```
Line 29: `const today = useMemo(() => getToday(), []);`

The empty dependency array means `today` is computed once when the component mounts and
never updated. If a user keeps the browser tab open past midnight, due date comparisons
become stale: a job due "today" would show as "due in 1 day", and a job that became
overdue at midnight would still show as "due today".

**Acceptance criteria:**

- AC-1: The `today` value in KanbanCard MUST be refreshed when the date changes.
- AC-2: A reasonable refresh mechanism (e.g., re-compute on each render using a
  ref comparison, or a midnight interval) MUST ensure correctness without causing
  unnecessary re-renders.
- AC-3: Due date badges ("Overdue", "Due today", "Due in N days") MUST reflect the
  actual current date.

**Edge cases:**

- User opens page at 23:59, midnight passes -- badges must update.
- Multiple KanbanCards visible -- all must use the same "today" (module-level is fine
  if refreshed periodically).
- Timezone edge cases -- `new Date()` uses browser local time, which is correct for
  user-facing due dates.
- Component unmount before interval fires -- interval must be cleaned up.

---

### DAU-1 (MEDIUM) -- Rapid double-drag with no drag lock

**Current behavior:** `KanbanBoard.tsx` has no lock mechanism during the async
`handleTransitionConfirm` call. A user could:
1. Drag job A from "bookmarked" to "applied" (dialog opens)
2. Confirm the move (async call starts)
3. While the async call is in flight, drag job A again from "applied" to "interview"

The second drag operates on stale local state because `onRefresh` has not yet returned
the server-confirmed data.

**Acceptance criteria:**

- AC-1: While `isPending` is true (async status change in flight), drag-and-drop MUST
  be disabled for the job currently being transitioned.
- AC-2: Optionally, ALL drag-and-drop MUST be disabled while any transition is pending
  (simpler, prevents all race conditions).
- AC-3: The drag sensors should be disabled or the overlay should indicate "operation in
  progress".

**Edge cases:**

- User confirms dialog then immediately closes it -- pending state must still block.
- Server returns error -- drag must be re-enabled.
- Slow network (5+ second transition) -- user must see feedback that operation is pending.

---

### DAU-2 (HIGH) -- Two tabs, stale state, no compare-and-swap

**Current behavior:** `changeJobStatus` fetches the current job status and validates the
transition, but does not use optimistic locking / compare-and-swap. Scenario:

1. Tab A shows job in "bookmarked" status
2. Tab B moves job to "applied" (succeeds)
3. Tab A drags job from "bookmarked" (stale) to "rejected"
4. Server sees current status is "applied" (from Tab B's change)
5. "applied" -> "rejected" IS a valid transition, so it succeeds
6. But the user in Tab A intended "bookmarked" -> "rejected"

The fundamental issue is that Tab A's local state is stale and the server does not
verify the expected source status.

**Acceptance criteria:**

- AC-1: `changeJobStatus` MUST accept an optional `expectedFromStatusId` parameter.
- AC-2: When `expectedFromStatusId` is provided and the current job status does NOT
  match, the action MUST return
  `{ success: false, errorCode: "STALE_STATE", message: "errors.staleState" }`.
- AC-3: The Kanban UI MUST pass the expected source status when initiating a transition.
- AC-4: On STALE_STATE error, the UI MUST refresh the board and show a user-friendly
  message.

**Edge cases:**

- `expectedFromStatusId` is not provided (backward compatibility) -- skip the check.
- Job was deleted between the two tabs -- existing NOT_FOUND check covers this.
- Same status change submitted from both tabs simultaneously -- first wins, second gets
  STALE_STATE.
- Legacy callers (updateJobStatus wrapper) -- must still work without expected status.

---

### DAU-7 (HIGH) -- 500+ jobs, Kanban uses paginated getJobsList

**Current behavior:** `JobsContainer.tsx` line 109 calls `getJobsList(page, jobsPerPage,
filter, search)` with a default of `APP_CONSTANTS.RECORDS_PER_PAGE` (typically 25).
This paginated data is passed to the `KanbanBoard` component. A user with 500 jobs sees
only the first 25 on the Kanban board. Additionally, `getJobsList` does not fetch `tags`
in its select clause, so tag badges are never rendered on Kanban cards.

Meanwhile, `getKanbanBoard` (lines 770-843 of `job.actions.ts`) fetches ALL jobs with
tags and is specifically designed for the Kanban view, but it is never called from
JobsContainer.

**Acceptance criteria:**

- AC-1: The Kanban view in JobsContainer MUST use `getKanbanBoard()` instead of
  `getJobsList()` when `viewMode === "kanban"`.
- AC-2: The table view MUST continue using `getJobsList()` with pagination.
- AC-3: Kanban cards MUST display tag badges (the data must include tags).
- AC-4: Switching between kanban and table view MUST load the appropriate data source.

**Edge cases:**

- User with 0 jobs -- empty state must render correctly for both views.
- User with 1000+ jobs -- getKanbanBoard loads all, may be slow. Consider whether a
  performance warning or lazy loading per column is needed (future enhancement, not
  blocking).
- View mode switch while data is loading -- must handle abort/cancel correctly.
- Tags array is empty for some jobs -- should render without errors.

---

### EDGE-2 (MEDIUM) -- Status value not in STATUS_ORDER silently drops jobs

**Current behavior:** In `getKanbanBoard` (job.actions.ts line 824):
```
const columns: KanbanColumn[] = STATUS_ORDER
  .filter((statusValue) => statusMap.has(statusValue))
  .map(...)
```

Jobs whose status value is NOT in `STATUS_ORDER` (e.g., a custom status or a legacy
status like "saved" or "draft" that was not migrated) are grouped by
`jobsByStatus.get(statusValue)` but never displayed because no column is created for them.

Similarly, `useKanbanState.ts` line 127:
```
for (const statusValue of STATUS_ORDER) {
```
Same issue on the client side.

**Acceptance criteria:**

- AC-1: `getKanbanBoard` MUST NOT silently drop jobs with status values outside
  STATUS_ORDER.
- AC-2: Jobs with unrecognized status values MUST either:
  - (Option A) Appear in a catch-all "Other" column, OR
  - (Option B) Be mapped to the closest matching column (e.g., "draft" -> "bookmarked")
- AC-3: A test MUST verify that a job with a status value not in STATUS_ORDER is still
  present in the returned KanbanBoard data.

**Edge cases:**

- Status value is `null` or empty string (corrupted data) -- should not crash, should
  appear in catch-all or be filtered with a warning.
- Multiple unrecognized status values -- all should be handled.
- Legacy "draft" and "saved" values -- these are mapped in VALID_TRANSITIONS but not in
  STATUS_ORDER.

---

### EDGE-3 (MEDIUM) -- KanbanEmptyState rendered without onAddJob prop

**Current behavior:** `KanbanBoard.tsx` line 324:
```
return <KanbanEmptyState />;
```

`KanbanEmptyState` accepts an optional `onAddJob` prop. When not provided, only the
empty message renders -- no call-to-action button. The user sees "Add your first job
to start tracking" but has no button to actually add a job from this view.

**Acceptance criteria:**

- AC-1: `KanbanBoard` MUST pass an `onAddJob` callback to `KanbanEmptyState`.
- AC-2: The callback should navigate to or open the add-job flow.
- AC-3: The "Add Job" button MUST be visible in the empty state.

**Edge cases:**

- Empty state renders during initial load (loading=true, jobs=[]) -- currently covered
  by the skeleton check (`loading && jobs.length === 0`).
- User adds a job from the empty state -- the board should refresh and show the new job.

---

### EDGE-5 (MEDIUM) -- Within-column reorder is a no-op

**Current behavior:** `KanbanBoard.tsx` line 157:
```
if (sourceColumn === targetColumn) return;
```

When a user drags a card within the same column (to reorder), the handler returns
immediately without updating `sortOrder`. The server-side `updateKanbanOrder` action
supports same-column reorder (it only does sort order update when no status change),
but the client never calls it.

**Acceptance criteria:**

- AC-1: Dragging a card within the same column MUST update the card's `sortOrder` via
  `updateKanbanOrder(jobId, newSortOrder)` (no `newStatusId` parameter).
- AC-2: The new sort order MUST be persisted server-side so that the order survives
  page reload.
- AC-3: The visual order MUST update optimistically in the UI before the server confirms.

**Edge cases:**

- Dragging a card to the same position -- no-op is correct, no API call needed.
- Dragging the only card in a column -- no reorder possible, no API call.
- Sort order collision -- two cards with the same sort order after reorder. The
  midpoint strategy (newOrder = (above + below) / 2) should handle this.
- Rapid reorder of multiple cards -- each must trigger its own update (or debounce).

---

## 3. Test Scenario Matrix

### 3.1 Legend

- **U** = Unit test (Jest, direct function call, mocked Prisma)
- **C** = Component test (Jest + Testing Library, mocked hooks/actions)
- **I** = Integration test (Jest, multiple modules interacting)
- **E** = E2E test (Playwright, full browser)
- **D** = Dictionary validation test (key consistency across locales)

### 3.2 Matrix

| # | Finding | Test Case | Type | File Target |
|---|---------|-----------|------|-------------|
| 1 | F5 | updateJob with status change: valid transition succeeds, creates history | U | `__tests__/job.actions.spec.ts` |
| 2 | F5 | updateJob with status change: invalid transition returns INVALID_TRANSITION | U | `__tests__/job.actions.spec.ts` |
| 3 | F5 | updateJob with status change: non-existent newStatusId returns NOT_FOUND | U | `__tests__/job.actions.spec.ts` |
| 4 | F5 | updateJob with unchanged status: no transition validation, no history | U | `__tests__/job.actions.spec.ts` |
| 5 | F5 | updateJob with status change: emits JobStatusChanged domain event | U | `__tests__/job.actions.spec.ts` |
| 6 | F5 | updateJob with status change: computes side effects (applied flag/date) | U | `__tests__/job.actions.spec.ts` |
| 7 | F5 | E2E: edit job, change status to invalid target, form shows error | E | `e2e/crud/job.spec.ts` |
| 8 | F7 | No handleError callsite in actions/ passes a string NOT starting with "errors." | I | `__tests__/handleError-i18n-compliance.spec.ts` |
| 9 | F7 | All error i18n keys referenced in actions exist in all 4 locale dictionaries | D | `__tests__/dictionaries.spec.ts` |
| 10 | F6 | ToastClose renders translated dismiss text, not hardcoded "Dismiss" | C | `__tests__/toast-i18n.spec.ts` |
| 11 | F6 | ToastClose sr-only text changes with locale (de: "Schliessen") | C | `__tests__/toast-i18n.spec.ts` |
| 12 | F1-partial | errors.duplicateEntry exists in all 4 locales with non-empty value | D | `__tests__/dictionaries.spec.ts` |
| 13 | F1-partial | errors.fetchFailed exists in all 4 locales with non-empty value | D | `__tests__/dictionaries.spec.ts` |
| 14 | F1-partial | errors.referenceError exists in all 4 locales with non-empty value | D | `__tests__/dictionaries.spec.ts` |
| 15 | F1-partial | handleError returns errors.duplicateEntry for Prisma P2002 | U | `__tests__/lib-utils.spec.ts` |
| 16 | F1-partial | handleError returns errors.fetchFailed for fetch failed Error | U | `__tests__/lib-utils.spec.ts` |
| 17 | F1-partial | handleError returns errors.referenceError for Prisma P2003 | U | `__tests__/lib-utils.spec.ts` |
| 18 | F8 | addJob with non-existent statusId returns NOT_FOUND | U | `__tests__/job.actions.spec.ts` |
| 19 | F8 | addJob with valid statusId proceeds to create | U | `__tests__/job.actions.spec.ts` |
| 20 | F8 | addJob with empty string statusId fails validation | U | `__tests__/job.actions.spec.ts` |
| 21 | F10 | AddJobFormSchema default status value test (documents current behavior) | U | new or extend existing schema spec |
| 22 | F10 | Form always overrides default statusId with actual selection | C | component-level if add-job form is tested |
| 23 | F9 | getToday returns midnight-normalized date | U | `__tests__/kanban-card-today.spec.ts` |
| 24 | F9 | Due date badge shows "Overdue" when due date is yesterday | C | `__tests__/kanban-card-today.spec.ts` |
| 25 | F9 | Due date badge shows "Due today" when due date is today | C | `__tests__/kanban-card-today.spec.ts` |
| 26 | F9 | Due date badge shows "Due in N days" for future dates within 3 days | C | `__tests__/kanban-card-today.spec.ts` |
| 27 | DAU-1 | KanbanBoard disables drag while isPending is true | C | `__tests__/kanban-board-drag-lock.spec.ts` |
| 28 | DAU-1 | Transition dialog confirm sets isPending, blocks sensors | C | `__tests__/kanban-board-drag-lock.spec.ts` |
| 29 | DAU-2 | changeJobStatus with matching expectedFromStatusId succeeds | U | `__tests__/crm-actions.spec.ts` |
| 30 | DAU-2 | changeJobStatus with mismatched expectedFromStatusId returns STALE_STATE | U | `__tests__/crm-actions.spec.ts` |
| 31 | DAU-2 | changeJobStatus without expectedFromStatusId (backward compat) succeeds | U | `__tests__/crm-actions.spec.ts` |
| 32 | DAU-2 | updateKanbanOrder with expectedFromStatusId validates freshness | U | `__tests__/crm-actions.spec.ts` |
| 33 | DAU-2 | E2E: two-tab stale drag shows refresh message | E | `e2e/crud/kanban-stale.spec.ts` |
| 34 | DAU-7 | JobsContainer kanban view calls getKanbanBoard, not getJobsList | C | `__tests__/jobs-container-view-mode.spec.ts` |
| 35 | DAU-7 | JobsContainer table view calls getJobsList with pagination | C | `__tests__/jobs-container-view-mode.spec.ts` |
| 36 | DAU-7 | getKanbanBoard returns tags in job data | U | `__tests__/crm-actions.spec.ts` |
| 37 | DAU-7 | KanbanCard renders tag badges when tags are present | C | `__tests__/kanban-card-tags.spec.ts` |
| 38 | EDGE-2 | getKanbanBoard includes jobs with unrecognized status values | U | `__tests__/crm-actions.spec.ts` |
| 39 | EDGE-2 | useKanbanState includes jobs with legacy "draft" status | U | `__tests__/useKanbanState.spec.ts` |
| 40 | EDGE-2 | Jobs with status not in STATUS_ORDER appear in catch-all column | U | `__tests__/crm-actions.spec.ts` |
| 41 | EDGE-3 | KanbanBoard passes onAddJob to KanbanEmptyState | C | `__tests__/kanban-empty-state.spec.ts` |
| 42 | EDGE-3 | KanbanEmptyState renders Add Job button when onAddJob provided | C | `__tests__/kanban-empty-state.spec.ts` |
| 43 | EDGE-3 | KanbanEmptyState renders no button when onAddJob omitted | C | `__tests__/kanban-empty-state.spec.ts` |
| 44 | EDGE-5 | handleDragEnd within same column calls updateKanbanOrder with sort order | C | `__tests__/kanban-board-reorder.spec.ts` |
| 45 | EDGE-5 | Same-column reorder: no status change, no history, no event | U | `__tests__/crm-actions.spec.ts` |
| 46 | EDGE-5 | Same position drop (no actual reorder) is a no-op | C | `__tests__/kanban-board-reorder.spec.ts` |

---

## 4. Mock Strategy

### 4.1 Prisma Mocks (for Unit and Integration Tests)

All server action tests mock Prisma via `jest.mock("@prisma/client")`. The following
models and methods need mocking per finding:

**F5 (updateJob state machine):**
- `prisma.job.findFirst` -- return current job WITH Status relation (for comparing
  current vs new statusId)
- `prisma.jobStatus.findFirst` -- return the target status record
- `prisma.job.update` -- return updated job
- `prisma.jobStatusHistory.create` -- return history entry
- `prisma.$transaction` -- wrap update + history creation
- `prisma.jobTitle.findFirst`, `prisma.company.findFirst`, `prisma.location.findFirst`,
  `prisma.jobSource.findFirst` -- FK ownership mocks (already in existing test)
- Mock import: `@/lib/crm/status-machine` -- real implementation (not mocked) to test
  actual transition validation

**F8 (addJob statusId validation):**
- `prisma.jobStatus.findFirst` -- new mock for status existence check
- All existing FK ownership mocks remain

**DAU-2 (compare-and-swap):**
- `prisma.job.findFirst` -- return job with specific statusId for freshness check
- Existing `changeJobStatus` mocks plus assertion on `expectedFromStatusId` parameter

**DAU-7 (getKanbanBoard integration):**
- `prisma.jobStatus.findMany` -- return all statuses
- `prisma.job.findMany` -- return jobs WITH tags relation
- Verify the select clause includes `tags: { select: { id, label, value } }`

**EDGE-2 (unrecognized status):**
- `prisma.job.findMany` -- return a job with status value "custom_status" not in
  STATUS_ORDER
- `prisma.jobStatus.findMany` -- return standard statuses PLUS the custom one

### 4.2 Hook and Function Mocks (for Component Tests)

**F6 (Toast i18n):**
- Mock `@/i18n` -- `useTranslations` returning `t` function that resolves
  `common.dismiss` to the correct locale value

**F9 (getToday staleness):**
- Mock `Date` constructor to control time (use `jest.useFakeTimers()` and
  `jest.setSystemTime()`)
- Test: set time to 23:59, render KanbanCard, advance to 00:01, verify badge update

**DAU-1 (drag lock):**
- Mock `changeJobStatus` action as an async function with controllable resolution
- Mock dnd-kit sensor activation to verify disabled state

**EDGE-3 (empty state prop):**
- Render `KanbanBoard` with `jobs=[]` and `loading=false`
- Assert `KanbanEmptyState` receives `onAddJob` prop

**EDGE-5 (within-column reorder):**
- Mock `updateKanbanOrder` action
- Simulate DnD end event with `sourceColumn === targetColumn`
- Assert `updateKanbanOrder` called with `(jobId, newSortOrder)` and NO `newStatusId`

### 4.3 Module Mocks (shared across test files)

These modules are mocked in almost every server action test:

| Module | Mock |
|--------|------|
| `@/utils/user.utils` | `getCurrentUser: jest.fn()` returning `{ id: "user-id" }` |
| `next/cache` | `revalidatePath: jest.fn()` |
| `@/lib/events` | `emitEvent: jest.fn()`, `createEvent: jest.fn()`, `DomainEventTypes` enum |
| `@prisma/client` | Full PrismaClient mock with chained methods |

### 4.4 Dictionary Validation (no mocks needed)

Tests #12-14 and #9 are pure data validation tests that import real dictionary files
and check for key existence and non-empty values. No mocks required.

The existing `dictionaries.spec.ts` already validates key consistency across locales.
New error keys will be automatically caught by the existing test if they are added to
a namespace dictionary. If they are added to the core dictionary, the core consistency
test covers them.

### 4.5 E2E Test Infrastructure

Tests #7 and #33 require Playwright:

- Use existing `e2e/helpers/index.ts` utilities (login, expectToast, uniqueId)
- Use `storageState` for authenticated sessions (crud project)
- Test #7 (edit job invalid transition): Create job, attempt status edit via form to
  invalid target, assert error toast
- Test #33 (two-tab stale): Complex -- requires two browser contexts with independent
  sessions viewing the same job. May be deferred to a manual test protocol if Playwright
  multi-tab is too fragile.

---

## 5. Verification of Already-Fixed Items

The following items are marked as fixed. Existing tests should continue to pass, and
no new tests are needed. However, verify during implementation that these remain intact:

| ID | What to Verify | Where |
|----|----------------|-------|
| F1 | errors.notFound, errors.invalidTransition, errors.noteTooLong, errors.invalidSortOrder keys exist in dictionaries | `__tests__/dictionaries.spec.ts` |
| F2 | jobs.kanbanChangeStatusMobile key exists in all 4 locales | Dictionary consistency check |
| F3 | KanbanColumn uses getStatusLabel (no duplicate logic) | Visual inspection or grep |
| F4 | Undo toast only shows when canUndo is true | `__tests__/undo-store.spec.ts` |

**Verification method:** Run `bash scripts/test.sh --no-coverage` after all fixes.
All existing tests must pass unchanged. The dictionary consistency test
(`dictionaries.spec.ts`) automatically catches any regression in key coverage.

---

## 6. Implementation Priority

Recommended implementation order based on severity and dependency:

1. **F5 (HIGH)** -- updateJob state machine enforcement. Foundation for correctness.
2. **DAU-2 (HIGH)** -- compare-and-swap. Prevents silent data corruption.
3. **DAU-7 (HIGH)** -- Kanban data source. Prevents data loss for large users.
4. **F8 (MEDIUM)** -- addJob statusId validation. Quick fix, reduces error surface.
5. **F1-partial (MEDIUM)** -- Dictionary keys. Quick fix, improves error UX.
6. **F7 (MEDIUM)** -- handleError i18n. Large scope but mechanical refactoring.
7. **F6 (MEDIUM)** -- Toast dismiss i18n. Small, self-contained.
8. **EDGE-2 (MEDIUM)** -- Unrecognized status handling. Prevents silent data loss.
9. **DAU-1 (MEDIUM)** -- Drag lock. Prevents race conditions.
10. **EDGE-5 (MEDIUM)** -- Within-column reorder. Feature completion.
11. **EDGE-3 (MEDIUM)** -- Empty state onAddJob. UX polish.
12. **F10 (LOW)** -- Schema default alignment. Low risk, documentation fix.
13. **F9 (LOW)** -- getToday staleness. Edge case, low probability.
