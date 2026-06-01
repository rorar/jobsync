# Track: getStagedVacancies cursor pagination

**ID:** cursor-pagination_20260601
**Status:** ⛔ Pending — ENTRY-CRITERIA-GATED (pre-emptive)

## Entry Criteria

User-scale/perf trigger (large staging backlog or measured slow deep page). **Pre-emptive —
no user has reported slowness yet.** ~2–3 day focused sprint. Do NOT start without a trigger.

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)

## Progress

- Phases: 0/4 complete
- Tasks: 0/8 complete

## Scope (BACKLOG §6)

`getStagedVacancies` uses skip/offset (`stagedVacancy.actions.ts:68`, `skip: offset`) →
degrades at large offsets. Migrate to composite cursor (`discoveredAt`+`id`). Ripples into
StagingContainer + RecordsPerPageSelector + BulkActionBar select-all + StagingNewItemsBanner.
Offset usage code-verified at HEAD `b4b20e9`.

## Quick Links

- [Back to Tracks](../../tracks.md)
- [Product Context](../../product.md)
