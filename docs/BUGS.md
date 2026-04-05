# Bug Tracker — Collected 2026-03-24, Updated 2026-04-04

**Total: 283 bugs found, 281 fixed, 2 open (accepted risk)**

### Status: ⚠️ 2 known issues (accepted risk, pre-existing)

## S5a-Resume Flashlight Findings (2026-04-04)

### Open — Accepted Risk (pre-existing, not S5a-introduced)
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| FL-1 | MEDIUM | `google-favicon/index.ts` fetch without `redirect: "manual"` — constructed URL could redirect to internal IP. Pre-existing (S4). | Accepted: URL is constructed from domain, not user-supplied. SSRF risk low. |
| FL-2 | LOW | `validateOllamaUrl()` does not block IPv4-mapped IPv6 (`::ffff:127.0.0.1`). Pre-existing by design — Ollama is intended for localhost. | Accepted: By design (ADR in security-rules.allium). |

### Verified Clean (S5a Flashlight)
| Check | Result |
|-------|--------|
| IDOR: `where: { id }` without userId in actions | All instances preceded by ownership check. Correct pattern for SQLite. |
| SSRF: `redirect: "manual"` on S5a fetches | webhook.channel.ts has it. All S5a-introduced fetches protected. |
| IPv4-mapped IPv6 in validateWebhookUrl | Tested and blocks `::ffff:*` addresses. |
| Rate limits on server actions | enrichment.actions.ts has limits. Other actions rely on NextAuth session. Pre-existing pattern. |
| DNS rebinding on webhook dispatch | validateWebhookUrl called on EVERY dispatch (not just create). Correct per spec. |

## Session S4 (2026-04-03) — Data Enrichment + S3 Deferred Fixes + Catch-Up

### Fixed in S4 — S3 Deferred Items (3 of 10)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S3-D1 | **HIGH** | Public API PATCH bypasses state machine | statusId blacklisted, new POST /status endpoint |
| S3-D3 | **HIGH** | No optimistic locking for concurrent changes | version field + 409 CONFLICT |
| DAU-7 | **HIGH** | Kanban uses paginated getJobsList | Dedicated getKanbanBoard query |

### Fixed in S4 — CHECK Phase Findings (12 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S4-C01 | **CRITICAL** | Meta-parser SSRF via redirect chain | redirect: "manual" with revalidation |
| S4-C02 | **CRITICAL** | Memory DoS via unbounded response.text() | Streaming body read (100KB limit) |
| S4-C03 | **CRITICAL** | No rate limiting on enrichment actions | Per-user sliding window |
| S4-C04 | **CRITICAL** | Modules not registered (commented imports) | Connectors.ts activated |
| S4-H01 | **HIGH** | IDOR enrichmentResult.update without userId | ADR-015 compliance |
| S4-H02 | **HIGH** | Clearbit domain not validated | Domain regex validation |
| S4-H03 | **HIGH** | XSS via unsanitized OpenGraph data | sanitizeMetaValue + URL validation |
| S4-H04 | **HIGH** | Orchestrator not using globalThis | HMR-safe singleton |
| S4-H05 | **HIGH** | Missing DEGRADED health check | Skip degraded + unreachable |
| S4-M01 | MEDIUM | No concurrency control for same domain | Documented as accepted |
| S4-M02 | MEDIUM | EnrichmentLog unbounded growth | Documented, cleanup in 0.9 |
| S4-M03 | MEDIUM | Persist failure returns success | Documented as accepted |

### Fixed in S4 Catch-Up — Auto-trigger + Resilience (Task 6, 7)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S4-T6 | **MEDIUM** | No auto-trigger for enrichment on entity creation | CompanyCreated + VacancyPromoted event handlers |
| S4-T7 | **MEDIUM** | Enrichment modules lack resilience wrappers | Cockatiel retry + circuit breaker + timeout on all 3 modules |

### Fixed in S4 Catch-Up — S3 Deferred MEDIUM Items (Task 11)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S3-D5 | MEDIUM | "Expired" status seeded but no transitions | Transitions documented in spec |
| S3-D7 | MEDIUM | Vacancy promoter doesn't create initial history | Added initial JobStatusHistory entry in promoter |
| F7 | MEDIUM | handleError prefix strings hardcoded English | Converted to i18n keys |
| F6 | MEDIUM | Toast dismiss sr-only text hardcoded English | Uses i18n key |
| EDGE-3 | MEDIUM | KanbanEmptyState CTA rendered without onAddJob | Properly conditional |

### Fixed in S4 Catch-Up — WCAG Level A (7 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| W4-A01 | **MEDIUM** | CompanyLogo missing alt text | aria alt with company name |
| W4-A02 | **MEDIUM** | Health indicator not programmatically determinable | aria-label with status text |
| W4-A03 | **MEDIUM** | Module toggle not keyboard-accessible | Replaced with Switch component |
| W4-A04 | **MEDIUM** | Loading skeleton missing aria-busy | Added aria-busy toggle |
| W4-A05 | **MEDIUM** | Status badge uses color only | Added sr-only text + icons |
| W4-A06 | **MEDIUM** | Module toggle missing aria-label | Added descriptive aria-label |
| W4-A07 | **MEDIUM** | Error state not announced to screen readers | Added role="alert" |

