# Stream F — Docs, Specs, ADR, BUGS.md, Memory (executed inline by orchestrator)

## Why inline
Stream F's spawned agent crashed with API 529 (Overloaded) before any tool calls (`tool_uses: 0, total_tokens: 0`). Re-spawning was likely to fail again under load. The work is prose-heavy with low downstream risk so the orchestrator executed it directly.

## Files created
- `docs/adr/030-deck-action-contract-and-notification-late-binding.md` (~115 lines) — three architectural decisions: (A) `useDeckStack.onAction` covariant return type refinement, (B) notification late-binding i18n pattern, (C) deck action routing invariant
- `~/.claude/projects/-home-pascal/memory/feedback_honesty_gate_before_push.md` — new feedback memory; honesty gate must run BEFORE push, not after

## Files edited
- `docs/BUGS.md` — added 3 entries under new "UX Sprint + Honesty Gate Fixes (2026-04-09)" section: HYDR-1 (`<p><div>` hydration), NOTIF-LB1 (dispatcher locale-freeze, 5 sites), DECK-ROUTE1 (sheet action routing bug). Bumped totals 396→399 / 394→397.
- `CLAUDE.md` — added a new "Reusable UI Components" section block + 3 new sections: "Staging Details Sheet + Deck Action Routing", "Super-Like Celebration", "useDeckStack.onAction Contract", "Notification Late-Binding Pattern". All concise, all reference ADR-030.
- `specs/notification-dispatch.allium` — added 2 invariants: `LateBoundLocale` and `SingleNotificationWriter` (the latter aspirational, lists current legitimate exceptions).
- `specs/vacancy-pipeline.allium` — added `DeckActionRoutingInvariant` covering all 5 deck actions × 4 entry points.
- `~/.claude/projects/-home-pascal/memory/project_current_sprint.md` — replaced 2026-04-08 sprint summary with 2026-04-09 (full sprint listing including blacklist fix, 6-task UX sprint, hotfix, honesty gate streams, deferred items).
- `~/.claude/projects/-home-pascal/memory/MEMORY.md` — updated `project_current_sprint.md` description, added pointer to new feedback_honesty_gate_before_push.md.

## Cross-references
- ADR-030 referenced in: CLAUDE.md (4 sections), BUGS.md (NOTIF-LB1, DECK-ROUTE1), notification-dispatch.allium (LateBoundLocale, SingleNotificationWriter), vacancy-pipeline.allium (DeckActionRoutingInvariant), feedback_honesty_gate_before_push.md
- Hotfix commit 2caab7e referenced in: ADR-030, BUGS.md DECK-ROUTE1, vacancy-pipeline.allium DeckActionRoutingInvariant, project_current_sprint.md

## Deferred items discovered while writing docs
- The "SingleNotificationWriter" invariant is aspirational — current code has 5 legitimate exceptions (in-app channel + 3 degradation sites + 2 webhook.channel sites). A full event-emission refactor would let it become enforceable.
- ESLint rules to enforce both invariants are tracked in CLAUDE.md but not yet implemented.
- The ADR-030 references "commit TBD" placeholders for the Stream C and other commit hashes — those will be filled in after Phase 4 commits.

## TypeScript / build impact
None — all changes are docs, specs, memory files. `npx tsc --noEmit` remains clean.
