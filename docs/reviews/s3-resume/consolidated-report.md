# S3-Resume Consolidated Code Review Report

**Target**: S3 CRM Core — Job Status Workflow (5.3) + Kanban Board (5.6)
**Reviewers**: Code Quality, Architecture, Security, Performance, Testing, Best Practices, WCAG 2.2, Interaction Design, Data Storytelling, Allium Weed
**Date**: 2026-04-02
**Files Reviewed**: 47 files across domain logic, server actions, UI components, hooks, tests

---

## Deduplication Log

Findings from multiple reviewers at the same location merged per multi-reviewer deduplication rules (same file:line + same issue = merge, take highest severity).

| Merged Finding | Sources | Resolution |
|---------------|---------|------------|
| Note length validation gap | CQ-01, ARC-06 | → CON-01 (High) |
| getStatusLabel duplication | CQ-03, ARC-04, PERF-05, F-02 | → CON-05 (Medium) |
| Undo violates state machine | ARC-03, CQ-09 | → CON-02 (Medium) |
| Raw DB labels in toasts/announcements | CQ-04, F-09, F-10 | → CON-06 (Medium) |
| getStatusDistribution serial queries | CQ-07, PERF-07 | → CON-14 (Low) |
| Hardcoded "jobs" in aria-label | F-12, WCAG R-2 | → CON-19 (Low, in WCAG group) |
| Drag handle aria-label | WCAG O-1, Interaction 7.3 | → CON-03 (Critical) |

**Raw finding count**: ~68 across all reviewers
**After deduplication**: 42 unique findings

---

## Critical Findings (7)

### CON-C01 — Cross-user FK injection in addJob/updateJob [SEC-S3-01]
**Location**: `src/actions/job.actions.ts:319-338`
**Dimension**: Security (CWE-639)
**Source**: Security Auditor
**Description**: Both `addJob` and `updateJob` accept foreign key IDs (jobTitleId, companyId, locationId, jobSourceId, resumeId, tagIds) from client without verifying the referenced entities belong to the current user. An attacker can reference another user's entities.
**Impact**: Cross-user data access. User A's job references User B's Company, Resume, etc.
**Fix**: Verify ownership of all FK inputs via `Promise.all` before transaction. See security audit for full code.

### CON-C02 — Drag handle indistinguishable to screen readers [WCAG O-1]
**Location**: `src/components/kanban/KanbanCard.tsx:72-83`
**Dimension**: Accessibility (WCAG 4.1.2, Level A)
**Source**: WCAG Auditor, Interaction Design
**Description**: All drag handles have identical `aria-label` (full instruction paragraph). Screen readers cannot distinguish between cards. `id="kanban-dnd-instructions"` exists but is never connected via `aria-describedby`.
**Impact**: Keyboard/screen reader users cannot identify which card they are operating on.
**Fix**: `aria-label="Drag {job title}"` + `aria-describedby="kanban-dnd-instructions"`. Add i18n key `jobs.kanbanDragHandle`.

### CON-C03 — Collapse/expand buttons missing aria-expanded [WCAG O-2]
**Location**: `src/components/kanban/KanbanColumn.tsx:44-64, 92-100`
**Dimension**: Accessibility (WCAG 4.1.2, Level A)
**Source**: WCAG Auditor
**Description**: Neither the collapse button nor the expand pill communicates collapsed/expanded state via ARIA.
**Impact**: Screen reader users cannot determine column state.
**Fix**: Add `aria-expanded={true/false}` to both controls.

### CON-C04 — Mobile status Select has no accessible label [WCAG O-3]
**Location**: `src/components/kanban/KanbanBoard.tsx:483-506`
**Dimension**: Accessibility (WCAG 1.3.1, 4.1.2, Level A)
**Source**: WCAG Auditor
**Description**: Mobile `<Select>` for status changes has no `aria-label`, `<label>`, or `aria-labelledby`. Multiple identical-looking controls on the page.
**Impact**: Screen reader users cannot identify what each select does.
**Fix**: `aria-label={t("jobs.kanbanChangeStatusMobile") + ": " + job.JobTitle?.label}` on SelectTrigger.

### CON-C05 — Search input and filter Select unlabelled [WCAG O-4]
**Location**: `src/components/myjobs/JobsContainer.tsx:269-280`
**Dimension**: Accessibility (WCAG 1.3.1, Level A)
**Source**: WCAG Auditor
**Description**: Search `<Input>` has only placeholder (not a reliable accessible name). Filter `<SelectTrigger>` has only an icon.
**Impact**: Core navigation controls invisible to assistive technology.
**Fix**: Add `aria-label` to both controls using existing i18n keys.

