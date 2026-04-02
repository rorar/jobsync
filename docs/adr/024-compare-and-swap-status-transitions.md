# ADR-024: Compare-and-Swap for Job Status Transitions

**Date:** 2026-04-02
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

Two browser tabs open the same Kanban board. Tab 1 moves a job from "bookmarked" to "applied". Tab 2 still shows the job as "bookmarked" and drags it to "interview". The server sees the actual current status is "applied" and validates applied-to-interview (a valid transition), so it succeeds. But the user in Tab 2 intended bookmarked-to-interview (an invalid transition). The server silently performed a different transition than the user intended. This was identified as DAU-2 during the S3 review.

The fundamental problem is that the client sends only the desired target status, not the assumed source status. The server cannot distinguish "user knows the current state" from "user has stale state".

## Decision

Add an optional `expectedFromStatusId` parameter to `changeJobStatus()` in `src/actions/job.actions.ts`. When provided, the server compares the job's actual current `statusId` against the expected value before applying the transition. If they differ, the action returns a `STALE_STATE` error code, prompting the user to refresh.

```ts
if (expectedFromStatusId !== undefined && currentJob.statusId !== expectedFromStatusId) {
  return { success: false, message: "errors.staleState", errorCode: "STALE_STATE" };
}
```

The parameter is optional for backward compatibility -- existing callers (bulk actions, API routes, non-Kanban UI) that do not pass it continue to work without stale-state checking.

### Why Not Full Optimistic Locking?

Schema-level optimistic locking (a `version` integer on the Job model, incremented on every write, checked with `UPDATE ... WHERE version = ?`) would close the read-write race window completely. This was deferred (S3-D3) because:

1. It requires a Prisma migration adding a `version` column to the `Job` table
2. Every job update path (not just status transitions) must increment and check the version
3. The compare-and-swap approach addresses the specific Kanban stale-state scenario with minimal surface area

The application-level check has a small race window between reading `currentJob.statusId` and writing the new status, but for a self-hosted single-user application with human-speed interactions, this window is negligible.

## Consequences

### Positive
- Detects stale state before applying an unintended transition -- user gets a clear "refresh and retry" message (`errors.staleState` key, translated in all 4 locales)
- Uses the existing `ActionErrorCode` union type (`STALE_STATE` added to `src/models/actionResult.ts`) for programmatic error handling
- Backward compatible -- callers that omit `expectedFromStatusId` are unaffected
- The Kanban board passes the card's current `statusId` as `expectedFromStatusId`, so the check is automatic for drag-and-drop transitions

### Negative
- Application-level check, not database-level -- a theoretical race window exists between the read and write (negligible in practice)
- Only protects `changeJobStatus`, not other job mutations (title, notes, etc.) -- those remain vulnerable to concurrent edits until full optimistic locking is implemented
- Adds a code path that callers must handle (the `STALE_STATE` error) -- UI must show a refresh prompt rather than a generic error

### Files Changed
- `src/actions/job.actions.ts` -- `expectedFromStatusId` parameter added to `changeJobStatus()`
- `src/models/actionResult.ts` -- `STALE_STATE` added to `ActionErrorCode` union
- `src/i18n/dictionaries.ts` -- `errors.staleState` key added in all 4 locales (en, de, fr, es)
