# Sprint 2 Team Review — Performance Dimension

## Summary
- **Commit range:** `a92aaf3..dc48f4b` (HEAD) — 129 files, ~14k lines.
- **Files reviewed (performance-relevant subset):** ~38 of 129
  - `src/actions/{companyBlacklist,enrichment,logoCheck,module,notification}.actions.ts`
  - `src/actions/stagedVacancy.actions.ts` (read-only; not touched this sprint but exercised by new UI)
  - `src/lib/connector/data-enrichment/{orchestrator,cache,types}.ts`
  - `src/lib/connector/degradation.ts`
  - `src/lib/events/consumers/{enrichment-trigger,notification-dispatcher}.ts`
  - `src/lib/events/event-bus.ts`
  - `src/lib/notifications/{channel-router,channels/in-app.channel,channels/webhook.channel,channels/email.channel,channels/push.channel,deep-links}.ts`
  - `src/lib/locale-resolver.ts`
  - `src/lib/assets/logo-asset-subscriber.ts`
  - `src/components/staging/{StagingContainer,DeckView,DeckCard,MatchScoreRing,SuperLikeCelebration,SuperLikeCelebrationHost,StagedVacancyCard,StagedVacancyDetailSheet,StagedVacancyDetailContent,PromotionDialog,StagingNewItemsBanner}.tsx`
  - `src/components/layout/{NotificationBell,NotificationDropdown,NotificationItem}.tsx`
  - `src/hooks/{useDeckStack,useStagingActions,useStagingLayout,use-media-query,useSuperLikeCelebrations}.ts`
  - `src/components/ui/company-logo.tsx`
  - `prisma/schema.prisma` (delta: `add_notification_structured_fields`)
  - `jest.config.ts`, `scripts/test.sh`, `jest.polyfills.ts`