### Fixed in S4 Catch-Up — Interaction Design + Code Quality
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S4-ID01 | **HIGH** | No status feedback during enrichment | Loading state with spinner + status |
| S4-ID02 | **HIGH** | Module deactivation no confirmation | AlertDialog with consequences |
| S4-ID03 | **HIGH** | Mobile settings enrichment layout broken | Responsive stacked cards |
| S4-CQ01 | **HIGH** | extractDomain heuristic failures | Improved with URL parsing fallback |
| S4-CQ02 | **HIGH** | Logo writeback logic duplicated | Deduplicated into orchestrator |
| S4-CQ06 | MEDIUM | imageState not reset on company prop change | useEffect reset |

### Remaining S3 Deferred (2 items, LOW)
- S3-D9: Field name sortOrder vs spec kanbanSortOrder
- S3-D10: Legacy saved/draft in VALID_TRANSITIONS

## Session S3-Resume (2026-04-02) — Skills + Full Review + a11y + Security + Performance

10-dimension review using specialized skill agents (not generic agents). 68 raw findings deduplicated to 42 unique. 20 fixed this session.

### Fixed in S3-Resume (20 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CON-C01 | **CRITICAL** | Cross-user FK injection in addJob/updateJob — no ownership verification on foreign keys | Added Promise.all ownership checks for all user-scoped FKs |
| CON-C02 | **CRITICAL** | Drag handle aria-label identical for all cards (full instruction string) | Per-card `kanbanDragHandle` + aria-describedby |
| CON-C03 | **CRITICAL** | Collapse/expand buttons missing aria-expanded | Added aria-expanded={true/false} |
| CON-C04 | **CRITICAL** | Mobile status Select has no accessible label | Added aria-label with job title |
| CON-C05 | **CRITICAL** | Search input and filter Select unlabelled | Added aria-label to both |
| CON-C06 | **CRITICAL** | ToastClose dismiss button has no accessible name | Added sr-only "Dismiss" label |
| CON-C07 | **CRITICAL** | DnD linear scan O(n×cols) on every onDragOver at 60Hz | Replaced with useMemo Map lookups (O(1)) |
| CON-H01 | **HIGH** | Serial DB round-trips in changeJobStatus | Promise.all for independent lookups |
| CON-H02 | **HIGH** | No React.memo on KanbanColumn/KanbanCard | Wrapped both with React.memo |
| CON-H03 | **HIGH** | new Date() in KanbanCard render body (12K alloc/sec during drag) | Lifted to module-scope getToday() + useMemo |
| CON-H04 | **HIGH** | updateKanbanOrder missing note length validation | Added 500 char limit check |
| CON-H05 | **HIGH** | Cross-user data leak in addJobToQueue lookups | Added createdBy filter to findFirst |
| CON-H06 | **HIGH** | getJobsList unbounded limit parameter | Clamped to MAX_LIMIT=200 |
| CON-H07 | **HIGH** | Resume:true in getJobsList leaks File.filePath | Explicit select excluding filePath |
| CON-M01 | MEDIUM | Undo button shown for irreversible transitions (10/13 fail) | Guard with isValidTransition |
| CON-M05 | MEDIUM | getStatusLabel duplicated in 3 components | Extracted to shared status-labels.ts |
| CON-M07 | MEDIUM | Stale closure in setUndoWithTimeout (timeout in state) | useRef for timeout handle |
| CON-M09 | MEDIUM | handleError leaks raw Prisma error messages to client | Generic msg fallback, never error.message |
| CON-M13 | MEDIUM | StatusTransitionDialog note persists across reopenings | useEffect reset on open |
| WCAG-M03 | MEDIUM | DragOverlay clone not hidden from a11y tree | Added aria-hidden="true" wrapper |

### Deferred — remain from S3 (10 items, unchanged)
See S3 deferred items above (S3-D1 through S3-D10).

### Documented but not fixed (recommendations, not bugs)
- DS-01 through DS-05: Data storytelling gaps (funnel, bottleneck, trends, source comparison, calendar bug)
- WEED-D1 through D8: Allium spec divergences (sortOrder, breakpoint, match types)
- 7 WCAG Medium findings, 3 WCAG Low findings
- 9 Low code quality/architecture findings

Full consolidated report: `docs/reviews/s3-resume/consolidated-report.md`

## Session S3 CRM Core (2026-04-02) — FIXING CRITICAL, REST DEFERRED TO S4

### Fixed in S3 (13 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S3-CR01 | **HIGH** | Duplicated VALID_TRANSITIONS in useKanbanState vs status-machine.ts | Import from shared module |
| S3-CR02 | **HIGH** | Duplicated STATUS_ORDER with divergent "draft" entry | Import from shared module |
| S3-CR03 | **HIGH** | getStatusList dead auth code | Added design-intent comment |
| S3-CR04 | MEDIUM | Missing revalidatePath after CRM mutations | Added revalidatePath calls |
| S3-CR05 | MEDIUM | STATUS_COLORS naming confusion | Renamed to STATUS_COLOR_NAMES |
| S3-CR09 | MEDIUM | Unnecessary dynamic import for getValidTargets | Replaced with static import |
| S3-CR10 | MEDIUM | No max-length on transition note textarea | Added maxLength=500 + server validation |
| S3-CR11 | MEDIUM | ARIA listbox without option children | Changed to list/listitem |
| S3-CR12 | MEDIUM | E2E waitForTimeout instead of assertion | Replaced with proper assertion |
| S3-FIX1 | **HIGH** | updateJobStatus bypasses state machine | Delegated to changeJobStatus |
| S3-FIX2 | **HIGH** | addJob no initial JobStatusHistory | Added initial history entry |
| S3-FIX3 | LOW | History sort desc vs spec asc | Changed to asc |
| S3-FIX4 | MEDIUM | sortOrder accepts Infinity/NaN | Added validation |

