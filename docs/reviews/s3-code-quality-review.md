# S3 CRM Core -- Code Quality Review

**Date:** 2026-04-02
**Reviewer:** Claude Opus 4.6 (Code Review Expert)
**Scope:** S3 CRM Core -- Job Status Workflow (5.3) + Kanban Board (5.6)
**Files reviewed:** 15 core files, cross-referenced with Prisma schema, seed data, constants, and test suites

---

## Summary

The S3 CRM Core implementation is solid overall. The state machine is clean and well-tested, the DDD boundary is respected (Job Aggregate owns all status transitions), and IDOR enforcement is consistent. The code follows the project conventions with proper i18n, domain events, and transaction boundaries.

However, this review identified **13 new findings** that were not part of the original S3 review (CR-01 through CR-12 and S3-D1 through S3-D4). Findings are organized by severity.

**Severity distribution:** 1 High, 7 Medium, 5 Low

---

## Findings

### CQ-01 -- Missing Note Validation in updateKanbanOrder

**Severity:** High
**File:** `src/actions/job.actions.ts`, lines 786-908
**Category:** Input validation gap

`changeJobStatus` correctly validates note length (line 610: `if (note && note.length > 500)`), but `updateKanbanOrder` accepts a `note` parameter (line 790) and passes it through to `jobStatusHistory.create` (line 862) without any length validation. This is a second entry point for status transitions that bypasses the note-length guard.

A malicious client could call `updateKanbanOrder` directly (it is a server action exported from a `"use server"` file) and supply an arbitrarily long note string.

**Fix:** Add the same validation that exists in `changeJobStatus`.

```typescript
// In updateKanbanOrder, after the sortOrder validation (line 801):
if (note && note.length > 500) {
  return { success: false, message: "errors.noteTooLong", errorCode: "VALIDATION_ERROR" };
}
```

---

### CQ-02 -- "expired" Status Divergence Between Seed and State Machine

**Severity:** Medium
**File:** `prisma/seed.ts` line 38, `src/lib/crm/status-machine.ts`, `src/lib/constants.ts` line 54
**Category:** Data model inconsistency

The seed script creates an "expired" status in the database (`{ label: "Expired", value: "expired" }`). The `JOB_STATUSES` array in `constants.ts` also includes "expired". However, the state machine in `status-machine.ts` has no transitions defined for "expired", `STATUS_ORDER` does not include it, `STATUS_COLORS` in `useKanbanState.ts` has no entry for it, and `STATUS_COLOR_NAMES` in the machine has no entry for it.

This means:
- Jobs with "expired" status appear in the database but are invisible on the Kanban board (filtered out by the `STATUS_ORDER` loop in `getKanbanBoard`).
- The `isValidTransition` function returns `false` for any transition from "expired" because `VALID_TRANSITIONS["expired"]` is `undefined`.
- Jobs stuck in "expired" cannot be moved to any other status through the CRM workflow.

**Fix:** Either (a) add "expired" to the state machine with appropriate transitions and UI colors, or (b) remove it from the seed and constants, and add a migration that remaps existing "expired" jobs to "archived". Option (b) is likely correct since the S3 design intentionally replaced "expired" with "archived".

---

### CQ-03 -- Duplicated getStatusLabel Helper Across Three Components

**Severity:** Medium
**File:** `src/components/kanban/KanbanBoard.tsx` line 332, `src/components/kanban/KanbanColumn.tsx` line 36, `src/components/kanban/StatusTransitionDialog.tsx` line 55
**Category:** Code duplication / DRY violation

The same `getStatusLabel` function is implemented independently in three separate components. All three use the identical pattern:

```typescript
const key = `jobs.status${status.value.charAt(0).toUpperCase()}${status.value.slice(1)}`;
const translated = t(key);
return translated !== key ? translated : status.label;
```

The three copies have subtly different signatures (one accepts `JobStatus | null`, the others accept `JobStatus`), which creates divergence risk.

**Fix:** Extract a shared utility function.

```typescript
// src/lib/crm/status-labels.ts
import type { JobStatus } from "@/models/job.model";

export function getStatusLabel(
  t: (key: string) => string,
  status: JobStatus | null,
): string {
  if (!status) return "";
  const key = `jobs.status${status.value.charAt(0).toUpperCase()}${status.value.slice(1)}`;
  const translated = t(key);
  return translated !== key ? translated : status.label;
}
```

Then import and use in all three components.

---

### CQ-04 -- Raw String Interpolation Instead of Parameterized i18n

**Severity:** Medium
**File:** `src/components/kanban/KanbanBoard.tsx` lines 173-174, 219, 280-281, 360-386
**Category:** i18n fragility / maintainability

Translation strings are interpolated using chained `.replace("{from}", ...)` calls. This pattern has two problems:

