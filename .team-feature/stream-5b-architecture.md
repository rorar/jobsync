# Sprint 2 Team Review — Architecture Dimension

**Reviewer:** architecture stream (Opus 4.6 1M)
**Scope:** `a92aaf3..dc48f4b` (129 files, ~14k lines, two UX runs + Sprint 0 + Sprint 1 + cleanups)
**Primary focus:** Module boundaries, server-action repository pattern, domain events, hook contracts, ADR-030 Decisions A–C, DDD ubiquitous language, spec alignment.
**Method:** git diff + read-only inspection of `src/hooks/`, `src/components/staging/`, `src/actions/`, `src/lib/events/`, `src/lib/notifications/`, `src/lib/connector/`, `specs/*.allium`, `docs/adr/030*.md`.

## Summary

- **Files reviewed:** ~72 of 129 (focused on architecture-relevant subset: all connector/event/action/hook/notification paths; skipped pure i18n dicts, e2e specs, lint configs)
- **HIGH findings:** 5
- **MEDIUM findings:** 6
- **LOW findings:** 4
- **Verified CRIT fixes:** CRIT-A1 (`deactivateModule` routes through `ModuleDeactivated`), CRIT-A2 (`PromotionDialog.onSuccess` threads `jobId`), CRIT-Y1/Y2/Y3 (out of dimension, spot-verified only)
- **Key insight:** The CRIT-A1 fix surfaced a *symmetric* blind spot — `activateModule` is still a dead publisher path, mirroring the exact bug CRIT-A1 fixed (H-A-01). Similar "fix one side, leave the other" pattern also applies to undo (H-A-02), PromotionDialog defensive path (H-A-03), and deck-action reload races (M-A-02).

## HIGH findings

### H-A-01 — `ModuleReactivated` is a dead publisher path (symmetric twin of CRIT-A1)
- **File:** `/home/pascal/projekte/jobsync/src/actions/module.actions.ts:154-193` (publisher missing) + `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts:336-372` (handler + subscription exist)
- **Severity:** HIGH
- **Rule:** ADR-030 Decision B "SingleNotificationWriter" / domain-event completeness / `specs/notification-dispatch.allium` trigger `ModuleReactivated`
- **Finding:** `activateModule()` updates `ModuleRegistration` status and returns — it never emits `ModuleReactivated` via the event bus. The dispatcher's `handleModuleReactivated` handler is fully registered (`eventBus.subscribe(DomainEventType.ModuleReactivated, handleModuleReactivated)` at dispatcher.ts:455) and builds a complete 5W+H `NotificationDraft`, but the event is never published from anywhere in `src/`. Verified via:
  ```
  grep -rn "ModuleReactivated" src/ --include="*.ts" | grep -v event-types.ts | grep -v notification-dispatcher.ts | grep -v index.ts
  # -> zero emit sites
  ```
  This is the EXACT class of bug the Sprint 1 CRIT-A1 fix remediated for `ModuleDeactivated`. CRIT-A1's scope review only checked the deactivate path; the symmetric reactivate path was never touched.
- **Reproduction / rationale:** Any user who reactivates a previously-auth-failed module in Settings sees the toggle flip to "active" but receives no notification. The dispatcher handler (which would dual-write `titleKey="notifications.moduleReactivated.title"`, severity=success, etc.) is reachable only if an emission is added.
- **Suggested fix direction:** At the end of `activateModule()` (after the DB upsert), query how many automations are paused with `pauseReason IN ("module_deactivated", "auth_failure", "cb_escalation")` for this `moduleId`, and emit **one** `ModuleReactivated` event per distinct `userId`, mirroring the `automationIdsByUser` fan-out already in `deactivateModule()` at `module.actions.ts:267-284`. Spec is explicit (`specs/module-lifecycle.allium` rule `ModuleActivation`) that automations are NOT auto-unpaused — the notification's value is "your module is back, {count} automation(s) remain paused; visit settings to re-enable". The payload field `pausedAutomationCount` is already declared in `event-types.ts` and consumed by the handler.