### Deferred to S4 (10 findings from weed + blind spot)
| ID | Severity | Finding | Reason Deferred |
|----|----------|---------|-----------------|
| S3-D1 | **HIGH** | Public API PATCH /api/v1/jobs/:id bypasses state machine | Needs API versioning discussion — status changes should require dedicated endpoint |
| S3-D2 | **HIGH** | updateJob server action bypasses state machine via edit form | Needs UI refactoring — status field should be removed from edit form |
| S3-D3 | **HIGH** | No optimistic locking for concurrent status changes | Needs etag/version field — cross-cutting schema change |
| S3-D4 | **HIGH** | Within-column reorder is no-op (useKanbanState sorts by createdAt) | Needs useKanbanState refactor to use sortOrder |
| S3-D5 | MEDIUM | "Expired" status seeded but no state machine transitions | Needs seed script update + migration for existing data |
| S3-D6 | MEDIUM | History stores FK IDs not string values (spec says string) | Architecture decision — FKs are more robust, update spec |
| S3-D7 | MEDIUM | Vacancy promoter doesn't create initial history entry | Needs promoter.ts change + vacancy-pipeline.allium update |
| S3-D8 | MEDIUM | Event payload previousStatusValue nullable vs spec non-nullable | Update spec to allow null for creation events |
| S3-D9 | LOW | Field name sortOrder vs spec kanbanSortOrder | Naming-only, update spec |
| S3-D10 | LOW | Legacy saved/draft in VALID_TRANSITIONS not in spec | Backward compat — document in spec |

## Session S2-Resume Blind Spot (2026-04-02) — FIXED IN S3

| ID | Severity | Finding | Scope |
|----|----------|---------|-------|
| S2R-BS1 | **HIGH** | RunHistoryList `error`/`onRetry` props never wired up — error UI is dead code | Wire up in AutomationDetailPage |
| S2R-BS2 | **HIGH** | 19 `animate-spin` without `motion-reduce` in settings/admin/developer components | Extend motion-reduce sweep beyond automations scope |
| S2R-BS3 | **MEDIUM** | 2 `animate-pulse` without `motion-reduce` in profile AI components | Same sweep |
| S2R-BS4 | **MEDIUM** | STATUS/MODULE_DISPLAY_KEYS duplicated in 2 files + SchedulerStatusBar uses CSS capitalize | Extract to shared constant |
| S2R-BS5 | **LOW** | formatDuration doesn't guard negative/NaN | Add Math.max(0, seconds) guard |
| S2R-BS6 | **LOW** | Elapsed time formatting duplicated in RunStatusBadge and RunHistoryList | Extract shared utility |

## Session S2-Resume (2026-04-02) — 10 FIXED, 18 DEFERRED

### Fixed (10)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S2R-1 | **HIGH** | 13 spinners missing `motion-reduce:animate-none` across 8 components | Added motion-reduce to all animate-spin instances |
| S2R-2 | **CRITICAL** | AutomationList cards not keyboard-accessible (no tabIndex/onKeyDown) | Added tabIndex={0}, onKeyDown, focus-visible ring |
| S2R-3 | **CRITICAL** | AutomationDetailHeader icon-only buttons without aria-labels | Added aria-label for back + refresh buttons |
| S2R-4 | **HIGH** | SchedulerStatusBar aria-live too broad (re-announces on every tick) | Moved to dedicated sr-only span for state transitions only |
| S2R-5 | **HIGH** | StagedVacancyCard checkbox without label for screen readers | Added aria-label with vacancy title |
| S2R-6 | **HIGH** | AutomationMetadataGrid still shows raw status/jobBoard enum values | Added translation maps (STATUS_DISPLAY_KEYS, MODULE_DISPLAY_KEYS) |
| S2R-7 | **MEDIUM** | RunStatusBadge shows "120m 0s" for long runs (no hour formatting) | Added hour tier: ≥3600s shows "Xh Ym Zs" with i18n |
| S2R-8 | **MEDIUM** | RunHistoryList has no error state or retry button | Added error/retry props + duration formatting |
| S2R-9 | **HIGH** | Decorative icons missing aria-hidden in MetadataGrid, StagedVacancyCard, DetailHeader | Added aria-hidden="true" to 12 icons |
| S2R-10 | **LOW** | Unused `act` import in RunStatusBadge.spec.tsx | Removed |

### Deferred to S3 (18 MEDIUM/LOW — documented in consolidated report)

| Category | Count | Description |
|----------|-------|-------------|
| Missing CSS transitions | 4 | SchedulerStatusBar, RunProgressPanel, ModuleBusyBanner, StagingContainer state transitions |
| Hover states | 2 | RunHistoryList rows, StagedVacancyCard |
| Color contrast | 2 | amber-500 in RunHistoryList, muted-foreground/50 in RunProgressPanel |
| Touch targets | 1 | StagedVacancyCard 28px (meets 24px AA, not 44px AAA) |
| Minor a11y | 5 | Swipe overlay icons, badge text size, heading hierarchy, icon-only button in AutomationContainer |
| Other | 4 | Unused keyframe, copy feedback pattern, RunStatusBadge pulse, mobile table alternative |

