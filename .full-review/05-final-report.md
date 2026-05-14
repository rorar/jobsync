# Comprehensive Code Review Report — Session 2026-05-14

## Review Target

18 commits of Code Quality Refactoring: rate-limit factory, DATA_DIR storage, orphan-finder, file-cleanup, registerProjection, CQ-16 as-any removal, shared test fixtures, F-3 file move, LOGO_PRUNE_LEVELS constant.

## Executive Summary

High-quality refactoring session with well-designed abstractions. Zero critical issues introduced by this session. One pre-existing HIGH security finding (SEC-05: uploadFile as Server Action). One convergent MEDIUM finding (F-02/SEC-01/P-01: unmigrated rate limiters) flagged independently by all three review dimensions. Key gap: new utilities lack dedicated tests despite being foundational code.

## Findings by Priority

### Critical (P0 — Must Fix)

None introduced by this session.

### High (P1 — Fix Before Next Release)

| ID | Category | File | Finding |
|----|----------|------|---------|
| SEC-05 | Security | `profile.actions.ts:475` | **PRE-EXISTING:** `uploadFile` exported from `"use server"` file, accepts raw path params. ADR-019 violation. |
| T-1 | Testing | `rate-limit.ts` | Factory has NO dedicated test despite being used by 6 wrappers. |
| T-4 | Testing | `profile.actions.ts` | `uploadFile` path traversal guard has ZERO test coverage. |

### Medium (P2 — Plan for Next Sprint)

| ID | Category | File | Finding |
|----|----------|------|---------|
| F-02/SEC-01/P-01 | All 3 | `auth-rate-limit.ts` + `health-rate-limit.ts` | NOT migrated to factory. Unbounded memory, no cleanup. |
| SEC-09 | Security | `auth-rate-limit.ts:78` | IP spoofing via `X-Forwarded-For` (pre-existing) |
| F-01 | Quality | `api/rate-limit.ts:23` | Redundant local `RateLimitResult` type shadows shared |
| T-2 | Testing | `storage.ts` | No tests for DATA_DIR fallback chain |
| T-3 | Testing | `crm-activity-logger.ts` | No tests for registerProjection |
| BP-3 | Practices | `testFixtures.ts:1908` | `jest.fn()` in production-tree file |

### Low (P3 — Backlog)

| ID | Category | Finding |
|----|----------|---------|
| F-03 | Quality | Deprecated `stripTokenFromUrl` still called |
| F-04/SEC-02 | Quality/Security | Silent catch in file-cleanup swallows EACCES |
| F-05/BP-1 | Quality/Practices | `require("fs")` in ESM module |
| F-06/P-02 | Quality/Perf | Rich limiter cleanup uses defaultWindowMs |
| F-07 | Quality | Operator precedence ambiguity in retention-cron |
| F-08 | Quality | Unused import `getErrorCount` in ErrorLogSettings |
| F-09 | Quality | AiSettings enum narrowing without runtime guard |
| F-10/SEC-03 | Quality/Security | Async onValueChange unhandled rejection |
| F-11/BP-3 | Quality/Practices | `makeMockChannel` couples testFixtures to Jest |
| SEC-10/BP-4 | Security/Practices | Missing `import "server-only"` in api/rate-limit.ts |
| BP-2 | Practices | `import type { z }` → `import type { ZodType }` |
| R-1 | Architecture | OverridableRateLimitStrategy LSP concern |
| A-1 | Architecture | orphan-finder re-throws without path context |
| E-1 | Architecture | registerProjection module-private (YAGNI ok) |

## Findings by Category

- **Code Quality**: 11 findings (0 Critical, 0 High, 2 Medium, 9 Low)
- **Architecture**: 3 findings (0 Critical, 0 High, 0 Medium, 3 Low)
- **Security**: 10 findings (0 Critical, 1 High, 2 Medium, 6 Low, 1 Info)
- **Performance**: 7 findings (0 Critical, 0 High, 1 Medium, 6 Low)
- **Testing**: 14 findings (1 Critical, 1 High, 3 Medium, 5 Low, 2 Positive, 2 Info)
- **Best Practices**: 7 findings (0 Critical, 0 High, 1 Medium, 4 Low, 2 Info)

## Recommended Action Plan

1. **SEC-05 + T-4:** Move `uploadFile` to `server-only` utility + add path traversal regression tests (HIGH, small effort)
2. **F-02/SEC-01/P-01:** Migrate `auth-rate-limit.ts` + `health-rate-limit.ts` to shared factory (MEDIUM, 15 min each)
3. **T-1:** Create `__tests__/rate-limit.spec.ts` — 15 tests for factory core (HIGH, medium effort)
4. **T-2 + T-3:** Tests for storage.ts + crm-activity-logger.ts (MEDIUM, medium effort)
5. **SEC-10/BP-4:** Add `import "server-only"` to `api/rate-limit.ts` (LOW, 1 line)
6. **F-08:** Remove unused `getErrorCount` import (LOW, 1 line)
7. **BP-2:** `import type { ZodType }` instead of `{ z }` (LOW, 1 line)
8. **Remaining LOW:** Batch into cleanup sprint

## Review Metadata

- Review date: 2026-05-14
- Phases completed: 1 (Quality+Architecture), 2 (Security+Performance), 3 (Testing), 4 (Best Practices), 5 (Report)
- Agents: 6 parallel reviews (code-reviewer, architect-review, security-auditor, performance-engineer, test-analysis, best-practices)
- Total findings: 52 (deduplicated cross-references: ~30 unique)
