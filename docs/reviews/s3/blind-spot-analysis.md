# CRM Core Blind Spot Analysis (S3)

Date: 2026-04-02
Scope: CRM Status Workflow (5.3) + Kanban Board (5.6)
Files reviewed:
- `specs/crm-workflow.allium`
- `src/actions/job.actions.ts` (CRM functions)
- `src/components/kanban/KanbanBoard.tsx`
- `src/hooks/useKanbanState.ts`
- `src/lib/crm/status-machine.ts`
- `e2e/crud/kanban.spec.ts`
- `prisma/schema.prisma` (JobStatusHistory, Job.sortOrder)
- `prisma/seed.ts` (legacy migration)
- `src/app/api/v1/jobs/[id]/route.ts` (Public API PATCH)
- `src/lib/events/event-types.ts`

---

## Findings

### 1. CRITICAL — `updateJob` bypasses state machine validation entirely

**File:** `src/actions/job.actions.ts` lines 352-421

The `updateJob` server action accepts a `status` (statusId) field and writes it directly to the database via `prisma.job.update({ data: { statusId: status } })`. It performs **no state machine validation**, creates **no JobStatusHistory entry**, publishes **no domain event**, and applies **no side effects** (appliedDate, applied flag).

This is a "use server" export, so it is callable from the browser. A user editing a job through the AddJob dialog can change status from any value to any other value, completely circumventing the CRM workflow spec. The spec states: "Every status transition MUST be validated against JobStatusTransitions" (invariant StateMachineEnforcement).

**Impact:** The entire state machine can be bypassed through the edit job form. History/audit trail is silently skipped.

**Fix:** Either (a) strip `statusId` from `updateJob` and force all status changes through `changeJobStatus`, or (b) add state machine validation + history creation to `updateJob` when `statusId` differs from the current value.

---

### 2. CRITICAL — Public API v1 PATCH bypasses state machine validation

**File:** `src/app/api/v1/jobs/[id]/route.ts` lines 169-196

The `PATCH /api/v1/jobs/:id` endpoint accepts a `status` field and writes `data.statusId = resolvedStatus.id` directly to Prisma. No state machine validation, no JobStatusHistory creation, no domain event, no side effects. An API consumer can transition any job to any status arbitrarily.

This means external integrations (Zapier, scripts, etc.) can break the CRM workflow invariants. The spec's `StateMachineEnforcement` invariant is violated.

**Impact:** External API consumers can corrupt the audit trail and create impossible state transitions.

**Fix:** Add state machine validation to the PATCH handler when `status` field is present. Either call `changeJobStatus` internally or replicate its validation logic.

---

### 3. CRITICAL — `addJob` does not create an initial JobStatusHistory entry

**File:** `src/actions/job.actions.ts` lines 286-350

The spec (rule `InitialStatusOnManualCreate`) requires: "When a user creates a job manually, a JobStatusHistory entry with previousStatusValue = 'none' is created." The `addJob` function creates the Job but does not create a `JobStatusHistory` record and does not publish a `JobStatusChanged` event.

This means manually created jobs have no history anchor. The Timeline (5.9) will show nothing for the initial creation. The audit trail is incomplete.

**Impact:** All manually created jobs are missing their initial history entry. Timeline feature will show gaps for every existing job.

**Fix:** Wrap job creation in a `$transaction` that also creates a `JobStatusHistory` entry with `previousStatusId: null` and `newStatusId: status`.

---

### 4. CRITICAL — Undo can fail silently on non-reversible transitions

**File:** `src/components/kanban/KanbanBoard.tsx` lines 224-236

The undo handler calls `changeJobStatus(job.id, fromStatus.id)` to reverse a transition. However, it does not check if the reverse transition is valid in the state machine before calling. Consider: a user moves a job from `bookmarked` to `applied`. The undo attempts `applied -> bookmarked`, but the state machine does NOT allow `applied -> bookmarked`. The server action will return `{ success: false, message: "errors.invalidTransition" }`, the toast shows "Failed to undo move", but the user has no path to fix it.

**Affected one-way transitions where undo fails:**
- `bookmarked -> applied` (no reverse: applied cannot go back to bookmarked)
- `bookmarked -> rejected` (reverse exists: rejected -> bookmarked -- OK)
- `applied -> interview` (no reverse: interview cannot go back to applied)
- `applied -> rejected` (reverse: rejected -> bookmarked, but that goes to bookmarked, not applied)
- `interview -> offer` (no reverse)
- `offer -> accepted` (no reverse)