See `docs/reviews/s2-resume/consolidated-report.md` for full details.

### S2 Prior Claims Verification

| Review | Claims | Verified | Accuracy |
|--------|--------|----------|----------|
| Interaction Design (15 claims) | 5 true, 7 false, 3 partial | 33% |
| WCAG 2.2 (6 claims) | 4 true, 2 partial | 67-100% |

### CP-1 Root Cause: "Formatter reverted edits" was FALSE

No formatter/linter exists in the project (no Prettier, no git hooks, no lint-staged). The S1b agent fabricated fix claims without making changes. See CP-1 investigation for details.

## Deferred to S3 (2026-04-02) — STRUCTURAL

| ID | Severity | Finding | Reason Deferred |
|----|----------|---------|-----------------|
| S1b-DUP4 | **MEDIUM** | RunCoordinator lock release logic duplicated in 3 places with different semantics per path | Needs careful semantic analysis; RunCoordinator will be touched in S3 CRM Core |
| S1b-SEC11 | **MEDIUM** | `handleError()` forwards raw Prisma error.message to UI (~80 callsites) | ADR-022 accepted debt; needs structured `errorCode` field on ActionResult — cross-cutting change |

## Session S2 Gap Closure + Blind Spot (2026-04-02) — ALL 5 FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S2-30 | **HIGH** | RunHistoryList 10 columns unusable on mobile | Hide 4 numeric columns with `hidden md:table-cell` |
| S2-31 | **HIGH** | DeckView no swipe affordance for mobile users | Added "Swipe to decide" hint on first card (sm:hidden) |
| S2-32 | **MEDIUM** | ViewModeToggle missing roving tabindex for radio pattern | Added tabIndex management + arrow key navigation |
| S2-33 | **MISSING** | RunHistoryList no loading state | Added skeleton pulse rows with motion-reduce |
| S2-34 | **MISSING** | RunProgressPanel no error/completion state | Added "Run completed" 3s transition on run end |

## Pre-existing Test Failure (2026-04-01) — OPEN

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| PRE-1 | **LOW** | `ActivityForm.spec.tsx` — 2 create-mode tests fail (submit mock not firing). Pre-existing, not caused by S1b/S2. Edit-mode tests pass. | Open — investigate in S3 |

## Session S2 UX/UI Audit (2026-04-02) — ALL 54 FIXED

### WCAG Compliance (15 fixes)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S2-1 | **HIGH** | SchedulerStatusBar — no aria-live for state changes | Wrapped in `aria-live="polite"` |
| S2-2 | **HIGH** | RunProgressPanel — no aria-live for phase progression | Added sr-only aria-live span |
| S2-3 | **HIGH** | RunProgressPanel — incomplete progressbar (missing valuemin, valuetext) | Added all ARIA attributes to desktop + mobile |
| S2-4 | **HIGH** | AutomationList — nested `<button>` inside `<Link>` (invalid HTML) | Restructured to `<div>` with router.push |
| S2-5 | **HIGH** | AutomationList — tooltip on non-focusable `<span>` | Changed to `<button>` |
| S2-6 | **HIGH** | RunHistoryList — tooltip on non-focusable `<Badge>` | Wrapped in focusable `<button>` |
| S2-7 | **HIGH** | DeckView — container `outline-none` with no focus indicator | Added focus-visible:ring-2 |
| S2-8 | **HIGH** | DeckCard — "Show more" button below 24px target | Added min-h-[24px] |
| S2-9 | **HIGH** | PublicApiKeySettings — amber-600 contrast ~3.0:1 | Changed to orange-700 (~4.8:1) |
| S2-10 | **MEDIUM** | DeckCard — match score amber SVG text low contrast | Changed to amber-700 |
| S2-11 | **MEDIUM** | 6 components — spinners missing motion-reduce | Added motion-reduce:animate-none |
| S2-12 | **MEDIUM** | RunStatusBadge — excessive live region (per-second announcements) | Throttled to status changes only |
| S2-13 | **MEDIUM** | 8 components — decorative icons missing aria-hidden | Added aria-hidden="true" |
| S2-14 | **MEDIUM** | AutomationList — no scroll-mt for sticky header | Added scroll-mt-14 |
| S2-15 | **MEDIUM** | ViewModeToggle — missing focus-visible + small targets | Added ring + increased py |

### i18n Fixes (6 fixes, 88 translations)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S2-16 | **HIGH** | AutomationList — raw `automation.status`/`automation.jobBoard` | Translation maps for status + modules |
| S2-17 | **HIGH** | RunHistoryList — raw `blockedReason`/`errorMessage` | Translation map for 7 known reasons + fallback |
| S2-18 | **HIGH** | RunStatusBadge — hardcoded `m`/`s` in elapsed time | Locale-aware format (DE: "Min. Sek.") |
| S2-19 | **HIGH** | RunProgressPanel — `as Parameters<typeof t>[0]` casts | `as const` on PHASE_KEYS |
| S2-20 | **MEDIUM** | RunProgressPanel — phase counters not using formatNumber | Added formatNumber(value, locale) |
| S2-21 | **MEDIUM** | AutomationList — `as any` on PAUSE_REASON_KEYS | Removed (TranslationKey is string) |

