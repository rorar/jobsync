# S3 CRM Core -- Architectural Review

**Scope:** Job Status Workflow (5.3) + Kanban Board (5.6)
**Date:** 2026-04-02
**Reviewer:** Architecture Agent (Opus 4.6)
**Files reviewed:** 18 primary files across domain, actions, hooks, components, schema, events, and tests

---

## Executive Summary

The S3 CRM Core implementation is architecturally solid. The state machine in `status-machine.ts` serves as a genuine single source of truth. The Allium spec (`specs/crm-workflow.allium`) is thorough, and the implementation tracks it faithfully. Domain events are well-integrated. The aggregate boundary (Job + History) is respected. IDOR ownership checks are consistently present.

That said, this review surfaces several new findings -- three at Medium severity and four at Low severity -- none of which are Critical or High. The most significant findings concern a dead server action, a duplicated interface definition with semantic drift, and the undo mechanism relying on a reverse transition that the state machine may reject.

**Known exclusions:** This review does not re-report CR-01/02 (duplicated transitions/order -- fixed), CR-13 (interface types in action file -- deferred), S3-D1/D2 (state machine bypass via API/edit -- deferred), S3-D3 (optimistic locking -- deferred), or S3-D4 (within-column reorder -- deferred).

---

## Findings

### ARC-01: `getKanbanBoard` server action is dead code

**Severity:** Medium
**Architectural Impact:** Medium -- dead code in an aggregate repository obscures which data paths are actually exercised by the system.

**Observation:** The `getKanbanBoard()` server action in `src/actions/job.actions.ts` (lines 705-779) is never called anywhere in the application. No component, API route, or test invokes it as a live data path. Instead, the `KanbanBoard` component receives `jobs` and `statuses` as props from `JobsContainer`, which fetches them via `getJobsList()` and `getStatusList()`. The client-side `useKanbanState` hook then builds columns in-memory.

This creates two parallel column-building implementations:
- **Server-side:** `getKanbanBoard()` fetches all jobs, groups by status, respects `sortOrder`, and builds `KanbanColumn[]` with a lightweight `KanbanJob` projection.
- **Client-side:** `useKanbanState` receives `JobResponse[]` (full objects from `getJobsList`), groups by status, and sorts by `createdAt` only (ignores `sortOrder` entirely).

The server-side path was clearly designed to be the primary data source (it includes `sortOrder` handling and a dedicated `KanbanJob` projection), but the client-side path is what actually runs in production.

**Consequences:**
1. The `sortOrder` field is never read by any active code path. `updateKanbanOrder` writes to it but nothing reads it for display ordering.
2. Over-fetching: the Kanban board receives full `JobResponse` objects with `description`, `Resume`, `jobUrl`, and `salaryRange` when it only needs title, company, tags, and due date.
3. The pagination/filter semantics from `getJobsList` leak into the Kanban view -- if a user applies a filter in table mode and switches to Kanban, they see a filtered board rather than the full pipeline.

**Recommendation:** Either wire `getKanbanBoard()` as the actual data path for the Kanban view (creating a separate fetch path from the table view), or delete it and consolidate on the client-side approach. The current state has two diverging implementations that will drift further over time. If the server-side path is chosen, `useKanbanState` should be simplified to only manage UI state (collapse, undo) without rebuilding columns.

---

### ARC-02: Duplicate `KanbanColumn` interface with semantic mismatch

**Severity:** Medium
**Architectural Impact:** Medium -- divergent type definitions for the same concept violate DDD's ubiquitous language principle and create maintenance burden.

**Observation:** There are two `KanbanColumn` interfaces:

1. `src/actions/job.actions.ts` (line 545): The server-side definition carries `statusId`, `statusValue`, `statusLabel`, `jobCount`, `isCollapsed`, and `jobs: KanbanJob[]` (a lightweight projection).
2. `src/hooks/useKanbanState.ts` (line 77): The client-side definition carries `status: JobStatus`, `jobs: JobResponse[]` (full objects), `isCollapsed`, and `color`.

These are two different types with the same name representing the same concept. The client-side version has `color` (a UI concern) baked in, while the server-side version has `jobCount` (a computed property). They use different job type projections (`KanbanJob` vs `JobResponse`) and different status representations (`statusId`/`statusValue`/`statusLabel` vs full `JobStatus` object).

Because the server-side definition is dead code (see ARC-01), this is currently not causing type confusion in practice. However, if `getKanbanBoard()` is later wired up, consumers will encounter two incompatible `KanbanColumn` types in the same import graph.

**Recommendation:** Define a single canonical `KanbanColumn` type in a shared location (e.g., `src/lib/crm/types.ts` or `src/models/kanban.model.ts`). If the server-side and client-side representations genuinely differ, name them differently (`KanbanColumnDTO` for the wire format, `KanbanColumnView` for the UI-enriched version) to make the distinction explicit.

---

### ARC-03: Undo reversal can violate state machine for non-symmetric transitions

