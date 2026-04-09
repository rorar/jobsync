# Sprint 2 Architecture Specialist Spot-Check

## Purpose
Validation run — comparing specialized `comprehensive-review:architect-review` against the baseline generic `agent-teams:team-reviewer` at `.team-feature/stream-5b-architecture.md`. The orchestrator wants a signal on whether a dimension-specialized reviewer surfaces materially new HIGH findings that a generic reviewer missed on the same codebase slice.

**Scope:** commits `a92aaf3..dc48f4b`, 129 files changed, ~14k LOC, two `/agent-teams:team-feature` runs (UX sprint + honesty-gate remediation) + Sprint 0 + Sprint 1 CRIT fixes + cleanups + Jest worker fix.

**Methodology in brief:** read the baseline first, verified each HIGH claim against the actual code, then looked for architectural blind spots the generic reviewer's lens may have filtered out — specifically the deck routing invariant (ADR-030 Decision C), the event-bus dispatch semantics, the celebration lifecycle, and cross-aggregate mutations outside the ones the baseline called out.

## Summary

- **Files deeply read:** ~28 of 129 (focused on deck stack, staging container, notification dispatcher, degradation writers, event bus, staging actions, enrichment trigger, locale resolution, detail sheet, celebration host + queue, blacklist action, InApp channel, ChannelRouter, webhook channel, deep-links, userSettings actions, useDeckStack, spec files, ADR-030, scripts/check-notification-writers.sh)
- **Files surface-scanned:** ~30 (diffs + grep hits for secondary patterns — degradation-coordinator, enrichment orchestrator, test fixtures, migration SQL, relevant tests, event types, event bus)
- **Tool calls:** ~35 (Read + Grep + Bash git-log/diff)
- **Baseline HIGH findings confirmed:** 5 of 5 (H-A-01 through H-A-05)
- **Baseline HIGH findings I would downgrade/reject:** 0
- **NEW HIGH findings the generic reviewer missed:** 2 (H-A-06, H-A-07)
- **NEW MEDIUM findings:** 3 (M-A-07 through M-A-09)
- **NEW LOW findings:** 2 (L-A-05, L-A-06)
- **Verified CRIT fixes:** CRIT-A1 (`deactivateModule` emits `ModuleDeactivated`, enforcement script active), CRIT-A2 (`PromotionDialog.onSuccess` threads `jobId`, wired into `StagingContainer.promotionResolveRef`), CRIT-Y1/Y2/Y3 (out of dimension; spot-verified the touch-target changes in `DeckView.tsx` — `WCAG 2.5.5` comments present at buttons 380, 427)

## Baseline findings — agreement check

### H-A-01 (ModuleReactivated dead publisher path)
- **Verdict:** Agree. Strong HIGH.
- **Verified:** `src/actions/module.actions.ts:154-193` contains NO `emitEvent(...)` call in `activateModule()`. Contrast with `deactivateModule` at line 276-284 which does emit `ModuleDeactivated` per distinct user. `grep -rn "ModuleReactivated" src/ --include="*.ts" | grep -v event-types.ts | grep -v notification-dispatcher.ts | grep -v index.ts` returns zero emit sites. `handleModuleReactivated` at `notification-dispatcher.ts:336-372` is fully wired and the subscription at line 455 is registered. Dead publisher path confirmed — exactly the symmetric twin of CRIT-A1.
- **Additional observation not in baseline:** `activateModule()` also lacks the user-scoping fan-out pattern that `deactivateModule` uses. When reactivation is implemented, the publisher will also need to query affected users (all users whose automations were paused with `pauseReason` matching `module_deactivated | auth_failure | cb_escalation`) and emit one event per distinct userId — the notification should communicate "your module is back, N automations remain paused because we do NOT auto-restart per spec rule `ModuleActivation`." That's the only way `pausedAutomationCount` on the payload can be populated correctly per user.