### H-A-02 — Deck undo stack records irreversible actions, producing "undo theatre"
- **File:** `/home/pascal/projekte/jobsync/src/hooks/useDeckStack.ts:148-156` + `/home/pascal/projekte/jobsync/src/components/staging/StagingContainer.tsx:330-342`
- **Severity:** HIGH
- **Rule:** ADR-030 Decision A contract cohesion / SOLID SRP / ubiquitous language ("undo" must mean undo)
- **Finding:** `useDeckStack.performAction` appends EVERY successful action to the undo stack (except `skip`):
  ```typescript
  if (action !== "skip") {
    const entry: UndoEntry = { vacancy, action, index, createdJobId: result.createdJobId };
    setUndoStack(prev => [entry, ...prev].slice(0, MAX_UNDO_STACK));
  }
  ```
  But `StagingContainer.handleDeckUndo` reverses server state ONLY for `dismiss`:
  ```typescript
  if (entry.action === "dismiss") {
    await restoreStagedVacancy(entry.vacancy.id);
  }
  // promote/superlike undo is more complex (would need to delete the promoted job)
  // For now, undo only works for dismiss actions
  ```
  Effect: the user swipes right (promote) or up (superlike) or down (block), then clicks Undo — the card re-appears on the deck, deck stats decrement, the celebration is yanked away, but the Job record and/or blacklist entry and/or trashed StagedVacancy is **still committed server-side**. Re-actioning against the ghost card triggers a silent rollback when the server action fails because the aggregate is already in a terminal state. The user then sees the card on screen with no way to remove it (rollback resets `exitDirection` and index stays).
  This is not an ADR-030-introduced bug but Sprint 2 introduced several new entry points (details sheet, auto-approve-off promotion, block-with-confirmation) whose state machines all funnel into this broken undo flow, expanding the blast radius.
- **Reproduction / rationale:**
  1. Enable auto-approve
  2. Swipe a card right (promote) — Job created in DB, undo stack has 1 entry
  3. Click Undo — deck index reverts, stats decrement, but the Job still exists
  4. Swipe the same card right again — `promoteStagedVacancyToJob` returns failure ("already promoted"), animation rolls back, user is stuck
- **Suggested fix direction:** Make `useDeckStack`'s undo stack reversibility-aware. Two options:
  1. **Narrow contract:** `performAction` only pushes reversible actions. Pass a `reversibleActions: DeckAction[]` option to the hook; the StagingContainer sets `["dismiss"]` for now. Hide the Undo button for non-reversible terminal states.
  2. **Complete the undo implementations:** Introduce `revertPromote(jobId, stagedVacancyId)`, `revertBlacklist(pattern)`, etc., plumb through `handleDeckUndo`, and keep the current broad undo stack.
  Option 1 is the cleanest — it preserves the current contract and simply acknowledges that promote/superlike/block are terminal intents. Document the rule in ADR-030 as a Decision D.

### H-A-03 — PromotionDialog defensive fallback re-introduces CRIT-A2 on the non-data success path
- **File:** `/home/pascal/projekte/jobsync/src/components/staging/PromotionDialog.tsx:103-116`
- **Severity:** HIGH
- **Rule:** ADR-030 Decision A / CRIT-A2 remediation completeness
- **Finding:** The CRIT-A2 fix threads `result.data.jobId` through `onSuccess` on the happy path. BUT a defensive branch was added that handles `result.success && !result.data`:
  ```typescript
  } else if (result.success && !result.data) {
    console.warn("[PromotionDialog] promoteStagedVacancyToJob returned success without data — cannot forward jobId", ...);
    toast({ variant: "success", description: t("staging.promoted") });
    onOpenChange(false);   // <- closes dialog WITHOUT calling onSuccess
  }
  ```
  `onOpenChange(false)` fires but `onSuccess` is **not** called. In `StagingContainer.tsx:589-602`, the `onOpenChange` prop handler schedules a `queueMicrotask` that resolves the pending `promotionResolveRef` with `{ success: false }`. So from the deck's perspective, the promotion **failed** — it rolls back the exit animation and the card stays put. Meanwhile the user has just seen a green success toast. Silent contract drift: UI says "promoted", deck says "failed", the staged vacancy is actually promoted server-side.
  This is a probabilistic bug — it only fires if a future refactor ever makes `promoteStagedVacancy` return `{ success: true }` without `data`. Today the impl always returns `{ jobId, stagedVacancyId }`, so the branch is defensive dead code. But the defensive branch becomes the weak link the moment the contract drifts. Note that the `handleDeckAction` auto-approve path at `StagingContainer.tsx:290-296` has the correct (symmetric) console.warn AND passes the optional `createdJobId` through regardless.