1. **Order dependence:** If a translation contains `{from}` inside the replacement text for another placeholder, the second `.replace` could corrupt it.
2. **Inconsistency:** In `KanbanBoard.tsx` lines 173-174, the toast for invalid transition uses `fromStatus.label` (raw database label, not translated), while the `StatusTransitionDialog.tsx` uses `getStatusLabel(fromStatus)` (translated). This means the same "invalid transition" toast will show English labels even in German locale.

**Fix for the untranslated labels (lines 173-174 and 280-281):**

```typescript
// Before (KanbanBoard.tsx line 173):
.replace("{from}", fromStatus.label)
.replace("{to}", toStatus.label),

// After:
.replace("{from}", getStatusLabel(fromStatus))
.replace("{to}", getStatusLabel(toStatus)),
```

This also requires importing the extracted `getStatusLabel` or using the local one already defined at line 332.

---

### CQ-05 -- Kanban Board Fetches All Jobs Without Pagination

**Severity:** Medium
**File:** `src/actions/job.actions.ts` lines 705-779 (`getKanbanBoard`)
**Category:** Performance / scalability

`getKanbanBoard` fetches ALL jobs for the user in a single query (line 716: `prisma.job.findMany({ where: { userId: user.id } })`) with no `take` limit. For users with hundreds or thousands of tracked jobs, this will:

- Load all jobs into memory on each board render.
- Serialize all jobs across the server-action boundary.
- Force the client to hold all jobs in React state.

The table view uses pagination (`getJobsList` with `skip`/`take`), but the Kanban view does not.

**Fix (short-term):** Add a reasonable cap per column.

```typescript
// In getKanbanBoard, add a limit:
const MAX_JOBS_PER_COLUMN = 50;

// After grouping, truncate each column and note total:
const columnJobs = (jobsByStatus.get(statusValue) ?? []).slice(0, MAX_JOBS_PER_COLUMN);
const totalInColumn = (jobsByStatus.get(statusValue) ?? []).length;

return {
  // ...existing fields...
  jobCount: totalInColumn,  // total count (already correct)
  jobs: columnJobs,          // capped display list
};
```

**Fix (longer-term):** Implement virtual scrolling per column or lazy loading.

---

### CQ-06 -- Stale Closure in setUndoWithTimeout Callback

**Severity:** Medium
**File:** `src/hooks/useKanbanState.ts` lines 145-156
**Category:** React correctness

