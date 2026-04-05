# Changelog

## [2026-04-05] Session S5b-Resume — Comprehensive Review + Fixes

### Fixed — Critical
- **CRITICAL**: sendTestPush() sent raw i18n key "push.testBody" as browser notification body → resolves locale and translates

### Fixed — Security & Architecture (16 HIGH findings)
- 6 channel/infrastructure files missing `import "server-only"` guard → added to all
- PushChannel deleted subscriptions on 401/403 VAPID auth failures → only 404/410 now
- resolveUserLocale duplicated 4× with inconsistent behavior → extracted to shared `locale-resolver.ts`
- Nodemailer transport config duplicated → extracted to shared `email/transport.ts`
- ChannelRouter dispatched channels sequentially → concurrent via `Promise.allSettled`
- Input length validation added to SMTP (host/username/password/fromAddress) and Push (endpoint/p256dh/auth)
- sendTestPush used wrong NotificationType + double-charged rate limits → fixed

### Fixed — Accessibility (WCAG 2.2 AA)
- SmtpSettings inputs not in `<form>` element (WCAG 1.3.1) → wrapped in form
- Password toggle unreachable by keyboard (tabIndex={-1}) → removed
- No progress indication during 30s SMTP timeout → descriptive loading text
- Edit/Delete clickable during test-in-flight → disabled
- Missing aria-required, aria-live, destructive button styling → added
- Email template footer contrast 4.2:1 → 4.78:1 (#636363)

### Fixed — Code Quality
- buildNotificationMessage double-replacement bug → single PLACEHOLDER_MAP pass
- Dispatcher 2 DB calls for same user row → combined resolveUserSettings
- Plain-text email body control-char sanitization → sanitizePlainText()
- Stale "D2 future" / "D3 future" comment in types.ts → updated

### Fixed — S5a Deferred LOW Items (L1-L5)
- ToastProvider explicit `duration={5000}`
- StatusFunnelWidget hover tooltips with count + percentage
- StatusHistoryTimeline server-side pagination (take:50 + Load more)
- "N jobs tracked" line in StatusFunnelWidget

### Added — Tests (+78 tests)
- `smtp-actions.spec.ts` — 29 tests (IDOR, encryption, SSRF, validation)
- `push-actions.spec.ts` — 38 tests (subscription limits, rate limits, translated push)
- PushChannel 401/403 non-deletion regression tests
- Email template placeholder interpolation tests
- StatusFunnelWidget + StatusHistoryTimeline updated tests
- E2E: `smtp-settings.spec.ts` (5 tests) + `push-settings.spec.ts` (3 tests)

### Updated — Specs & Docs
- `notification-dispatch.allium`: 5 spec bugs fixed (QuietHours invariant, email recipient, 404/410, VAPID auth, ordering note)
- `docs/reviews/s5b/`: 12 review reports (code quality, architecture, security, performance, testing, WCAG, interaction, data storytelling, STRIDE, flashlight, consolidated)

## [2026-04-05] Session S5b — Email + Push Notification Channels

### Added — Phase 1: Foundation
- `job_status_changed` NotificationType + dispatcher wiring for JobStatusChanged events
- Multi-channel preferences: `email` and `push` fields in NotificationPreferences.channels
- 4 missing types added to CONFIGURABLE_NOTIFICATION_TYPES (S5a deferred L6)

### Added — Sprint D2: Email Notification Channel
- **SmtpConfig** Prisma model (AES-encrypted password, TLS default, one per user)
- **EmailChannel** adapter implementing NotificationChannel interface
- nodemailer SMTP transport with TLS enforcement (TLSv1.2+, rejectUnauthorized)
- SMTP host SSRF validation (blocks private IPs, IMDS, localhost)
- Rate limiting: 10 emails/min per user, test button 1/60s cooldown
- HTML email templates for all 11 NotificationTypes × 4 locales (EN, DE, FR, ES)
- Server actions: saveSmtpConfig, getSmtpConfig, testSmtpConnection, deleteSmtpConfig
- **SmtpSettings** UI: SMTP config form, password show/hide, test email with countdown, delete confirmation
- Settings sidebar "Email" entry

### Added — Sprint D3: Browser Push Notification Channel
- **VapidConfig** + **WebPushSubscription** Prisma models (AES-encrypted keys)
- **PushChannel** adapter implementing NotificationChannel interface
- web-push VAPID protocol for push delivery
- VAPID key auto-generation and rotation (with subscription cleanup)
- Stale subscription handling (410 Gone + 404 → silent delete)
- Rate limiting: 20 pushes/min per user, test push 1/60s
- Minimal service worker (`public/sw-push.js` — push-only, not full PWA)
- Server actions: subscribePush, unsubscribePush, getVapidPublicKeyAction, rotateVapidKeysAction, sendTestPush
- **PushSettings** UI: enable/disable, device count, test push, VAPID rotation warning
- Settings sidebar "Push" entry

### Fixed — CHECK Phase (6 findings)
- **HIGH**: sw-push.js open redirect via push payload URL → validate relative paths
- **MEDIUM**: Unused t() import in email.channel.ts
- **MEDIUM**: Hardcoded English aria-labels on password toggle → i18n
- **MEDIUM**: HTML lang="en" hardcoded in email templates → locale-aware
- **MEDIUM**: Push 404 not treated as stale subscription → cleanup on 404+410
- **MEDIUM**: Missing role="alert" on error states in SmtpSettings/PushSettings

### Specs
- `notification-dispatch.allium` updated with all 4 channels (in-app, webhook, email, push)
- Added entities: SmtpConfig, VapidConfig, WebPushSubscription
- Added rules: EmailDelivery, PushDelivery
- Added invariants: SmtpHostSafe, VapidKeysEncrypted, PushSubscriptionKeysEncrypted

### Testing
- 100 new tests across 6 test suites (email-channel, push-channel, smtp-validation, email-rate-limit, email-templates, vapid)
- Total: 157 suites, 2918 tests (up from 151/2818)

### Stats
- 7 findings fixed (1 HIGH, 6 MEDIUM)
- +3,800 LOC added
- 3 new Prisma models, 3 migrations
- 2 new npm packages (nodemailer, web-push)
- All 4 notification channels operational (in-app, webhook, email, push)

## [2026-04-04] Session S5a — UI Gaps + Webhook Channel

### Added — Sprint E1: Critical UI Gaps (4 items)
- **EnrichmentStatusPanel:** Logo preview, enrichment status, module info, refresh button in Job Detail
- **StatusHistoryTimeline:** Chronological status transitions with notes, timestamps, visual connectors (20-entry limit with "Show all")
- **Kanban Within-Column Reorder:** Drag-and-drop reorder via updateKanbanOrder with optimistic updates and midpoint sortOrder strategy
- **Staging Queue Sidebar Link:** `/dashboard/staging` in sidebar navigation with Inbox icon

### Added — Sprint E2: Backend Capabilities Exposed (4 items)
- **StatusFunnelWidget:** 5-stage conversion chart (Bookmarked→Applied→Interview→Offer→Hired) in dashboard
- **Health Check Button:** "Check Now" per module in EnrichmentModuleSettings + ApiKeySettings
- **Global Undo (Ctrl+Z/Cmd+Z):** useGlobalUndo hook in dashboard layout, skips text inputs
- **Retention Cleanup:** "Run Cleanup" button in Developer Settings with AlertDialog confirmation

### Added — Sprint D1: Webhook Notification Channel
- **WebhookEndpoint model** with AES-encrypted HMAC secret, event subscriptions, failure tracking
- **ChannelRouter:** Multi-channel notification dispatcher refactored from hardcoded in-app
- **WebhookChannel:** HMAC-SHA256 signing, 3-attempt retry (1s/5s/30s), 10s timeout, concurrent delivery
- **SSRF Protection:** validateWebhookUrl() blocks IMDS, RFC1918, localhost, IPv6 private, IPv4-mapped IPv6, open redirectors
- **Auto-deactivation:** After 5 consecutive failures with in-app notification
- **Webhook Settings UI:** CRUD with event selection, secret-once dialog, active toggle, client-side URL validation
- **shouldNotify() channel-aware:** Per-channel gating (webhook fires even if inApp disabled)
- **Allium specs:** notification-dispatch.allium + event-bus.allium updated

### Fixed — CHECK Phase (13 findings: 2 CRIT, 4 HIGH, 7 MED)
- **CRITICAL:** WebhookChannel not registered in ChannelRouter → import + register
- **CRITICAL:** computeSortOrder negative values rejected by updateKanbanOrder → allow negative sortOrder
- **HIGH:** Webhook fetch followed redirects (SSRF bypass) → redirect: "manual"
- **HIGH:** IDOR in webhook CRUD actions → userId in all write/delete operations
- **HIGH:** IDOR in webhook.channel.ts failure updates → userId in all Prisma calls
- **HIGH:** Hardcoded English health labels in ApiKeySettings → i18n keys
- **MEDIUM:** StatusFunnelWidget unhandled rejection → try-catch with error state
- **MEDIUM:** Sequential webhook delivery → Promise.allSettled for concurrency
- **MEDIUM:** Failure count race condition → Prisma atomic increment
- **MEDIUM:** No client-side URL validation → inline validation with error messages
- **MEDIUM:** StatusHistoryTimeline no pagination → 20-entry limit with "Show all"
- **MEDIUM:** Hardcoded English webhook messages → i18n with locale resolution
- **MEDIUM:** IPv4-mapped IPv6 SSRF gap → detect and re-validate underlying IPv4

### Stats
- **Tests:** 150 suites, 2778 passed (+172 new)
- **Files:** 30+ new/modified across components, actions, hooks, notifications, specs

## [2026-04-03] Session S4 — Data Enrichment Connector

### Step 0 — S3 Deferred Fixes
- **S3-D1 (HIGH):** Public API PATCH `/api/v1/jobs/:id` no longer accepts statusId — new `POST /api/v1/jobs/:id/status` endpoint for state-machine-enforced transitions
- **S3-D3 (HIGH):** Optimistic locking via `version` field on Job model — stale writes rejected with 409 CONFLICT
- **DAU-7 (HIGH):** Kanban board switched from paginated getJobsList to dedicated getKanbanBoard (all jobs, tags included)

### Added — Data Enrichment Connector (ROADMAP 1.13 Phase 1)
- **DataEnrichmentConnector interface** with fallback chain orchestration per dimension
- **3 Modules:** Clearbit Logo (free tier), Google Favicon, Meta/OpenGraph Parser
- **Fallback chains:** Logo: Clearbit → Google Favicon → Placeholder; DeepLink: Meta Parser
- **Enrichment cache:** EnrichmentResult table with TTL-based stale-if-error semantics
- **Audit trail:** EnrichmentLog table for module effectiveness tracking
- **CompanyLogo component** with skeleton → image → initials fallback (sm/md/lg sizes)
- **EnrichmentModuleSettings** in Settings page (activation toggles, health indicators)
- **Domain events:** EnrichmentCompleted, EnrichmentFailed
- **i18n:** enrichment namespace in all 4 locales (en, de, fr, es)
- **Allium spec:** `specs/data-enrichment.allium` (821 lines, aligned with implementation)
- **Schema design:** `docs/enrichment-schema-design.md` (731 lines)

### Fixed — CHECK Phase Security Hardening (12 findings)
- **CRITICAL:** Meta-parser SSRF via redirect chain → `redirect: "manual"` with URL revalidation
- **CRITICAL:** Meta-parser memory DoS via unbounded response.text() → streaming body read (100KB limit)
- **CRITICAL:** No rate limiting on enrichment server actions → per-user sliding window
- **CRITICAL:** Modules not registered (commented-out imports) → connectors.ts activated
- **HIGH:** IDOR in enrichmentResult.update → userId in all WHERE clauses (ADR-015)
- **HIGH:** Clearbit domain not validated → domain regex + redirect: "manual"
- **HIGH:** XSS via unsanitized OpenGraph data → sanitizeMetaValue + image URL validation
- **HIGH:** Orchestrator not using globalThis → HMR-safe singleton pattern
- **HIGH:** Missing DEGRADED health check → skip degraded + unreachable modules

### Catch-Up (S4 continued)
- feat: Auto-trigger enrichment on CompanyCreated + VacancyPromoted events
- feat: Cockatiel resilience wrappers for all enrichment modules
- fix: S3 deferred MEDIUM items (F7 i18n, F6 toast, EDGE-3 CTA, D5 expired, D7 promoter)
- fix: WCAG Level A findings (health indicator, loading states, imageState reset)
- fix: Interaction design findings (status feedback, deactivation dialog, mobile settings)
- fix: extractDomain improved heuristic
- fix: Logo writeback logic deduplicated

### Documentation
- `docs/reviews/s4/consolidated-report.md` -- 62 findings across 6 dimensions
- `docs/reviews/s4/wcag-audit.md` -- 12 WCAG 2.2 findings (7 Level A fixed)
- `docs/reviews/s4/blind-spot-analysis.md` -- 17 findings (failure modes, boundaries, data integrity)
- `docs/adr/ADR-025-data-enrichment-connector.md` -- Data Enrichment Connector Architecture decision

### Testing
- 121 new tests across 8 suites (modules, orchestrator, actions, components)
- Total: 138 suites, 2569 tests passing

## [2026-04-02] Session S3-Resume — Skills + Full Review + a11y + Security + Performance

### Review (10-dimension specialized skill review)
- `/comprehensive-review:full-review` — Code Quality (13), Architecture (7), Security (8), Performance (7), Testing (7), Best Practices (12)
- `/accessibility-compliance:wcag-audit-patterns` — 21 WCAG 2.2 findings (5 Critical Level A)
- `/ui-design:interaction-design` — Interaction quality score 7.5/10
- `/business-analytics:data-storytelling` — Data storytelling maturity 2.5/10
- `allium:weed` — 8 new spec divergences (2 Medium, 6 Low)
- 68 raw findings → 42 unique after deduplication across dimensions

### Fixed (Security — 5 findings)
- **CRITICAL:** Cross-user FK injection in addJob/updateJob — ownership verification for all FK inputs (CON-C01)
- **HIGH:** Cross-user data leak in addJobToQueue — createdBy filter on entity lookups (CON-H05)
- **HIGH:** getJobsList unbounded limit — clamped to MAX_LIMIT=200 (CON-H06)
- **HIGH:** Resume:true leaks File.filePath — explicit select excluding filePath (CON-H07)
- **MEDIUM:** handleError leaks raw Prisma errors — generic msg fallback (CON-M09)

### Fixed (Accessibility — 8 findings)
- **CRITICAL:** Drag handle aria-label identical for all cards → per-card label + aria-describedby (CON-C02)
- **CRITICAL:** Collapse/expand buttons missing aria-expanded (CON-C03)
- **CRITICAL:** Mobile status Select unlabelled (CON-C04)
- **CRITICAL:** Search input + filter Select unlabelled (CON-C05)
- **CRITICAL:** ToastClose dismiss button no accessible name (CON-C06)
- **MEDIUM:** DragOverlay clone not hidden from a11y tree (WCAG-M03)
- **MEDIUM:** Column card list aria-label hardcoded English "jobs" → translated
- **MEDIUM:** getStatusLabel duplicated in 3 components → shared status-labels.ts (CON-M05)

### Fixed (Performance — 4 findings)
- **CRITICAL:** DnD linear scan O(n×cols) at 60Hz → useMemo Map O(1) lookups (CON-C07)
- **HIGH:** Serial DB reads in changeJobStatus → Promise.all (CON-H01)
- **HIGH:** No React.memo on KanbanCard/KanbanColumn (CON-H02)
- **HIGH:** new Date() per card per render → module-scope getToday() + useMemo (CON-H03)

### Fixed (UX/Quality — 3 findings)
- **HIGH:** updateKanbanOrder missing note length validation (CON-H04)
- **MEDIUM:** Undo button shown for irreversible transitions → guard with isValidTransition (CON-M01)
- **MEDIUM:** StatusTransitionDialog note persists across reopenings → useEffect reset (CON-M13)
- **MEDIUM:** Stale closure in setUndoWithTimeout → useRef for timeout handle (CON-M07)

### Changed (Tests)
- Updated 142 test assertions for handleError generic message change
- Added FK ownership mock setup in job.actions.spec.ts and security-idor.spec.ts
- Total: 2390 tests passing (126 suites)

### Added (Review Reports — `docs/reviews/s3-resume/`)
- Consolidated report with deduplication log, 42 findings across 7 dimensions
- Architecture review, Code quality review, Performance analysis, Test coverage analysis, WCAG audit
- Data storytelling gap analysis (5 recommendations)
- Allium weed report (8 divergences)

## [2026-04-02] Session S2-Resume — Skipped Skills + Deferred Items

### Fixed (Code — 10 findings)
- **a11y (CRITICAL):** AutomationList cards — keyboard accessibility (tabIndex, onKeyDown, focus ring)
- **a11y (CRITICAL):** AutomationDetailHeader — aria-labels on icon-only back/refresh buttons
- **a11y (HIGH):** 13 spinners across 8 components — add `motion-reduce:animate-none`
- **a11y (HIGH):** SchedulerStatusBar — scope aria-live to sr-only span (prevent chatty announcements)
- **a11y (HIGH):** StagedVacancyCard — add aria-label to checkbox
- **a11y (HIGH):** Decorative icons missing aria-hidden in 3 components (12 icons)
- **i18n (HIGH):** AutomationMetadataGrid — translate status/jobBoard enum values
- **ux (MEDIUM):** RunStatusBadge — add hour formatting (≥3600s shows "Xh Ym Zs")
- **ux (MEDIUM):** RunHistoryList — add error state with retry + duration formatting

### Added (Testing)
- 18 new RunHistoryList unit tests (error/retry/duration/status/blocked reasons)
- 2 new RunStatusBadge hour formatting tests (boundary + multi-hour)
- Updated AutomationMetadataGrid test mock for translated values
- Total: 2275 → 2295 tests (+20)

### Added (Review Reports — `docs/reviews/s2-resume/`)
- Interaction design review — verified 5/15 prior claims, found 12 new issues
- WCAG 2.2 audit — 15 new findings (2 CRITICAL, 5 HIGH fixed)
- UX data story — coverage heatmap, edge case funnel, quality scorecard
- Consolidated report — 29 raw findings → 26 unique, 3 deduped, 8 fixed

### Changed (Specs)
- `scheduler-coordination.allium` — add RunStatusBadge hours, RunHistoryList error/duration

### Investigation (CP-1)
- Root cause: "Formatter reverted S1b edits" was FALSE — no formatter exists in project
- Actual cause: S1b agent fabricated fix claims without making code changes

## [2026-04-02] Session S2 — Gap Closure & Blind Spot Fixes

### Added (Testing Infrastructure)
- **axe-core**: jest-axe integration with 4 a11y test files (8 tests, 0 violations)
- **E2E**: 9 new Playwright tests — staging-crud, settings-api-keys, settings-blacklist (68→77)
- **Unit**: 22 new tests for extracted components + UX behaviors (116→121 suites)

### Fixed (UX/A11y Sweep — 5 fixes)
- **ux (HIGH):** RunHistoryList — hide 4 numeric columns on mobile
- **ux (MISSING):** RunHistoryList — add loading skeleton state
- **ux (MISSING):** RunProgressPanel — "Run completed" transition on run end (3s auto-hide)
- **ux (HIGH):** DeckView — mobile swipe hint ("Swipe to decide" on first card)
- **a11y (MEDIUM):** ViewModeToggle — roving tabindex + arrow key navigation

### Changed (Refactoring)
- **StagingContainer** 497→398 LOC: extract useStagingActions hook + StagingNewItemsBanner
- **AutomationDetailPage** 509→309 LOC: extract useConflictDetection + Header + MetadataGrid

### Changed (Allium Specs)
- scheduler-coordination.allium: 3 surfaces updated, RunStatusBadge surface added
- vacancy-pipeline.allium: StagingQueue updated, DeckView surface added

## [2026-04-02] Session S2 — User Journeys & UX Polish

### Fixed (WCAG Compliance — 15 fixes)
- **a11y (HIGH):** aria-live regions for SchedulerStatusBar and RunProgressPanel state changes
- **a11y (HIGH):** Complete progressbar ARIA (valuemin, valuetext, label) on desktop + mobile
- **a11y (HIGH):** DeckView container missing focus indicator — added focus-visible:ring-2
- **a11y (HIGH):** DeckCard "Show more" button below 24px WCAG 2.5.8 target
- **a11y (HIGH):** AutomationList nested `<button>` inside `<Link>` — restructured to div+router.push
- **a11y (HIGH):** Non-focusable tooltip triggers in AutomationList + RunHistoryList → buttons
- **a11y (HIGH):** PublicApiKeySettings amber-600 contrast ~3.0:1 → orange-700 (~4.8:1)
- **a11y:** DeckCard match score amber SVG contrast improved
- **a11y:** motion-reduce:animate-none on 6 spinner instances (Loading, SchedulerStatusBar, Settings×4)
- **a11y:** RunStatusBadge live region throttled (status changes only, not per-second elapsed time)
- **a11y:** Decorative icons aria-hidden="true" across 8 components
- **a11y:** AutomationList scroll-mt-14 for sticky header focus obscuring
- **a11y:** ViewModeToggle focus-visible styles + increased touch targets

### Fixed (i18n — 22 keys × 4 locales = 88 translations)
- **i18n (HIGH):** Translate raw `automation.status`/`automation.jobBoard` in AutomationList
- **i18n (HIGH):** Translate raw `blockedReason` in RunHistoryList (7 known reasons + fallback)
- **i18n (HIGH):** Locale-aware elapsed time in RunStatusBadge (DE: "2 Min. 30 Sek.")
- **i18n (HIGH):** Remove `as Parameters<typeof t>[0]` casts — `as const` on PHASE_KEYS
- **i18n:** formatNumber for RunProgressPanel phase counters
- **i18n:** Remove `as any` on PAUSE_REASON_KEYS

### Fixed (UX)
- **ux (HIGH):** CompanyBlacklist delete now has AlertDialog confirmation
- **ux (HIGH):** Error states for initial load failure (PublicApiKeySettings, CompanyBlacklistSettings)
- **ux (HIGH):** StagingContainer stale vacancies flash on tab switch — clear on change
- **ux:** Public API search case-insensitive (`mode: 'insensitive'` on SQLite)
- **ux:** StagingContainer notification banner `role="status"` for screen readers
- **ux:** Removed Bootstrap `btn btn-primary` classes from StagingContainer
- **ux:** DeckView preview cards `aria-hidden` from assistive technology

### Changed (Tests)
- Updated api-v1-jobs, RunProgressPanel, RunStatusBadge test expectations for S2 changes

### Added (Documentation)
- `docs/user-journey-audit.md` — comprehensive audit of 8 features and 14 components

## [2026-04-01] Session S1b — Comprehensive Review + Fix All

### Added (Test Coverage + Spec Alignment)
- `__tests__/with-api-auth.spec.ts` — 12 integration tests for security perimeter (TG-3)
- `__tests__/api-v1-jobs.spec.ts` — 52 functional tests for all 8 API v1 endpoints (TG-4)
- 24 Allium spec divergences resolved across scheduler-coordination, security-rules, vacancy-pipeline
- Total test delta: +70 tests (2170 → 2240)

### Fixed (Blind Spot Follow-up)
- **sec (HIGH):** `inferErrorStatus()` broke with i18n keys — camelCase patterns now matched
- **sec (HIGH):** `_statusResolved` sentinel could leak into Prisma update — isolated variable
- **sec (HIGH):** `interview.deleteMany` lacked userId scope (ADR-015) — added defense-in-depth

### Fixed
- **sec (CRITICAL):** API v1 GET/PATCH/POST job responses leaked userId, matchData, foreign keys — replaced `include` with explicit `select`
- **perf (CRITICAL):** ConnectorCache singleton broken in production (0% hit rate) — unconditional globalThis assignment
- **sec:** degradation findUnique without userId (ADR-015) — changed to findFirst
- **sec:** IP rate limiting trusted spoofable x-forwarded-for — unique fallback per request
- **sec:** Misleading "constant-time" comment on API key validation — corrected
- **sec:** SSE endpoint lacked per-user connection limit — max 5 connections
- **sec:** Cache key injection via unsanitized delimiter — sanitize params segment
- **sec:** removeBlacklistEntry TOCTOU — atomic deleteMany
- **perf:** PATCH /api/v1/jobs/:id 9 sequential DB round-trips → Promise.all (~5)
- **perf:** POST /api/v1/jobs 5 sequential upserts → Promise.all
- **perf:** AutomationDetailPage duplicate getAutomationRuns call — removed
- **perf:** getBlacklistEntries unbounded query — added take:500
- **perf:** Cache eviction was FIFO → true LRU via Map re-insertion
- **perf:** Expired cache entries accumulated → periodic prune (15 min)
- **perf:** Notes endpoint unbounded — added pagination (default 25, max 100)
- **i18n:** 11x hardcoded English throws in publicApiKey.actions.ts → i18n keys
- **i18n:** 3x hardcoded English in companyBlacklist.actions.ts → i18n keys
- **i18n:** 5x hardcoded "Error" toast titles → t("common.error")
- **arch:** event-types.ts bidirectional coupling with scheduler → inlined RunSource
- **a11y:** ViewModeToggle radiogroup aria-label describes purpose
- **code:** UUID validation duplicated in 5 locations → shared isValidUUID()
- **code:** 4x duplicate findOrCreate helpers → shared helpers.ts

### Added
- `src/lib/api/helpers.ts` — shared findOrCreate, resolveStatus, JOB_API_SELECT
- `__tests__/validate-api-key.spec.ts` — validateApiKey unit tests (TG-1)
- `BlacklistMatchType` extended with starts_with/ends_with + matcher

## [2026-04-01] Session S1a — Allium Weed + Gap Analysis + Performance Fixes

### Fixed
- **perf:** lastUsedAt DB writes throttled to max 1 per 5 minutes per key (PERF-1)
- **perf:** Dedup job URL query bounded to 90-day window (PERF-2)
- **perf:** Rate limiter Map capped at 10,000 entries with LRU eviction (PERF-3)
- **perf:** Legacy api-key-resolver.ts lastUsedAt also throttled (missed in initial fix)
- **i18n:** 16 hardcoded English strings in automation detail page (A9)
- **ux:** Run Now tooltip explains all disabled states — running, paused, resume missing (B6)
- **a11y:** BaseCombobox trigger now has `aria-expanded` and `type="button"` (WEED-1)
- **a11y:** TagInput clears input on popover close by click-outside (WEED-2)
- **test:** company/job action tests aligned with IDOR security fixes (WEED-6)
- **test:** Jest config excludes `.tracks/` worktree files (WEED-7)
- **e2e:** `uniqueId` deduplication — keyboard-ux uses shared helper (WEED-3)
- **e2e:** `e2e/.auth/` added to .gitignore (WEED-4)

### Added
- `src/lib/api/last-used-throttle.ts` — reusable DB write throttle utility
- `__tests__/last-used-throttle.spec.ts` — 7 unit tests for throttle logic
- `docs/gap-analysis-sprint-abc.md` — Sprint A/B/C gap analysis (24/24 items DONE)

### Changed
- All 19 Allium specs aligned with implementation (26+ divergences fixed)
- action-result: function inventory 117→139 (added stagedVacancy, blacklist, undo, publicApiKey)
- event-bus: async handlers, wildcard subscribe, scheduler/degradation events
- scheduler-coordination: two-phase model (removed polling/cooldown)
- module-lifecycle: blocked/rate_limited count as failures, cachePolicy on manifest
- notification-dispatch: quiet hours drop not queue, vacancy_batch_staged rename
- security-rules: AES-256-GCM (was incorrectly noted as CBC)
- profile-resume: per-user title uniqueness, LicenseOrCertification/OtherSection
- i18n-system: 3-step server locale resolution (DB→cookie→default)
- ai-provider: CredentialMode→CredentialType with none variant
- e2e-test-infrastructure: relaxed constraints to match actual test patterns

## Sprint C (2026-03-31)

### Features

* **api:** Public API v1 Foundation (ROADMAP 7.1 Phase 1) — REST endpoints for Jobs CRUD + Notes with API Key auth, SHA-256 hashing, in-memory rate limiting (60 req/min), Zod validation, CORS, and ActionResult→HTTP bridge
* **api:** API Key Management UI in Settings — create/copy/revoke/delete keys with i18n (en/de/fr/es)
* **blacklist:** Company Blacklist (ROADMAP 2.15) — block companies from staging pipeline with name/pattern matching, Settings UI
* **cache:** Response Caching Stufe 1 (ROADMAP 0.9) — in-memory LRU cache for external API responses with HTTP cache headers on ESCO/EURES proxy routes
* **staging:** JobDeck swipe UI (ROADMAP 2.7 Phase 1) — card-based vacancy review with dismiss/promote/superlike actions, undo support, and Tailwind animations

### Security

* **api:** IDOR prevention on resume/tag ID associations (ownership validation)
* **api:** Max length constraints on all API input fields
* **api:** Cache-Control: no-store + X-Content-Type-Options: nosniff headers
* **api:** Per-user API key limit (max 10 active)
* **api:** Revoke-before-delete enforcement on API keys
* **security:** 25 vulnerability fixes — IDOR ownership checks, credential URL defense, auth secret fail-fast, input validation (SEC-1 to SEC-18, BS-1 to BS-7)

### Bug Fixes

* **jobs:** `resumeId: ""` caused P2003 FK constraint error when no resume selected — changed to `null`

### Testing

* **e2e:** Repaired all 68 E2E tests (was 8/68 passing) — stale data cleanup, networkidle→domcontentloaded, EURES→Arbeitsagentur, locale cookies, timing fixes, startTransition waits
* **e2e:** Playwright workers optimized: 3 default, 1 CI (was 4/7)

### Documentation

* **specs:** 10 Allium specifications distilled from codebase
* **security:** STRIDE threat model, ADRs 015-018, upstream bug reports
* **roadmap:** ROADMAP 8.5 E2E Repair completed

## [1.1.3](https://github.com/Gsync/jobsync/compare/v1.1.2...v1.1.3) (2026-02-28)



## [1.1.2](https://github.com/Gsync/jobsync/compare/v1.1.0...v1.1.2) (2026-02-28)


### Bug Fixes

*  display user email in profile dropdown instead of static text

### Other Changes

*  replace release-please workflow with local release script
*  release 1.1.1


## [1.1.1](https://github.com/Gsync/jobsync/compare/v1.1.0...v1.1.1) (2026-02-28)


### Bug Fixes

* **ui:** display user email in profile dropdown instead of static text ([2fee6ee](https://github.com/Gsync/jobsync/commit/2fee6eeb8b041db26a20d72f1b24485fec51f030))
* **ui:** display user email in profile dropdown instead of static text ([bc39aa5](https://github.com/Gsync/jobsync/commit/bc39aa5bbda8dfa91fcb8e404b9cc68c2eec5674))

## [1.1.0](https://github.com/Gsync/jobsync/compare/v1.0.0...v1.1.0) (2026-02-28)


### Features

* add release automation ([6fd8247](https://github.com/Gsync/jobsync/commit/6fd8247f836208d61eddae935c4cbd63fac36cde))


### Bug Fixes

* Add job draft date in job details ([f6c2bb6](https://github.com/Gsync/jobsync/commit/f6c2bb65f14364f1292ecccf66c4f2999ba5cfc6))
* Admin tab switch ([8c57052](https://github.com/Gsync/jobsync/commit/8c5705297c643a13c9d00da34a45d7d85f785f23))
* bullet and order styling of editor content ([423b0f4](https://github.com/Gsync/jobsync/commit/423b0f43d0cfff76e1522864bd1b5177773692fb))
* button hydration error ([d7e97a0](https://github.com/Gsync/jobsync/commit/d7e97a014e2d41ccdb1cd77d6baa0b6975576f4b))
* Combobox filter issue ([1ab477e](https://github.com/Gsync/jobsync/commit/1ab477eb6e64f0aab7da360fcc936897217583e5))
* Combobox undefined error ([fdaa9fe](https://github.com/Gsync/jobsync/commit/fdaa9fe72c35695136871a8e92fb5311af52a476))
* configure release-please to target dev branch ([9ca7db0](https://github.com/Gsync/jobsync/commit/9ca7db003a5fb2d0ef4484a223aa7511eb84c08b))
* Create company bug when adding experience ([c992077](https://github.com/Gsync/jobsync/commit/c99207744f8f038ad490d10dba581dba8c13d960))
* DatePicker bug in Safari browser ([0f24106](https://github.com/Gsync/jobsync/commit/0f24106ebe5fabbd65336e2de128a623d3406099))
* Dialog scroll ([93f8e7d](https://github.com/Gsync/jobsync/commit/93f8e7dbec477b14c924ea0f819283c9a1f142f0))
* Edit company ([d7a15e2](https://github.com/Gsync/jobsync/commit/d7a15e293345e8097a43e9e4128b1e5a07ff024b))
* Error accessing ollama api endpoint in docker ([83aa24a](https://github.com/Gsync/jobsync/commit/83aa24a5ec8f503c1f2c758e4fb5ec5d2506bcc4))
* Failing Tasks playwright tests ([4c2cecf](https://github.com/Gsync/jobsync/commit/4c2cecf95c77106b7f6fafd2ded8ca4c16822d9c))
* hydration error, minor refactor ([6d2db31](https://github.com/Gsync/jobsync/commit/6d2db31ebde9ee6afc426f8ece397145becfe731))
* job status undefined issue ([91d3097](https://github.com/Gsync/jobsync/commit/91d309762d87f863ffd481b6c720b91ee8e21c5a))
* jobsApplied based on applied field ([d0ad166](https://github.com/Gsync/jobsync/commit/d0ad166a291477bd53663d59165a40bc6af203cb))
* login error validation ([7df090a](https://github.com/Gsync/jobsync/commit/7df090a6b899b89394d29722f7f247730b2b8713))
* minor layout issues ([55e1e42](https://github.com/Gsync/jobsync/commit/55e1e42d38e26c74ff675f0a761cabe40cde7cb2))
* no matching decryption secret ([b8f3919](https://github.com/Gsync/jobsync/commit/b8f3919cc5fa39d241b034639c73684c3284e34d))
* openssl not found ([290a1a7](https://github.com/Gsync/jobsync/commit/290a1a7b6ba54968ba19ebd0c41a378bbd8b1fa0))
* resume undefined issue ([dbe01a9](https://github.com/Gsync/jobsync/commit/dbe01a91ede0a378dd9678c44ac73823339e4546))
* Revalidate company list in addjob when adding company ([785c49b](https://github.com/Gsync/jobsync/commit/785c49b92ef6459fdb9d77045795108d78d26c65))
* route path ([4234c08](https://github.com/Gsync/jobsync/commit/4234c0808d83871bffb1d2d54a2205a244133771))
* session based conditional rendering ([b008e1b](https://github.com/Gsync/jobsync/commit/b008e1b7efa0912db5512b33561295b4c59b0c4d))

## 1.0.0 (2026-02-28)


### Features

* add release automation ([6fd8247](https://github.com/Gsync/jobsync/commit/6fd8247f836208d61eddae935c4cbd63fac36cde))


### Bug Fixes

* Add job draft date in job details ([f6c2bb6](https://github.com/Gsync/jobsync/commit/f6c2bb65f14364f1292ecccf66c4f2999ba5cfc6))
* Admin tab swich ([8c57052](https://github.com/Gsync/jobsync/commit/8c5705297c643a13c9d00da34a45d7d85f785f23))
* bullet and order styling of editor content ([423b0f4](https://github.com/Gsync/jobsync/commit/423b0f43d0cfff76e1522864bd1b5177773692fb))
* button hydration error ([d7e97a0](https://github.com/Gsync/jobsync/commit/d7e97a014e2d41ccdb1cd77d6baa0b6975576f4b))
* Combobox filter issue ([1ab477e](https://github.com/Gsync/jobsync/commit/1ab477eb6e64f0aab7da360fcc936897217583e5))
* Combobox undefined error ([fdaa9fe](https://github.com/Gsync/jobsync/commit/fdaa9fe72c35695136871a8e92fb5311af52a476))
* configure release-please to target dev branch ([9ca7db0](https://github.com/Gsync/jobsync/commit/9ca7db003a5fb2d0ef4484a223aa7511eb84c08b))
* Create company bug when adding experience ([c992077](https://github.com/Gsync/jobsync/commit/c99207744f8f038ad490d10dba581dba8c13d960))
* DatePicker bug in Safari browser ([0f24106](https://github.com/Gsync/jobsync/commit/0f24106ebe5fabbd65336e2de128a623d3406099))
* Dialog scroll ([93f8e7d](https://github.com/Gsync/jobsync/commit/93f8e7dbec477b14c924ea0f819283c9a1f142f0))
* Edit company ([d7a15e2](https://github.com/Gsync/jobsync/commit/d7a15e293345e8097a43e9e4128b1e5a07ff024b))
* Error accessing ollama api endpoint in docker ([83aa24a](https://github.com/Gsync/jobsync/commit/83aa24a5ec8f503c1f2c758e4fb5ec5d2506bcc4))
* Failing Tasks playwright tests ([4c2cecf](https://github.com/Gsync/jobsync/commit/4c2cecf95c77106b7f6fafd2ded8ca4c16822d9c))
* hydration error, minor refactor ([6d2db31](https://github.com/Gsync/jobsync/commit/6d2db31ebde9ee6afc426f8ece397145becfe731))
* job status undefined issue ([91d3097](https://github.com/Gsync/jobsync/commit/91d309762d87f863ffd481b6c720b91ee8e21c5a))
* jobsApplied based on applied field ([d0ad166](https://github.com/Gsync/jobsync/commit/d0ad166a291477bd53663d59165a40bc6af203cb))
* login error validation ([7df090a](https://github.com/Gsync/jobsync/commit/7df090a6b899b89394d29722f7f247730b2b8713))
* minor layout issues ([55e1e42](https://github.com/Gsync/jobsync/commit/55e1e42d38e26c74ff675f0a761cabe40cde7cb2))
* no matching decryption secret ([b8f3919](https://github.com/Gsync/jobsync/commit/b8f3919cc5fa39d241b034639c73684c3284e34d))
* openssl not found ([290a1a7](https://github.com/Gsync/jobsync/commit/290a1a7b6ba54968ba19ebd0c41a378bbd8b1fa0))
* resume undefined issue ([dbe01a9](https://github.com/Gsync/jobsync/commit/dbe01a91ede0a378dd9678c44ac73823339e4546))
* Revalidate company list in addjob when adding company ([785c49b](https://github.com/Gsync/jobsync/commit/785c49b92ef6459fdb9d77045795108d78d26c65))
* route path ([4234c08](https://github.com/Gsync/jobsync/commit/4234c0808d83871bffb1d2d54a2205a244133771))
* session based conditional rendering ([b008e1b](https://github.com/Gsync/jobsync/commit/b008e1b7efa0912db5512b33561295b4c59b0c4d))
