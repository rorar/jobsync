# ADR-030: Deck Action Contract, Notification Late-Binding, and Deck Action Routing Invariant

**Date:** 2026-04-09
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

Three architectural decisions emerged from the staging UX sprint (tasks 2-5 of the six-task UX sprint) and were consolidated during the subsequent honesty-gate remediation sprint. They share no single file but they are causally linked: all three surfaced because the deck triage flow and the notification dispatcher each grew new capabilities that exposed latent weaknesses in their original contracts.

### Decision A — `useDeckStack.onAction` contract refinement

The staging deck (`useDeckStack`) exposes a `performAction` state machine that runs on every swipe/button click. It dispatches the domain action via a caller-supplied `onAction(vacancy, action)` callback and uses the result to drive optimistic card-exit animations, the undo stack, stats, and card advancement.

The original callback return type was `Promise<{ success: boolean }>`. When task 3 of the UX sprint asked for a "celebration fly-in after super-like that offers to open the newly created job", the hook had no way to know the promoted Job's id — `performAction` threw away everything except `success`. The celebration CTA ("Open job") had no destination.

This is the classic "abstraction works until you need one more piece of downstream context" failure mode. The fix could have been a side-channel (a ref that the caller populates before the promise resolves), a separate callback (`onPostAction(vacancy, action, result)`), or a return type refinement. The refinement is the cleanest because it is strictly additive: old callers that destructure `{ success }` keep working, new callers can destructure `{ success, createdJobId }` opportunistically.

### Decision B — Notification late-binding i18n pattern

The notification dispatcher (`src/lib/events/consumers/notification-dispatcher.ts`) historically resolved i18n messages at dispatch time:

```typescript
const message = t(locale, "notifications.moduleDeactivated").replace("{name}", moduleName);
await prisma.notification.create({ data: { message, ... } });
```

This locked the notification into the dispatcher-time locale. If the user later switched locale, the notification still displayed the old-locale string because the rendered text was frozen in the database row.

The same bug existed — undisclosed until this sprint's blind-spot analysis — in `degradation.ts` (3 sites) and `webhook.channel.ts` (2 sites). All five used direct `prisma.notification.create()` calls with pre-resolved English strings.

The fix is to store the **i18n key and params** in `data: Json` and resolve them at **render time**:

```typescript
await prisma.notification.create({
  data: {
    message: englishFallback, // kept for email/webhook/push channels & old clients
    data: {
      titleKey: "notifications.moduleDeactivated.title",
      titleParams: { moduleName },
      actorType: "module",
      actorId: moduleId,
      severity: "warning",
      reasonKey: "notifications.reason.authExpired",
    },
  },
});
```

`NotificationItem.tsx` calls `formatNotificationTitle(data, message, t)` which prefers the structured fields when present and falls back to `message` otherwise. Users see the message in their current locale regardless of when it was dispatched.

### Decision C — Deck action routing invariant

The `StagedVacancyDetailSheet` (task 2) added a second way to trigger deck actions: a user can open the details sheet on a card, read the full description, then click Dismiss / Promote / Super-Like / Block from the sheet footer.

The Phase 3 integration commit wired those buttons to the list-mode CRUD handlers (`handleDismiss(id)`, `handlePromote(vacancy)`, etc.) regardless of origin. In deck mode this silently broke:

- Deck stats (`stats.promoted`, `stats.superLiked`) did not update
- The undo stack did not record the action
- The optimistic exit animation did not play
- **Super-like did not trigger the celebration fly-in** (because `onSuperLikeSuccess` fires only from `useDeckStack.performAction`)
- The deck index did not advance — the user closed the sheet and saw the same card still in front of them

The honesty gate caught this during post-sprint self-review, but **after the commits had already been pushed**. The hotfix was shipped as commit `2caab7e`.

