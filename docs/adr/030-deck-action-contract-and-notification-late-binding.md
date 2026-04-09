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
- `src/actions/module.actions.ts` — 1 site in `deactivateModule`. Surfaced after this ADR was written, by the `scripts/check-notification-writers.sh` grep enforcement added in commit `1c2c593`. Not originally listed because earlier blind-spot scans only looked under `src/lib/`. Also produces duplicate notifications (the same deactivation is observed by `notification-dispatcher.ts:handleModuleDeactivated`). Scheduled for removal as Sprint 1 CRIT-A1 — the `deactivateModule` direct write will be deleted and the dispatcher's `ModuleDeactivated` handler becomes the single writer.

The full refactor to event emission is tracked as deferred work; the Sprint 1 CRIT-A1 fix absorbs the `module.actions.ts` piece of it.

**Decision C:** Any action taken against a deck card from any entry point MUST route through `useDeckStack.performAction`. In practice, this means: in `StagingContainer.tsx`, sheet action adapters are **mode-aware** — they call `handleDeckAction(vacancy, action)` when `detailsMode === "deck"` and the direct handlers (`handleDismiss(id)`, `handlePromote(vacancy)`, ...) when `detailsMode === "list"`. Tests in `__tests__/useDeckStack.spec.ts` and `__tests__/DeckView.spec.tsx` cover the deck path; the sheet-routing path is covered by the Phase 3 integration.

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
- Stream E grace period + `isExiting` contract: `SuperLikeCelebrationHost`
- Blind-spot report: `.team-feature/stream-h-blindspot.md` (Patterns 2, 3, 7)
- Honesty gate findings #16, #17 (Decision C) and the dispatcher i18n bug (Decision B)