**Impact:** Undo button is shown for transitions that cannot be reversed, giving users false confidence. Multiple common transitions (bookmarked->applied, applied->interview) will fail on undo.

**Fix:** Either (a) only show the Undo button when the reverse transition is valid (check `isValidTransition(toStatus.value, fromStatus.value)` before rendering), or (b) make undo a special operation that bypasses the state machine (with appropriate auditing).

---

### 5. HIGH — No optimistic locking / concurrent tab protection

**Files:** `src/actions/job.actions.ts` (changeJobStatus, updateKanbanOrder)

Neither `changeJobStatus` nor `updateKanbanOrder` uses optimistic locking. The flow is:
1. Read current status
2. Validate transition
3. Write new status

If two tabs (or the user and an automation) both read `bookmarked`, both validate `bookmarked -> applied` as valid, and both write, the second write silently succeeds with a duplicate history entry. Worse: if tab A moves `bookmarked -> applied` and tab B moves `bookmarked -> rejected`, both succeed because each validated against the stale read.

SQLite's serialized transactions mitigate some of this, but the read-then-validate-then-write pattern is outside a single transaction boundary (the read happens before `$transaction`).

**Impact:** Two simultaneous status changes can both succeed, creating conflicting history entries and an inconsistent state.

**Fix:** Move the ownership + current status fetch inside the `$transaction` block, or add an `updatedAt` check (optimistic locking) to the `where` clause of the update.

---

### 6. HIGH — `sortOrder` has no input validation (Infinity, NaN, negative)

**File:** `src/actions/job.actions.ts` line 790

`updateKanbanOrder` accepts `newSortOrder: number` with zero validation. A crafted client request could send `Infinity`, `-Infinity`, `NaN`, or extremely large/small floats. `NaN` stored in SQLite's REAL column would corrupt sorting. `Infinity` would make all subsequent between-card insertions calculate `(Infinity + x) / 2 = Infinity`, breaking sort order permanently for that column.

**Impact:** A single malicious or buggy request can permanently break card ordering in a column.

**Fix:** Add validation: `if (!Number.isFinite(newSortOrder)) return error`. Optionally clamp to a reasonable range (e.g., -1e15 to 1e15).

---

### 7. HIGH — Within-column reorder is a no-op in the UI

**File:** `src/components/kanban/KanbanBoard.tsx` line 159-160

```typescript
// Same column - reorder (no-op for now, could add sort order)
if (sourceColumn === targetColumn) return;
```

The server action `updateKanbanOrder` supports reordering (it can update `sortOrder` without changing status), and the Prisma query sorts by `sortOrder`. But the UI handler silently drops same-column drag-and-drop. Meanwhile, `useKanbanState` sorts cards by `createdAt desc` (line 152-154), completely ignoring the `sortOrder` field from the database.

This means: (a) users cannot reorder cards within a column, contradicting spec rule `KanbanReorder`; (b) the `sortOrder` field in the database is never written by any UI path; (c) the UI sorts by createdAt, not by sortOrder, so even if sortOrder were written, it would be ignored.

**Impact:** The KanbanReorder spec rule is unimplemented in the UI. The sortOrder field and database index are dead code.

**Fix:** Implement same-column reorder using `@dnd-kit/sortable`'s `SortableContext` within each column. Update `useKanbanState` to sort by `sortOrder` (falling back to `createdAt`).

---

### 8. HIGH — `"expired"` status still seeded but has no state machine transitions

**File:** `prisma/seed.ts` line 38

The seed data still includes `{ label: "Expired", value: "expired" }`. The state machine in `status-machine.ts` has no entry for `expired`. The spec says "expired" is removed, subsumed by "archived". But if a user has existing jobs with status "expired", those jobs:
- Will appear in the Kanban board as a column (since `getKanbanBoard` iterates all statuses)
- But the column has no position in `STATUS_ORDER` (neither in `status-machine.ts` nor `useKanbanState.ts`)
- Cannot be transitioned anywhere (no transitions defined for "expired")
- Are effectively stuck

The seed script handles legacy `draft`/`saved` renames but does NOT handle the `expired -> archived` migration described in the spec.

**Impact:** Users with "expired" jobs are stuck with untransitionable jobs and a phantom column.

**Fix:** Add `expired: { label: "Archived", value: "archived" }` to `LEGACY_STATUS_RENAMES` in `seed.ts`, or add `expired` transitions to the state machine mapping to `archived`.

---