- **HIGH findings:** 3
- **MEDIUM findings:** 6
- **LOW findings:** 5
- **Verified CRIT fixes (perf-adjacent):**
  - `jest.config.ts` now hard-pins `maxWorkers: 1` (CRIT-worker). `scripts/test.sh` translates `--workers=N` → `--maxWorkers=N` so the flag is no longer silently ignored. Confirmed the config is the authoritative floor for raw `npx jest` invocations.
  - `EnrichmentOrchestrator.buildEnrichmentCacheKey` now includes `userId` (CRIT cross-user cache leak / ADR-029). In-memory `ConnectorCache` keys are correctly scoped per user.
  - `EnrichmentOrchestrator.logAttempt` is fire-and-forget (`.catch(() => {})`, not awaited) — the previous `await`-per-attempt pattern was replaced, removing per-chain-step latency spikes.
  - `ConnectorCache` has LRU eviction with re-insertion-on-access, periodic prune (15 min, `.unref()`'d), and request coalescing via `inflight` Map. No invariants broken by Sprint 2.
  - `enrichment-trigger.ts` runs event-bus fire-and-forget enrichment under a `MAX_CONCURRENT_ENRICHMENTS=5` in-memory semaphore; queue drain is correctly wired in `finally`.
  - `handleCompanyCreated` / `handleVacancyPromoted` check for an unexpired `enrichmentResult` before invoking the chain (cache-before-chain), so repeated events don't re-fire external HTTP calls.
  - `degradation.handleAuthFailure` and `handleCircuitBreakerTrip` correctly use `prisma.notification.createMany` (batch insert, no N+1) for the dual-write of 5W+H columns + legacy `data` blob.

---

## HIGH findings

### H-P-01 — `notification-dispatcher` issues 2 identical `userSettings.findUnique` calls per event (double read)
- **File:** `src/lib/events/consumers/notification-dispatcher.ts:107-115, 125-134, 205, 262, 299, 340, 378, 412`
- **Severity:** HIGH
- **Rule:** Redundant database query / missing memoization of resolved user settings
- **Finding:** Every event handler calls `resolveLocale(payload.userId)` to build the legacy `message` fallback, then `dispatchNotification(draft)` internally calls `resolveUserSettings(draft.userId)` to resolve preferences for the channel router. Both helpers hit the same `prisma.userSettings.findUnique({ where: { userId } })` row. Seven handlers (`handleVacancyPromoted`, `handleBulkActionCompleted`, `handleModuleDeactivated`, `handleModuleReactivated`, `handleRetentionCompleted`, `handleJobStatusChanged`, `flushStagedBuffer`) are all affected — so every notification event costs **2 DB reads for the same row**.

  ```ts
  // handleVacancyPromoted (line 201-229):
  const locale = await resolveLocale(payload.userId);                  // query #1
  // ...
  await dispatchNotification({ ... });                                  // query #2 inside
  //   → async function dispatchNotification(draft) {
  //       const { preferences } = await resolveUserSettings(draft.userId);  // same row again
  //       channelRouter.route(draft, preferences).catch(...)
  //     }
  ```

  The `resolveUserSettings` helper already returns `{ preferences, locale }` in a single call — the duplicate is purely an integration oversight.
- **Reproduction / rationale:** A burst of 50 VacancyStaged events (one automation run) produces 1 batch notification (fine — one query each), but bulk actions, module deactivation, job status changes, and retention completion events scale linearly. With a few hundred events per day per user on a heavily-automated account, this is hundreds of redundant `userSettings` reads on top of the notification writes themselves. More importantly, the event bus serializes consumers (`for … await`), so every duplicate query lengthens the window during which the event bus cannot drain.
- **Suggested fix direction:** Resolve `{ preferences, locale }` once at the top of each handler and thread both into both the message builder AND `dispatchNotification`. Change the `dispatchNotification` signature to accept an optional `preferences` argument:

  ```ts
  async function dispatchNotification(
    draft: NotificationDraft,
    preferences?: NotificationPreferences,
  ): Promise<void> {
    const prefs = preferences ?? (await resolveUserSettings(draft.userId)).preferences;
    channelRouter.route(draft, prefs).catch(...)
  }

  async function handleVacancyPromoted(event) {
    const { preferences, locale } = await resolveUserSettings(payload.userId);
    const message = t(locale, "notifications.vacancyPromoted");
    await dispatchNotification({ userId: payload.userId, ..., }, preferences);
  }
  ```

  Same transformation for the other six handlers. Cuts per-event DB load in half and keeps the channel router untouched.

### H-P-02 — `CompanyBlacklist.addBlacklistEntry` retroactive-trash query scans `StagedVacancy.employerName` without an index
- **File:** `src/actions/companyBlacklist.actions.ts:102-123`, `prisma/schema.prisma:490-561`
- **Severity:** HIGH
- **Rule:** Missing index on column used in `updateMany` WHERE clause
- **Finding:** The new blacklist retroactive-trash feature (commit `70b9f44`) runs an `updateMany` that filters by `employerName` with one of `equals` / `startsWith` / `endsWith` / `contains`:

  ```ts
  prisma.stagedVacancy.updateMany({
    where: {
      userId: user.id,
      employerName: employerFilter,     // { equals | startsWith | endsWith | contains: pattern }
      trashedAt: null,
      archivedAt: null,
      promotedToJobId: null,
    },
    data: { trashedAt: new Date() },
  }),
  ```

  But `StagedVacancy` has **no index on `employerName`** (see schema.prisma, lines 556-560 — the only indexes are `[userId, sourceBoard, externalId]`, `[userId, status]`, `[userId, automationId]`, `[userId, createdAt]`, `[trashedAt]`). Prisma will use the `[userId, ...]` index as a seek prefix, but SQLite then has to scan every row in the user's partition, deserialize it, and LIKE-match `employerName`.
- **Reproduction / rationale:** A user with 10k staged vacancies who blocks a common employer name pays for a 10k-row sequential scan inside a transaction with `companyBlacklist.create`. The transaction holds a write lock on both tables while the scan runs. On SQLite this serializes all other writes to `StagedVacancy` (dismiss/promote/archive from the staging UI) for the duration. The `contains` match (the default `matchType`) can never use an index at all, so this cost is unavoidable without an index.
- **Suggested fix direction:** Two options:
  1. **Add a composite index** `@@index([userId, employerName])` on `StagedVacancy`. Satisfies `equals` and `startsWith` (the two matchTypes that are index-compatible). `contains`/`endsWith` still scan, but the scan is over the `(userId, employerName)` b-tree leaves rather than random heap pages — a big win for any user with >5k rows.
  2. **Move the retroactive trash OUT of the transaction** with the blacklist `create`. Create the blacklist row first (tiny), then in a separate statement run the `updateMany`. Losing atomicity is acceptable here because the `addBlacklistEntry` semantics are idempotent — the worst case is that new vacancies matching the pattern still get trashed by the Runner's pre-dedup filter even if the retroactive sweep fails.

  Prefer option 1 + documenting in the companyBlacklist action that `contains` is the slow path. Option 2 alone doesn't fix the scan cost — it just moves it out of the lock window.

### H-P-03 — `scripts/test.sh` default no longer disables coverage; `jest.config.ts` hard-pins `collectCoverage: true`
- **File:** `jest.config.ts:37`, `scripts/test.sh:24-56`
- **Severity:** HIGH
- **Rule:** Default test-run cost amplified by always-on v8 coverage + single worker
- **Finding:** `jest.config.ts` sets `collectCoverage: true` at line 37 and `coverageProvider: "v8"` at line 54. `maxWorkers: 1` is now enforced (the good fix from `dc48f4b`). The combination means **every `npx jest …` invocation runs with v8 coverage on a single worker**, even for targeted single-file runs during development. v8 coverage is typically 3-5× slower than istanbul and doesn't benefit from worker parallelism (which is already pinned to 1).

  The project's workaround is documented in `CLAUDE.md`: "Run `bash scripts/test.sh --no-coverage` before every commit". But `scripts/test.sh` does NOT imply `--no-coverage` by default — it just forwards all arguments unchanged. The CLAUDE.md instruction implies every developer explicitly types `--no-coverage` every time; a forgotten flag silently re-enables the slow path.
- **Reproduction / rationale:** An agent running `bash scripts/test.sh __tests__/DeckView.spec.tsx` (no coverage flag) re-runs the full coverage collector for that single file. On the 8GB VM with `maxWorkers=1`, this turns a ~3-second run into a 20-30 second run. Multiply by dozens of test iterations during a sprint and it adds up to significant wall-clock cost.
- **Suggested fix direction:** Pick one of:
  1. Flip `collectCoverage` to `false` in `jest.config.ts` and require an explicit `--coverage` flag (or a separate `test:coverage` npm script) for full coverage runs.
  2. Teach `scripts/test.sh` to default to `--no-coverage` unless the caller passes `--coverage`. Documented in the shebang comment and print a banner when coverage is off.

  Option 2 is lower-risk (keeps the `collectCoverage: true` default for raw `npx jest` in CI) but option 1 is cleaner. Either fully eliminates the "forgot the flag" foot-gun. The jest worker fix in `dc48f4b` addresses process count, not instrumentation cost — this finding is the natural companion.

---

## MEDIUM findings

### M-P-01 — `ChannelRouter.route` issues a DB query per enabled channel on every dispatch via `isAvailable`
- **File:** `src/lib/notifications/channel-router.ts:66-73`, `src/lib/notifications/channels/{webhook,email,push}.channel.ts` (each `isAvailable` method)
- **Severity:** MEDIUM
- **Rule:** Per-dispatch I/O that can be cached or short-circuited by preferences
- **Finding:** After the preference gate (which filters channels where `prefs.channels[channelId]` is `false`), the router calls `await channel.isAvailable(draft.userId)` for every surviving channel. Each implementation runs a separate Prisma query:

  - `WebhookChannel.isAvailable` → `prisma.webhookEndpoint.count({ where: { userId, active: true } })`
  - `EmailChannel.isAvailable` → `prisma.smtpConfig.count({ where: { userId, active: true } })`
  - `PushChannel.isAvailable` → `Promise.all([vapidConfig.findUnique, webPushSubscription.count])` (2 queries)
  - `InAppChannel.isAvailable` → returns `true` (no I/O — good)

  So a user who has enabled webhook + email + push but has no actual endpoints configured still pays **4 DB queries per notification** just to discover nothing is configured. Combined with H-P-01 (2 userSettings reads), a single notification can hit the DB 6 times on the dispatch path before the InApp write.
- **Reproduction / rationale:** A user who just enabled all channels in settings but hasn't actually created any webhook / SMTP / push subscription pays this cost forever. Event-storm scenarios (bulk actions over 500 items, retention sweep) multiply it by the event count.
- **Suggested fix direction:** The availability checks are almost never transient — once a user has configured a webhook endpoint, they have it until they delete it. Cache `isAvailable(userId)` in `globalThis` with a short TTL (30-60s), or make the check opt-in via a registry: `channelRouter.register(channel, { availabilityTtlMs: 30_000 })`. The `webhookEndpoint.count`/`smtpConfig.count`/`vapidConfig.findUnique` queries are all indexed, but the round-trip itself is the cost. Another option: rely on the channel's `dispatch` returning `{ success: true }` when nothing is configured (webhook already does this at line 278-280; the other channels should mirror the pattern) and just drop the `isAvailable` phase entirely — it would save a full DB round-trip per channel per dispatch.

### M-P-02 — `getStagedVacancies` uses `include` (implicit full `select`) and pulls every scalar + JSON array per row
- **File:** `src/actions/stagedVacancy.actions.ts:81-90`
- **Severity:** MEDIUM
- **Rule:** Over-fetching — missing explicit `select` prunes
- **Finding:** `getStagedVacancies` was NOT touched this sprint, but the new staging UI pulls the full row and threads it through `StagedVacancyDetailContent` (which DOES need most fields) AND through list cards (`StagedVacancyCard` — which needs a minority of fields) AND through deck cards (`DeckCard` — which needs an even smaller subset but uses the extended meta). Since one `getStagedVacancies` response feeds all three rendering paths, there's no single "right" select. But the row payload includes `description` (potentially several KB), `applicationInstructions`, `companyDescription`, `matchData` (the raw JSON match response, often 5-50KB), plus three JSON arrays (`occupationUris`, `industryCodes`, `workingLanguages`). At `limit=20`, a single page can easily top 500KB over the wire.

  The new `StagedVacancyDetailSheet` does NOT re-fetch individual rows — it takes the vacancy object from the list. So the list query is paying for the worst-case detail-sheet use even when the user never opens the sheet.
- **Reproduction / rationale:** The serialization cost of a 500KB Server Action response is non-trivial in Next.js server actions — it's JSON-stringified on the server and shipped down as a POST response. A user paginating through several tabs (new / dismissed / archive) on a busy account re-downloads the full payload each time. The `matchData` field in particular is pure ballast for list rendering.
- **Suggested fix direction:** Introduce a `STAGED_VACANCY_LIST_SELECT` shape (similar to the pattern in `src/lib/api/helpers.ts` `JOB_LIST_SELECT`) that omits `matchData`, `applicationInstructions`, and `companyDescription`. Keep `description` but set a `substring`-style server-side truncation. Rehydrate the full row on-demand from the detail sheet via a new `getStagedVacancyById` call (the action already exists at line 105-123) when the user opens it. This is out-of-scope for the sprint's bug fixes but worth a follow-up ticket.

### M-P-03 — `useStagingActions.createHandler` returns a fresh closure every call; `StagedVacancyCard` is not memoized
- **File:** `src/hooks/useStagingActions.ts:16-36`, `src/components/staging/StagingContainer.tsx:189-194, 511-527`, `src/components/staging/StagedVacancyCard.tsx`
- **Severity:** MEDIUM
- **Rule:** Unnecessary re-renders in list containers
- **Finding:** `useStagingActions` returns `createHandler`, and `StagingContainer` calls `createHandler(...)` five times inline in the component body:

  ```tsx
  const { createHandler } = useStagingActions(reload);
  const handleDismiss = createHandler(dismissStagedVacancy, "staging.dismissed");
  const handleRestore = createHandler(restoreStagedVacancy, "staging.restored");
  const handleArchive = createHandler(archiveStagedVacancy, "staging.archived");
  const handleTrash = createHandler(trashStagedVacancy, "staging.trashed");
  const handleRestoreFromTrash = createHandler(restoreFromTrash, "staging.restoredFromTrash");
  ```

  Each call returns a fresh `async (id) => { … }` closure on every render. Those closures are passed as props to every `StagedVacancyCard` in the mapped list (lines 511-527). `StagedVacancyCard` is NOT wrapped in `React.memo`, so the list re-renders every card whenever **any** `StagingContainer` state mutates — `selectedIds`, `detailsOpen`, `detailsVacancy`, `promotionOpen`, `blockConfirmOpen`, `searchTerm` (during typing), `mounted`, etc.

  `DeckCard` IS memoized (`memo(DeckCardInner)` at line 249) but `StagedVacancyCard` is not. The list card receives 10+ props including 8 function props — cascading re-renders ripple through the whole list on every state change.
- **Reproduction / rationale:** At `recordsPerPage=20`, each keystroke in the search box triggers 20 card re-renders. At `recordsPerPage=100` (max), 100 card re-renders per keystroke. With the details sheet open, every pointer event that bubbles through the container causes another round. Not catastrophic for 20 items, but measurable for 100, and the fix is trivial.
- **Suggested fix direction:**
  1. Wrap `StagedVacancyCard` in `React.memo` with a shallow-prop comparator (or the default — its props are all primitive + stable callbacks once fixed).
  2. Wrap the handlers in `useCallback` at the container level OR restructure `useStagingActions` to pre-build the five handlers inside the hook (each under its own `useCallback`) so their identities are stable across renders.

  Either of the two is sufficient; both together are ideal. Same fix pattern as `DeckCard` already uses.

### M-P-04 — `PromotionDialog` / `BlockConfirmationDialog` render inside `StagingContainer` unconditionally (always mounted)
- **File:** `src/components/staging/StagingContainer.tsx:587-643`
- **Severity:** MEDIUM
- **Rule:** Mounted-but-hidden overhead for dialogs
- **Finding:** `PromotionDialog`, `BlockConfirmationDialog`, and `StagedVacancyDetailSheet` are always in the JSX tree — their Radix primitives manage the open state internally. While Radix DOES skip rendering the portal content when `open={false}`, the component function bodies still run, the `t()` translator resolves, and any `useState` inside re-initializes. `PromotionDialog` holds four input states (`titleOverride`, `companyOverride`, `locationOverride`, `submitting`) that reset via `resetForm()` on open — fine. Not a hot-path issue, but the dialog components re-render with the parent.
- **Reproduction / rationale:** Minor. Included for completeness because the DeckView was refactored to mount the celebration host as a sibling — the same pattern (always mounted, conditionally portaled) applies to the three dialogs.
- **Suggested fix direction:** Non-issue for now — the Radix pattern is standard. Flag only if React DevTools Profiler shows `PromotionDialog` in a hot path during deck/list interactions. If it does, gate the render with `{promotionOpen && <PromotionDialog … />}`.

### M-P-05 — `NotificationItem.parseNotificationData` runs on every render (no memo)
- **File:** `src/components/layout/NotificationItem.tsx:47-65, 114`
- **Severity:** MEDIUM
- **Rule:** Repeated JSON parse in render
- **Finding:** `parseNotificationData` is called inline in the component body on every render:

  ```tsx
  const data = parseNotificationData(notification.data);
  ```

  When `notification.data` is already an object (Prisma returns it parsed), the function short-circuits on `typeof === "object"` and returns a cast — cheap. But when it's a string (legacy / pre-migration rows), `JSON.parse` runs on every render. For a feed of 50 notifications, that's up to 50 JSON.parse calls on every NotificationDropdown re-render (triggered by mark-as-read, dismiss, refresh).
- **Reproduction / rationale:** After ADR-030 most new notifications should have `data` as an object, not a string. But older rows still carry strings, and the pattern is a foot-gun for any future writer that accidentally serializes before storage.
- **Suggested fix direction:** Wrap in `useMemo(() => parseNotificationData(notification.data), [notification.data])`. Cheap fix, eliminates a hot path for the legacy row case.

### M-P-06 — `DeckView.useEffect` keydown listener re-subscribes on every card advance
- **File:** `src/components/staging/DeckView.tsx:137-164`, `src/hooks/useDeckStack.ts:226-282`
- **Severity:** MEDIUM
- **Rule:** Churned event listeners due to unstable callback deps
- **Finding:** Two separate `document.addEventListener("keydown", …)` effects in DeckView (line 162) and useDeckStack (line 280) have deps that change on every card advance:

  ```ts
  // DeckView line 164:
  }, [onOpenDetails, isDetailsOpen, currentVacancy, containerRef]);

  // useDeckStack line 282:
  }, [enabled, isDetailsOpen, dismiss, promote, superLike, block, skip, undo]);
  ```

  `currentVacancy` advances every swipe. `dismiss/promote/superLike/block/skip/undo` are all derived from `performAction`, which is `useCallback([currentVacancy, currentIndex, onAction, onSuperLikeSuccess])` — so they all get new identities on every advance. Both effects therefore tear down and re-add their `keydown` listeners every time the user swipes a card. Not a leak (cleanup runs), but unnecessary churn inside the deck's 300ms animation window.
- **Reproduction / rationale:** Power users triaging 50+ vacancies in one deck session will trigger 50+ listener subscribe/unsubscribe cycles. Chrome DevTools shows these as minor but non-zero CPU blips in the Performance panel.
- **Suggested fix direction:** Use a `useRef` to hold the current vacancy and current-handler set, and subscribe the listener ONCE on mount via an effect with `[]` deps. The handler reads the current values from the ref. This is a common React pattern for stable global listeners. Alternatively, attach the listener to the deck container via React's `onKeyDown={}` prop (the container already has `tabIndex={0}` at line 270) and let React manage subscription lifecycle. The existing document-level listener only exists because focus may escape the container; that's also solvable by trapping focus inside the deck region.

---

## LOW findings

### L-P-01 — `ConnectorCache.buildKey` sanitizes with regex on every call
- **File:** `src/lib/connector/cache.ts:71-83`
- **Severity:** LOW
- **Rule:** Tiny allocation per cache key
- **Finding:** Every cache lookup builds `segments = [module, operation, sanitize(params)]` and optionally appends locale/userId, each going through `s.replace(/:/g, "%3A")`. Allocates a fresh regex match object and a new string per call. For the enrichment hot path (called once per orchestrator `execute()`), this is 2-3 allocations per cache hit.
- **Reproduction / rationale:** Negligible on its own — included because the enrichment cache key now includes `userId:domainKey` (post-fix), doubling the sanitize work per key. Still dominated by the `Map.get` call itself. Noted for awareness.
- **Suggested fix direction:** If profiling ever shows cache-key building on a hot path: cache the RegExp as a module-level constant (`const COLON_RE = /:/g`) so the V8 JIT doesn't re-parse it, and consider pre-computing the "safe" key once for known-static `module`/`operation` pairs via a tagged-template helper. Zero action needed today.

### L-P-02 — `NotificationBell` polls `getUnreadCount` every 30s per open tab
- **File:** `src/components/layout/NotificationBell.tsx:22, 39-43`
- **Severity:** LOW
- **Rule:** Per-tab polling (no coalescing across tabs)
- **Finding:** `POLL_INTERVAL_MS = 30_000`. `useEffect` sets up an unconditional `setInterval(fetchCount, 30_000)` on mount. Every open browser tab independently polls — N tabs per user means N × `prisma.notification.count` queries per 30s. The count query is cheap (indexed `[userId, read]`) but it's a wasted round-trip when the app could listen for notification events via the existing SSE channel used by the scheduler.
- **Reproduction / rationale:** A user with 4 tabs open pays 4 × cost. The StagingNewItemsBanner already consumes SSE via `useSchedulerStatus` for a similar UX problem, so the pattern is available. The 30s interval is modest but not free.
- **Suggested fix direction:** Replace polling with an SSE subscription to notification events (mirror `use-scheduler-status`). Or, at minimum, use `BroadcastChannel` to share the count across tabs so only one tab polls. Non-blocker — the current 30s interval is not hurting anyone and the query is well-indexed.

### L-P-03 — `SuperLikeCelebration` re-renders keyframe `<style>` block on every re-render
- **File:** `src/components/staging/SuperLikeCelebration.tsx:316-341`
- **Severity:** LOW
- **Rule:** Inline style block in render
- **Finding:** The component inlines a 25-line `<style>` block with keyframes. React re-creates this as a text node on every render. For a single fly-in card with a 6-second lifecycle, this is maybe 10-20 re-renders (pointer drag, focus, timer). The browser dedupes identical stylesheets, so the cost is React reconciliation, not CSS parse.
- **Reproduction / rationale:** Purely cosmetic. The component's comment explains the deliberate choice: "keeps the component self-contained with no globals.css edit and respects prefers-reduced-motion." The tradeoff is intentional.
- **Suggested fix direction:** If the keyframes ever move to `globals.css`, drop the inline `<style>` (saves 1-2% of the component's render cost). No action today.

### L-P-04 — `CompanyLogo` re-initializes state on every prop change (including re-renders where props are shallow-equal)
- **File:** `src/components/ui/company-logo.tsx:70-74`
- **Severity:** LOW
- **Rule:** Redundant state reset
- **Finding:** The `useEffect` at line 70 resets `imageState` and `useFallback` whenever `logoUrl` or `logoAssetId` changes:

  ```ts
  useEffect(() => {
    const src = (logoAssetId ? `/api/logos/${logoAssetId}` : null) ?? (logoUrl || null);
    setImageState(src ? "loading" : "error");
    setUseFallback(false);
  }, [logoUrl, logoAssetId]);
  ```

  For staging cards where `logoUrl` and `logoAssetId` are both `undefined`, this effect still runs on every mount and every Fast Refresh but then sets state to `"error"` immediately, which triggers the initials fallback path — wasted work but negligible in practice.
- **Reproduction / rationale:** Staging list/deck components never pass `logoUrl` or `logoAssetId` to `CompanyLogo` (verified via grep). So every staging `CompanyLogo` falls through to initials, and the effect fires unnecessarily. ~50 cards × unused effect is fine.
- **Suggested fix direction:** Guard the effect with a ref that tracks the previous src and skips when unchanged, or short-circuit earlier. Not a blocker. Noted because the Sprint 2 UI puts many more `CompanyLogo` instances on screen (DeckCard, StagedVacancyCard, StagedVacancyDetailContent) than the previous sprint.

### L-P-05 — `notification-dispatcher` registers channels as a module-level side effect, not inside `registerNotificationDispatcher()`
- **File:** `src/lib/events/consumers/notification-dispatcher.ts:63-66`
- **Severity:** LOW
- **Rule:** Module import cost
- **Finding:** The four channel instances (`new InAppChannel()`, `new WebhookChannel()`, `new EmailChannel()`, `new PushChannel()`) are constructed at module-top-level and registered into the `channelRouter` singleton during first import. This means anyone who imports `notification-dispatcher` pays for channel instantiation (and any transitive imports) even in code paths that don't dispatch notifications (e.g. test modules that only need `_testHelpers`). The `channelRouter.register()` method is guarded against duplicates, so re-import is safe, but the initial cost is paid lazily on every cold server render that touches this file.
- **Reproduction / rationale:** The dispatcher is imported transitively by many server actions (via the event bus setup). Moving registration into `registerNotificationDispatcher()` (which is already the public bootstrap) would let tests and non-dispatch code paths skip it entirely.
- **Suggested fix direction:** Move lines 63-66 inside `registerNotificationDispatcher()` (keep the idempotency guard). Saves ~30ms of cold-start work in modules that transitively import the dispatcher file but never register it. Non-blocker.

---

## Out-of-scope notes

1. **Existing pre-sprint patterns not regressed by Sprint 2:**
   - `getStagedVacancyCounts` fires 5 count queries in parallel every time a staging tab is clicked. Indexed, bounded, fine.
   - `StagingContainer`'s `useEffect` ESLint disables on lines 171 and 185 are deliberate (avoid debounce/load double-fire). Not a finding.
   - The `useDeckStack.performAction` 300ms `setTimeout` for animation is intentional — the server action fires in parallel, and `await actionPromise` at line 144 joins the two. No perf bug.

2. **CRIT-A/Y fixes that intersect performance — all verified non-regressive:**
   - `CRIT-A1` (module deactivation event routing): replaces a `prisma.notification.createMany` with a per-user event emission. The new path emits **one event per distinct userId** via a `Map` (lines 267-284 of `module.actions.ts`), so it's O(affected users) events, not O(affected automations) — this is a net win over the previous direct `createMany` approach because downstream consumers (webhook/email/push) now dispatch once per user instead of per automation.
   - `CRIT-A2` (createdJobId threading): purely a correctness fix, no perf delta.
   - `CRIT-Y1/Y2/Y3` (WCAG fixes): purely A11y, no perf delta.

3. **Jest config note about `scripts/test.sh`:**
   The script's default `--maxWorkers=1` translation is correct and the silent-ignore bug is genuinely fixed. The remaining concern is the always-on coverage collection (captured as H-P-03 above). The test.sh fix and the jest.config.ts fix are BOTH needed for full coverage of the original footgun.

4. **Not reviewed (out of scope for perf dimension):**
   - i18n dictionary additions in `src/i18n/dictionaries/*.ts`
   - E2E test infrastructure in `e2e/crud/*`
   - Allium specs in `specs/*.allium`
   - ADR-029 / ADR-030 documents in `docs/adr/`

5. **No API 529 fallback triggered** — review completed in one pass.