### CON-C06 — ToastClose dismiss button has no accessible name [WCAG O-7]
**Location**: `src/components/ui/toast.tsx:74-90`
**Dimension**: Accessibility (WCAG 4.1.2, Level A)
**Source**: WCAG Auditor
**Description**: Close button renders only an X icon with no aria-hidden or sr-only label. Affects every kanban operation toast.
**Impact**: Screen readers announce "button" with no label.
**Fix**: Add `aria-hidden="true"` to icon + `<span className="sr-only">{t("common.dismiss")}</span>`.

### CON-C07 — DnD linear scan O(n×cols) on every onDragOver at 60Hz [PERF-01]
**Location**: `src/components/kanban/KanbanBoard.tsx:90-116`
**Dimension**: Performance
**Source**: Performance Engineer
**Description**: `findJob` and `getJobColumn` iterate the full jobs array and all columns on every pointer move event (~60/sec). At 200 jobs: 12,000 comparisons/sec.
**Impact**: Drag jank at any realistic scale.
**Fix**: Replace with `Map` lookups built once in `useMemo`, reducing per-event cost from O(n×cols) to O(1).

---

## High Findings (10)

### CON-H01 — Serial DB round-trips in changeJobStatus [PERF-02]
**Location**: `src/actions/job.actions.ts:598-698`
**Dimension**: Performance
**Description**: Three sequential reads (getCurrentUser, job.findFirst, jobStatus.findFirst) before the write transaction. Job and status lookups are independent.
**Fix**: `Promise.all` the independent lookups.

### CON-H02 — No React.memo on KanbanColumn/KanbanCard [PERF-03]
**Location**: `src/components/kanban/KanbanCard.tsx`, `KanbanColumn.tsx`
**Dimension**: Performance
**Description**: Every onDragOver state change re-renders all ~200 cards across all 7 columns.
**Fix**: Wrap both components with `React.memo` with appropriate comparison.

### CON-H03 — new Date() in KanbanCard render body [PERF-04]
**Location**: `src/components/kanban/KanbanCard.tsx:43`
**Dimension**: Performance
**Description**: Creates a Date object per card per render. 12K allocations/sec during drag.
**Fix**: Lift to module scope or context, update on coarser cadence.

### CON-H04 — Missing note validation in updateKanbanOrder [CQ-01/ARC-06]
**Location**: `src/actions/job.actions.ts:786-908`
**Dimension**: Security/Quality (merged)
**Description**: `changeJobStatus` validates note ≤500 chars but `updateKanbanOrder` does not. Both are "use server" exports.
**Fix**: Add `if (note && note.length > 500) return error`.

### CON-H05 — Cross-user data leak in addJobToQueue lookups [SEC-S3-02]
**Location**: `src/actions/job.actions.ts:503-508`
**Dimension**: Security (CWE-639)
**Description**: `addJobToQueue` resolves entity names from IDs using `findUnique` without `createdBy` filter.
**Fix**: Add `createdBy: user.id` to lookups.

### CON-H06 — getJobsList unbounded limit [SEC-S3-03]
**Location**: `src/actions/job.actions.ts:48-52`
**Dimension**: Security (CWE-770)
**Description**: No upper bound on `limit` parameter. Attacker can request limit=999999.
**Fix**: `const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200)`.

### CON-H07 — Resume:true in getJobsList leaks File.filePath [SEC-S3-04]
**Location**: `src/actions/job.actions.ts:109`
**Dimension**: Security (CWE-200)
**Description**: `Resume: true` returns all fields including File.filePath. Violates project convention (SEC-11).
**Fix**: Replace with explicit `Resume: { select: { id, title, File: { select: { id, fileName, fileType } } } }`.

### CON-H08 — Drag handle touch target ~20x20px [Interaction 5.2]
**Location**: `src/components/kanban/KanbanCard.tsx:72-83`
**Dimension**: Interaction Design / Accessibility (WCAG 2.5.8)
**Description**: Drag handle `p-0.5` + `h-4 w-4` icon = ~20x20px touch area. Below 24px AA minimum and far below 44px guideline.
**Fix**: Increase to `min-h-[44px] min-w-[44px]` with flex centering on touch devices.

### CON-H09 — Collapsed columns cannot receive drops [Interaction 2.3]
**Location**: `src/components/kanban/KanbanBoard.tsx:418-431`
**Dimension**: Interaction Design
**Description**: Collapsed columns (rejected, archived) are not droppable. Users must expand them first. These are the most common drop destinations.
**Fix**: Apply `useDroppable` to collapsed render path, add visual indication on hover.