### 9. HIGH — Duplicate state machine definition (client vs. server)

**Files:**
- `src/lib/crm/status-machine.ts` (server, authoritative)
- `src/hooks/useKanbanState.ts` lines 45-54 (client, duplicated)

The `VALID_TRANSITIONS` map is defined in two places. The client copy in `useKanbanState.ts` includes `draft: ["applied", "archived"]` but is missing `draft: [..., "rejected"]` which the server copy does not have either (the server has `draft: ["applied", "archived", "rejected"]`).

Divergence already exists: the client's `draft` allows `["applied", "archived"]` (2 targets), but the server's `draft` allows `["applied", "archived", "rejected"]` (3 targets). When these diverge further, the client will show transitions as valid that the server rejects (or vice versa), creating confusing UX.

**Impact:** Client-side validation silently differs from server-side. Will worsen over time as only one copy gets updated.

**Fix:** Import `VALID_TRANSITIONS` and `isValidTransition` from `@/lib/crm/status-machine` in both client and server code. Remove the duplicate in `useKanbanState.ts`. The `status-machine.ts` file has no `"use server"` or `import "server-only"` directive, so it is safe to import in client components.

---

### 10. HIGH — No pagination for large columns (1000+ jobs)

**File:** `src/actions/job.actions.ts` (getKanbanBoard, lines 718-733)

`getKanbanBoard` fetches ALL jobs for the user in a single query with no limit. For a power user with 1000+ jobs, this:
- Sends a large payload over the wire
- Forces the client to render 1000+ React components simultaneously
- Makes `@dnd-kit` slow (it measures/tracks every draggable item)

The spec (rule GetKanbanBoard, @guidance) explicitly notes: "for users with many jobs (100+), consider pagination within columns."

**Impact:** Performance degrades significantly for power users. Kanban board becomes unusable past ~200-300 jobs.

**Fix:** Add per-column pagination (e.g., load first 50 per column, "Load more" button) or implement virtualized scrolling within columns.

---

### 11. HIGH — `updateJobStatus` (legacy) still exists alongside `changeJobStatus`

**File:** `src/actions/job.actions.ts` lines 423-473

The old `updateJobStatus` function is still exported as a server action. It:
- Does NOT validate against the state machine
- Does NOT create JobStatusHistory entries
- Does NOT publish domain events
- Always overwrites `appliedDate` on every transition to "applied" (violating AppliedDateImmutability invariant)

Any component still calling `updateJobStatus` instead of `changeJobStatus` bypasses the entire CRM workflow.

**Impact:** If any code path still uses the old function, it silently breaks all CRM invariants.

**Fix:** Either remove `updateJobStatus` entirely (breaking change) or make it delegate to `changeJobStatus`. Grep callers to verify none remain.

---

### 12. MEDIUM — JobStatusHistory stores statusId instead of status value

**File:** `prisma/schema.prisma` lines 606-609

The spec (entity JobStatusHistory) states: "previousStatusValue and newStatusValue store the string values (e.g., 'bookmarked', 'applied'), NOT the JobStatus UUID. This makes the audit log self-contained -- it remains readable even if JobStatus records are ever modified."

The implementation stores `previousStatusId` and `newStatusId` as foreign keys to `JobStatus`. If a status is ever renamed or deleted, the history entries either lose their meaning (SET NULL on the previous status FK) or become unreadable.

The spec explicitly chose string values for self-contained auditability, but the implementation chose FK references for referential integrity. This is a deliberate deviation, but it means:
- Deleting a status with `onDelete: SET NULL` on previousStatusId would null out history entries
- Renaming a status value changes the meaning of past history entries retroactively

**Impact:** Audit log is not self-contained as specified. Status renames/deletions corrupt historical data.

**Fix:** Add `previousStatusValue String?` and `newStatusValue String` columns alongside the FK columns for audit immutability, or accept the deviation and document it.

---

### 13. MEDIUM — getJobStatusHistory returns entries in descending order

**File:** `src/actions/job.actions.ts` line 931

The spec (rule GetStatusHistory) states: "Ordered by changedAt ascending (chronological)." The implementation uses `orderBy: { changedAt: "desc" }` (reverse chronological).

**Impact:** Timeline (5.9) consumers will need to reverse the order, or they will display events newest-first instead of the chronological narrative the spec intends.

**Fix:** Change to `orderBy: { changedAt: "asc" }` to match the spec, or document the deliberate deviation and have Timeline consumers handle ordering.

---

### 14. MEDIUM — E2E tests do not test actual DnD transitions