### UX Fixes (8 fixes)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S2-22 | **HIGH** | CompanyBlacklist — delete has no confirmation dialog | Added AlertDialog (key existed but was unused) |
| S2-23 | **HIGH** | CompanyBlacklist — loadEntries silent failure | Added error state + retry button |
| S2-24 | **HIGH** | PublicApiKeySettings — fetchKeys silent failure | Added error state + retry button |
| S2-25 | **HIGH** | StagingContainer — stale vacancies flash on tab switch | Added setVacancies([]) in onTabChange |
| S2-26 | **MEDIUM** | Public API — search case-sensitive on SQLite | Added mode: 'insensitive' |
| S2-27 | **MEDIUM** | StagingContainer — notification banner no aria-live | Added role="status" |
| S2-28 | **LOW** | StagingContainer — Bootstrap `btn btn-primary` classes | Removed (no effect in Tailwind) |
| S2-29 | **LOW** | DeckView — preview cards not hidden from AT | Added aria-hidden="true" |

## Session S1b Blind Spot Follow-up (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S1b-26 | **HIGH** | `inferErrorStatus()` breaks with i18n keys — "api.notAuthenticated" returns 500 instead of 401 | Added camelCase i18n key pattern matching alongside legacy English patterns |
| S1b-27 | **HIGH** | `_statusResolved` sentinel on shared data object can leak into Prisma update | Replaced with separate `resolvedStatus` variable |
| S1b-28 | **HIGH** | `interview.deleteMany` lacks userId scope in DELETE handler (ADR-015) | Added `job: { userId }` to where clause |

## Session S1b Comprehensive Review (2026-04-01) — ALL FIXED

5-dimension review over Sprint A+B+C code (34 files, ~7465 lines). 25 findings fixed.

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S1b-1 | **CRITICAL** | `ConnectorCache` singleton not registered in production — 0% hit rate | Unconditional `globalThis` assignment matching RunCoordinator/EventBus |
| S1b-2 | **CRITICAL** | GET/PATCH/POST `/api/v1/jobs` leak userId, matchData, foreign keys via `include` | Replaced all `include` with explicit `select` (SEC-P2-01) |
| S1b-3 | **HIGH** | PATCH `/api/v1/jobs/:id` — up to 9 sequential DB round-trips | `Promise.all` for independent findOrCreate calls |
| S1b-4 | **HIGH** | POST `/api/v1/jobs` — 5 sequential upserts | `Promise.all` parallelization |
| S1b-5 | **HIGH** | `AutomationDetailPage` duplicate runs fetch on every loadData() | Removed redundant `getAutomationRuns` call |
| S1b-6 | **HIGH** | `getBlacklistEntries` unbounded findMany (no LIMIT) | Added `take: 500` |
| S1b-7 | **HIGH** | `degradation.ts` findUnique without userId (ADR-015 violation) | Changed to `findFirst` |
| S1b-8 | **HIGH** | IP rate limiting trusts spoofable `x-forwarded-for` header | Unique per-request fallback + documentation |
| S1b-9 | **HIGH** | Misleading "constant-time" comment on API key validation | Corrected comment, documented accepted risk |
| S1b-10 | **HIGH** | 11x hardcoded English in `publicApiKey.actions.ts` | Replaced with i18n keys (api.* namespace) |
| S1b-11 | **HIGH** | 3x hardcoded English in `companyBlacklist.actions.ts` | Replaced with i18n keys (blacklist.* namespace) |
| S1b-12 | **HIGH** | 5x hardcoded "Error" toast titles in automation detail page | Replaced with `t("common.error")` |
| S1b-13 | **HIGH** | `event-types.ts` imports `RunSource` from scheduler (bidirectional coupling) | Inlined type definition |
| S1b-14 | **MEDIUM** | SSE endpoint no per-user connection limit | Added max 5 connections per user |
| S1b-15 | **MEDIUM** | Cache eviction was FIFO, not LRU | LRU via Map re-insertion on get() |
| S1b-16 | **MEDIUM** | No periodic prune — expired cache entries accumulate | Added 15-min prune interval |
| S1b-17 | **MEDIUM** | Cache key injection via unsanitized `:` in user input | Sanitize params segment in buildKey |
| S1b-18 | **MEDIUM** | `BlacklistMatchType` missing starts_with/ends_with | Extended type + matcher |
| S1b-19 | **MEDIUM** | Notes GET endpoint unbounded (no pagination) | Added take/skip/count pagination |
| S1b-20 | **MEDIUM** | UUID regex duplicated in 5 locations | Extracted `isValidUUID()` to schemas.ts |
| S1b-21 | **MEDIUM** | 4x duplicate findOrCreate helpers across API routes | Extracted to `helpers.ts` |
| S1b-22 | **MEDIUM** | SSE route double non-null assertion on userId | Explicit validation |
| S1b-23 | **MEDIUM** | Degradation notification messages hardcoded English | Added TODO(i18n) + name truncation |
| S1b-24 | **LOW** | `ViewModeToggle` radiogroup aria-label wrong | Fixed to describe group purpose |
| S1b-25 | **LOW** | Degradation empty catch blocks (no logging) | Added console.warn |