**Severity:** Medium
**Architectural Impact:** Medium -- the undo mechanism bypasses the declarative state machine guarantee, creating a class of transitions that the state machine was explicitly designed to prevent.

**Observation:** The undo mechanism in `KanbanBoard.tsx` (line 226) calls `changeJobStatus(job.id, fromStatus.id)` to reverse a transition. This works for symmetric transitions (e.g., `bookmarked -> applied` can be undone because `applied -> bookmarked` is... NOT in the transition map). The undo will fail silently for most transitions because the state machine is intentionally asymmetric.

Examining the transition map:
- `bookmarked -> applied` -- undo (`applied -> bookmarked`) is **not valid**
- `bookmarked -> rejected` -- undo (`rejected -> bookmarked`) is valid
- `applied -> interview` -- undo (`interview -> applied`) is **not valid**
- `applied -> rejected` -- undo (`rejected -> applied`) is **not valid**
- `offer -> accepted` -- undo (`accepted -> offer`) is **not valid**

Of the 13 forward transitions, only 3 have valid reverse paths (`bookmarked -> rejected/archived`, `archived -> bookmarked`). For the other 10, the undo button appears in the toast but will fail with an `INVALID_TRANSITION` error when clicked, showing a "Kanban undo failed" toast.

**Consequences:** The user sees an undo affordance that fails for the majority of transitions. This is a UX integrity issue rooted in an architectural mismatch between the undo model (assumes all transitions are reversible) and the state machine model (most transitions are intentionally one-directional).

**Recommendation:** Filter the undo affordance through the state machine before showing it. Only display the undo toast action when `isValidTransition(newStatusValue, previousStatusValue)` returns true. For irreversible transitions, show a confirmation-only toast without the undo button. Alternatively, implement a distinct "undo" mechanism that bypasses the state machine (with its own audit trail showing "reverted via undo"), but this would require a deliberate architectural decision documented in an ADR.

---

### ARC-04: `getStatusLabel` helper duplicated across three components

**Severity:** Low
**Architectural Impact:** Low -- code duplication without behavioral risk, but a maintenance smell.

**Observation:** The `getStatusLabel` function is independently defined in three locations with identical logic:
- `src/components/kanban/KanbanBoard.tsx` (line 332)
- `src/components/kanban/KanbanColumn.tsx` (line 36)
- `src/components/kanban/StatusTransitionDialog.tsx` (line 55)

All three compute the i18n key using the pattern `jobs.status${capitalized(status.value)}` and fall back to `status.label` if the translation key is not found.

**Recommendation:** Extract to a shared utility, either in `src/hooks/useKanbanState.ts` (as `getStatusLabel(t, status)`) or as a standalone function in `src/lib/crm/status-machine.ts` (the domain-level label resolver). Since this is a UI concern requiring the `t` function, the hook is a more natural home.

---

### ARC-05: `STATUS_COLORS` in hook creates UI-domain coupling

**Severity:** Low
**Architectural Impact:** Low -- the `useKanbanState` hook exports Tailwind class maps (`STATUS_COLORS`) that multiple components import, blending UI presentation with state management.

**Observation:** `STATUS_COLORS` in `src/hooks/useKanbanState.ts` (line 22) maps status values to Tailwind class objects (`bg`, `border`, `text`, `darkBg`, `darkBorder`, `headerBg`). This is consumed by `KanbanCard.tsx`, `KanbanColumn.tsx`, and `StatusTransitionDialog.tsx`.

The hook is otherwise focused on state management (collapsed columns, column building, undo state). The color map is a pure presentation concern that could change independently from the state logic (e.g., design system update, theme changes).

**Recommendation:** Move `STATUS_COLORS` to a dedicated file like `src/components/kanban/status-colors.ts` or `src/lib/crm/status-colors.ts`. This separates the presentation mapping from the state management hook, making both easier to reason about and test independently.

---

### ARC-06: `updateKanbanOrder` note validation missing compared to `changeJobStatus`

**Severity:** Low
**Architectural Impact:** Low -- inconsistent input validation between two code paths that share the same domain operation.

**Observation:** `changeJobStatus` (line 610) validates that `note.length <= 500` before proceeding. `updateKanbanOrder` (line 786) accepts an optional `note` parameter but does not validate its length before passing it to the `jobStatusHistory.create` call within the transaction.

While `updateKanbanOrder` is currently only called via the DnD flow where the `StatusTransitionDialog` enforces `maxLength={500}` on the textarea, server actions are public API surfaces (ADR-019). A direct call to `updateKanbanOrder` with a 10,000-character note would bypass the client-side constraint and write directly to the database.

**Recommendation:** Add the same note length validation to `updateKanbanOrder` that exists in `changeJobStatus`. Better yet, extract a shared validation function (e.g., `validateTransitionNote(note)`) that both actions call, ensuring the invariant is enforced once and applied everywhere.

---

### ARC-07: `useKanbanState` column sort ignores `sortOrder` field

