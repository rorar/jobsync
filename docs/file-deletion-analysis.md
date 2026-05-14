# File Deletion Analysis — Flashlight Report (2026-05-14)

## Overview

6 file deletion sites across 5 files. Analysis performed to evaluate which sites benefit from a shared `deleteFileAndPruneEmptyParents()` utility.

## Deletion Inventory

| # | File | Type | Mechanism | Parent Cleanup | Refactored? |
|---|------|------|-----------|---------------|-------------|
| 1 | `profile.actions.ts:510` | Resume | `unlinkSync()` | None | No — sync API, separate issue |
| 2 | `logo-asset-service.ts:325` | Logo | `deleteFileAndPruneEmptyParents(path, 2)` | 2 levels | **YES** (`4a1b4cd`) |
| 3 | `company.actions.ts:310` | Logo | `deleteFileAndPruneEmptyParents(path, 2)` | 2 levels | **YES** (`4a1b4cd`) |
| 4 | `execute-deletion.ts:122` | Logo+Resume | `Promise.allSettled(unlink)` | None (batch) | No — batch pattern |
| 5 | `execute-deletion.ts:127` | Logo Dir | `rm({ recursive: true })` | Entire tree | No — recursive, not incremental |
| 6 | `orphan-finder.ts:59` | Logo orphans | `deleteFileAndPruneEmptyParents(path, 2)` | 2 levels | **YES** (`4a1b4cd`) |

## Shared Utility

`src/lib/assets/file-cleanup.ts` — `deleteFileAndPruneEmptyParents(filePath, levels)`

- Best-effort, idempotent (ENOENT on file = success)
- `levels` parameter: structure-agnostic (logos=2, future flat=0 or 1)
- Stops pruning on first non-empty directory

## Remaining Issues (Not Addressed)

| Issue | File | Description | Priority |
|-------|------|-------------|----------|
| `unlinkSync` | `profile.actions.ts:510` | Synchronous file deletion blocks event loop | LOW — single file, fast |
| No parent cleanup on batch | `execute-deletion.ts:122` | Individual file unlinks don't prune empty dirs | LOW — user dir is rm'd recursively at line 127 |

## Cross-References

- Orphan finder: `docs/event-consumer-analysis.md` (orphan-finder is called by retention-cron Rule 7)
- Logo asset storage paths: CLAUDE.md § "Logo Asset Cache"
- Storage path resolution: `src/lib/storage.ts` (DATA_DIR)