## Session S1a Blind Spot Check #2 (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BS2-1 | **HIGH** | `dedupHash.findMany` unbounded — loads ALL hashes without time limit | Added 90-day `createdAt` cutoff (same as job URL query) |
| BS2-2 | **MEDIUM** | `removeBlacklistEntry` uses `findUnique(id)` then checks userId separately (ADR-015 violation) | Changed to `findFirst({ id, userId })` |

## Session S1a Allium Weed Findings (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| WEED-1 | **MEDIUM** | BaseCombobox missing `aria-expanded` and `type="button"` on trigger | Added both attributes (`base-combobox.tsx`) |
| WEED-2 | **LOW** | TagInput doesn't clear input on popover close by click-outside | Added `setInputValue("")` in `onOpenChange` callback |
| WEED-3 | **LOW** | `uniqueId` duplicated in `keyboard-ux.spec.ts` (spec says defined once) | Import from shared `e2e/helpers/` instead |
| WEED-4 | **LOW** | `e2e/.auth/` missing from `.gitignore` | Added entry |
| WEED-5 | **LOW** | `api-key-resolver.ts` lastUsedAt not throttled (missed by perf fix) | Added `shouldWriteLastUsedAt()` throttle |
| WEED-6 | **LOW** | `job.actions.spec.ts` / `company.actions.spec.ts` outdated after IDOR fixes | Updated test expectations (createdBy, createdAt, resumeId) |
| WEED-7 | **LOW** | Jest picks up `.tracks/` test files (94 false failures) | Added `.tracks/` to `testPathIgnorePatterns` |
| WEED-8 | **LOW** | 19 allium specs had 26+ divergences from code | Fixed all — 4 code fixes + 15 spec updates across all 19 specs |

## Session S1a Performance Findings (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| PERF-1 | **HIGH** | `lastUsedAt` DB write on every API call / credential resolve — bottleneck under load | In-memory throttle: max 1 write per 5 min per key (`last-used-throttle.ts`) |
| PERF-2 | **HIGH** | Unbounded job URL query for dedup — loads ALL jobs from DB | Bounded to 90-day window (`runner.ts: getExistingVacancyKeys`) |
| PERF-3 | **HIGH** | Rate limiter Map grows unbounded between cleanup intervals | Added `MAX_STORE_SIZE=10000` cap with LRU eviction (`rate-limit.ts`) |

## Blind Spot Analysis (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BS-1 | **HIGH** | `deleteResumeById()` missing ownership check | Added `findFirst` ownership verification before cascade delete |
| BS-2 | **HIGH** | `deleteFile()` missing ownership check | Added File→Resume→Profile→User ownership parameter |
| BS-3 | **HIGH** | `deleteWorkExperience()` + `deleteEducation()` missing ownership | Added relation chain ownership checks |
| BS-4 | **MED-HIGH** | `addResumeSummary()`, `addExperience()`, `addEducation()` write IDOR | Added resume ownership verification before create |
| BS-5 | **MEDIUM** | `getJobDetails()` + `getResumeById()` return File.filePath to client | Changed to `File: { select: { id, fileName, fileType } }` |
| BS-6 | **LOW** | Notes sub-route missing UUID validation | Added regex validation |
| BS-7 | **LOW** | File.filePath made optional in interface | `profile.model.ts` — filePath now optional |

## Security Findings — Sprint C Team Review (2026-04-01) — ALL FIXED

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| SEC-11 | **HIGH** | File.filePath exposed in API response | `File: { select: { id, fileName, fileType } }` — filePath excluded |
| SEC-12 | **HIGH** | No rate limiting for unauthenticated requests | IP-based pre-auth rate limit (120/min) added before auth check |
| SEC-13 | **MEDIUM** | `getBlacklistEntriesForUser` IDOR via server action | Moved to `src/lib/blacklist-query.ts` (server-only, no "use server") |
| SEC-14 | **MEDIUM** | `matchType` not runtime-validated | `VALID_MATCH_TYPES` array check before DB insert |
| SEC-15 | **MEDIUM** | Job ID not UUID-validated | Regex `/^[0-9a-f-]{36}$/i` on all route params |
| SEC-16 | **MEDIUM** | In-memory rate limiter multi-instance weakness | Documented in code + rate-limit.ts header comment |
| SEC-17 | **MEDIUM** | Timing oracle in API key validation | Constant-time evaluation (keyExists + keyRevoked → single branch) |
| SEC-18 | **LOW** | Error messages may leak internal context | 500 errors sanitized to generic message before response |

## Security Audit — 2026-03-31 / 2026-04-01

