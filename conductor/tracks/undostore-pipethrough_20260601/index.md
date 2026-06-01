# Track: undoStore split-brain full pipe-through (M-A-09)

**ID:** undostore-pipethrough_20260601
**Status:** ⛔ Pending — ENTRY-CRITERIA-GATED

## Entry Criteria

ADR-030 amendment (extend Decision A `onAction` with an `undoTokenId` pipe-through) +
in-flight-undo migration plan. ~2–3 day focused sprint. Do NOT start until the amendment lands.

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)

## Progress

- Phases: 0/4 complete
- Tasks: 0/9 complete

## Scope (BACKLOG §6)

Only `dismiss` is reversible today (`REVERSIBLE_DECK_ACTIONS = ["dismiss"]`,
`useDeckStack.ts:35`). Pipe `ActionResult.data.undoTokenId` → `useDeckStack.onAction` →
`UndoEntry` → `handleDeckUndo` → `undoStore.compensate(tokenId)` so promote/superlike/block
become reversible (the `undoTokenId` field is dead code today). Symbols code-verified at HEAD `b4b20e9`.

## Quick Links

- [Back to Tracks](../../tracks.md)
- [Product Context](../../product.md)