### H-A-02 (Deck undo stack records irreversible actions — "undo theatre")
- **Verdict:** Agree. Strong HIGH.
- **Verified:** `useDeckStack.ts:148-156` pushes every successful non-skip action into the undo stack. `StagingContainer.handleDeckUndo:332-340` only implements the `dismiss` reversal server-side. `promote/superlike/block` undos decrement stats and reset the index but leave the Job/blacklist entry/trashed StagedVacancy committed. Reproduction walk-through in the baseline is correct: re-actioning against the "undone" ghost card triggers a silent rollback when the server reports `{success: false}` because the aggregate has already transitioned past the expected precondition in `dismissStagedVacancy`/`promoteStagedVacancyToJob`. The user is stuck because `setExitDirection(null)` fires but the card stays in place.
- **Additional observation not in baseline:** The undo store at `src/lib/undo/undo-store.ts` (modified in Sprint 1 — +6 lines) is an entirely separate compensation mechanism from `useDeckStack.undoStack`. `stagedVacancy.actions.ts:dismissStagedVacancy` already creates an `undoEntry` with a compensation callback and pushes it to `undoStore` (lines 151-162). That store has proper reversibility semantics. `useDeckStack`'s own undo stack is a REDUNDANT second undo mechanism that duplicates state without reusing the compensation callbacks the server actions already produce. Correct fix is to pass the `undoTokenId` from `ActionResult.data.undoTokenId` back through `onAction → useDeckStack`, and have `undo()` call a server action that invokes the stored compensation. This would also let promote/superlike/block undos "just work" because `createUndoEntry` is generic. Tracked as a spec deviation from `specs/vacancy-pipeline.allium` which treats the undo store as the single source of truth for reversal.

### H-A-03 (PromotionDialog defensive fallback re-introduces CRIT-A2 on the non-data success path)
- **Verdict:** Agree. Strong HIGH (latent contract violation, dead code today).
- **Verified:** `PromotionDialog.tsx:103-116` — the `result.success && !result.data` branch calls `toast` + `onOpenChange(false)` but NOT `onSuccess`. In `StagingContainer.tsx:589-602` the `onOpenChange` handler schedules `queueMicrotask` that resolves the pending `promotionResolveRef` with `{success: false}`. Net effect: UI says "promoted" (green toast), deck says "failed" (rollback), server side is actually promoted. Perfect silent drift.
- **Minor correction to baseline:** The auto-approve=OFF path in `StagingContainer.handleDeckAction:300-304` opens the dialog and returns the promise. When the dialog resolves via the defensive branch, `onOpenChange(false)` fires, which triggers the `queueMicrotask` that resolves the promotionResolveRef with `{success: false}`. The baseline mentions the `handleDeckAction` auto-approve path at line 290-296 has the "correct (symmetric) console.warn", but that warn path (auto-approve=ON) is a DIFFERENT code branch from the dialog (auto-approve=OFF). The defensive branch in the dialog is a separate, independent drift surface. Still HIGH.

### H-A-04 (5 legacy direct-writer sites bypass `shouldNotify()`)
- **Verdict:** Agree. Strong HIGH.
- **Verified:** `scripts/check-notification-writers.sh` enumerates exactly 3 legitimate exceptions (`in-app.channel.ts`, `degradation.ts`, `webhook.channel.ts`). Within those: `degradation.ts` has 3 `prisma.notification.create*` calls at lines 117, 242, 336 and `webhook.channel.ts` has 2 at lines 191, 234. None of the 5 sites import `shouldNotify` or call `resolveUserSettings` to fetch preferences. Contrast with `ChannelRouter.route:60-65` which gates every channel via `shouldNotify(prefs, draft.type, channelId)`, and `shouldNotify` itself at `notification.model.ts:191-220` enforces global kill switch + channel enablement + per-type override + quiet hours. The 5 legacy sites violate all four.
- **Reinforces my new H-A-07 below** (the preferences/quiet-hours check is enforced at the channel-router layer, not at the Prisma-writer layer — so ALL non-router writers are, by construction, exempt from it). The enforcement script only checks WHERE the write lives, not WHETHER `shouldNotify` was called before it. Baseline's suggested fix direction (extend the script to assert `shouldNotify` calls inside allowed files) is correct and necessary.

