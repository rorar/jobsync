# Track: Session Recovery & Stale-Session Guard (ROADMAP 3.11)

**ID:** session-recovery_20260601
**Status:** ⛔ Pending — ENTRY-CRITERIA-GATED (scheduled feature)

## Entry Criteria

ROADMAP 3.11 prioritised for a sprint. Effort **M**. Scheduled forward feature (gate is
product scheduling, not a design decision). Do NOT start until prioritised.

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)

## Progress

- Phases: 0/3 complete
- Tasks: 0/9 complete

## Scope (ROADMAP 3.11)

Phase 1 — Stale-Session Guard: `getCurrentUser()` (`src/utils/user.utils.ts:5`) checks
JWT-id DB-existence (60s cache) → null on mismatch + dashboard re-login banner (no cryptic
P2003). Phase 2 — `usePersistedForm`: debounced localStorage form-state persistence
(mirrors useKanbanState/useStagingLayout) for AddJob/AddAutomation/Profile/SMTP.
Seams code-verified at HEAD `b4b20e9`.

## Quick Links

- [Back to Tracks](../../tracks.md)
- [Product Context](../../product.md)