### CON-H10 — Color is sole status differentiator on cards [WCAG P-1]
**Location**: `src/hooks/useKanbanState.ts:30-37`, `src/components/kanban/KanbanCard.tsx:60-66`
**Dimension**: Accessibility (WCAG 1.4.1, Level AA)
**Description**: Card left-border color is the only status indicator. No non-color alternative. bookmarked/draft share identical colors.
**Fix**: Add sr-only status text inside card.

---

## Medium Findings (16)

| ID | Source | Finding | Fix Priority |
|----|--------|---------|-------------|
| CON-M01 | ARC-03/CQ-09 | Undo reversal fails for 10/13 transitions (asymmetric state machine) | Guard undo with `isValidTransition` |
| CON-M02 | CQ-02 | "expired" status seeded but no transitions/colors/column | Remove from seed or add transitions |
| CON-M03 | ARC-01 | `getKanbanBoard` server action is dead code (never called) | Wire or remove |
| CON-M04 | ARC-02 | Duplicate `KanbanColumn` interface (server vs client, different shapes) | Unify or rename |
| CON-M05 | CQ-03/ARC-04/F-02 | `getStatusLabel` duplicated in 3 components | Extract shared utility |
| CON-M06 | CQ-04/F-09/F-10 | Raw DB labels in toasts + DnD announcements instead of translated | Use `getStatusLabel()` consistently |
| CON-M07 | CQ-06 | Stale closure in `setUndoWithTimeout` — timeout handle in state vs ref | Use `useRef` for timeout |
| CON-M08 | CQ-08 | KanbanBoard 529 lines — too many responsibilities | Extract hooks: useKanbanDnd, useStatusTransition |
| CON-M09 | SEC-S3-05 | `handleError` leaks raw error messages for unmapped Prisma errors | Return generic msg, not `error.message` |
| CON-M10 | F-01 | `getJobsList` omits `tags` — KanbanCard tag badges are dead UI | Add tags to select or remove UI |
| CON-M11 | F-04 | Manual `isPending` instead of React 19 `useTransition` | Modernize to useTransition |
| CON-M12 | F-06 | KanbanBoard + @dnd-kit statically imported, not code-split | Use `next/dynamic` |
| CON-M13 | F-07 | StatusTransitionDialog note persists across reopenings (stale state) | Reset on open or key by job.id |
| CON-M14 | Interaction 2.1 | No pre-hover visual invitation on valid drop targets | Add resting valid-target style |
| CON-M15 | Interaction 4.3 | No layout animation when cards shift after drop | CSS entry animation or View Transitions |
| CON-M16 | Interaction 8.1 | `closestCenter` collision detection flickers at column boundaries | Switch to `closestCorners` |

## Low Findings (9)

| ID | Source | Finding |
|----|--------|---------|
| CON-L01 | ARC-05 | STATUS_COLORS Tailwind map in state hook (presentation in state) |
| CON-L02 | CQ-11 | Float sortOrder precision drift after ~50 midpoint insertions |
| CON-L03 | CQ-12 | addJob doesn't validate initial status is a valid starting state |
| CON-L04 | SEC-S3-06 | getJobsList exposes userId in response (no UI purpose) |
| CON-L05 | SEC-S3-07 | Undo flow bypasses transition note (audit trail gap) |
| CON-L06 | SEC-S3-08 | localStorage parsing without element type validation |
| CON-L07 | F-03 | useRef imported but unused in useKanbanState |
| CON-L08 | F-05 | @dnd-kit/sortable fully wired but within-column reorder is no-op |
| CON-L09 | F-11 | View mode persistence split between parent and child |

## WCAG-Specific Findings (not duplicated above — Medium/Low)

| ID | SC | Level | Finding |
|----|----|-------|---------|
| WCAG-M01 | 1.4.3 | AA | Amber due-date badge dark mode contrast at risk (opacity blending) |
| WCAG-M02 | 2.3.3 | AA | AlertDialog/Toast animations no motion-reduce guards |
| WCAG-M03 | 4.1.2 | A | DragOverlay clone not hidden from a11y tree (duplicate nodes) |
| WCAG-M04 | 4.1.3 | AA | onDragOver returns "" when no target (silent announcement) |
| WCAG-M05 | 1.3.1 | AA | Column role="group" should be role="region" |
| WCAG-M06 | 4.1.3 | AA | Loading state not announced; focus lost on disabled confirm |
| WCAG-M07 | 3.1.2 | AA | ToastProvider missing translated label prop |
| WCAG-L01 | 1.4.4 | AA | Badge text at 10px below legible minimum |
| WCAG-L02 | 3.3.3 | AA | Invalid transition error lacks correction suggestion |
| WCAG-L03 | 1.3.1 | A | KanbanEmptyState action button never rendered (no onAddJob prop) |

## Allium Weed Divergences (not duplicated above)

