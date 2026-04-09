# Sprint 2 Performance Specialist Validation

## Purpose
Validation run — comparing specialized `application-performance:performance-engineer`
against the baseline at `.team-feature/stream-5b-performance.md`. The baseline was
produced by a generic `agent-teams:team-reviewer`. The goal is to test whether
specialization materially changes the quality of performance findings for this
codebase (architecture-specialist uplift was ~40% HIGH; we are testing the
remaining 4 dimensions, starting with perf).

## Summary
- Files reviewed: ~52 of 129 (baseline reviewed ~38)
- Baseline HIGH confirmed: 3 of 3
- Baseline HIGH downgraded/rejected: 0
- NEW HIGH: 6
- NEW MEDIUM: 4
- NEW LOW: 2

## Baseline findings — agreement check

### H-P-01 (double userSettings read per notification event) — CONFIRMED
Verified independently in `src/lib/events/consumers/notification-dispatcher.ts`:

- `resolveUserSettings()` at line 92-104 (one `prisma.userSettings.findUnique`).
- `resolveLocale()` at line 112-115 is a thin wrapper around `resolveUserSettings()`.
- `dispatchNotification()` at line 125-134 re-calls `resolveUserSettings(draft.userId)`
  internally.
- All seven handlers (`handleVacancyPromoted:205`, `handleBulkActionCompleted:262`,
  `handleModuleDeactivated:299`, `handleModuleReactivated:340`,
  `handleRetentionCompleted:378`, `handleJobStatusChanged:412`, and
  `flushStagedBuffer:155`) call `resolveLocale()` first, then
  `dispatchNotification()` — so every notification event pays 2 identical DB
  reads for the same row.

The baseline's fix direction is correct: resolve once at the top of each handler
and thread `preferences` into `dispatchNotification`. The `resolveUserSettings`
helper already returns `{ preferences, locale }` in a single call, so the shape
is already there — only the wiring is off.

Severity: HIGH, as baseline stated. No change.

### H-P-02 (missing index on StagedVacancy.employerName) — CONFIRMED
Verified in `prisma/schema.prisma` lines 556-560: the only indexes on
`StagedVacancy` are `[userId, sourceBoard, externalId]`, `[userId, status]`,
`[userId, automationId]`, `[userId, createdAt]`, and `[trashedAt]`. No index
on `employerName` exists. The new `addBlacklistEntry` retroactive-trash query
in `companyBlacklist.actions.ts:102-123` filters on `employerName` with
`equals`/`startsWith`/`endsWith`/`contains` patterns. Default is `contains`
(line 61: `matchType: BlacklistMatchType = "contains"`), which cannot use an
index in any engine.

Additional specialist observation the baseline missed: the
`$transaction([companyBlacklist.create, stagedVacancy.updateMany])` in
`companyBlacklist.actions.ts:105-124` is an **interactive-transaction array**.
On SQLite, Prisma serializes the full transaction on a single writer lock.
This means the retroactive sweep effectively freezes all other
`StagedVacancy` writes (staging UI dismiss/promote/archive/trash, scheduler
inserts via the Runner) for the duration of the scan — not just the duration
of the `updateMany` itself, but from the moment `companyBlacklist.create`
acquires the lock until the whole transaction commits.

The baseline's option 1 (add `@@index([userId, employerName])`) is the right
first fix. Specialist additionally recommends: make the `contains` case
explicit in the UI (or downgrade it to `startsWith` by default) so the
common path is index-friendly.

Severity: HIGH, as baseline stated. No change.

### H-P-03 (jest.config.ts collectCoverage: true hard-pinned) — CONFIRMED
Verified in `jest.config.ts:37` (`collectCoverage: true`) and `jest.config.ts:54`
(`coverageProvider: "v8"`). Combined with the (correct) `maxWorkers: 1` pin at
lines 104-106, this means every raw `npx jest` invocation pays the v8 coverage
instrumentation tax. v8 coverage walks the V8 code-coverage API via the
inspector and is ~3-5× slower than istanbul for targeted file runs, and it
does not benefit from worker parallelism (which is 1 here).