The `setUndoWithTimeout` callback captures `undoState` from its closure (line 147: `if (undoState) { clearTimeout(undoState.timeout); }`). Because `undoState` is in the dependency array of `useCallback` (line 156), the callback is recreated on every undo state change, which is correct for the clear logic. However, this means every consumer that depends on `setUndoWithTimeout` (like `KanbanBoard`'s `handleTransitionConfirm`) is also recreated, potentially causing unnecessary re-renders of the entire board.

More critically, if `setUndoWithTimeout` is called rapidly (two quick drag-and-drops), the second call captures the stale `undoState` from before the first `setUndoState` has flushed, so `clearTimeout` may miss the first timer.

**Fix:** Use a ref for the timeout handle instead of storing it in state.

```typescript
const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const setUndoWithTimeout = useCallback((state: Omit<UndoState, "timeout">) => {
  if (undoTimeoutRef.current) {
    clearTimeout(undoTimeoutRef.current);
  }

  const timeout = setTimeout(() => {
    setUndoState(null);
    undoTimeoutRef.current = null;
  }, 5000);

  undoTimeoutRef.current = timeout;
  setUndoState({ ...state, timeout });
}, []); // No dependency on undoState
```

---

### CQ-07 -- Transaction Not Used for getStatusDistribution (Two Sequential Queries)

**Severity:** Medium
**File:** `src/actions/job.actions.ts` lines 965-1000
**Category:** Data consistency

`getStatusDistribution` issues two sequential queries: `prisma.job.groupBy` and `prisma.jobStatus.findMany`. If a status is deleted or renamed between the two queries, the join in lines 983-993 would silently drop counts (the `filter` on line 993 removes nulls). This is unlikely in practice since statuses are system-wide, but it is a correctness gap in the DDD aggregate consistency model.

**Fix:** No immediate fix needed, but add a comment documenting the eventual consistency assumption, or use `$transaction` for read consistency.

```typescript
// Add comment:
// NOTE: Two sequential queries. Status renames between queries could cause
// a count to be silently dropped. Acceptable for dashboard display.
```

---

### CQ-08 -- KanbanBoard Component Has Excessive Responsibilities (297 Lines of Logic)

**Severity:** Medium
**File:** `src/components/kanban/KanbanBoard.tsx`
**Category:** Component cohesion / Single Responsibility

`KanbanBoard.tsx` is a 529-line component that handles:
1. DnD sensor configuration and event routing (lines 77-188)
2. Status transition confirmation flow (lines 190-263)
3. Mobile status change handler (lines 270-289)
4. Desktop DnD board rendering (lines 340-444)
5. Mobile tab-based board rendering (lines 447-515)
6. Drag overlay rendering (lines 434-442)
7. Toast and undo logic (lines 212-243)
8. Accessibility announcements (lines 353-389)

This single component mixes multiple concerns. The mobile and desktop experiences could be separate components. The transition logic (confirm, cancel, undo) could be extracted into a custom hook.

**Fix:** Extract at minimum:
- `useKanbanDnd()` hook -- encapsulates DnD sensor config, drag start/over/end/cancel handlers, active/over state.
- `useStatusTransition()` hook -- encapsulates dialog state, confirm/cancel handlers, undo logic.
- `KanbanMobileView` component -- the entire Tabs-based mobile section.

This would reduce `KanbanBoard.tsx` to approximately 150 lines of composition.

---

### CQ-09 -- Undo via Reverse Transition May Violate State Machine

**Severity:** Low
**File:** `src/components/kanban/KanbanBoard.tsx` lines 224-233
**Category:** Domain logic edge case

The undo action calls `changeJobStatus(job.id, fromStatus.id)` to reverse a transition. However, the reverse transition may not be valid in the state machine. For example:

- User drags "bookmarked" to "applied" (valid).
- Undo attempts "applied" to "bookmarked" -- but `VALID_TRANSITIONS["applied"]` does not include `"bookmarked"`.

This means the undo will fail with `INVALID_TRANSITION`, showing "Undo failed" to the user. The undo button creates an expectation that the action is reversible, but the state machine does not guarantee this.

**Fix:** Either (a) check `isValidTransition` before showing the undo button, or (b) have the undo bypass the state machine by using a dedicated `revertJobStatus` action that writes the history entry with a `note: "Undo"` flag and does not validate the transition.

Option (a) is simpler and more honest:

```typescript
// Only show undo action if reverse transition is valid
const canUndo = isValidTransition(toStatus.value, fromStatus.value);

toast({
  title: t("jobs.kanbanMoved").replace("{status}", statusLabel),
  description: job.JobTitle?.label,
  ...(canUndo ? {
    action: (
      <ToastAction altText={t("jobs.kanbanUndo")} onClick={...}>
        {t("jobs.kanbanUndo")}
      </ToastAction>
    ),
  } : {}),
  duration: 5000,
});
```

---

### CQ-10 -- No Unit Tests for KanbanBoard, KanbanCard, or KanbanColumn Components

**Severity:** Low
**File:** `__tests__/` directory
**Category:** Test coverage gap

The project's CLAUDE.md states: "Every feature, bugfix, and refactoring MUST include tests." The S3 implementation has good test coverage for:
- `status-machine.ts` -- 220 lines of thorough tests
- `crm-actions.spec.ts` -- 456 lines covering all server actions
- `JobsContainer.spec.tsx` -- properly mocks Kanban components

However, there are no component tests for:
- `KanbanBoard.tsx` -- DnD interactions, transition dialog flow, mobile/desktop switching
- `KanbanCard.tsx` -- due date badge logic (overdue, due soon, due today calculations)
- `KanbanColumn.tsx` -- collapsed/expanded rendering, drop target visual states
- `StatusTransitionDialog.tsx` -- form submission, note trimming, cancel behavior
- `KanbanEmptyState.tsx` -- render with/without `onAddJob` prop
- `useKanbanState.ts` -- column building, collapse persistence, undo timeout

The `KanbanCard` due-date logic (lines 43-49) in particular has branching conditions (overdue, dueToday, dueSoon, normal) that warrant dedicated unit tests.

**Fix:** Add at minimum:
1. `__tests__/useKanbanState.spec.ts` -- test column building, collapse toggle, undo timeout.
2. `__tests__/KanbanCard.spec.tsx` -- test due date badge variants with fixed `Date.now()`.
3. `__tests__/StatusTransitionDialog.spec.tsx` -- test note submission and cancel behavior.

---

### CQ-11 -- Float sortOrder Precision Drift Risk

**Severity:** Low
**File:** `prisma/schema.prisma` line 301, `src/actions/job.actions.ts` line 841
**Category:** Technical debt / long-term maintainability

The `sortOrder` field uses `Float @default(0)`. The typical Kanban reorder strategy with floats is to set the new position as the midpoint between two neighbors (e.g., between 1.0 and 2.0, insert at 1.5). After many reorders, the float values converge and eventually lose precision.

SQLite stores floats as IEEE 754 doubles with approximately 15 significant digits. After ~50 successive midpoint insertions between two values, the precision is exhausted and ordering breaks.

**Fix:** This is not urgent but should be tracked. The standard mitigation is to periodically renormalize sort orders to integers (e.g., gap 1000). Add a comment documenting this limitation:

```typescript
// TECH DEBT: Float midpoint insertion degrades after ~50 successive
// reorders between the same two items. Track as a future renormalization task.
```

---

### CQ-12 -- addJob Creates History Entry But Does Not Validate Initial Status

**Severity:** Low
**File:** `src/actions/job.actions.ts` lines 288-381 (`addJob`)
**Category:** Defensive validation gap

`addJob` creates a `JobStatusHistory` entry for the initial status (line 350-359), which is good for audit completeness. However, it does not validate that the provided `status` ID actually corresponds to a valid initial status in the workflow. Any status ID from the database is accepted, meaning a manually crafted request could create a job directly in the "accepted" or "offer" state.

The state machine comment at line 18-19 explicitly notes "Exception: initial status on job creation (no previous status)" -- this is by design. However, the comment implies any status is valid as an initial state, which may not be the intended business rule.

**Fix:** If the business rule is that new jobs should start only in "bookmarked" or "applied", add a validation:

```typescript
const VALID_INITIAL_STATUSES = ["bookmarked", "applied"];

const newStatus = await prisma.jobStatus.findFirst({ where: { id: status } });
if (!newStatus || !VALID_INITIAL_STATUSES.includes(newStatus.value)) {
  return { success: false, message: "errors.invalidInitialStatus", errorCode: "VALIDATION_ERROR" };
}
```

If any initial status is intentionally valid (e.g., importing jobs from another system), document this explicitly and leave as-is.

---

### CQ-13 -- Redundant Data Fetch Pattern in JobsContainer for Kanban Mode

**Severity:** Low
**File:** `src/components/myjobs/JobsContainer.tsx` lines 106-131, 321-327
**Category:** Performance / unnecessary work

When `viewMode === "kanban"`, `JobsContainer` still calls `getJobsList` (paginated, with select/filter) on every mount and search change. The Kanban board component receives these same paginated jobs. But the server-side `getKanbanBoard` action fetches ALL jobs (unpaginated) with a different select shape.

This means in Kanban mode, the `getJobsList` call is wasted work -- the results are passed to `KanbanBoard`, but the board internally sorts by column, not by the list view's pagination. The table-view pagination state (`page`, `totalJobs`, load-more button) is invisible in Kanban mode but still managed.

**Fix:** In Kanban mode, skip the `getJobsList` fetch and have `KanbanBoard` call `getKanbanBoard` internally. Alternatively, have `JobsContainer` conditionally choose its data-fetching strategy based on `viewMode`.

---

## Positive Observations

These aspects of the S3 implementation are particularly well done:

1. **State machine isolation:** `status-machine.ts` is a pure function module with no side effects, no I/O, and no framework dependencies. It is trivially testable and serves as the single source of truth.

2. **Transaction boundaries:** Both `changeJobStatus` and `updateKanbanOrder` correctly use `$transaction` to atomically update the job and create the history entry.

3. **Domain event publishing:** Events are emitted AFTER the transaction commits, preventing phantom events for failed transactions.

4. **IDOR enforcement:** Every Prisma query in the new CRM actions includes `userId: user.id` in the where clause, consistent with ADR-015.

5. **Test coverage for server actions:** `crm-actions.spec.ts` covers authentication, authorization, valid transitions, invalid transitions, side effects, and event publishing.

6. **Accessibility:** The Kanban board includes ARIA announcements for drag operations, keyboard navigation, `role="group"` on columns, and `role="list"` on card containers.

7. **Legacy compatibility:** The state machine and seed script handle the "draft"/"saved" to "bookmarked" migration gracefully.

---

## Priority Matrix

| ID | Severity | Effort | Priority |
|----|----------|--------|----------|
| CQ-01 | High | Low (1 line) | Fix immediately |
| CQ-02 | Medium | Medium | Fix in next session |
| CQ-03 | Medium | Low | Fix in next session |
| CQ-04 | Medium | Low | Fix in next session |
| CQ-05 | Medium | Medium | Track for scaling |
| CQ-06 | Medium | Medium | Fix in next session |
| CQ-07 | Medium | Low | Document only |
| CQ-08 | Medium | High | Refactor when adding features |
| CQ-09 | Low | Low | Fix in next session |
| CQ-10 | Low | High | Add incrementally |
| CQ-11 | Low | Low | Document only |
| CQ-12 | Low | Low | Document or fix based on business rule |
| CQ-13 | Low | Medium | Optimize when adding Kanban server fetch |