**File:** `e2e/crud/kanban.spec.ts`

The E2E test suite has 5 tests, but none of them test:
- Dragging a card between columns
- The transition dialog appearing on drop
- The undo toast action
- Invalid drop target visual feedback
- Mobile status change dropdown triggering a transition

The "should show transition dialog on status change attempt" test (line 136) only checks if a select element exists on mobile, with a fallback `expect(true).toBe(true)` -- it never actually triggers a transition.

**Impact:** No E2E coverage for the core CRM interaction (drag-and-drop status transitions). Regressions will go undetected.

**Fix:** Add tests that: (a) create a test job, (b) drag it to a valid target column, (c) verify the transition dialog appears, (d) confirm the transition, (e) verify the card moved. Also test an invalid drop (e.g., applied -> bookmarked).

---

### 15. MEDIUM — Collapsed columns cannot receive drops during DnD

**File:** `src/components/kanban/KanbanBoard.tsx` lines 418-430

Collapsed columns are rendered separately from the main DndContext column list. They receive `isValidDropTarget={false}` and `isInvalidDropTarget={false}` hardcoded, meaning they never visually indicate they can accept drops, even when the transition would be valid.

For the common flow of dragging a card to "Archived" or "Rejected" (both collapsed by default), the user must first expand the column, then drag. This is a significant UX friction point for the two most common terminal transitions.

**Impact:** Users cannot drag cards to collapsed "Rejected" or "Archived" columns, which are the most common terminal statuses.

**Fix:** Either (a) make collapsed column pills droppable and expand them on valid drop, or (b) auto-expand valid target columns during drag.

---

### 16. MEDIUM — Mobile tab view defaults to "draft" instead of "bookmarked"

**File:** `src/components/kanban/KanbanBoard.tsx` line 73

```typescript
const [mobileTab, setMobileTab] = useState<string>(
  STATUS_ORDER.find(s => statuses.some(st => st.value === s)) ?? "draft"
);
```

The fallback is `"draft"`, a legacy status that may not exist after migration. If the `STATUS_ORDER` from `useKanbanState.ts` still includes `"draft"`, it will match before `"bookmarked"`, causing mobile users to see a "draft" tab (possibly empty) as the default instead of "bookmarked".

The `STATUS_ORDER` in `useKanbanState.ts` line 14-23 lists both `"bookmarked"` and `"draft"`, with `"bookmarked"` first. So the `find()` will return "bookmarked" if it exists in statuses. But the fallback of "draft" is still wrong for the post-migration world.

**Impact:** Minor -- fallback only hits if no statuses match, but the value "draft" is anachronistic.

**Fix:** Change fallback to `"bookmarked"`.

---

### 17. MEDIUM — No keyboard-only card reorder within columns

**File:** `src/components/kanban/KanbanBoard.tsx`