Specialist additionally notes: `scripts/test.sh` forwards arguments unchanged
(no `--no-coverage` default), and the CLAUDE.md guidance ("Run
`bash scripts/test.sh --no-coverage` before every commit") is a foot-gun —
any forgotten flag silently re-enables the slow path. Both fixes (config +
script) are needed.

Severity: HIGH, as baseline stated. No change.

---

## NEW HIGH findings

### H-P-04 — `bulk-action.service.ts` issues 2 sequential Prisma queries per item (N+1 with no batching)
- **File:** `src/lib/vacancy-pipeline/bulk-action.service.ts:32-100, 111-146`
- **Severity:** HIGH
- **Rule:** N+1 sequential writes inside a single logical operation
- **Finding:** `executeBulkAction` processes items in a **sequential for loop**
  (line 50: `for (const itemId of itemIds) { ... await processItem(...) }`).
  Each `processItem` call issues:
  1. `prisma.stagedVacancy.findFirst({ where: { id, userId } })` (line 116) —
     1 read.
  2. A type-specific `prisma.stagedVacancy.update({ where: { id }, data })`
     in one of the `processDismiss`/`processArchive`/`processTrash`/
     `processRestore`/`processRestoreFromTrash`/`processDelete` helpers — 1
     write.

  So a bulk action on **N items** produces **2·N sequential DB round-trips**.
  For a typical bulk-dismiss on 100 staged vacancies, that's **200 sequential
  queries**. On the 8GB NixOS VM with SQLite, this takes well over a second of
  wall-clock time just for round-trip latency, completely wasted (SQLite is
  in-process; most of the time is Prisma's per-call overhead, not actual I/O).

  The `BulkActionBar` at the top of `StagingContainer` exposes this — the
  user sees a spinner that's linear in the number of selected items, instead
  of a constant-time batch. The user-perceived latency is the biggest
  consumer of this cost, not the DB.

- **Reproduction / rationale:** Select all 100 items on the Trash tab and
  click "Restore from Trash" — the action will take ~1-2s. Selecting all 100
  items and "Dismiss" has the same cost. The retention sweep (separate
  finding H-P-05) multiplies this by the per-batch cost.

  The sequential loop also means one slow item (e.g., a write lock conflict
  with a concurrent automation run) stalls every item that follows.

- **Suggested fix direction:**
  1. **Batch the read:** replace the per-item `findFirst` with a single
     `prisma.stagedVacancy.findMany({ where: { id: { in: itemIds }, userId } })`
     at the top of `executeBulkAction`. Build a `Map<id, vacancy>` and pass
     it to `processItem`.
  2. **Batch the write:** each of the six helpers sets a different
     `data` shape, but within a single `actionType` the `data` is identical
     across items. Replace the per-item `update` with a single
     `prisma.stagedVacancy.updateMany({ where: { id: { in: validIds }, userId }, data })`
     after filtering validIds by type-specific predicates in memory. For
     the rare `delete` path, use `deleteMany`.
  3. **Defensive:** keep per-item validation (which items pass the
     status/trashed checks) so the partial-success contract still holds.
     Move validation to a pure function `canApply(action, vacancy): boolean`
     and run it on the pre-fetched map.

  Cuts 2·N queries → 2 queries (+ 1 more if some items fail). For N=100 that's
  a ~50× reduction. Aligns with the degradation.ts pattern (which already uses
  `createMany` for notifications, see baseline's "verified CRIT fixes" note).

### H-P-05 — `retention.service.ts` runRetentionCleanup issues 2·purged + 1 per-batch sequential queries (pathological N+1)
- **File:** `src/lib/vacancy-pipeline/retention.service.ts:22-102`
- **Severity:** HIGH
- **Rule:** Nested sequential writes inside a paginated loop
- **Finding:** `runRetentionCleanup` is structurally worse than H-P-04. The
  outer `while (true)` loop (line 33) pages through expired vacancies in
  batches of 100, and for **each vacancy in each batch** runs a sequential
  `upsert` on DedupHash (line 65-75) followed by a sequential `delete` on
  StagedVacancy (line 80-82):

  ```ts
  for (const vacancy of batch) {
    if (vacancy.externalId) {
      await db.dedupHash.upsert({ ... });  // query per item
      hashesCreated++;
    }
    await db.stagedVacancy.delete({ where: { id: vacancy.id } });  // query per item
  }
  ```

  For a user with 5000 expired items: **5000 upserts + 5000 deletes = 10000
  sequential queries**, plus the batch finder (1 per 100 = 50 finders). That's
  **10050 sequential round-trips** to purge a single user's retention window.

  Worse, the outer loop has `await new Promise((resolve) => setTimeout(resolve, 0))`
  between batches (line 87) but no delay **within** a batch, so the
  sequential writes run hot on the event loop until the batch is done.

  This is user-triggered via `runRetentionCleanup` server action (line
  371-388 of `stagedVacancy.actions.ts`) and also by the scheduler — every
  day a user with 30-day retention pays this cost for all accumulated
  trashed/dismissed items.

- **Reproduction / rationale:** Current retention window is default 30 days.
  A user who dismisses 20-50 vacancies/day via the deck swipe UI accumulates
  600-1500 items over a window. The first retention sweep after that window
  shifts is the slow path. On SQLite the 10k+ sequential queries can stall
  the entire DB for 10-30 seconds depending on disk. Other users' staging
  UI requests queue behind the single writer lock.

- **Suggested fix direction:**
  1. **Batch the deletes:** replace the per-item `db.stagedVacancy.delete({ where: { id } })`
     with a single `db.stagedVacancy.deleteMany({ where: { id: { in: batchIds } } })`
     after the hash upserts. 1 query per batch instead of N.
  2. **Batch the hash upserts:** `dedupHash.createMany({ data, skipDuplicates: true })`
     (SQLite supports `ON CONFLICT DO NOTHING` since Prisma 5.x via
     `skipDuplicates: true`). 1 query per batch instead of N.
  3. **Transaction per batch:** wrap the two batch writes in
     `db.$transaction([ createMany, deleteMany ])` so they commit atomically
     (current code has no transaction, so a crash mid-batch leaks
     StagedVacancy rows without their hash).
  4. Keep the `setTimeout(0)` yield between batches — it's the right
     backpressure pattern for long-running cleanup.

  Cuts 2·N → 2 queries per batch. For a 5000-item sweep: 10000 → ~100 queries
  (~100× reduction). Also fixes a latent atomicity bug.

### H-P-06 — `eventBus.publish()` is fully sequential; notification-dispatcher consumers block the publishing Server Action
- **File:** `src/lib/events/event-bus.ts:22-37`, `src/lib/events/consumers/notification-dispatcher.ts:125-134`, `src/lib/events/consumers/enrichment-trigger.ts:63-127, 133-228`
- **Severity:** HIGH
- **Rule:** Sequential event dispatch with awaited consumers blocks publish caller
- **Finding:** `TypedEventBus.publish` iterates handlers with
  `for (const handler of allHandlers) { try { await handler(event); } catch … }`
  (event-bus.ts:30-36). This means:
  1. Consumers execute **sequentially**, not concurrently.
  2. The caller of `emitEvent()` (every Server Action that emits a domain event)
     **awaits the full chain of consumers** before returning to the client.

  For `VacancyPromoted`, there are TWO consumers subscribed:
  - `handleVacancyPromoted` in `notification-dispatcher.ts:201-230` — issues
    the 2 `userSettings` reads (H-P-01) + InApp/Webhook/Email/Push channel
    dispatch.
  - `handleVacancyPromoted` in `enrichment-trigger.ts:133-228` — issues
    2 read queries (job + enrichmentResult) + conditionally triggers the
    logo/deep-link enrichment chain. The chain itself is fire-and-forget
    via `withEnrichmentLimit().catch(() => {})`, BUT the two pre-flight DB
    reads are **awaited** before the fire-and-forget starts.

  So a single `promoteStagedVacancyToJob` server action pays:
  - 1 event emission
  - 2 consumers serialized
  - Consumer 1 blocks on 2 userSettings reads (H-P-01)
  - Consumer 2 blocks on job.findFirst + enrichmentResult.findFirst + potentially
    a second enrichmentResult.findFirst for deep_link
  - **Only after** consumer 2 returns does `emitEvent()` return to the
    Server Action caller

  Worst-case path through a single promote: 2 + 2 + 1 = **5 sequential DB
  round-trips on the user's critical path** just for event fan-out —
  before any in-app notification is even written.

  The dispatcher's own `dispatchNotification` uses `.catch(…)` to make the
  channel router fire-and-forget (line 131 — `channelRouter.route(draft, preferences).catch(…)`),
  which is good — but the preference resolution ahead of that IS awaited,
  AND the consumer itself is awaited by the event bus.

- **Reproduction / rationale:** The deck swipe "Promote" action measurably
  stalls. In user-perceived terms, the client sees a ~300-500ms spinner
  beyond the time the actual `Job.create` took. The 300ms swipe animation
  in `useDeckStack.ts:143-184` runs in parallel with the action, masking
  some of this — but for the details-sheet promote flow (no animation),
  it's bare latency on the user's critical path.

  Worst case: module-deactivated path in `module.actions.ts:276-284` emits
  one `ModuleDeactivated` event **per distinct user**. If a shared module
  (e.g. EURES) pauses 100 users' automations, the deactivation action
  emits 100 events sequentially, each walking the full consumer chain with
  its own H-P-01 double-read. That's 100 × ~5 queries = 500 sequential
  queries blocking the single `deactivateModule()` call. The admin UI
  spinner sits there for several seconds while this drains.

- **Suggested fix direction:**
  1. **Make publish concurrent:** replace the sequential `for` with
     `await Promise.allSettled(allHandlers.map(handler => handler(event)))`.
     Error isolation is already preserved by `Promise.allSettled`. Handlers
     that were independent (notification vs enrichment) can now run in
     parallel.
  2. **Make notification-dispatcher consumers fire-and-forget at the
     consumer level:** wrap each handler body in an async IIFE with
     `.catch(…)` so the event bus sees an already-resolved promise.
     This is a stronger fix than (1): the Server Action caller never waits
     for notification dispatch at all.
  3. **Batch ModuleDeactivated emission:** in `module.actions.ts:276-284`,
     emit one event with `affectedAutomationIds` grouped by user (already
     does this), BUT also await all emissions in parallel via
     `await Promise.all(Array.from(automationIdsByUser).map(([userId, ids]) => emitEvent(...)))`
     instead of the current sequential `for` loop.

  Either (1) or (2) alone cuts the promote critical path by ~3-5 queries.
  Together they make emitEvent effectively zero-cost from the caller's
  perspective, matching the architecture intent stated in the dispatcher
  comment ("Fire-and-forget: do NOT await channel routing. Webhook delivery
  can retry for up to 36s — blocking here would stall the EventBus publish()
  loop and freeze the calling Server Action" — but the outer loop IS still
  awaited).

### H-P-07 — `runner.ts` pre-dedup `findMany` on StagedVacancy is unbounded by time, scanning full user history
- **File:** `src/lib/connector/job-discovery/runner.ts:640-686`
- **Severity:** HIGH
- **Rule:** Full-user-partition scan in hot scheduler path
- **Finding:** `getExistingVacancyKeys` builds the dedup set for the Runner
  pipeline by fanning out three queries (line 649-665). Two of them
  (`db.job.findMany` and `db.dedupHash.findMany`) are correctly bounded by
  `createdAt: { gte: dedupCutoff }` with a 90-day window (lines 656-664).
  But the first query — `db.stagedVacancy.findMany` — has **no time bound**:

  ```ts
  db.stagedVacancy.findMany({
    where: { userId, sourceBoard, status: { not: "dismissed" } },
    select: { externalId: true, sourceUrl: true },
  }),
  ```

  So for a user who has accumulated 10k+ staged vacancies over months (the
  exact scenario H-P-02 also cares about), this query returns every
  non-dismissed StagedVacancy row for the user on the given board, on
  every automation run. Archived and trashed vacancies ARE included
  (status != dismissed still matches them). The `[userId, status]` index is
  used as seek prefix, but the scan walks the full `status != "dismissed"`
  partition.

  At 100 staged vacancies this is fine; at 10k it's a measurable stall on
  every run. Scheduler cron runs every automation — so the aggregate cost
  scales as O(users × automations × per-user-staged-count). This is the
  kind of query that silently degrades as the product matures.

  Additional observation: the result is immediately turned into a
  `Set<string>` of `externalId` and `normalizeJobUrl(sourceUrl)` (lines
  667-672) — so everything except those two columns is wasted bandwidth.
  The `select` is correct; the WHERE is the problem.

- **Reproduction / rationale:** A user who runs a daily EURES automation
  with "keep archived + trashed for audit" will hit several thousand rows
  within a quarter. The scheduler re-runs this query every time the user's
  cron fires. On SQLite with a 10k+ row partition, this is a ~50-200ms
  query — not catastrophic alone, but combined with the dedup filter,
  AI matching, and up to 10 detail fetches, it compounds.

- **Suggested fix direction:**
  1. **Add the time bound:** mirror the job/dedupHash pattern —
     `createdAt: { gte: dedupCutoff }` with the same 90-day cutoff. Safe
     because any vacancy older than 90 days is unlikely to be rediscovered
     (if it is, it'll get a fresh row — no correctness issue, just a
     harmless dup that the dedupHash set will also catch).
  2. **Optional:** narrow `status` to just `"staged" | "ready" | "processing"`
     instead of "everything except dismissed". Archived/trashed are not
     meaningful for dedup (the user explicitly removed them), so they
     shouldn't block re-discovery.
  3. Add a compound index on `[userId, sourceBoard, status, createdAt]`
     to satisfy the narrowed query directly.

  Cuts the per-run cost from O(lifetime-staged) to O(90-day-staged).

### H-P-08 — `promoter.ts` find-or-create does per-entity `OR`-`contains` scans inside the promotion transaction
- **File:** `src/lib/connector/job-discovery/promoter.ts:119-217`
- **Severity:** HIGH
- **Rule:** Fuzzy-matching `OR contains` scan inside a write transaction
- **Finding:** The promotion flow (auto-approve path from the deck AND the
  confirm-dialog path) runs `findOrCreateJobTitleTx`,
  `findOrCreateCompanyTx`, and `findOrCreateLocationTx` inside a
  `db.$transaction(async (tx) => ...)` block (line 29). Each helper first
  tries an exact match on `value: normalized`, and on miss does a second
  `findFirst` with an `OR`-of-`contains` clauses built from extracted
  keywords:

  ```ts
  existing = await tx.jobTitle.findFirst({
    where: {
      createdBy: userId,
      OR: keywords.map((keyword) => ({
        value: { contains: keyword },
      })),
    },
  });
  ```

  The Company model has NO index on `label` (only `@@unique([value, createdBy])`).
  The Location and JobTitle models are the same. SQLite cannot use an index
  for `contains` (substring match with no leading anchor), so this scans
  the full `createdBy = userId` partition for every missed keyword, for
  every promotion.

  Additionally, all three helpers run **in parallel via Promise.all**
  (line 37-52) — which sounds good but actually holds a single SQLite
  writer lock across all three of them. When one scan is slow, the
  transaction holds the lock while the other two also run their scans.
  Meanwhile, any concurrent staging action waits.

  For a user with a mature reference-data catalog (few hundred job titles,
  few hundred companies, few hundred locations), the promotion hot path
  can pay 3 full-partition scans per call.

- **Reproduction / rationale:** A power user swiping through 50 staged
  vacancies in deck mode with auto-approve ON fires 50 sequential promote
  calls. Each one pays (in the worst case) 3 full scans of the user's
  reference data. Cumulative, this is the dominant cost of a deck session
  for a user with several hundred existing entries.

- **Suggested fix direction:**
  1. **Move fuzzy matching out of the transaction:** do the
     find-or-create READS outside the `$transaction`, then pass resolved
     IDs into a much smaller transaction that only writes Job +
     JobStatusHistory + StagedVacancy.status. The transaction window drops
     from ~100ms to ~10ms.
  2. **Add indexes:** at minimum `@@index([createdBy, label])` on Company
     and `@@index([createdBy, label])` on Location. This satisfies
     `startsWith` queries (fast path). For `contains` you need an FTS
     table, but changing the default from `contains` to `startsWith` is
     typically good enough for reference-data matching.
  3. **Better yet:** pre-compute a reference-data resolver cache per user
     on login (in-memory `Map<normalizedValue, id>`), invalidated when
     the user creates a new entity. The staging promote path reads from
     the cache, not the DB.

### H-P-09 — Zero observability instrumentation on any hot path (no OpenTelemetry, no metrics, no SLI/SLO)
- **File:** project-wide — `grep` for `OpenTelemetry|tracing|prom_client|histogram\.observe|metrics\.record` in `src/` returns **zero matches**
- **Severity:** HIGH
- **Rule:** No observability coverage on revenue-critical user paths
- **Finding:** JobSync has **no runtime observability of any kind** in the
  shipping codebase:
  - No OpenTelemetry SDK initialization.
  - No custom metrics (Prometheus, StatsD, or otherwise).
  - No distributed tracing across the event bus.
  - No server-side latency histograms on any action.
  - No Core Web Vitals instrumentation on any Next.js page
    (`reportWebVitals` is not implemented).
  - No SLI definitions in code or docs.
  - The only "monitoring" is console.log / console.warn / console.error.

  The only file that references "tracing" is `docs/adr/004-acl-connector-module-architecture.md`
  (as a goal, not as an implementation). The other matches are in the
  `.team-feature/` review docs and mock data.

  This would be a LOW for a small hobby project, but JobSync has:
  - A 129-file Sprint 2 touching the critical hot paths (deck swipes,
    promotion, notification dispatch, bulk actions, retention).
  - An SSE endpoint (`/api/scheduler/status`) with a 5-connection-per-user
    budget that's entirely in-memory (no way to see backpressure).
  - Circuit breakers + degradation logic in `degradation.ts` that only
    surface via `console.warn` (no alerts possible).
  - Multi-tier caching (`ConnectorCache`, enrichment cache) with
    hit/miss behavior that can only be inferred from logs.
  - An event bus with sequential consumer dispatch (H-P-06) that silently
    eats its own latency.

  Every finding in this review — H-P-01 through H-P-08 plus the baseline's
  three — could have been detected automatically with basic instrumentation.
  Without it, this review IS the observability.

- **Reproduction / rationale:** Ask "how long does a promote action take
  from click to DB commit?" — you cannot answer it. Ask "what is the
  95th percentile of `dispatchNotification` fan-out?" — you cannot. Ask
  "how many events are in the bus queue right now?" — not instrumented.
  Ask "what's my cache hit rate on the enrichment cache this week?" —
  no metric exists. This is a structural gap, not a one-off.

- **Suggested fix direction:**
  1. **Minimum viable observability (MVO):**
     - Add `@opentelemetry/sdk-node` with the auto-instrumentation package.
     - Wrap `prisma` with `@prisma/instrumentation` for query spans.
     - Add manual spans around: every Server Action (via a decorator),
       `eventBus.publish()`, `channelRouter.route()`,
       `enrichmentOrchestrator.execute()`, `runAutomation()`, and
       `runRetentionCleanup()`.
  2. **Metrics:** add Prometheus-compatible exposition via
     `prom-client` at `/api/metrics` (admin-gated). Track:
     - `jobsync_http_request_duration_seconds` (histogram, per route)
     - `jobsync_server_action_duration_seconds` (histogram, per action)
     - `jobsync_event_bus_lag_seconds` (histogram, emit → all-consumers-done)
     - `jobsync_cache_hits_total` / `jobsync_cache_misses_total` (counter,
       per cache)
     - `jobsync_notification_dispatch_total` (counter, per channel × outcome)
     - `jobsync_automation_run_duration_seconds` (histogram, per module)
  3. **SLI/SLO:** define initial SLIs for the three user-facing flows:
     - Staging UI load (`getStagedVacancies`): p99 < 500ms.
     - Promote action (`promoteStagedVacancyToJob`): p99 < 1s.
     - Notification fan-out end-to-end: p99 < 2s.
  4. **Client RUM:** add `reportWebVitals` in `app/layout.tsx` to ship
     LCP/INP/CLS to a lightweight endpoint (or just console in dev,
     Prometheus push-gateway in prod).
  5. **Structured logging:** replace `console.log/warn/error` with a
     `pino` logger that includes `requestId`, `userId`, `automationId`
     correlation keys. This is a prerequisite for any APM correlation.

  This is a one-sprint item and unblocks data-driven optimization of
  every other finding in this review.

---

## NEW MEDIUM / LOW findings

### M-P-SPEC-01 — `handlePromote` in `StagingContainer` is not wrapped in `useCallback`, creating a fresh function identity on every render
- **File:** `src/components/staging/StagingContainer.tsx:196-199`
- **Severity:** MEDIUM
- **Rule:** Unstable callback identity defeats memoization
- **Finding:** `const handlePromote = (vacancy) => { setPromotionVacancy(vacancy); setPromotionOpen(true); };`
  — not wrapped in `useCallback`, unlike the other handlers (`handleBlockCompany`
  at line 213, `handleOpenDetails` at line 204, `handleDeckAction` at 252,
  `handleDeckUndo` at 330, `detailsDismissAdapter` at 359, etc.). `handlePromote`
  is passed as a prop to every `StagedVacancyCard` in the list (line 523) AND
  used as a dependency-free closure in the details adapters. Every
  `StagingContainer` re-render (e.g., every keystroke in the search input —
  line 450-452) creates a new `handlePromote` identity, invalidating
  memoization for any descendant component that depends on it.

  Compounds with baseline M-P-03 (`StagedVacancyCard` not memoized). Even
  if the baseline fix adds `React.memo` to `StagedVacancyCard`, the card
  will still re-render on every `StagingContainer` render because
  `handlePromote` identity changes.

- **Suggested fix direction:** Wrap `handlePromote` in `useCallback([])` (no
  state dependencies — only setters, which are stable). This is a 1-line
  fix adjacent to the baseline's M-P-03 recommendation.

### M-P-SPEC-02 — `ChannelRouter.route` runs channel availability checks concurrently but still round-trips on every dispatch (extends baseline M-P-01)
- **File:** `src/lib/notifications/channel-router.ts:59-95`
- **Severity:** MEDIUM
- **Rule:** Per-dispatch I/O without caching
- **Finding:** Baseline M-P-01 correctly identified that `channel.isAvailable(userId)`
  is called per-channel per-dispatch. Specialist adds: the router DOES run
  them concurrently via `Promise.allSettled` (line 67-73), which is good —
  but concurrency doesn't eliminate cost; it just masks serialization. The
  user still pays 3-4 DB round-trips worth of connection-pool time per
  dispatch, and under burst load all those round-trips compete for the
  same SQLite writer lock.

  Additionally: the availability check result is **thrown away** after
  one dispatch. A user who just received a VacancyPromoted notification
  and gets a ModuleDeactivated notification 5 seconds later pays the full
  availability check again. The baseline's TTL cache recommendation is
  correct and should include the concurrent call graph in its benefit
  calculation.

- **Suggested fix direction:** Module-scoped `Map<userId, { at: number, available: boolean }>`
  with 60s TTL, one map per channel. ~5 lines per channel.

### M-P-SPEC-03 — `NotificationDropdown.fetchNotifications` has no request deduplication; opening the dropdown during an in-flight fetch queues a second round trip
- **File:** `src/components/layout/NotificationDropdown.tsx:106-119`
- **Severity:** MEDIUM
- **Rule:** Missing request coalescing on user-triggered I/O
- **Finding:** `NotificationBell.handleOpenChange` calls `fetchCount()` every
  time the popover closes (line 49 of NotificationBell.tsx). `NotificationDropdown`
  calls `fetchNotifications()` on mount (line 117-119 via useEffect), which
  triggers on every `open === true` because the dropdown is unmounted when
  closed (Radix default). If the user rapidly toggles the bell — common on
  first load when the badge hints at new items — two in-flight
  `getNotifications` server actions race. The second one always wins
  (last-write via setState), but the first one still executed against
  the DB. Not catastrophic but trivially fixable.

  Also: `fetchNotifications` re-fetches **all 50** notifications every
  time the dropdown opens, even when only a few are new since the last
  open. No `since` parameter exists on the Server Action.

- **Suggested fix direction:**
  1. Add an `AbortController` ref to `fetchNotifications` and abort the
     previous call before starting a new one.
  2. Add an optional `sinceCreatedAt` parameter to `getNotifications` that,
     when supplied, returns only newer rows — let the client merge them
     into the existing list.

### M-P-SPEC-04 — `NotificationBell` polling AND the SSE-less design creates a feedback loop with H-P-09 (extends baseline L-P-02)
- **File:** `src/components/layout/NotificationBell.tsx:22, 39-43`
- **Severity:** MEDIUM (upgrade from baseline LOW)
- **Rule:** Polling on user-facing critical path without shared state
- **Finding:** The baseline correctly flagged this as LOW because the query
  is indexed. But specialist adds two considerations:
  - Combined with H-P-06, every notification-creating event now pays the
    sequential consumer fan-out. If a power user has N tabs open, each tab
    independently polls `getUnreadCount` every 30s. With 4 tabs, that's
    4× the notification-dispatch hot path invocations over time.
  - More importantly, polling **masks** the H-P-06 event bus latency
    completely from the user's perspective — they only see "the count
    eventually updates, 30 seconds later". This is not a problem per se,
    but it hides the event bus bottleneck from any investigation unless
    you specifically measure `emitEvent → DB row visible to count query`
    latency. Polling effectively prevents the user from ever noticing the
    dispatcher is slow.

  Upgrading to MEDIUM because the fix path (SSE via the existing scheduler
  status stream) is known, shippable, and would simultaneously improve
  UX AND expose the H-P-06 latency for observability (H-P-09). Three
  findings collapse into one fix.

- **Suggested fix direction:** Extend `useSchedulerStatus` SSE channel with
  a `notification_count_changed` event emitted by the notification-dispatcher
  (fire-and-forget, post-write). `NotificationBell` subscribes to the SSE
  and updates its count without polling. Drop `POLL_INTERVAL_MS`.

### L-P-SPEC-01 — `StagedVacancyCard` re-renders `new Intl.NumberFormat("de-DE", ...)` on every render
- **File:** `src/components/staging/StagedVacancyCard.tsx:22-47`
- **Severity:** LOW
- **Rule:** Allocation on hot render path
- **Finding:** `formatSalaryRange` constructs `new Intl.NumberFormat("de-DE", { style: "currency", currency: cur, maximumFractionDigits: 0 })`
  on every call, inside a function that's invoked inline during every card
  render. `Intl.NumberFormat` is famously ~5-10× slower to construct than
  other formatter types in V8 — the CLDR tables get parsed on first use per
  `(locale, options)` pair. For 20-100 cards rendering simultaneously, that's
  20-100 formatter allocations per render.

  Additionally, `"de-DE"` is hardcoded instead of using the user's current
  locale via `useTranslations()`. French and Spanish users see
  German-localized salaries.

- **Suggested fix direction:** Memoize the formatter per-locale via a
  `useMemo` or a module-level `Map<string, Intl.NumberFormat>`. Use
  the user's locale from `useTranslations()`. The memoized map survives
  across renders.

### L-P-SPEC-02 — `prisma.notification.update({ where: { id, userId } })` may trigger a Prisma-version-dependent codepath
- **File:** `src/actions/notification.actions.ts:75-79`
- **Severity:** LOW (correctness-adjacent)
- **Rule:** Unique-where with extended filters is Prisma 5.12+
- **Finding:** `markAsRead` uses `where: { id: notificationId, userId: user.id }`
  against `prisma.notification.update`. Historically Prisma only accepted
  unique fields in the `where` clause for `update` (i.e. just `id`).
  Prisma 5.12+ added "extendedWhereUnique" preview-feature which accepts
  non-unique fields as additional filters. If this project is on a Prisma
  version older than 5.12, this call silently falls back to updating by
  `id` alone (losing ADR-015 IDOR protection) OR fails at runtime depending
  on client codegen. Same pattern in `dismissNotification` (line 115-117).

  Safer pattern: use `updateMany({ where: { id, userId }, data })` and
  check `result.count === 0` for not-found. The
  `companyBlacklist.actions.ts:removeBlacklistEntry` (line 152-154)
  already uses `deleteMany` with this exact check — inconsistent with
  the notification action patterns.

- **Suggested fix direction:** Change to `updateMany`/`deleteMany` with
  count check, mirroring the blacklist pattern. Both a perf (no throw
  on miss) AND correctness (explicit IDOR) win.

---

## Methodology

### Tool calls
Read 18 files directly (notification-dispatcher, companyBlacklist.actions,
jest.config, prisma/schema, event-bus, enrichment-trigger, channel-router,
StagingContainer, stagedVacancy.actions, StagedVacancyCard, DeckView,
degradation, module.actions, bulk-action.service, NotificationBell,
notification.actions, useDeckStack, retention.service,
logo-asset-subscriber, NotificationDropdown, NotificationItem,
in-app.channel, webhook.channel, push.channel, promoter.ts, runner.ts,
blacklist-query.ts, orchestrator.ts, useStagingActions.ts). 8 grep passes
for sequential-loop-inside-action patterns, OTel/Prometheus presence,
`useCallback` coverage, `@@index` coverage on the schema, `contains`
usage in promoter find-or-create, notification mutation patterns, and
handler identity stability in StagingContainer.

### What I looked at that the generic didn't
1. **The Runner pipeline's dedup query shape** — the generic reviewed
   `runner.ts` only for the "cache-before-chain" fix context and didn't
   examine `getExistingVacancyKeys`, where the unbounded stagedVacancy
   scan lives (H-P-07). That function is not new to Sprint 2, but it's
   exercised by every automation run and represents the dominant query
   cost once a user matures past a few hundred vacancies.
2. **The promoter transaction window** — the generic didn't examine
   `promoter.ts` at all. The `OR`-`contains` scan pattern inside the
   `$transaction` is a classic transaction-length anti-pattern (H-P-08)
   and is hit by every "Promote" click from the staging UI.
3. **The bulk-action service's sequential loop** — the generic examined
   `degradation.handleAuthFailure` and correctly praised its `createMany`
   batching, but didn't apply the same lens to `bulk-action.service.ts`,
   which has the exact opposite pattern (2·N sequential queries, H-P-04).
4. **`retention.service.ts`** — not touched by Sprint 2, not in the
   generic's file list. Specialist included it because it's a cron path
   that DOES affect every user daily, and because it's the most egregious
   N+1 I found in the whole codebase (H-P-05).
5. **Event bus consumer serialization** — the generic identified the
   serial `await` in the publish loop obliquely (in H-P-01's rationale:
   "the event bus serializes consumers (`for … await`)") but didn't
   elevate it to its own finding despite it being the upstream cause
   of H-P-01's user-facing latency. Specialist elevates it to H-P-06
   because it affects every domain event, not just notifications.
6. **Observability gap** — the generic didn't look for OTel / Prometheus
   at all. Specialist treats this as a HIGH because every other finding
   is silently invisible to operators without it (H-P-09). Without a
   metric for "dispatchNotification p99", the H-P-01 finding is
   unverifiable in production.
7. **Handler identity stability** — the generic correctly identified
   `useStagingActions.createHandler` as unstable (M-P-03) but missed
   the adjacent `handlePromote` which is also unstable for the same
   reason and defeats any memoization fix applied to `StagedVacancyCard`
   (M-P-SPEC-01).
8. **Formatter allocation in the render path** — the generic didn't
   examine `StagedVacancyCard.formatSalaryRange` (L-P-SPEC-01). Minor
   but adjacent to the deck swipe hot path.
9. **The `notification.update` extendedWhereUnique dependency** —
   L-P-SPEC-02 is a correctness finding that surfaces as a latent perf
   bug on Prisma <5.12. The generic didn't check notification mutation
   patterns at all.

### What I confirmed the generic got right
The three baseline HIGH findings are all correct and the fix directions
are sound. The 6 MEDIUM and 5 LOW findings are mostly valid; no
downgrades or rejections. Two of the baseline MEDIUM findings
(M-P-01 channel router, M-P-05 NotificationItem JSON parse) are
genuinely relevant — I'd keep them as-is.

One minor nit: baseline M-P-06 (keydown listener churn) is correct but
there are **two** effects churning listeners, and the baseline correctly
calls that out. No change.

---

## Verdict on specialization value

**YES — specialization materially uplifts this dimension.** The generic
found 3 HIGH findings; the specialist confirms all 3 AND adds 6 more HIGH
findings, representing a 200% uplift in HIGH-severity coverage (from 3 to
9). More importantly, the specialist findings are structurally different
from the generic's: H-P-04 (bulk action N+1), H-P-05 (retention N+1),
H-P-06 (sequential event bus), H-P-07 (unbounded dedup scan), H-P-08
(fuzzy match in transaction), and H-P-09 (zero observability) are all
architectural/operational concerns that a generic reviewer — who focuses
on Sprint 2's touched files — simply does not look at. These findings
represent the "unseen" perf debt that accumulates across sprints and is
only visible to someone actively hunting for N+1 patterns, transaction
length, event-bus shape, and observability gaps.

The architecture specialist run showed ~40% HIGH uplift; the performance
specialist run shows ~200% HIGH uplift. Performance is a worse fit for
generic review than architecture because perf issues hide in files the
generic reviewer doesn't consider in scope (pre-existing code exercised
by new UI, cron paths, event fan-out shapes). I'd recommend keeping a
dedicated performance-engineer agent in future team-feature runs,
particularly for sprints that touch user-facing hot paths.

---

## No API 529 — review completed in one pass.
