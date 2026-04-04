# Phase 4: Best Practices & Standards

## Framework & Language Findings (12 total: 1 High, 4 Medium, 7 Low)

### High
| ID | File:Line | Finding |
|----|-----------|---------|
| F-05 | package.json, KanbanCard/Column | `@dnd-kit/sortable` infrastructure (SortableContext, useSortable, verticalListSortingStrategy) fully wired but within-column reorder is no-op — dead library usage |

### Medium
| ID | Finding |
|----|---------|
| F-01 | `getJobsList` omits `tags` from select — KanbanCard tag badges are dead UI code |
| F-04 | Manual `isPending` useState instead of React 19 `useTransition` for server action calls |
| F-06 | KanbanBoard + @dnd-kit statically imported, not code-split — loads in table view mode too |
| F-07 | StatusTransitionDialog note state persists across dialog reopenings (not reset on new job) |

### Low
| ID | Finding |
|----|---------|
| F-02 | `getStatusLabel` duplicated in 3 components (= CQ-03, PERF-05) |
| F-03 | `useRef` imported but unused in `useKanbanState` |
| F-08 | Fragile chained `.replace()` for i18n interpolation |
| F-09 | DnD screen reader announcements use raw DB labels instead of translated getStatusLabel |
| F-10 | Invalid-transition toasts use raw labels (= CQ-04) |
| F-11 | View mode persistence responsibility split between parent and child |
| F-12 | Hardcoded "jobs" in column list aria-label (= WCAG R-2) |

## Cross-Reference
| Phase 4 | Earlier Phase |
|---------|--------------|
| F-02 | CQ-03, PERF-05, ARC-04 |
| F-09/F-10 | CQ-04 |
| F-12 | WCAG R-2 |
| F-05 | Related to S3-D4 (within-column reorder no-op) |