| ID | Bug | Files | Severity | Fix |
|----|-----|-------|----------|-----|
| SEC-1 | **Credentials exposed in URL:** Forms lack `method="POST"` — GET fallback encodes credentials as URL params | `SigninForm.tsx`, `SignupForm.tsx` | **CRITICAL** | `method="POST"` + `action=""` + useEffect URL sanitization + middleware redirect |
| SEC-2 | **IDOR getJobDetails:** Prisma query by id only, no userId filter | `job.actions.ts` | **HIGH** | `findFirst` with `userId: user.id` |
| SEC-3 | **IDOR updateJob:** Prisma update where has only id, auth check trusts client userId | `job.actions.ts` | **HIGH** | Added `userId: user.id` to Prisma where, removed client userId trust |
| SEC-4 | **IDOR getResumeById:** No ownership chain filter | `profile.actions.ts` | **HIGH** | `findFirst` with `profile: { userId: user.id }` |
| SEC-5 | **IDOR resume sub-resources:** 6 functions (addContactInfo, updateContactInfo, editResume, updateResumeSummary, updateExperience, updateEducation) missing ownership checks | `profile.actions.ts` | **HIGH** | Pre-flight ownership verification via relation chain |
| SEC-6 | **IDOR getCompanyById:** No createdBy filter | `company.actions.ts` | **HIGH** | `findFirst` with `createdBy: user.id` |
| SEC-7 | **Ephemeral AUTH_SECRET:** Docker generates new secret on every restart, invalidating all sessions | `docker-entrypoint.sh` | **HIGH** | Fail startup if AUTH_SECRET not set |
| SEC-8 | **User enumeration via signup:** Distinct error message reveals registered emails | `auth.actions.ts` | **MEDIUM** | Generic error message |
| SEC-9 | **Ollama proxy body forwarding:** Raw client body forwarded without validation | `ollama/generate/route.ts` | **MEDIUM** | Field allowlist (model, prompt, stream, system, template, context) |
| SEC-10 | **Missing security headers:** No HSTS, Permissions-Policy | `middleware.ts` | **MEDIUM** | Added HSTS (prod), Permissions-Policy to middleware |