- **Reproduction / rationale:** Purely a code-contract review finding — not reproducible in production today without injecting a mock `promoteStagedVacancyToJob` that returns `{ success: true }` only. But the whole point of CRIT-A2 was "prevent silent jobId drift"; this branch is the same drift pattern.
- **Suggested fix direction:** Either (a) relax `PromotionDialogSuccessResult.jobId` to `string | undefined` and always call `onSuccess({ jobId: result.data?.jobId ?? "", stagedVacancyId: vacancy.id })`; or (b) make the defensive branch a hard error (`throw new Error("Contract violation: success without data")` → caught by the existing catch that toasts failure and leaves the ref pending → micro-task resolves false — consistent with the visible outcome). Option (b) is more honest.

### H-A-04 — 5 legacy direct-writer sites bypass `shouldNotify()` preference gating and quiet hours
- **File:** `/home/pascal/projekte/jobsync/src/lib/connector/degradation.ts:117,242,336` + `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts:191,234`
- **Severity:** HIGH
- **Rule:** `specs/notification-dispatch.allium` rules `PreferenceCheck`, `QuietHours`; invariant `QuietHoursRespected`
- **Finding:** The 5 ADR-030 legacy-writer sites each do a direct `prisma.notification.create()` or `createMany()` without consulting `shouldNotify(prefs, type, "inApp")`, without consulting quiet hours, without consulting per-type overrides, without consulting the global `enabled` kill switch. The spec rule `PreferenceCheck` requires ALL notification creation to check preferences first; the invariant `QuietHoursRespected` says "no Notification is created during user's quiet hours". Both are silently violated by these 5 sites.
  The 3 `degradation.ts` sites are pre-existing legacy, but the 2 `webhook.channel.ts` sites were added in Sprint 2 (af6d328). Sprint 2 correctly added the late-binding i18n (Decision B part 1) but did NOT add the preference/quiet-hours gating that the dispatcher+router path enforces for free.
  Spec invariant violation is real and user-visible:
  - User sets quiet hours 22:00–07:00 — auth failures during the night still create in-app rows
  - User disables `auth_failure` in per-type — still gets notifications
  - User disables in-app globally — still gets in-app rows
- **Reproduction / rationale:** Inspect `degradation.handleAuthFailure` and `webhook.channel.notifyDeliveryFailed`: neither imports `shouldNotify` nor calls it. Contrast with `ChannelRouter.route` in `channel-router.ts:59-64` which gates every channel.
- **Suggested fix direction:** Short-term (minimum viable): extract a shared helper `createDirectNotification(draft, userId)` that calls `shouldNotify(prefs, draft.type, "inApp")` + quiet-hours check + writes the Prisma row. The 5 legacy sites call this helper instead of `prisma.notification.create` directly. This is a ~30-line helper that closes all 5 violations at once. Long-term (deferred per ADR-030): refactor these 5 sites to emit domain events (`ModuleAuthFailed`, `ModuleCircuitBroken`, `WebhookDeliveryFailed`, etc.) and subscribe the dispatcher, which already does all the gating. The enforcement script `scripts/check-notification-writers.sh` (which only greps for `prisma.notification.create*`) should be extended to also fail if an allowed file lacks a `shouldNotify` call — prevents regression.

