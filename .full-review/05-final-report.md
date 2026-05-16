# Review Report — Commit 31d4eec (#16 Notification Semantics Cleanup)

## Executive Summary

Solid implementation of 3 notification improvements. Two reviewers (Code Quality + Architecture) found 1 critical bug (placeholder mismatch), 3 medium issues, and 3 low items. All actionable findings fixed in-session. Architecture validated as sound.

## Findings by Priority

### Fixed in Review (5)

| ID | Severity | Finding | Fix |
|---|---|---|---|
| CR-1 | Critical | `contactFromJob` legacy message used `{jobTitle}` placeholder for person name | Template → `{personName}` x4 locales, handler `.replace()` updated |
| AR-1 | Medium | Email `ALLOWED_DATA_FIELDS` missing `personName` | Added to allowlist + `personName`/`jobTitle` in extendedData |
| CR-2 | Medium | `REMINDER_TITLE_KEY_MAP` undefined guard missing | Added `if (!titleKey) return;` |
| AR-2 | Low | `actorType: "system"` for user-initiated manual contact | Changed to `"user"` |
| CR-4 | Low | Source guard ordering inconsistency undocumented | Added explanatory comment |

### Accepted / Deferred (3)

| ID | Severity | Finding | Rationale |
|---|---|---|---|
| CR-3 | Medium | Two handlers share similar 7-step structure (DRY) | Only 2 instances, CLAUDE.md: "three similar lines better than premature abstraction" |
| CR-5 | Low | Missing M-T-09 locale regression tests for new handlers | Same `t(ctx.locale, ...)` pattern, covered by existing M-T-09 tests |
| AR-3 | Low | `interviewDate` not surfaced in notification | Enhancement for future sprint |

## Findings by Category

- **Code Quality**: 5 findings (1 critical, 2 medium, 2 low) — all fixed or accepted
- **Architecture**: 3 findings (2 medium, 1 low) — all fixed or accepted
- **Security**: 0 new findings (IDOR guards verified by both reviewers)
- **Performance**: 0 new findings (2 small DB lookups per event, fire-and-forget)

## Verification

- 245 suites, 4739 tests, 0 failures
- `tsc --noEmit`: 0 new errors
- Dictionary consistency: 75/75 tests pass

## Review Metadata

- Review date: 2026-05-15
- Phases completed: 1A (Code Quality), 1B (Architecture)
- Phases skipped: 2-4 (small scope, no new security surface, no frontend, no infra changes)
- Reviewers: feature-dev:code-reviewer, comprehensive-review:architect-review