### H-A-05 (`CompanyBlacklist` aggregate writes to `StagedVacancy` aggregate without a domain event seam)
- **Verdict:** Agree. Strong HIGH.
- **Verified:** `companyBlacklist.actions.ts:104-124` — the `$transaction` wraps `companyBlacklist.create` AND `stagedVacancy.updateMany({ trashedAt: new Date() })`. No `emitEvent` is called for the trashed rows. Compare to `trashStagedVacancy:276` which correctly emits `VacancyTrashed` per row. The bulk `updateMany` bypasses the aggregate mutator entirely — any consumer of `VacancyTrashed` (retention stats, audit logger via WILDCARD, future enrichment cache eviction, CRM-side signals) silently misses blacklist-triggered trashes.
- **Additional observation not in baseline:** the blacklist action ALSO skips the precondition check that `trashStagedVacancy` enforces at line 256: `if (vacancy.status === "promoted") return { success: false, message: "Cannot trash a promoted vacancy" };`. The bulk `updateMany` filters by `promotedToJobId: null` (line 120), which approximates the precondition but is NOT identical — `promotedToJobId` is the foreign-key column while `status === "promoted"` is the enum. If those ever drift (a failed promotion that set `promotedToJobId` but not `status`, or vice versa), the blacklist would either trash a promoted vacancy or skip a legit trash. Recommend Fix Option 1 from baseline (emit `BlacklistEntryAdded`, consumer calls `trashStagedVacancy` per matched id, which gives you the precondition check AND the per-row event emission for free).

## NEW HIGH findings (not in baseline)