### H-A-05 — `CompanyBlacklist` aggregate writes to `StagedVacancy` aggregate without a domain-event seam
- **File:** `/home/pascal/projekte/jobsync/src/actions/companyBlacklist.actions.ts:104-124`
- **Severity:** HIGH
- **Rule:** DDD aggregate-boundary invariant (CLAUDE.md "Aggregate Boundaries" section) / domain event seam
- **Finding:** `addBlacklistEntry()` wraps the blacklist insert and a `stagedVacancy.updateMany({ trashedAt: new Date() })` in a single transaction. This is a **cross-aggregate mutation** — the blacklist aggregate directly updates rows in the staged-vacancy aggregate without going through the vacancy pipeline's owned mutators (`trashStagedVacancy`) and without emitting any domain events. Comparing to `trashStagedVacancy()` (stagedVacancy.actions.ts:244-279), the proper aggregate mutator emits `VacancyTrashed` per row; the bulk `updateMany` bypasses this completely. Any consumer that subscribes to `VacancyTrashed` (retention stats, enrichment cache eviction, audit logger, future CRM-side signals) will silently miss blacklist-triggered trashes.
  Additionally, this is a new Sprint-2 behavior (70b9f44 "retroactively trash matching staged vacancies on block"); it was added without an ADR and without a domain event design. The fact that the user-facing toast says "{count} filtered" is proof the aggregate boundary is being crossed without a matching event.