**Severity:** Low
**Architectural Impact:** Low -- functional inconsistency between the schema design intent and the active code path.

**Observation:** The `useKanbanState` hook (line 132) sorts jobs within each column by `createdAt` descending:

```typescript
.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
```

Meanwhile, the schema has a `sortOrder Float @default(0)` field with a compound index `@@index([userId, statusId, sortOrder])`, and `getKanbanBoard` (the dead server action) orders by `[{ sortOrder: "asc" }, { createdAt: "desc" }]`.

The Allium spec (invariant `SortOrderConsistency`) states: "order is determined by kanbanSortOrder ascending." The active code path violates this invariant by ignoring `sortOrder` entirely.

This is related to ARC-01 (dead `getKanbanBoard` action) but is called out separately because it represents a schema-code invariant mismatch. The database carries `sortOrder` data, `updateKanbanOrder` writes to it, but nothing reads it for display.

**Recommendation:** This is fully resolved by addressing ARC-01. When the data path is consolidated, ensure the active path respects `sortOrder` as the primary sort key with `createdAt` as the tiebreaker.

---

## Positive Findings

These aspects of the implementation are well-designed and worth noting:

### State Machine as Single Source of Truth

The `status-machine.ts` module is cleanly separated from both the persistence layer and the UI layer. All consumers (`job.actions.ts`, `useKanbanState.ts`, `KanbanBoard.tsx`) import from this single module. The re-export in `useKanbanState.ts` (line 12: `export { isValidTransition, STATUS_ORDER }`) maintains a single dependency direction. No consumer defines its own transition rules.

### Transaction + Event Pattern

The `changeJobStatus` and `updateKanbanOrder` actions follow the correct pattern: validate, then execute the status update + history creation in a single `$transaction`, then emit the domain event after the transaction commits. This ensures the audit log is always consistent with the job state and that events are only published for committed changes. The comment "eventual consistency -- event delivery is best-effort" correctly frames the event semantics.

### IDOR Ownership Enforcement

Every server action that touches job data includes `userId: user.id` in the Prisma `where` clause. The `getJobStatusHistory` action performs a two-step check: first verifying job ownership, then querying history with `userId` in the where clause. This is consistent with ADR-015.

### Allium Spec Fidelity

The implementation tracks the `crm-workflow.allium` spec closely. The state machine transitions match exactly. The side effects (appliedDate immutability, applied flag backfill on interview) are implemented as specified. The JobStatusHistory schema matches the entity definition. The domain event payload matches the event specification.

### Legacy Status Handling

The `VALID_TRANSITIONS` map includes `saved` and `draft` as aliases for `bookmarked` transitions, and `STATUS_COLOR_NAMES` maps them to the same colors. This provides graceful backward compatibility for existing data that may reference pre-CRM status values without requiring a breaking migration.

### Test Coverage for Domain Logic

The `crm-actions.spec.ts` test suite covers the critical paths: authentication checks, IDOR enforcement (NOT_FOUND for missing ownership), state machine validation (invalid transitions rejected), side effect verification (appliedDate set on first applied transition), domain event emission, and Kanban board column ordering. The test structure follows the aggregate boundary -- all CRM actions are tested in a single file corresponding to the repository.

### Accessibility in DnD

The `KanbanBoard` component provides custom DnD announcements for screen readers via `@dnd-kit/core`'s `accessibility.announcements` configuration. Drag start, drag over, drag end, and drag cancel all produce descriptive text using i18n keys. The drag handle has an explicit `aria-label`, and columns use `role="group"` with descriptive aria-labels.

---

## Summary Table

| ID     | Severity | Category                | Summary                                                      |
|--------|----------|-------------------------|--------------------------------------------------------------|
| ARC-01 | Medium   | Dead Code / Data Path   | `getKanbanBoard` server action is never called               |
| ARC-02 | Medium   | Type Duplication        | Two `KanbanColumn` interfaces with semantic mismatch         |
| ARC-03 | Medium   | State Machine Integrity | Undo reversal fails for most transitions silently            |
| ARC-04 | Low      | Code Duplication        | `getStatusLabel` duplicated in 3 components                  |
| ARC-05 | Low      | Separation of Concerns  | `STATUS_COLORS` Tailwind map lives in state management hook  |
| ARC-06 | Low      | Input Validation        | `updateKanbanOrder` missing note length validation           |
| ARC-07 | Low      | Schema-Code Invariant   | Active code path ignores `sortOrder` field entirely          |

---

## Recommended Priority

1. **ARC-03** (undo validation) -- highest user-facing impact, easiest fix (guard the undo button with `isValidTransition`)
2. **ARC-01** (dead `getKanbanBoard`) -- architectural decision needed: wire it or remove it
3. **ARC-06** (note validation) -- quick fix, prevents potential abuse via direct action call
4. **ARC-02, ARC-04, ARC-05, ARC-07** -- address during next refactoring pass or when wiring ARC-01