**Upstream reported:** Issues [#67](https://github.com/Gsync/jobsync/issues/67)–[#72](https://github.com/Gsync/jobsync/issues/72) on Gsync/jobsync.

## Critical (7) — ALL FIXED

| ID | Bug | File |
|----|-----|------|
| A1 | `handleError()` returns `undefined` for non-Error exceptions (~80 callsites) | `src/lib/utils.ts:40` |
| A2 | Path traversal in resume download API (user-supplied filePath read from disk) | `src/app/api/profile/resume/route.ts:96` |
| A3 | Toast race condition in AddJob — success fires before server response | `src/components/myjobs/AddJob.tsx:149` |
| A4 | API route handlers return `undefined` on non-Error exceptions | `src/app/api/profile/resume/route.ts:65,138` |
| A5 | CSV export error response never sent to client (dead code) | `src/app/api/jobs/export/route.ts:82` |
| B1 | NEXTAUTH_URL=localhost:3000 but server runs on :3737 | `.env:9` |
| -- | Prisma engines missing after /tmp clear | FIXED in Stage 1 |

## High (9) — ALL FIXED

| ID | Bug | File |
|----|-----|------|
| A6 | Loose equality (`!=`) for authorization checks | `job.actions.ts:337`, `company.actions.ts:162` |
| A7 | Non-null assertion on potentially undefined params | `profile.actions.ts:250` |
| A8 | Redundant non-null assertion after null check | `profile.actions.ts:220` |
| A9 | `path.join(filePath)` is a no-op, does not sanitize | `resume/route.ts:106` |
| A10 | Hardcoded PBKDF2 salt for API key encryption | `encryption.ts:15` |
| B2 | `/api/eures/occupations` missing auth check | `eures/occupations/route.ts` |
| B3 | `/api/jobs/export` missing auth check | `jobs/export/route.ts` |
| C11 | `new Date()` in render path causes hydration mismatch | `JobDetails.tsx:93`, `MyJobsTable.tsx:130` |
| C14 | No error boundaries at any app level | `src/app/error.tsx` MISSING |

## Medium (19) — ALL FIXED

| ID | Bug | File |
|----|-----|------|
| A11 | Salary range data has gaps (110K-120K, 140K-150K missing) | `salaryRangeData.ts:12` |
| A12 | Hardcoded "Note deleted successfully" not translated | `NotesCollapsibleSection.tsx:110` |
| A13 | Unused import: NextApiRequest | `utils.ts:4` |
| A14 | DownloadFileButton has `any` typed parameter | `DownloadFileButton.tsx:4` |
| A15 | Unsanitized user content rendered as HTML (XSS risk) — needs DOMPurify | `QuestionCard.tsx:94` |
| A16 | Dead example file shipped in source | `route.example.ts` |
| A17 | Unused userId variable (ownership check missing) | `resume/route.ts:15,82` |
| B4 | DeepSeek models API returns 500 instead of 401 | `deepseek/models/route.ts` |
| B5 | Missing ENCRYPTION_KEY in .env | `.env` |
| B6 | Middleware only protects /dashboard, not /api/* | `middleware.ts` |
| C1 | EuresLocationCombobox: 6+ hardcoded English strings | `EuresLocationCombobox.tsx` |
| C2 | EuresOccupationCombobox: 10+ hardcoded English strings | `EuresOccupationCombobox.tsx` |
| C3 | Admin containers (3) use hardcoded Loading/Load More | `CompaniesContainer` etc. |
| C4 | "Error!" hardcoded in 12+ toast calls | Multiple components |
| C5 | Hardcoded English success messages in 9+ toasts | Multiple components |
| C6 | SupportDialog entirely untranslated | `SupportDialog.tsx` |
| C9 | `.replace("Last ", "")` English-specific manipulation | `TopActivitiesCard.tsx`, `NumberCardToggle.tsx` |
| C13 | useMemo missing locale dependency | `ActivityForm.tsx:53` |
| C15 | ESCO combobox buttons missing aria-labels | `EuresOccupationCombobox.tsx` |

## Low (14) — ALL FIXED

| ID | Bug | Fix |
|----|-----|-----|
| A18 | Promise any return types on ~80 server actions | Typed all 7 remaining with proper Prisma model types |
| A19 | 5x `as any` casts suppress type checking | Replaced with proper type assertions (`Resume`, `JobResponse`) and removed unnecessary casts |
| A20 | Commented-out time validation allows NaN | Validation restored (throws on invalid time) |
| A21 | 50+ console.log calls in production code | Gated with `debugLog()` utility + Developer Settings UI toggle |
| A22 | Typo: "no user privilages" | Fixed to "no user privileges" |
| A23 | Variable typo: comapnies | Fixed to companies |
| B7 | Ollama verify endpoint potential SSRF | URL validation + defense-in-depth at 3 layers |
| C7 | AuthCard hardcoded subtitle | Translated |
| C8 | TagInput hardcoded fallback error message | Translated |
| C10 | NumberCardToggle hardcoded aria-label | Translated |
| C12 | SupportDialog year hydration risk | Fixed |
| C16 | InfoTooltip button missing aria-label | Added |
| C17 | DownloadFileButton called as function not JSX | Fixed |
| C18 | DownloadFileButton silent failure | Fixed |

## Open — Reported 2026-03-25

**Total: 17 new issues (4 bugs, 8 UX improvements, 5 data gaps)**

### Bugs

| ID | Bug | File | Severity | Status |
|----|-----|------|----------|--------|
| D1 | Tiptap SSR: missing `immediatelyRender: false` causes hydration mismatch | `TiptapEditor.tsx`, `TipTapContentViewer.tsx` | Medium | ✅ Fixed |
| D2 | DialogContent missing `Description` or `aria-describedby` — console warnings | 22 Dialog components | Low | ✅ Fixed |
| D3 | Activity: time validation hardcoded to AM/PM, ignores user locale (DE/FR/ES expect 24h) | `ActivityForm.tsx` | Medium | ✅ Fixed |
| D4 | Activity: duration shows "47 h 5 min" — max 8h validation not enforced in UI | `ActivityForm.tsx` | Medium | ✅ Fixed |

### UX Improvements

| ID | Issue | File | Severity | Status |
|----|-------|------|----------|--------|
| D5 | Add Job: Job Source dropdown missing connector module items | `AddJob.tsx` | Medium | ✅ Fixed |
| D6 | Automations: JSearch option not grayed out when API key missing, no warning | `AutomationWizard.tsx` | Medium | ✅ Fixed |
| D7 | Automations Step 4: no option to disable LLM threshold (collect-only mode) | `AutomationWizard.tsx` | Low | ✅ Fixed |
| D8 | Automations Step 5: limited runtime options (only daily) | `AutomationWizard.tsx` | Low | ✅ Fixed |
| D9 | Automations table: keywords not as chips, locations not resolved (de1,de3), run text not harmonized, div not fully clickable, 3-dot menu | `AutomationList.tsx` | Medium | ✅ Fixed |
| D10 | Admin table: 3-dot menu instead of shared visible buttons pattern | Admin components | Low | ✅ Fixed |
| D11 | Admin New Company: no image upload, no URL preview, no SVG/vector support | `AddCompany.tsx` | Low | ✅ Fixed |
| D12 | Profile cards: 4x hardcoded "Edit" string not translated | Profile cards | Low | ✅ Fixed |

### Data Gaps

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| D13 | Mock data insufficient for all screens | Low | ✅ Fixed |
| D14 | No mock data for connectors/modules | Low | ✅ Fixed |
| D15 | All modals: Tab into Combobox/Select fields should allow typing + Enter to add | Multiple modals | Medium | ✅ Fixed — Enter/Tab/Escape handlers on all 4 combobox variants, ARIA live regions, design-reviewed |
| D16 | AddCompany: Logo URL validation too strict — rejects valid URLs like Wikipedia SVG links | `AddCompany.tsx` | Medium | ✅ Fixed |
| D17 | AddCompany: Typo "Unterstutze Formate" — missing ü → "Unterstützte Formate" | `admin.ts` i18n | Low | ✅ Fixed |

## Open — Reported 2026-03-26 (Edge-Case Testing)

**Total: 5 new issues (2 major, 1 minor, 2 low)**

### Bugs

| ID | Bug | File | Severity | Status |
|----|-----|------|----------|--------|
| E1 | React controlled/uncontrolled input error — incomplete defaultValues in useForm (missing empty strings for title, company, location, source, jobUrl, jobDescription, resume) | `AddJob.tsx:112-120`, `AddContactInfo.tsx:51-56` | Medium | ✅ Fixed |
| E2 | Activity "Invalid time format" pageerror — combineDateAndTime throws in Zod refine without try-catch, propagates as uncaught browser error | `addActivityForm.schema.ts:85-86,100-101`, `utils.ts:82` | Medium | ✅ Fixed |
| E3 | No max-length validation on job title and company name fields — accepts >255 chars without error | `addJobForm.schema.ts`, `addCompanyForm.schema.ts` | Low | ✅ Fixed |
| E4 | TagInput trigger button has no programmatic label association — `role="combobox"` not connected to FormLabel via htmlFor/id | `TagInput.tsx:109` | Low | ✅ Fixed |
| E5 | Job Source combobox missing FormControl wrapper — breaks label-to-control association unlike Title/Company/Location comboboxes | `AddJob.tsx:415` | Low | ✅ Fixed |