### H-A-06 — Decision C "fix" is semantically incomplete: sheet-mode deck actions bypass the deck state machine (commit `2caab7e`)
- **File:** `src/components/staging/StagingContainer.tsx:359-412` (adapters) + `src/hooks/useDeckStack.ts:113-187` (performAction) + `src/components/staging/DeckView.tsx:103-111` (hook instantiation)
- **Severity:** HIGH
- **Rule:** ADR-030 Decision C "deck action routing invariant" / DDD "single source of truth for state machine" / SOLID Tell-Don't-Ask
- **Finding:** ADR-030 Decision C states: *"Any action taken against a deck card from any entry point MUST route through `useDeckStack.performAction` (via the container's `handleDeckAction` callback)."* The commit `2caab7e` claims to fix this for the details sheet. It does not. The sheet adapters in deck mode call `handleDeckAction(vacancy, "dismiss")` directly, but `handleDeckAction` is the **server-action dispatcher** that `useDeckStack.performAction` consumes via its `onAction` prop — it is NOT `performAction` itself. The state machine (owned by `useDeckStack` living INSIDE `DeckView`) is never invoked. Concretely, when the user dismisses a card from the details sheet in deck mode:
  1. `detailsDismissAdapter` (line 359) calls `handleDeckAction(vacancy, "dismiss")` (line 362)
  2. `handleDeckAction` (line 252) calls `dismissStagedVacancy(vacancy.id)` — server dismiss succeeds, emits `VacancyDismissed`, toast fires
  3. Returns `{ success: true }` to the adapter
  4. Sheet closes via `onOpenChange(false)` in `runAction` (`StagedVacancyDetailSheet.tsx:89`)
  5. **The deck is now in an inconsistent state:** `useDeckStack.currentIndex` is still 0, `useDeckStack.stats.dismissed` is still 0, `useDeckStack.undoStack` has no entry, no exit animation played, and `DeckView` still shows the same card because `vacancies[0]` is unchanged in the React state (the parent's `vacancies` prop was not reloaded in the dismiss branch).

  The user closes the sheet and sees the exact bug that CRIT-A2 / ADR-030 / honesty gate finding #17 was supposed to prevent — the card still in front of them, stats stale, undo empty.

  The commit message says: *"In deck mode they route through handleDeckAction(vacancy, action) which is the single source of truth for deck state."* This is false. `handleDeckAction` is the single source of truth for **dispatching the server action**; `useDeckStack.performAction` is the single source of truth for **the deck state machine**. These are different abstractions and the fix conflated them.

  Why tests don't catch it: `__tests__/StagedVacancyDetailSheet.spec.tsx` tests the sheet in isolation with mocked callbacks (`jest.fn()`). It asserts that the callback is invoked but not what it does to deck state. There's no integration test that mounts `StagingContainer` with a real `DeckView` and asserts the deck index advances after a sheet dismiss. `__tests__/DeckView.spec.tsx` (285 lines) never mounts a sheet. `e2e/crud/staging-details-sheet.spec.ts` is list-mode only (line 42-46 — goes straight to the "New" tab in list mode).

  Why the related flows work by accident:
  - **Auto-approve promote:** `handleDeckAction` calls `reload()` (line 282), which refetches all vacancies and replaces the `vacancies` array. The dismissed vacancy is gone, so the card "advances" from a different angle — but `useDeckStack.currentIndex` still points at the wrong slot, so this introduces M-A-04 (vacancies-prop-instability) symptoms.
  - **Block:** `handleBlockCompany` calls `reload()` after the block confirmation, same masking behavior.
  - **Non-auto-approve promote:** The PromotionDialog triggers `reload()` in its `onSuccess` branch (line 616). Same masking.
  - **Dismiss (the most common action):** NO `reload()` call — the bug is fully exposed.

- **Reproduction (manual):** Open staging, switch to deck mode, open the details sheet on the first card via the Info button, click Dismiss in the sheet footer. The sheet closes, the toast fires, the vacancy is trashed server-side, but the deck still shows the same card and `stats.dismissed` is 0. Swipe left on the now-stale card: `dismissStagedVacancy` returns `{ success: false, message: "Can only dismiss staged or ready vacancies" }` because the vacancy is already dismissed. The exit animation rolls back and the card stays.
- **Suggested fix direction:** Lift `useDeckStack`'s `dismiss/promote/superLike/block/skip` imperatives from inside `DeckView` up to `StagingContainer`. Two options:
  1. **Promote the imperatives to props:** `DeckView` accepts a `deckActions: { dismiss, promote, superLike, block, skip, undo }` prop owned by a `useDeckStack` instance that lives in `StagingContainer`. The sheet adapters in deck mode call `deckActions.dismiss()` etc. directly. This is the SSOT fix per Decision C.
  2. **Forward ref callable handle:** `DeckView` exposes an imperative handle via `useImperativeHandle` — `ref.current.performAction("dismiss")`. Sheet adapters call the handle in deck mode. More React-y but indirection-heavy.

  Option 1 is cleaner and matches the ADR's stated principle. Either fix also requires a new integration test: `__tests__/StagingContainer.integration.spec.tsx` that mounts the container in deck mode, opens the sheet, dismisses from the sheet, and asserts `stats.dismissed === 1` AND the rendered card is the next vacancy. Without this test the bug will silently recur the next time someone refactors.

  Until the fix lands, add a temporary `reload()` call at the end of `handleDeckAction`'s `dismiss` branch to mask the symptom (at the cost of a redundant refetch). Documented ADR follow-up.

### H-A-07 — `shouldNotify` is the preference-gate enforcement point but it lives BEHIND the channel router, not IN the model layer — so direct writers are architecturally exempt, not just legacy
- **File:** `src/models/notification.model.ts:191-220` (shouldNotify) + `src/lib/notifications/channel-router.ts:59-65` (sole call site in the write path) + `src/lib/connector/degradation.ts` + `src/lib/notifications/channels/webhook.channel.ts`
- **Severity:** HIGH
- **Rule:** `specs/notification-dispatch.allium` invariants `QuietHoursRespected` + `PreferenceCheck` rule + DDD domain-layer enforcement / SOLID ISP
- **Finding:** H-A-04 (baseline) correctly identifies that the 5 legacy writers bypass `shouldNotify`. But the root cause is architectural, not just "they were added before the router existed": **there is no enforcement point for `PreferenceCheck` or `QuietHours` at the Notification model/repository layer**. `shouldNotify` is a plain TypeScript function exported from `notification.model.ts` that any caller can choose to call or not. The only caller in the write path is `ChannelRouter.route`. Every other writer — including the 5 legacy direct-writers, AND any future writer that forgets to import `shouldNotify` — is, by construction, a silent spec violator.

  This is different from H-A-04: H-A-04 says "fix the 5 known sites." H-A-07 says "the enforcement model itself is wrong — the next writer that ships will have the same bug, because the domain layer has no gate." The architectural fix is to make the preference check an **invariant of the Notification aggregate**, not a courtesy check the channel router happens to perform. Options:

  1. **Repository pattern:** Introduce `NotificationRepository.create(draft, userId)` in `src/lib/notifications/repository.ts` (server-only) that ALWAYS calls `shouldNotify` before any DB write. Everyone who wants to create a Notification must go through the repository. `in-app.channel.ts` is the only file allowed to call `prisma.notification.create*` directly (the repository calls the raw Prisma under the hood). `scripts/check-notification-writers.sh` stays identical in intent but tightens to exactly ONE allowed file.
  2. **Write-time guard in a Prisma extension:** Use a Prisma client extension to intercept `notification.create` and check preferences before proceeding. Pros: true invariant, impossible to bypass from application code. Cons: Prisma extensions are process-wide and could interfere with the in-app channel itself (chicken-and-egg).
  3. **Keep the current 5 legacy exceptions but make each one call a shared `createDirectNotification(draft, userId)` helper from the baseline's H-A-04 suggestion — AND extend the enforcement script to assert `createDirectNotification` is the only write pattern inside the allowed files, NOT `prisma.notification.create` raw.** This is the minimum viable fix aligned with the baseline but closes the class-of-bug loop.

- **Why this is distinct from H-A-04:** The baseline's H-A-04 suggested fix direction is "extract a shared helper `createDirectNotification` … this is a ~30-line helper that closes all 5 violations at once." That fix closes today's 5 violations. My H-A-07 says: unless the enforcement model changes, the 6th violation (which caused CRIT-A1) and the 7th (yet to be committed) will keep appearing, because the domain layer has no gate — only a convention. The difference is "fix the count" vs "fix the slope." Both should be accepted; H-A-07 is the strategic escalation of H-A-04's tactical fix.

- **Rationale for HIGH:** The spec invariants `QuietHoursRespected` and `PreferenceCheck` are user-visible: a user with quiet hours set 22:00-07:00 expects NO rows in `Notification` created during that window. Today, any of 5 sites will create them anyway. The regression surface is real and grows with every module added. The HIGH classification is consistent with how the baseline treats H-A-04.

## NEW MEDIUM findings

### M-A-07 — `useDeckStack` cannot survive the celebration's navigation side-effect — the fly-in queue is tied to `DeckView`'s lifetime
- **File:** `src/components/staging/DeckView.tsx:550-554` (host mount point) + `src/components/staging/SuperLikeCelebrationHost.tsx:142-148` (navigation on CTA)
- **Severity:** MEDIUM
- **Rule:** Architectural ownership / "state that outlives the component that triggered it"
- **Finding:** `useSuperLikeCelebrations` lives inside `DeckView` (line 84). The host is mounted as a sibling of the deck itself (lines 550-554). When the user clicks "Open job" in a celebration, `router.push` navigates away from the staging page, which unmounts `DeckView`, which destroys the celebration queue. Any queued celebrations behind the current one are silently lost. For a batch of 5 rapid super-likes: the user sees the first celebration, clicks "Open job", and celebrations 2-5 never display. The `MAX=5` queue cap implies that stacking is a supported use case — but the lifecycle contract doesn't match that intent.

  There is a second, subtler issue: the celebration navigation ALSO bypasses `useDeckStack`'s state. The deck index advanced when the super-like fired, so when the user returns from `/dashboard/myjobs/:jobId` via back-navigation, the staging page re-mounts from scratch (no persisted deck state) and starts over at index 0. The super-liked card is already gone from the server-side list (because it was promoted to a Job) so the deck will not show it, but the other 4 queued celebrations are gone and the user's "review session stats" counter is reset.
- **Suggested fix direction:** Lift `useSuperLikeCelebrations` up to `StagingContainer` (or even higher, to the dashboard layout) so the queue survives navigation. Render the `SuperLikeCelebrationHost` as a portal child of a layout that persists across the `/dashboard/*` routes. This also makes the celebration reachable from list-mode promote flows (currently impossible because the hook is deck-only), closing an inconsistency in the UX where list-mode super-like silently loses the celebration affordance.

  Secondary: add a Zustand/Jotai persistent atom or a sessionStorage-backed queue so celebrations survive a hard navigation if the hook can't be lifted.

### M-A-08 — `NotificationActorType = "enrichment"` is in the type union but never populated by any writer AND `formatNotificationActor` has no case for `"module"` (not just `"enrichment"`)
- **File:** `src/models/notification.model.ts:23-28` + `src/lib/notifications/deep-links.ts:387-399`
- **Severity:** MEDIUM
- **Rule:** Discriminated union completeness / ubiquitous language / exhaustiveness checking
- **Finding:** The baseline's M-A-01 identifies that `formatNotificationActor` does not case `"module"`. I confirm and extend: the switch at line 390 cases only `system`, `automation`, `user` — it has no case for either `"module"` OR `"enrichment"` even though BOTH are in the type union (`NotificationActorType`). The module case affects every single module-lifecycle notification (every `module_deactivated`, `auth_failure`, `cb_escalation` — already 3 out of 7 active notification types). The `"enrichment"` case is dead code today but would also fall through.

  Additionally: there is no TypeScript exhaustiveness check on the switch. If a new actor type is added to the union, the switch silently keeps compiling and returns `""` (line 398). Classic "exhaustive switch over discriminated union without `never` guard" anti-pattern.

  The degradation writers at lines 117, 242, 336 all set `actorType: "module"` and `actorId: moduleId`. The dispatcher handler at `notification-dispatcher.ts:308` sets `actorType: "module"` for `ModuleDeactivated`. So the switch's `default: return ""` branch is hit EVERY time a module notification renders. Baseline captured this symptom as "the raw module slug falls through." My version clarifies that the path returns an empty actor slot, because `actorId` is set and the `if (actorId) return actorId;` at line 385 fires BEFORE the switch. So the raw slug IS the actor name — but the switch is also dead code, because it's never reached when `actorType === "module"` AND `actorId` is populated. Double bug: wrong actor text AND unreachable case.
- **Suggested fix direction:**
  1. Add `case "module": return resolveModuleDisplayName(actorId, t) ?? t("notifications.actor.module");` BEFORE the `if (actorId) return actorId;` line.
  2. Add `case "enrichment": return t("notifications.actor.enrichment");`.
  3. Replace the `default: return "";` with an exhaustive-check pattern: `default: { const _exhaustive: never = actorType; return ""; }` so future additions fail compile.
  4. Add i18n keys `notifications.actor.module` and `notifications.actor.enrichment` to all 4 locale dictionaries.

### M-A-09 — `handleDeckUndo` does not reverse non-`dismiss` actions in server state but IS wired as an `onUndo` callback that fires for any undo — the local state reversal creates a split-brain with the undo-store compensation mechanism that also exists
- **File:** `src/components/staging/StagingContainer.tsx:330-342` + `src/lib/undo/undo-store.ts` + `src/actions/stagedVacancy.actions.ts:151-162`
- **Severity:** MEDIUM
- **Rule:** Architectural coherence / duplicate mechanisms for the same intent
- **Finding:** The baseline's H-A-02 covers the user-visible bug (undo theatre). This is a related but distinct architecture concern: JobSync actually has TWO separate undo mechanisms that don't know about each other.
  1. **Server-side `undoStore`** in `src/lib/undo/undo-store.ts`, populated by `dismissStagedVacancy`, `archiveStagedVacancy`, `trashStagedVacancy` with generic compensation callbacks (closure captures). This is the DDD-aligned "undoable command" pattern. Each `ActionResult` returns an `undoTokenId` the client can use to invoke the compensation.
  2. **Client-side `useDeckStack.undoStack`** in `src/hooks/useDeckStack.ts:101`, populated ad-hoc from `onAction` success, reversed via `onUndo` callback that the container implements partially (`StagingContainer.handleDeckUndo` only covers `dismiss`).

  These two stores overlap for `dismiss` (where both work) and diverge for `promote/superlike/block` (where neither works). They also diverge for `archive` and `trash` (undoStore covers them, deck stack doesn't care because deck never archives/trashes from the swipe UI). The deck's `handleDeckUndo` does not consult the undoStore's tokenId — it naively calls `restoreStagedVacancy` for `dismiss`, duplicating the reversal logic instead of invoking the compensation the server already registered.

  The correct architectural resolution is: pipe `ActionResult.data.undoTokenId` from each server action through `handleDeckAction → useDeckStack.onAction return → useDeckStack.undoStack entry → handleDeckUndo → server-side undo action that invokes the token's compensation`. This gives you:
  - a single source of truth for what "undo" means (the closure captured at commit time)
  - automatic coverage for promote/superlike/block once their server actions start returning undo tokens
  - automatic expiration, because the undoStore already has TTL semantics
  - no divergence between deck stats and server state

- **Why MEDIUM not HIGH:** This is the architectural fix for H-A-02 (HIGH). The HIGH is the user-visible symptom; this MEDIUM is the root cause. Listed separately so the fix direction is visible even if H-A-02 is addressed with a narrower option (option 1 in the baseline: "narrow contract to reversible actions only").

## NEW LOW findings

### L-A-05 — `eventBus.publish` awaits handlers sequentially, making late-registered handlers dominated by earlier ones (registration-order coupling)
- **File:** `src/lib/events/event-bus.ts:30-36`
- **Severity:** LOW
- **Rule:** Event dispatch ordering / loose coupling
- **Finding:** `for (const handler of allHandlers) { try { await handler(event); } catch ... }` runs handlers sequentially. With 5 consumers registered via `registerEventConsumers` (audit-logger, notification-dispatcher, degradation-coordinator, enrichment-trigger, logo-asset-subscriber), a `VacancyPromoted` publish waits for all of them in registration order. If `handleCompanyCreated` (enrichment-trigger) blocks for the `await db.enrichmentResult.findFirst(...)` (M-A-06), every subsequent handler waits. The baseline's M-A-06 captures the database-read blocking symptom; this captures the architectural root: **sequential dispatch in a fire-and-forget bus is a contradiction in terms**.

  `emitEvent` is fire-and-forget at the publisher level (`eventBus.publish(...).catch(...)`), so callers don't block. But handlers DO block each other. This means the order of `registerEventConsumers` calls in `consumers/index.ts:17-35` matters for latency and error propagation — a subtle form of tight coupling between consumers that should be independent.
- **Suggested fix direction:** Change `publish` to dispatch handlers concurrently via `Promise.allSettled(handlers.map(h => h(event)))`. The spec's `ErrorIsolation` rule is preserved (one handler's error doesn't affect others), and the `OrderGuarantee` invariant is not actually guaranteed by the current code anyway (the `Set<EventHandler>` iteration order is insertion order, which is a JS impl detail, not a spec guarantee). True ordering requires an explicit priority, which is not used anywhere in the codebase. Low priority because nothing currently depends on ordering and `emitEvent`'s caller-side fire-and-forget hides most of the impact.

### L-A-06 — Notification Prisma migration adds new columns as `JSONB` on SQLite (type silently becomes TEXT)
- **File:** `prisma/migrations/20260409135116_add_notification_structured_fields/migration.sql:8-10`
- **Severity:** LOW
- **Rule:** Type safety at persistence boundary / database portability
- **Finding:** The migration SQL declares `titleParams JSONB` and `reasonParams JSONB`. SQLite does not have a native `JSONB` type — it stores these as `TEXT` with JSON1 extension semantics. The Prisma client handles the marshaling, but the column type shown in `.schema` output is `JSONB` which will confuse anyone inspecting the DB. More importantly: if the project later migrates to PostgreSQL, the column type `JSONB` has a real binary encoding there, and a naive `pg_dump` → `sqlite → pg` data transfer will fail on these columns because the data in SQLite is TEXT, not JSONB binary. This is a latent portability landmine.

- **Suggested fix direction:** Either declare the columns as `TEXT` in the SQL and let the Prisma layer handle `Json?` typing (which is how the schema.prisma declares them — `Json?` translates to the backend's native JSON type), or document a migration strategy in the ADR/migration comments. This is a pre-existing pattern in the project — the original `Notification.data Json?` is also stored as TEXT in SQLite — so the LOW classification is consistent.

## Methodology / differences from the generic review

What I looked at that the generic reviewer didn't:

1. **Called the ADR's own invariant against its implementation.** The generic reviewer verified that CRIT-A1 and CRIT-A2 were fixed. I also verified that the Decision C commit (`2caab7e`) actually honors Decision C's stated invariant — and found it does not (H-A-06). This required reading the commit description against the code and understanding the difference between `useDeckStack.performAction` and `StagingContainer.handleDeckAction`. That distinction is invisible unless you're specifically looking for "state machine ownership" as an architectural property, which is an architecture specialist's tool.

2. **Looked for enforcement mechanism vs. enforcement point confusion.** H-A-04 identifies 5 sites that bypass `shouldNotify`. H-A-07 identifies that `shouldNotify` is not a gate — it's a polite suggestion that only one caller happens to use. That escalation requires thinking about "what layer SHOULD own this invariant", a DDD-flavored question the generic reviewer didn't ask.

3. **Checked for parallel mechanism drift.** M-A-09 identifies that JobSync has two undo mechanisms (server-side `undoStore` + client-side `useDeckStack.undoStack`) that don't know about each other. The generic reviewer caught the user-visible undo-theater symptom (H-A-02) but didn't connect it to the existing `undoStore` infrastructure that already solves the problem.

4. **Considered lifecycle scope mismatches.** M-A-07 flags the celebration queue living inside `DeckView` — when the user clicks "Open job", navigation destroys the queue. The generic reviewer tested the ADR-030 Decision A contract compliance but didn't ask "does the queue's lifetime match its intent?"

5. **Pushed on type exhaustiveness.** M-A-08 finds `formatNotificationActor` has no case for `"module"` OR `"enrichment"`, not just the missing `"module"` case the baseline caught. Also noted the missing `never` exhaustiveness guard.

What the generic reviewer looked at that I didn't deeply re-verify:

- **i18n dictionary coverage.** I did not re-check whether all new notification types have keys in all 4 locales. The baseline noted "notifications.actor.module and notifications.actor.enrichment do not exist" — I treated that as fact.
- **Security scopes on the new Prisma writes.** I did not re-verify the IDOR `userId` scoping on the Sprint 2 additions — relying on the baseline's spot-check of `CompanyBlacklist.actions` + the project's existing ADR-015 discipline.
- **React exhaustive-deps minutiae.** I skipped L-A-04 (handleBlockCompany dep array) and similar hook-lint concerns — they're real but low-impact and not architecture-specific.
- **Hook logic details inside useDeckStack / useSuperLikeCelebrations.** I looked at the public contracts, not the internal ref machinery. The baseline's M-A-04 (reload races) is a hook-internal concern I accept without re-verification.

Coverage overlap: ~80% on HIGH findings (I confirmed all 5 of the baseline's HIGHs independently, then added 2 more). Overlap is lower on MEDIUM/LOW where the two reviews optimize for different tastes.

## Verdict on specialization value

**PARTIAL — with a lean toward YES.**

The specialized review produced 2 new HIGH findings (H-A-06 undermining the Decision C fix, H-A-07 reframing preference-gate enforcement) that materially change the Sprint 2 remediation plan. Neither was in the baseline; both are directly actionable. H-A-06 in particular is a "the honesty gate missed its own gate" finding — the commit claims to fix a bug but re-introduces it with the fix, and no test catches the regression. That's exactly the kind of finding a specialist lens catches that a generalist doesn't.

Against that: the 5 baseline HIGHs were all correct and well-reasoned — I agreed with every one and downgraded none. The generic reviewer found `H-A-01` through `H-A-05` without specialization. Running specialists on the other 4 dimensions will produce new findings only if the codebase has equivalent dimension-specific blind spots in the other dimensions. For an architecture-heavy sprint (which Sprint 2 is — ADR-030 alone introduces 3 architectural decisions), the specialist uplift is ~40% more HIGH-severity coverage. For a security-heavy or accessibility-heavy sprint, the ratio may differ.

**Recommendation for the orchestrator:** Worth running specialized reviews for the other 4 dimensions on THIS sprint, because ADR-030 is the kind of cross-cutting change where each specialist lens has a shot at catching something the generic reviewer filtered out. For typical feature sprints (single-dimension changes), the generic reviewer's 80% coverage may be sufficient and the API-cost premium of specialists may not pay off.