- **Reproduction / rationale:** User adds a blacklist entry matching 50 staged vacancies → `audit-logger` (subscribed to `WILDCARD`) sees only `BlacklistAdded` (if even that — blacklist doesn't emit events either), not `VacancyTrashed x50`. Future retention cleanup statistics, "how many vacancies has the blacklist filtered?" dashboards, and any CRM event stream will be wrong.
- **Suggested fix direction:** Two options:
  1. **Event-driven (preferred, spec-aligned):** Emit `BlacklistEntryAdded(pattern, matchType, userId)` from the blacklist action. Add a new consumer `blacklist-trigger.ts` in `src/lib/events/consumers/` that subscribes to `BlacklistEntryAdded` and calls `trashStagedVacancy` per matched id (respecting the per-row aggregate mutator). Keeps aggregates isolated and produces a `VacancyTrashed` event for every row.
  2. **Bulk event, single-writer exception:** Keep the bulk `updateMany` but emit one `VacanciesBulkTrashed(ids, reason, userId)` event after commit. Document this in ADR-030 as a permitted cross-aggregate write. The spec would need a new invariant.
  Option 1 is more aligned with the existing DDD patterns (every other vacancy state transition goes through `trashStagedVacancy`/`restoreStagedVacancy`/etc.). Option 2 is faster but requires an ADR.

## MEDIUM findings

### M-A-01 — `formatNotificationActor` doesn't handle `actorType: "module"` or `"enrichment"`
- **File:** `/home/pascal/projekte/jobsync/src/lib/notifications/deep-links.ts:389-400`
- **Severity:** MEDIUM
- **Rule:** Discriminated union completeness / ubiquitous-language coverage
- **Finding:** `NotificationActorType = "system" | "module" | "automation" | "user" | "enrichment"` (notification.model.ts:23-28), but the switch in `formatNotificationActor` only cases `system`, `automation`, `user`. When `actorType === "module"` (every module lifecycle notification — `module_deactivated`, `auth_failure`, `cb_escalation`), the function falls through the `actorId` branch: if `actorId` is set (which it is in `degradation.ts` and `notification-dispatcher.handleModuleDeactivated`) the raw module slug (`"logo_dev"`, `"eures"`) is displayed as the actor name. No i18n lookup. `actorType === "enrichment"` doesn't exist in the enum definition but is allowed by the type — unused today but future enrichment notifications would also fall through.
- **Suggested fix direction:** Add `case "module": return moduleId ? resolveModuleDisplayName(moduleId, t) : t("notifications.actor.module");` and an equivalent for `enrichment`. Add `notifications.actor.module` and `notifications.actor.enrichment` keys to all 4 locales. The module display-name resolver can consult `moduleRegistry.get(moduleId)?.manifest.name` with a fallback to the slug — this closes the loop with M-A-02.

### M-A-02 — `ModuleDeactivatedPayload` carries only `moduleId` (slug), not `moduleName` (display name)
- **File:** `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts:298-332` + `/home/pascal/projekte/jobsync/src/lib/events/event-types.ts` (ModuleDeactivatedPayload definition)
- **Severity:** MEDIUM
- **Rule:** Event payload completeness ("Event payloads contain enough context for consumers") / ubiquitous language
- **Finding:** `handleModuleDeactivated` builds `titleParams = { moduleName: payload.moduleId }` — assigning the raw slug to a field literally named `moduleName`. The i18n template is `"Module paused: {moduleName}"`. Users on the receiving end see `"Module paused: logo_dev"` instead of `"Module paused: Logo.dev"`. The publisher (`deactivateModule()`) knows the manifest name (`registered.manifest.name`) but doesn't put it on the payload; the consumer has no clean way to look it up (the registry is in-memory and may be stale in a multi-process future).
  The degradation.ts handlers do use `registered.manifest.name` for their own English `message` fallback AND truncate it to `NAME_TRUNCATION_LENGTH`, but still don't set `titleParams.moduleName` — so the top-level column has no display name at all. Consistent bug across all module-notification writers.
- **Suggested fix direction:** Extend `ModuleDeactivatedPayload` with `moduleName: string`. Same for `ModuleReactivatedPayload`. Populate from `registered.manifest.name` at emit sites. Rule: event payloads should carry "all context needed to render a notification without a round-trip". The alternative (handler-side `moduleRegistry.get(moduleId)?.manifest.name`) works in-process but fails the test of "consumer shouldn't require implicit shared state". Related: M-A-01 fix would then use `titleParams.moduleName` as the actor display name.

### M-A-03 — `getUserLocale` reads `parsed.locale` but writers save to `parsed.display.locale`
- **File:** `/home/pascal/projekte/jobsync/src/lib/locale.ts:25` vs `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts:98` (correct) vs `/home/pascal/projekte/jobsync/src/actions/userSettings.actions.ts:142-154` (writer)
- **Severity:** MEDIUM
- **Rule:** Specification alignment / silent fallback pattern (stream-H Pattern 7)
- **Finding:** `UserSettingsData.display.locale` is the only path the settings UI ever writes (via `updateDisplaySettings`). The notification-dispatcher correctly reads `parsed.display?.locale`. But `getUserLocale()` in `src/lib/locale.ts:25` reads `parsed.locale` (top-level) which **never exists** in the written JSON. The function then silently falls back to the cookie (line 38-42), which happens to work because `updateDisplaySettings` also sets the `NEXT_LOCALE` cookie. So the stated priority "User DB settings → Cookie → Default" is a lie — the DB branch is dead code, and the whole function is effectively `return cookie ?? DEFAULT`.
  Sprint 2 touched this file (added debug logging per stream-H pattern 7 "silent fallback") but did NOT fix the path. The honesty-gate sprint's stated goal was "catch silent fallbacks"; this is the biggest one in the touched area.
- **Suggested fix direction:** Change line 25 to `if (parsed.display?.locale && isValidLocale(parsed.display.locale)) return parsed.display.locale;`. Consolidate: `notification-dispatcher.ts` and `locale.ts` should share the same locale-resolution helper. Consider extracting `resolveUserSettingsLocale(userId)` in a `src/lib/locale-resolver.ts` that both import (webhook.channel.ts already imports `resolveUserLocale` from such a helper — unify them).

### M-A-04 — `StagingContainer.handleDeckAction` fires `reload()` mid-animation, mutating deck state under the hook
- **File:** `/home/pascal/projekte/jobsync/src/components/staging/StagingContainer.tsx:282,616` + `/home/pascal/projekte/jobsync/src/hooks/useDeckStack.ts:106-109`
- **Severity:** MEDIUM
- **Rule:** Hook state machine invariant (vacancies array is stable across actions)
- **Finding:** `useDeckStack` computes `currentVacancy = vacancies[currentIndex]` on every render. The hook implicitly relies on the `vacancies` prop being stable across the lifetime of the deck session — otherwise `currentIndex` (which the hook owns) can point at an entirely different vacancy after a reload. But `StagingContainer.handleDeckAction` calls `reload()` on three paths:
  1. Auto-approve success (line 282)
  2. Block confirmation success — via `handleBlockCompany` → `reload()` (line 223)
  3. PromotionDialog success (line 616)
  `reload()` sets `setVacancies(data)` to a fresh paginated slice from the server, which may have a completely different ordering and length (blacklist trashes from earlier runs, new vacancies from scheduled automations, retention pruning, etc.). Mid-animation, `currentIndex` may now reference a ghost card or a card that wasn't supposed to be next.
  The auto-approve path at line 282 specifically calls `reload()` and then returns `{ success: true, createdJobId }` to the hook, which then increments `currentIndex + 1`. If reload completes before the 300ms animation delay, the next card rendering is a racey mess.
- **Reproduction / rationale:** Set auto-approve ON, spam-click Promote. The deck will occasionally skip cards or show wrong previews because of the race. Not always reproducible but always present.
- **Suggested fix direction:** Either (a) stop calling `reload()` during deck mode — keep the deck's `vacancies` slice frozen for the session, use a "new items available" banner when the user pauses; or (b) make `useDeckStack` index-by-id (track `processedIds: Set<string>`) so the currentIndex pointer is derived from the current vacancy's id, not its positional index. Option (b) is more invasive but more correct. Option (a) matches the existing `StagingNewItemsBanner` pattern (already imported). Minimum viable: debounce `reload()` to fire only when the deck session completes (`isSessionComplete === true`).

### M-A-05 — `channelRouter` singleton registration races: channels are registered as a side effect of `notification-dispatcher.ts` module import, not as part of `registerEventConsumers()`
- **File:** `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts:60-66`
- **Severity:** MEDIUM
- **Rule:** Module initialization ordering / single-source-of-truth bootstrap
- **Finding:** Four `channelRouter.register(new XChannel())` calls run at module-load time, outside any function. The `channelRouter` is a `globalThis` singleton so double-registration is guarded by an internal duplicate check (channel-router.ts:42-45 — warns and skips). But the side-effect pattern means:
  - Any code that imports `notification-dispatcher.ts` indirectly (for `_testHelpers`, for types, for `registerNotificationDispatcher`) incurs the channel-registration side effect at import time, even in test environments where tests want to mock/substitute channels.
  - Registration ordering depends on module import order, which is subtle when using `instrumentation.ts` + tests + HMR.
  - Tests that `jest.mock('@/lib/notifications/channels/webhook.channel', ...)` still see the real channel registered because the mock binds a different module instance.
  This is the same class of issue as "module singletons with side effects" that the codebase already treats carefully elsewhere (`RunCoordinator`, `EventBus`, `ConnectorCache` all use `globalThis` guards for HMR survival — which confirms the anti-pattern is already acknowledged).
- **Suggested fix direction:** Move the 4 `register` calls into `registerNotificationDispatcher()` (dispatcher.ts:450). The dispatcher registration is already idempotent via `g.__eventConsumersRegistered` in `consumers/index.ts:17-19`. This changes channel registration from "on first import" to "on application boot" — tests can then inject mock channels before calling `registerNotificationDispatcher`.

### M-A-06 — `enrichment-trigger.handleCompanyCreated` does `await findFirst` before the fire-and-forget — blocks EventBus publish
- **File:** `/home/pascal/projekte/jobsync/src/lib/events/consumers/enrichment-trigger.ts:82-89,160-165,207-211`
- **Severity:** MEDIUM
- **Rule:** Consumer non-blocking invariant / domain-event dispatch latency
- **Finding:** The EventBus' `publish()` iterates handlers with `await handler(event)` (event-bus.ts:30-36). This makes each handler potentially blocking. `handleCompanyCreated` — even though it describes itself as "fire-and-forget enrichment" — performs:
  ```typescript
  const existing = await db.enrichmentResult.findFirst({ ... });  // BLOCKS
  if (existing && ...) return;
  withEnrichmentLimit(() => enrichmentOrchestrator.execute(...))  // fire-and-forget
    .catch(...);
  ```
  Every publisher of `CompanyCreated` (job creation, vacancy promotion, bulk actions) now waits for a DB query before the event bus can move to the next handler. With 4 consumers registered (`audit-logger`, `notification-dispatcher`, `degradation-coordinator`, `enrichment-trigger`, `logo-asset-subscriber`), each blocking consumer adds sequential latency. A proper fire-and-forget would move the `findFirst` inside the `withEnrichmentLimit` closure, so the handler returns immediately and the orchestrator's internal cache-check handles the dedup.
  This wasn't introduced in Sprint 2 but the handler was significantly expanded (+207 lines — Sprint 1 enrichment-trigger refactor) and the pattern leaked into the two new handlers (`handleVacancyPromoted` also has two `await findFirst` calls before fire-and-forget).
- **Suggested fix direction:** Wrap the entire DB-check-then-execute sequence in the fire-and-forget:
  ```typescript
  void withEnrichmentLimit(async () => {
    const existing = await db.enrichmentResult.findFirst(...);
    if (existing && existing.status === "found" && existing.expiresAt > new Date()) return;
    await enrichmentOrchestrator.execute(...);
  }).catch(() => {});
  ```
  This matches the semantic "best-effort, non-blocking" stated in the module docstring.

## LOW findings

### L-A-01 — `checkLogoUrl` is exported from a `"use server"` file but returns a raw object instead of `ActionResult<T>`
- **File:** `/home/pascal/projekte/jobsync/src/actions/logoCheck.actions.ts:78-136`
- **Severity:** LOW
- **Rule:** Pattern consistency (`specs/action-result.allium` — Pattern A vs Pattern B)
- **Finding:** The return type is `Promise<{ isImage: boolean; contentType: string | null; resolvedUrl?: string }>` — raw, no `ActionResult<T>` envelope. Also, `if (!user)` returns `{ isImage: false, contentType: null }` which conflates "not authenticated" with "not an image". Callers can't distinguish. Per CLAUDE.md, server actions should follow Pattern A (`ActionResult<T>`) or Pattern B (raw return for queries) consistently — this is a query and raw return is permissible, but the auth failure should surface as an error marker.
- **Suggested fix direction:** Either lift to `Promise<ActionResult<{ isImage: boolean; contentType: string | null; resolvedUrl?: string }>>` or extend the raw shape with an `{ error?: "unauthenticated" | "rate_limited" | "ssrf" }` discriminator so callers can show the right error UI.

### L-A-02 — `deep-links.ts:formatNotificationTitle` uses loose `t: (key: string) => string` instead of the typed `useTranslations` signature
- **File:** `/home/pascal/projekte/jobsync/src/lib/notifications/deep-links.ts:322-337`
- **Severity:** LOW
- **Rule:** Published-language typing
- **Finding:** The formatter accepts `t: (key: string) => string` so tests can pass a mock, but this erases the typed dictionary-key constraint of the real `t` function. If a handler passes an invalid `titleKey` to the formatter, the loose `t` happily returns the key itself (or a fallback), hiding the error. Comment-only fix — the file says "loosely typed so this helper can be called from tests without the full i18n runtime" which is the acknowledged tradeoff.
- **Suggested fix direction:** Leave as-is; the tradeoff is documented and reasonable. Alternative: export a typed wrapper `formatNotificationTitleStrict(source, fallback, translations)` that callers in production code use, and keep the loose form for tests.

### L-A-03 — `webhook.channel.ts` notify helpers use `titleKey` values that don't follow the `.title` convention
- **File:** `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts:180,224`
- **Severity:** LOW
- **Rule:** Ubiquitous language consistency
- **Finding:** Every other notification uses a `<namespace>.<event>.title` key (e.g., `notifications.moduleDeactivated.title`, `notifications.authFailure.title`). The webhook channel uses `webhook.deliveryFailed` and `webhook.endpointDeactivated` — these are the same keys as the full-sentence templates used for the `message` fallback. Consequence: the title rendered by `formatNotificationTitle` is a full sentence, not a short title, violating the "title is short, reason is long" UX convention. Also blurs the 5W+H "WHAT" (title) vs "WHY" (reason) separation.
- **Suggested fix direction:** Add `webhook.deliveryFailed.title` = "Webhook delivery failed" (short) and keep `webhook.deliveryFailed` for the sentence. Update both notify helpers to set `titleKey = "webhook.deliveryFailed.title"` and optionally `reasonKey = "webhook.deliveryFailed"` (or a dedicated `webhook.deliveryFailed.reason`). Same for `endpointDeactivated`.

### L-A-04 — `handleDeckAction` lists `handleBlockCompany` in `useCallback` deps but never calls it directly in the body
- **File:** `/home/pascal/projekte/jobsync/src/components/staging/StagingContainer.tsx:252-328`
- **Severity:** LOW
- **Rule:** React exhaustive-deps hygiene
- **Finding:** The deps array `[t, reload, handleBlockCompany]` at line 327 includes `handleBlockCompany`, but the callback body only references it transitively — the block path sets `blockConfirmVacancy` and resolves the ref; the actual `handleBlockCompany` call lives in the dialog's `onConfirm` prop, which is a sibling render, not the callback body. Including it in deps causes unnecessary re-memoization of `handleDeckAction` every time `handleBlockCompany` changes (which is every render because `handleBlockCompany` is defined as a `useCallback` with `[t, reload]` deps, same as `handleDeckAction`). The chain causes `handleDeckAction` identity to flip every render, which flips `useDeckStack.performAction` identity, which flips the keyboard listener's useEffect deps — cascade re-subscribe on every parent render.
- **Suggested fix direction:** Remove `handleBlockCompany` from the deps array (it's not actually a dep — it's only invoked by the dialog, not inside `handleDeckAction`'s body). Or move the block confirmation dialog's `onConfirm` to a separate `useCallback` that owns its own deps.

## Out-of-scope notes

- **Notification Deduplication rule not enforced:** `specs/notification-dispatch.allium` rule `Deduplication` and invariant `NoDuplicateWithinWindow` mandate "no duplicate notifications of same type+moduleId within 5 minutes", but no implementation exists in `notification-dispatcher.ts` or `channel-router.ts`. Pre-existing (not introduced in Sprint 2) — mark spec invariant as aspirational OR implement.
- **`actorType: "enrichment"` is in the type definition but unused:** Dead enum variant. Either remove from the type or populate from enrichment consumers.
- **Stream-H Pattern 2/3 duplicate-writer findings:** already tracked in ADR-030; my H-A-04 extends those with the `shouldNotify` bypass aspect that the stream-H analysis did not flag. Consider folding this into ADR-030 as Decision B addendum.
- **`useDeckStack` vacancies-prop-stable assumption:** M-A-04 is a latent class-of-bug whose blast radius Sprint 2 expanded. A full fix crosses into Sprint 3 scope.
- **`handleCompanyCreated` blocking DB query before fire-and-forget:** same pattern in `handleVacancyPromoted` (2 more await sites). Fixing M-A-06 should fix both handlers in one pass.
- **Dictionary keys `notifications.actor.module` and `notifications.actor.enrichment` do not exist:** required for M-A-01 fix; i18n sprint may need to add keys to all 4 locales.
- **`scripts/check-notification-writers.sh` regression guard:** correctly enumerates the 5 legacy exceptions; recommend extending it to ALSO assert `shouldNotify` calls inside each allowed file (closes H-A-04 regression window).
- **Pre-existing `ModuleActivation` spec ambiguity:** the spec says automations are NOT auto-restarted on reactivation — so the `handleModuleReactivated` notification is largely informational. Confirm with spec owner whether the dead publisher is an omission or an intentional deprecation; if deprecation, remove the consumer. Otherwise fix per H-A-01.

---

**Review stance:** Architecture review produced 15 findings (5 HIGH, 6 MEDIUM, 4 LOW). The most valuable are H-A-01 (direct parallel of CRIT-A2 that Sprint 1 missed — symmetric blind spot on module activation) and H-A-02 (undo theatre — Sprint 2 expanded the blast radius of a contract-drift bug by adding new deck entry points without tightening the undo contract). Both are class-of-bug findings consistent with "flashlight effect" drift.
