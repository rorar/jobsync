# Phase 2: Security & Performance Review

## Security Findings (8 total: 1 High, 4 Medium, 3 Low)

### High
| ID | CWE | File:Line | Finding |
|----|-----|-----------|---------|
| SEC-S3-01 | CWE-639 | `job.actions.ts:319-338` | Cross-user FK injection in addJob/updateJob — accepts foreign key IDs without ownership verification |

### Medium
| ID | CWE | Finding |
|----|-----|---------|
| SEC-S3-02 | CWE-639 | `addJobToQueue` resolves entity names from IDs using `findUnique` without `createdBy` filter |
| SEC-S3-03 | CWE-770 | `getJobsList` unbounded `limit` parameter enables resource exhaustion |
| SEC-S3-04 | CWE-200 | `Resume: true` in `getJobsList` leaks `File.filePath` (vs explicit select in `getJobDetails`) |
| SEC-S3-05 | CWE-209 | `handleError` fallback returns raw `error.message` for unmapped Prisma errors |

### Low
| ID | Finding |
|----|---------|
| SEC-S3-06 | `getJobsList` exposes `userId` in response payload (no UI purpose) |
| SEC-S3-07 | Undo flow bypasses transition note on reverse transition (audit trail gap) |
| SEC-S3-08 | localStorage parsing without element type validation |

## Performance Findings (7 total: 2 Critical, 2 High, 2 Medium, 1 Low)

### Critical
| ID | File:Line | Finding | Impact |
|----|-----------|---------|--------|
| PERF-01 | `KanbanBoard:90-116` | Linear scan O(n×cols) on every `onDragOver` at 60Hz | 12K comparisons/sec at 200 jobs |
| PERF-02 | `job.actions.ts:598-698` | Serial DB reads in `changeJobStatus` (3 sequential queries) | Avoidable latency |

### High
| ID | Finding | Impact |
|----|---------|--------|
| PERF-03 | No `React.memo` on KanbanColumn/KanbanCard | Full re-render of all cards on every drag event |
| PERF-04 | `new Date()` in KanbanCard render body | 12K Date allocations/sec during drag |

### Medium
| ID | Finding |
|----|---------|
| PERF-05 | `getStatusLabel` closure duplicated in 3 components (= CQ-03) |
| PERF-06 | Double `revalidatePath` on same-column reorder triggers 7 unnecessary DB queries |

### Low
| ID | Finding |
|----|---------|
| PERF-07 | `getStatusDistribution` two serial queries (= CQ-07) |

## Cross-Reference with Phase 1
| Phase 2 | Phase 1 Equivalent |
|---------|-------------------|
| PERF-05 | CQ-03 (getStatusLabel duplication) |
| PERF-07 | CQ-07 (getStatusDistribution serial queries) |
| SEC-S3-05 | Related to S1b-SEC11 (handleError raw messages — accepted debt) |

## Critical Issues for Phase 3 Context

1. SEC-S3-01: Foreign key injection — affects test coverage review (need tests for ownership verification)
2. PERF-01/PERF-03: DnD performance — affects E2E test recommendations (drag performance tests)
3. SEC-S3-04: File.filePath leak — affects data exposure testing
