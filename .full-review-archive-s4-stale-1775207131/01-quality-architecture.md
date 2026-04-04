# Phase 1: Code Quality & Architecture Review

## Code Quality Findings (13 total: 1 High, 7 Medium, 5 Low)

### High
| ID | File:Line | Finding | Fix |
|----|-----------|---------|-----|
| CQ-01 | `job.actions.ts:786` | `updateKanbanOrder` missing note length validation (500 char limit bypassed) | Add same validation as `changeJobStatus` |

### Medium
| ID | File:Line | Finding |
|----|-----------|---------|
| CQ-02 | `seed.ts:38`, `status-machine.ts` | "expired" status seeded but no transitions/colors/column |
| CQ-03 | `KanbanBoard:332`, `KanbanColumn:36`, `StatusTransitionDialog:55` | `getStatusLabel` duplicated in 3 components |
| CQ-04 | `KanbanBoard:173-174,280-281` | Toast uses raw `fromStatus.label` instead of translated `getStatusLabel()` |
| CQ-05 | `job.actions.ts:705-779` | `getKanbanBoard` fetches ALL jobs unbounded |
| CQ-06 | `useKanbanState.ts:145-156` | Stale closure in `setUndoWithTimeout` — timeout handle in state vs ref |
| CQ-07 | `job.actions.ts:965-1000` | `getStatusDistribution` two sequential queries (eventual consistency gap) |
| CQ-08 | `KanbanBoard.tsx` (529 lines) | Component handles DnD + transitions + mobile + desktop + a11y — too many responsibilities |

### Low
| ID | Finding |
|----|---------|
| CQ-09 | Undo via reverse transition may violate state machine (same as ARC-03) |
| CQ-10 | No component tests for KanbanBoard, KanbanCard, KanbanColumn, StatusTransitionDialog |
| CQ-11 | Float sortOrder precision drift risk after ~50 midpoint insertions |
| CQ-12 | `addJob` doesn't validate initial status is a valid starting state |
| CQ-13 | `JobsContainer` fetches paginated list even in Kanban mode (wasted work) |

## Architecture Findings (7 total: 0 Critical, 0 High, 3 Medium, 4 Low)

### Medium
| ID | Impact | Finding |
|----|--------|---------|
| ARC-01 | Medium | `getKanbanBoard` server action is dead code — never called; client rebuilds columns |
| ARC-02 | Medium | Duplicate `KanbanColumn` interface (server vs client) with semantic mismatch |
| ARC-03 | Medium | Undo reversal fails silently for 10 of 13 transitions (asymmetric state machine) |

### Low
| ID | Finding |
|----|---------|
| ARC-04 | `getStatusLabel` duplicated in 3 components (= CQ-03) |
| ARC-05 | `STATUS_COLORS` Tailwind map in state hook (presentation in state management) |
| ARC-06 | `updateKanbanOrder` missing note validation (= CQ-01) |
| ARC-07 | Active code sorts by `createdAt` not `sortOrder` (= S3-D4 deferred) |

## Cross-Reference / Deduplication

| Finding | Duplicated As | Resolution |
|---------|--------------|------------|
| CQ-01 = ARC-06 | Note validation | Fix once (CQ-01) |
| CQ-03 = ARC-04 | getStatusLabel dup | Fix once (CQ-03) |
| CQ-09 = ARC-03 | Undo state machine | Fix once (ARC-03) |
| ARC-07 = S3-D4 | sortOrder ignored | Already deferred |
| CQ-05 ≈ ARC-01 | Dead/unbounded getKanbanBoard | Architectural decision |

## Deduplicated Unique Findings: 15

After deduplication:
- **High:** 1 (CQ-01 note validation)
- **Medium:** 7 (CQ-02, CQ-03, CQ-04, CQ-06, CQ-07, CQ-08, ARC-03)
- **Low:** 7 (ARC-02, ARC-05, CQ-10, CQ-11, CQ-12, CQ-13, ARC-01-decision)

## Critical Issues for Phase 2 Context

1. CQ-01: Server action input validation gap (note length) — relevant for security review
2. CQ-12: Initial status not validated on addJob — relevant for security review
3. CQ-05/ARC-01: Unbounded query without pagination — relevant for performance review
4. CQ-06: Stale closure in timeout handling — relevant for correctness review