| ID | Severity | Finding |
|----|----------|---------|
| WEED-D1 | Medium | useKanbanState sorts by createdAt, not sortOrder (spec: kanbanSortOrder asc) |
| WEED-D2 | Medium | sortOrder < 0 rejected, contradicts spec top-insertion algorithm |
| WEED-D3 | Low-Med | addJob trusts client for applied/appliedDate, no server enforcement |
| WEED-D4 | Low | Blacklist match_type: 4 values in code, 2 in spec (spec bug) |
| WEED-D5 | Low | Event payload has extra historyEntryId not in spec (spec bug) |
| WEED-D6 | Low | Transition dialog is modal, spec says inline (guidance) |
| WEED-D7 | Low | Mobile breakpoint 768px vs spec 640px |
| WEED-D8 | Low | Interview relation in Prisma not in spec |

## Data Storytelling Gaps (Recommendations, not bugs)

| ID | Priority | Finding |
|----|----------|---------|
| DS-01 | Must-have | Conversion funnel: getStatusDistribution() exists but is never rendered |
| DS-02 | Must-have | Source comparison: no source-level conversion analytics exist |
| DS-03 | Must-have | ActivityCalendar.tsx has hardcoded date bug (from === to) |
| DS-04 | Should-have | Bottleneck analysis: no time-in-status visualization |
| DS-05 | Should-have | Monthly trend chart (only 7-day exists) |

## Test Coverage Gaps

| ID | Severity | Finding |
|----|----------|---------|
| TEST-C01 | Critical | Zero component tests for all 6 Kanban components |
| TEST-C02 | Critical | Zero tests for useKanbanState hook |
| TEST-H01 | High | No FK injection test (SEC-S3-01) |
| TEST-H02 | High | No limit upper bound test (SEC-S3-03) |
| TEST-H03 | High | File.filePath exclusion test insufficient |
| TEST-H04 | High | sortOrder validation untested |
| TEST-H05 | High | Note length validation untested |

---

## Summary by Dimension

| Dimension | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| Security | 1 | 4 | 1 | 3 | 9 |
| Performance | 1 | 3 | 0 | 0 | 4 |
| Architecture | 0 | 0 | 4 | 2 | 6 |
| Accessibility (WCAG) | 5 | 1 | 7 | 3 | 16 |
| Interaction Design | 0 | 2 | 3 | 0 | 5 |
| Best Practices | 0 | 0 | 4 | 4 | 8 |
| Testing | 2 | 5 | 0 | 0 | 7 |
| Data Storytelling | 0 | 0 | 0 | 0 | 5 recs |
| Allium Weed | 0 | 0 | 2 | 6 | 8 divs |
| **Total** | **9** | **15** | **21** | **18** | **63+** |

---

## Fix Priority (Recommended Action Plan)

### Immediate (this session — security + critical a11y)
1. **CON-C01** — FK ownership verification in addJob/updateJob [Security HIGH → fix as CRITICAL]
2. **CON-C02 through CON-C06** — WCAG Level A failures (drag handle, aria-expanded, select labels, toast close)
3. **CON-C07** — DnD linear scan → Map lookups
4. **CON-H04** — Note length validation in updateKanbanOrder
5. **CON-H05** — Cross-user data leak in addJobToQueue
6. **CON-H06** — getJobsList limit cap
7. **CON-H07** — Resume:true → explicit select

### Next sprint (performance + interaction + medium a11y)
8. **CON-H01-H03** — Performance: Promise.all, React.memo, Date lift
9. **CON-H08-H09** — Touch targets, collapsed column drops
10. **CON-M01** — Undo state machine guard
11. **CON-M05-M06** — getStatusLabel extraction + translated labels
12. **CON-M07** — useRef for timeout
13. **CON-M09** — handleError generic fallback
14. **CON-M13** — Dialog note reset
15. **WCAG-M01 through M07** — Level AA fixes

### Backlog
16. **CON-M03** — getKanbanBoard dead code decision
17. **CON-M08** — KanbanBoard decomposition
18. **CON-M11-M12** — useTransition, dynamic import
19. **DS-01 through DS-05** — Dashboard visualizations
20. **All LOW findings** — Refactoring pass

---

## Review Metadata

- Review date: 2026-04-02
- Phases completed: Code Quality, Architecture, Security, Performance, Testing, Best Practices, WCAG 2.2, Interaction Design, Data Storytelling, Allium Weed
- Flags applied: security-focus, strict-mode
- Framework: Next.js 15 (App Router)
- Total review agents: 10
- Deduplication: 68 raw → 42 unique findings + 10 WCAG-specific + 8 weed divergences + 5 data recs + 7 test gaps