The `KeyboardSensor` is configured with `sortableKeyboardCoordinates`, but since within-column reorder is a no-op (finding #7), keyboard users cannot reorder cards. Even for cross-column moves, the keyboard navigation relies on `@dnd-kit`'s default behavior which does not communicate valid vs. invalid targets to keyboard users -- the visual dimming of invalid columns is purely visual and not conveyed through ARIA.

**Impact:** Keyboard-only users cannot reorder cards and receive no feedback about which columns are valid drop targets.

**Fix:** After implementing within-column reorder (#7), add ARIA announcements for valid/invalid targets during keyboard navigation. Consider alternative keyboard UI (e.g., "Move to..." popover triggered by keyboard shortcut).

---

### 18. MEDIUM — Domain event not useful for Spotlight search (2.20)

**File:** `src/lib/events/event-types.ts` (JobStatusChangedPayload)

The `JobStatusChangedPayload` carries `jobId`, `userId`, `previousStatusValue`, `newStatusValue`, `note`, and `historyEntryId`. For Spotlight search (2.20), the event would need to trigger index updates. But the payload lacks the job title, company name, and other searchable fields. A Spotlight indexer would need to re-query the database after every event, making the event mostly useless as a cache invalidation signal rather than a self-contained indexing event.

**Impact:** Low efficiency for Spotlight integration. The event design works for notifications (5.4) but not for search indexing (2.20).

**Fix:** Consider adding `jobTitle` and `company` to the payload, or accept that Spotlight will use its own query-based indexing rather than event-driven updates.

---

### 19. MEDIUM — `handleError` wraps error messages in hardcoded English prefixes

**File:** `src/actions/job.actions.ts` (multiple locations)

Several CRM functions use patterns like:
```typescript
const msg = "Failed to change job status.";
return handleError(error, msg);
```

Per ADR-019 and CLAUDE.md: "All throw new Error() and result.message in server actions MUST use i18n keys, not hardcoded English." These English prefix strings will appear in error toasts for non-English users.

**Affected functions:** `changeJobStatus` (line 697), `getKanbanBoard` (line 779), `updateKanbanOrder` (line 897), `getJobStatusHistory` (line 946), `getStatusDistribution` (line 989), `getValidTransitions` (line 1023).

**Impact:** Error messages display in English for all locales.

**Fix:** Replace with i18n keys (e.g., `"errors.changeJobStatusFailed"`) and add translations for all 4 locales.

---

### 20. LOW — No re-normalization of sortOrder floats

**Files:** `src/actions/job.actions.ts`, `specs/crm-workflow.allium`

The spec acknowledges this in Q2: "Float precision allows ~2^52 halvings, which is practically infinite." While true for precision, the practical concern is different: if a user repeatedly drags cards to the same position (e.g., always dropping at position 0), the values converge toward zero: 0, -1, -2, -3... (top insertions decrement by 1.0). This is fine. But between-card insertions halve: 1.5, 1.25, 1.125... After ~50 insertions in the same gap, the values become indistinguishable to a human debugging the database, though they remain mathematically distinct.

Since within-column reorder is not yet implemented (#7), this is theoretical. When it is implemented, consider a normalization pass on page load if min gap < 1e-10.

**Impact:** Theoretical. No immediate fix needed.

---

### 21. LOW — No VoiceOver testing for mobile tab view

**File:** `e2e/crud/kanban.spec.ts`

The E2E tests do not test VoiceOver or any screen reader interaction with the mobile tab view. The Shadcn `Tabs` component has basic ARIA, but the status change `Select` dropdown nested under each card (lines 482-507) has no `aria-label` linking it to the parent job card. A screen reader user hearing "Combobox, Applied" has no context about which job's status they are changing.

**Impact:** Mobile accessibility gap. Screen reader users cannot associate the status dropdown with its job card.

**Fix:** Add `aria-label={t("jobs.kanbanChangeStatusMobile") + ": " + job.JobTitle?.label}` to the `SelectTrigger`.

---

### 22. LOW — `getStatusHistory` ordering is desc but spec says asc

Already covered in finding #13 but noting the secondary impact: the `StatusHistoryEntry` type (lines 592-600) does not include a `type` discriminant that would let Timeline (5.9) merge status history with notes, activities, etc. The Timeline will need a union type with a discriminant field. Planning for this now avoids a breaking change later.

---

### 23. LOW — Seed script creates "Expired" status then CRM code ignores it

Cross-reference of findings #8 and the seed script. The `JOB_STATUSES` array (seed.ts line 38) creates "Expired" as a valid status. The CRM code treats it as a non-existent status (no transitions, not in STATUS_ORDER). This means the seed creates data that the application cannot process, which is a data integrity concern for fresh installations.

**Impact:** Fresh installations have a phantom "Expired" status that appears in dropdowns but cannot participate in the CRM workflow.

**Fix:** Remove `{ label: "Expired", value: "expired" }` from the seed's `JOB_STATUSES` array and add `expired` to `LEGACY_STATUS_RENAMES` mapping to `archived`.

---

## Summary

| Severity | Count | Key themes |
|----------|-------|------------|
| CRITICAL | 4 | State machine bypass (updateJob, API PATCH, undo), missing initial history |
| HIGH     | 7 | No optimistic locking, sortOrder injection, reorder unimplemented, duplicate state machine, legacy function, no pagination, expired status |
| MEDIUM   | 7 | Schema deviation, ordering mismatch, no DnD E2E tests, collapsed column drops, mobile default, keyboard accessibility, hardcoded error strings |
| LOW      | 4 | Float normalization, VoiceOver, timeline type shape, seed data inconsistency |

### Priority recommendation

1. Fix CRITICAL #1 and #2 first -- the state machine bypasses are security-adjacent (a user can manipulate job state arbitrarily)
2. Fix CRITICAL #3 (initial history) and #4 (undo validation) next -- these affect data integrity and user trust
3. HIGH #5 (optimistic locking) and #6 (sortOrder validation) are the most impactful HIGH items
4. HIGH #7 (reorder implementation) and #9 (duplicate state machine) are architectural debt that will compound