The underlying principle: **the deck state machine is the single source of truth for deck card progress**. Any action taken against a deck card — from any entry point (swipe, action rail button, details sheet, keyboard shortcut) — MUST flow through `useDeckStack.performAction` (via the container's `handleDeckAction` callback). Bypassing it breaks the state machine.

## Decision

We adopt three related architectural rules:

**Decision A:** `useDeckStack.onAction` returns `Promise<{ success: boolean; createdJobId?: string }>`. The optional `createdJobId` is populated by the caller when the action produces a Job (currently `promote` and `superlike`). `useDeckStack` forwards it to `options.onSuperLikeSuccess?.(jobId, vacancy)` for the super-like branch and `options.onSuperLikeUndone?.(jobId)` on undo.

**Decision B:** Server-side notification creation MUST populate `data.titleKey` and `data.titleParams` (plus optional `reasonKey`, `reasonParams`, `actorType`, `actorId`, `severity`) when creating a `Notification` row. The legacy `message` field SHOULD still be populated in English as a fallback for email/webhook/push channels and pre-migration clients. UI components MUST use `formatNotificationTitle(data, message, t)` from `src/lib/notifications/deep-links.ts` to resolve the display string at render time.

Aspirational: all notification writes SHOULD route through the channel router via domain events so the late-binding is enforced in one place. Current known direct writers (patched inline to satisfy the invariant):
- `src/lib/notifications/channels/in-app.channel.ts` — legitimate (the channel implementation itself)
- `src/lib/connector/degradation.ts` — 3 sites, patched in Stream C (commit `af6d328`)
- `src/lib/notifications/channels/webhook.channel.ts` — 2 sites, patched in Stream C (commit `af6d328`)

**Removed in Sprint 1 CRIT-A1**: `src/actions/module.actions.ts:deactivateModule` was briefly in this list (surfaced by the `scripts/check-notification-writers.sh` grep enforcement added in commit `1c2c593`, because earlier blind-spot scans only looked under `src/lib/`). The CRIT-A1 fix deleted the direct `createMany` call and replaced it with `emitEvent(ModuleDeactivated)`. The existing `notification-dispatcher.handleModuleDeactivated` handler — previously dead code because the event had subscribers but no publisher — is now the single writer. This ADR originally speculated that the direct write duplicated the dispatcher's work; that turned out to be wrong (the dispatcher handler was dead), but the fix is still correct and has a beneficial UX side-effect: users now get ONE summary notification per module deactivation across all enabled channels, instead of N in-app notifications (one per paused automation).

The full refactor to event emission for the remaining 5 sites above (in `degradation.ts` and `webhook.channel.ts`) is tracked as deferred work.

**Decision C:** Any action taken against a deck card from any entry point MUST route through `useDeckStack.performAction`. In practice, this means: in `StagingContainer.tsx`, sheet action adapters are **mode-aware** — they call `handleDeckAction(vacancy, action)` when `detailsMode === "deck"` and the direct handlers (`handleDismiss(id)`, `handlePromote(vacancy)`, ...) when `detailsMode === "list"`. Tests in `__tests__/useDeckStack.spec.ts` and `__tests__/DeckView.spec.tsx` cover the deck path; the sheet-routing path is covered by the Phase 3 integration.

> **Sprint 1.5 correction — 2026-04-09 (CRIT-A-06)**
>
> The original hotfix commit `2caab7e` for Decision C was **semantically incomplete**: it routed the sheet adapters in deck mode to `StagingContainer.handleDeckAction`, which is the **server-action dispatcher** that `useDeckStack` consumes via its `onAction` prop — NOT the state machine `useDeckStack.performAction` itself. These are **different abstractions**:
>
> - `handleDeckAction` calls the server action (`dismissStagedVacancy`, `promoteStagedVacancyToJob`, etc.) and returns an `ActionResult<T>`.
> - `useDeckStack.performAction` (a) invokes `onAction` (which in turn calls the server action), (b) drives the exit animation, (c) updates `currentIndex`, (d) pushes onto `undoStack`, (e) updates `stats`, (f) fires `onSuperLikeSuccess` for super-likes.
>
> As a result of the conflation: when a user dismissed from the details sheet in deck mode, the server dismiss succeeded but `currentIndex`, `undoStack`, `stats`, and the exit animation all stayed stale. The user closed the sheet and saw the same card still in front of them. Promote/superlike/block masked the symptom via the auto-approve `reload()` path, but **dismiss** — which has no `reload()` — fully exposed the bug. No test caught it because the sheet test was isolated with mocked callbacks and never mounted a real `StagingContainer`+`DeckView`+`useDeckStack` integration.
>
> The architecture specialist review (H-A-06) flagged this. The Sprint 1.5 fix exposes `DeckView` as a `forwardRef` with an imperative handle (`dismiss`, `promote`, `superLike`, `block`, `skip`) backed by the SAME imperatives the swipe/action-rail buttons use. `StagingContainer` holds a `deckViewRef` and the sheet adapters in deck mode now call `deckViewRef.current?.dismiss()` — guaranteeing that every deck entry point flows through `performAction` per the invariant.
>
> Files touched:
> - `src/components/staging/DeckView.tsx` — `forwardRef` + `useImperativeHandle` + `DeckViewHandle` interface export
> - `src/components/staging/StagingContainer.tsx` — `deckViewRef` + adapter rewrite (deck-mode branches no longer reference `handleDeckAction`)
> - `__tests__/StagingContainerDeckSheetRouting.spec.tsx` — NEW integration regression guard that mounts the container+view+hook+sheet and asserts the deck counter advances after a sheet dismiss (the bug that had no prior test coverage)
> - `specs/vacancy-pipeline.allium` — strengthened `DeckActionRoutingInvariant` with a note distinguishing `performAction` from `handleDeckAction`
>
> Fix commit: `5415d89` (orchestrator will backfill). Originally broken hotfix: `2caab7e`.
>
> Lesson: the honesty gate missed its own gate. The original hotfix's commit message claimed "`handleDeckAction` is the single source of truth for deck state" — this was false. `handleDeckAction` is the single source of truth for **server-action dispatch**; `useDeckStack.performAction` is the single source of truth for **the deck state machine**. Conflating the two is exactly the abstraction-boundary confusion ADR-030 was meant to prevent. Future reviewers of this ADR: the invariant is enforced IF AND ONLY IF the sheet adapters in deck mode drive `useDeckStack`'s public imperatives (via the `DeckViewHandle` ref), NOT the server-action dispatcher.

## Consequences

### Positive

- **Decision A** — The super-like celebration can reliably navigate to the created Job; the abstraction is future-proofed for any downstream context the caller wants to surface (e.g., duplicate-detection warnings, scheduling hints)
- **Decision B** — Notifications render correctly in the viewer's current locale regardless of when they were dispatched; one fix pattern applies to all 5 known bypass sites
- **Decision C** — The deck state machine remains the single source of truth; any new entry point (bulk actions, keyboard, URL deep-links) can be added without duplicating state-machine logic
- All three decisions are additive: no existing call sites break, no migrations required (beyond the already-deferred notification schema migration)

### Negative

- **Decision A** — The `onAction` callback contract is slightly more complex; new callers must know to populate `createdJobId` when the action produces a Job
- **Decision B** — Notification data is split between top-level columns (legacy `message`) and `data` JSON (new `titleKey`/params); consumers must know which to read. The `formatNotificationTitle` helper hides this, but it is still a bifurcation
- **Decision C** — Sheet adapters in `StagingContainer.tsx` are now mode-aware closures; understanding which path fires requires reading the adapter body. The alternative (separate handler sets) is worse — more boilerplate

### Risks

- **Decision B** — If a new code path adds a direct `prisma.notification.create()` call without populating `data.titleKey`, the late-binding silently degrades to the legacy `message` field. A future Prisma migration to promote these fields to top-level columns will make the contract enforceable at the schema level. Deferred but tracked.
- **Decision C** — If a new deck entry point is added (e.g., a right-click context menu, a mobile long-press menu) and the developer forgets to route through `handleDeckAction`, the same class of bug can recur. The blind-spot analyzer pattern checks for this, but it relies on the analyzer being run. An ESLint rule forbidding direct action-handler calls from within the staging directory would be a stronger safeguard — tracked as deferred work.

## Related ADRs

- **ADR-026** (Multi-Channel Notification Architecture) — establishes the channel router that Decision B's aspirational refactor would flow through
- **ADR-029** (Scope Enrichment Cache Keys by userId) — same class of "single source of truth" fix, for the enrichment orchestrator's in-memory cache
- **ADR-015** (IDOR Enforcement) — the ownership-scoping principle that Decision B's late-binding does NOT weaken (notifications are still per-user)

## References

- Stream A hotfix commit: `2caab7e` (deck action routing fix)
- Stream C commit: `af6d328` (degradation.ts + webhook.channel.ts late-binding)
- Stream 4 enforcement script: `1c2c593` (`scripts/check-notification-writers.sh`)
- Prisma migration to top-level 5W+H columns: `132bb96` (the bifurcation called out as a risk is now schema-enforceable)
- Sprint 1 CRIT-A1: `8c2e66b` (deactivateModule event-emission refactor; Decision B — module.actions.ts removed from the legacy writer list)
- Sprint 1 CRIT-A2: `2b6ed92` (PromotionDialog.onSuccess jobId threading; Decision A — concrete implementation of the `{ success, createdJobId? }` contract through the default auto-approve=OFF flow)
- Sprint 1.5 CRIT-A-06: `5415d89` (Decision C correction — the original hotfix `2caab7e` routed through the wrong dispatcher; fix exposes `DeckView` via `forwardRef` + `useImperativeHandle` so sheet adapters invoke `useDeckStack.performAction` directly). Architecture specialist finding: H-A-06 in `.team-feature/stream-5b-architecture-specialist.md`. Regression test: `__tests__/StagingContainerDeckSheetRouting.spec.tsx`.
- Sprint 1 CRIT-Y3 cross-component smoke test: verified in `__tests__/SuperLikeCelebration.spec.tsx` — the celebration's global Escape listener does NOT consume the event, so sibling handlers (Radix Dialog's DismissableLayer, any future modal) co-handle the same keypress cleanly
- Stream E grace period + `isExiting` contract: `SuperLikeCelebrationHost`
- Blind-spot report: `.team-feature/stream-h-blindspot.md` (Patterns 2, 3, 7)
- Honesty gate findings #16, #17 (Decision C) and the dispatcher i18n bug (Decision B)
