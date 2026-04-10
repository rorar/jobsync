# Bug Tracker — Collected 2026-03-24, Updated 2026-04-10

**Total: 538 bugs found, 536 fixed, 2 open (accepted risk), 2 deferred (Allium weed)**

### Status: ⚠️ 2 known issues (accepted risk, pre-existing) + 1 deferred cross-cutting (H-P-09 observability)

## Sprint 4 LOW Tier (2026-04-10)

44 LOW findings resolved across 6 parallel streams. Each stream's implementer agent invoked a dimension-specific skill via the Skill tool with combined (a)+(b) instrumentation.

**Skills per stream**:
- Stream A (notification + event bus arch): `backend-development:architecture-patterns`
- Stream B (performance + UI polish): `backend-development:architecture-patterns`
- Stream C (security): `security-scanning:threat-mitigation-mapping`
- Stream D (testing infra): `javascript-typescript:javascript-testing-patterns`
- Stream E (accessibility): `ui-design:accessibility-compliance`
- Stream F (`size="icon-lg"` sweep): `ui-design:accessibility-compliance`

### Fixed — Stream A: Notification + event bus arch polish (7 findings)
| ID | Severity | Summary | Fix |
|----|----------|---------|-----|
| L-A-02 | LOW | `deep-links.ts` formatters typed `t` as `(k: string) => string` — too loose; any string key compiles. | Introduced `NotificationTranslate = (key: TranslationKey) => string` type alias. When `TranslationKey` tightens to a literal union in a future sprint, the formatters will error on unknown keys. |
| L-A-03 | LOW | Webhook-channel direct-writer `titleKey` values didn't follow the project-wide `notifications.<typeName>.title` convention. | Renamed to `notifications.webhook.deliveryFailed.title` / `notifications.webhook.endpointDeactivated.title`. Added i18n keys in all 4 locales. |
| L-A-05 | LOW | `channelRouter.route` had no invalidation hook for Settings UI mutations — users could wait up to 30s for channel state changes to reflect in the availability cache. | `webhook.actions.ts`, `smtp.actions.ts`, `push.actions.ts` now call `channelRouter.invalidateAvailability(user.id, "<channel>")` after their mutations. Closes Sprint 3 M-P-01 follow-up. |
| L-A-06 | LOW | `prisma/schema.prisma` `Json?` column usage is SQLite-specific (maps to `TEXT`) and would diverge on PostgreSQL (`jsonb`). No comment documented the divergence. | Added a section comment documenting the SQLite vs PostgreSQL mapping. Informational — no schema change. |
| L-A-07 | LOW | `channel-router.ts` statically imports `webhook.channel.ts` which re-imports `prepareEnforcedNotification` from channel-router. Worked under ES-module hoisting but brittle. Sprint 3 honesty-gate follow-up. | Extracted `prepareEnforcedNotification` + `prepareEnforcedNotifications` + `EnforcedNotificationDraft` + related types into new leaf module `src/lib/notifications/enforced-writer.ts`. Clean Architecture "Dependencies point inward" — the leaf module has no dependencies on channel-router. `channel-router.ts`, `webhook.channel.ts`, `degradation.ts` all re-import from the leaf. |
| L-A-dead | LOW | `NotificationActorType = "enrichment"` dead variant — no production writer populates it, but the formatter case and i18n key existed. Sprint 3 honesty-gate follow-up. | Removed `"enrichment"` from the `NotificationActorType` union in `notification.model.ts`, removed the formatter case in `deep-links.ts`, removed `notifications.actor.enrichment` i18n keys in all 4 locales. `notification-format.spec.ts` drift-guard assertion kept the variant via a documented type-cast escape (intentional — tests the runtime fallback). |

### Fixed — Stream B: Performance + UI polish (9 findings + 3 Sprint 3 follow-ups)
| ID | Severity | Summary | Fix |
|----|----------|---------|-----|
| L-P-01 | LOW | `ConnectorCache.buildKey` ran a regex-based sanitize on every lookup. | Hoisted `KEY_SEGMENT_DELIMITER_PATTERN` regex to module scope as a pre-compiled const. |
| L-P-02 | LOW | `NotificationBell` polled every 30s per tab unconditionally — wasted bandwidth when the tab was hidden. | Page Visibility API: pause interval when `document.hidden === true`; resume + immediate catch-up fetch on `visibilitychange → visible`. |
| L-P-02 bonus | LOW | `NotificationBell` still used `size="icon"` (40×40). | Migrated to `size="icon-lg"` (44×44). Header h-14 on mobile fits comfortably. |
| L-P-03 | LOW | `SuperLikeCelebration` rendered inline `<style>{...}</style>` JSX with keyframe definitions — React re-created the `<style>` element on every render. | Extracted `@keyframes superlike-celebration-{slide-in,slide-out,fade-in,fade-out}` to `src/app/globals.css` with a `prefers-reduced-motion` override. Component uses a class name. |
| L-P-04 | LOW | `CompanyLogo` re-initialized useState on every prop change, including shallow-equal parent re-renders — CompanyLogo flashed back to loading skeleton on every parent reload. | Added `prevUrlsRef` guard: state only resets when `logoUrl` or `logoAssetId` actually change. |
| L-P-SPEC-01 | LOW | `StagedVacancyCard` created a new `Intl.NumberFormat("de-DE", ...)` per render for salary formatting. | Hoisted to module-scoped `SALARY_FORMATTER_CACHE: Map<string, Intl.NumberFormat>` keyed by currency; `getSalaryFormatter(currency)` accessor memoizes. Also added `group-focus-visible:bg-accent` to FooterActionButton for keyboard focus feedback. |
| L-P-SPEC-02 | LOW (audit) | `prisma.notification.update({ where: { id, userId } })` audit — mixing `@id` with a non-unique filter used to be a type error pre-Prisma-5.0. | **SAFE on Prisma 6.19**: `extendedWhereUnique` promoted to stable in 5.1; query engine compiles into a single `UPDATE ... WHERE id = ? AND userId = ?` (not SELECT-then-UPDATE). Inline audit comment added to `src/actions/notification.actions.ts:93` (orchestrator applied during honesty-gate resolution; Stream B flagged it but the file was out of scope). |
| scheduleDeckReload | Sprint 3 follow-up | Hardcoded `500` ms delay in `StagingContainer.scheduleDeckReload`. | Exported `ANIMATION_DURATION` constant from `useDeckStack.ts`; `StagingContainer` now computes delay as `DECK_ANIMATION_DURATION + DECK_RELOAD_BUFFER_MS` (200ms module-level constant). Symbolic form catches drift if animation duration is retuned. |
| useStagingActions cache | Sprint 3 follow-up | `useRef<Map>` handler cache never evicted. Safe today but a dynamic action factory could leak. | Added `HANDLER_CACHE_MAX_ENTRIES = 20` + FIFO eviction + `console.warn` fail-loud when the cap is hit. Today's 5 stable action references stay well below the cap. |
| FooterActionButton focus | Sprint 3 follow-up | Keyboard focus gave only the outer 44×44 ring, not the inner pill feedback. | Added `group-focus-visible:bg-*` variants to the inner pill classes in `StagedVacancyCard.tsx`. |

### Fixed — Stream C: Security polish (6 findings)
| ID | Severity | Summary | Fix |
|----|----------|---------|-----|
| L-A-01 | LOW | `checkLogoUrl` returned raw object instead of `ActionResult<T>`. Violated CLAUDE.md "Repository Pattern" convention for `"use server"` exports. | Wrapped return in `ActionResult<CheckLogoUrlData>`. Updated caller in `AddCompany.tsx`. |
| L-S-01 | LOW | Jest coverage close-out verification. | **RESOLVED by Sprint 3 Stream F (commit `4f29f69`).** `collectCoverage: false` confirmed present in `jest.config.ts`. Added inline close-out comment. No further action. |
| L-S-02 | LOW | `stagedBuffers` Map in `notification-dispatcher.ts` not globalThis-scoped — HMR module reload creates new Map while existing timer callbacks close over old reference, causing silent flush misses. | Moved to `globalThis.__notifStagedBuffers` using the singleton pattern from CLAUDE.md. Existing `_testHelpers.stagedBuffers` getter still works (returns the same reference). |
| L-S-03 | LOW | `resolveWikimediaUrl` made unauthenticated outbound Wikimedia API calls without a function-level rate limit. The outer `checkLogoUrl` cap was per-auth-user and did not protect non-action call paths. | Added dedicated `wikimedia:global` rate limit (50/min) inside `resolveWikimediaUrl` via existing `checkRateLimit` helper. Layered on top of M-S-04's per-user cap (dual-layer defense-in-depth). |
| L-S-04 | LOW | `enrichmentQueue` in `enrichment-trigger.ts` was unbounded — under bulk `CompanyCreated` event storms the queue grew without limit, risking OOM. | Added `MAX_ENRICHMENT_QUEUE_LENGTH = 200` constant. When queue is full, incoming task is dropped with `console.warn` including domain name. `withEnrichmentLimit(fn, domain?)` signature extension is backward compatible. Enrichment is best-effort per spec. |
| L-S-06 | LOW | `logo-asset-subscriber.ts` read `logoUrl` from DB and passed to download without re-validating SSRF. DB row could be mutated between enrichment write and subscriber read. | Added `validateWebhookUrl(logoUrl)` guard in subscriber before `downloadAndProcess`. Drops with `console.warn` on failure. Defense-in-depth (first validation remains at orchestrator). |

### Fixed — Stream D: Testing infrastructure polish (11 findings)
| ID | Severity | Summary | Fix |
|----|----------|---------|-----|
| L-T-01 | LOW | `check-notification-writers.sh` grep pattern only matched `prisma.notification.*` — missed the `db.notification.*` alias attack surface. | Extended grep to `(prisma\|db)\.notification\.(create\|createMany)` with documentation block explaining the two attack surfaces. |
| L-T-02 | LOW | `useSuperLikeCelebrations.spec.ts` dedupe test had a false positive — the assertion passed even when the dedupe logic was broken. | Strengthened dedupe test + added middle-item FIFO position test. |
| L-T-03 | LOW | Jest had no slow-test detection. | Added `slowTestThreshold: 5` to `jest.config.ts`. Tests exceeding 5s now warn in Jest reporter output. |
| L-T-04 | LOW | Missing `mockStagedVacancyWithAutomation` fixture in `testFixtures.ts` — tests inlined `{ ...mockStagedVacancy, automation: {...} }`. | Added the fixture. Legacy inline-spread call sites in 3 files (DeckCard, useDeckStack, StagingContainerDeckSheetRouting) noted as a follow-up migration. |
| L-T-05 | LOW | `MatchScoreRing.spec.tsx` had no edge case tests for negative/NaN/Infinity scores. | Added 4 edge case tests covering negative, NaN, Infinity, -Infinity. |
| L-T-06 | LOW | `undo-store.spec.ts` had no HMR-singleton reset test — module re-import could cross-contaminate tests. | Added `jest.resetModules()` + re-import HMR singleton test. |
| L-T-07 | LOW | No regression guard for the `Badge` component's `whitespace-nowrap` class (prevents wrapped text in translated labels). | New `__tests__/badge.spec.tsx` with 6 variants × whitespace-nowrap assertions. |
| dictionaries staging | Sprint 3 follow-up | `dictionaries.spec.ts` only cross-checked dashboard/jobs/activities/tasks — `staging`, `automations`, `settings` namespaces had no cross-locale consistency guard. | Added all three namespaces to `namespaceDictionaries`. Orchestrator fixup during Sprint 4 verification: added `EXTRA_ALLOWED_PREFIXES` map so `settings.ts` can host its legitimate multi-prefix keys (`developer.*`, `smtp.*`) without failing the prefix-equals-filename invariant. A future refactor should split those into dedicated namespace files. |
| notification-dispatcher mocks | Sprint 3 follow-up | `notification-dispatcher.spec.ts` relied on `Promise.allSettled` swallowing undefined-Prisma-mock rejections for webhook/email/push. | Added explicit Jest mocks for `webhookEndpoint`, `smtpConfig`, `vapidConfig`, `webPushSubscription`. Tests no longer lean on swallowed rejections. |
| E2E silent-skip | Sprint 3 follow-up | `e2e/crud/push-settings.spec.ts` and siblings had `test.skip(condition, ...)` anti-patterns that masked broken selectors. | Converted to throw patterns where applicable; documented the throw-vs-skip rule in `e2e/CONVENTIONS.md`. |
| E2E waitForTimeout sweep | Sprint 3 follow-up | 65+ `waitForTimeout` calls across 10+ e2e specs (profile-crud, keyboard-ux, activity-crud, smtp-settings, task-crud, question-crud, enrichment, company-crud, job-crud, automation-crud, job-detail-panels). | Replaced with condition-based `waitForLoadState` / `safeWait` per the `selectOrCreateComboboxOption` reference pattern. Stream D's self-flagged risk: some replacements may expose CI races — follow-up if keyboard-ux tests go flaky post-merge. |

### Fixed — Stream E: Accessibility polish (6 findings + 3 skeleton migrations + WeeklyBarChartToggle axisLeftLegendKey)
| ID | Severity | Summary | Fix |
|----|----------|---------|-----|
| L-Y-02 | LOW | `StagingNewItemsBanner` wrapped both the announcement text AND the "Show new items" Button inside a single `role="status"` live region. Screen readers re-read the button label on every polite-region update. | Split into visible `aria-hidden="true"` label + sr-only `role="status" aria-live="polite"` region + sibling non-live Button. Visual layout unchanged. Regression guard: `getAllByText` assertion (the label is now intentionally duplicated in the DOM). |
| L-Y-03 | LOW | `NotificationItem` unread indicator was a colored dot only — no non-color indicator for low-vision users. WCAG 1.4.1. | Added sr-only text via `t("notifications.unreadIndicator")` in all 4 locales. Colored dot kept for visual affordance. |
| L-Y-04 | LOW | `DiscoveredJobsList` status badge rendered raw enum values ("applied", "archived") — not localized. | Wrapped via `t("automations.discoveredJob.status." + job.status)` with raw-enum fallback so unknown statuses stay visible. i18n keys added in all 4 locales. |
| L-Y-05 | LOW | `MatchScoreRing` color palette had WCAG 1.4.11 non-text contrast failures: `amber-500` at 1.96:1 (need 3.0:1) and `emerald-500` at 2.61:1. | Migrated amber-500 → amber-700 (4.52:1 PASS) and emerald-500 → emerald-600 (3.39:1 PASS). Red-500 was already compliant. Dark-mode audit is a follow-up. |
| L-NEW-01 | LOW | `DeckView` rendered TWO concurrent `aria-live="polite"` regions — VoiceOver/NVDA double-announced card changes. | Consolidated to ONE polite region that carries the `lastAction` prefix when present. The 3s `setTimeout` that clears `lastAction` is unchanged. `aria-atomic="true"` ensures the combined string is announced once per update. |
| L-NEW-02 | LOW | `DiscoveredJobDetail` rendered the external-link anchor INSIDE the `DialogTitle`, causing screen readers to concatenate the link role into the heading name. | Moved anchor out to a sibling row inside `DialogHeader`. Heading's accessible name is now exactly the job title. |
| skeleton migration | Sprint 3 follow-up | `EnrichmentStatusPanel.tsx`, `StatusHistoryTimeline.tsx`, `StatusFunnelWidget.tsx` had inline skeletons with hardcoded `aria-label="Loading"`. | Migrated to shared `<Skeleton label={t("common.loading")}>` primitive. StatusFunnelWidget additionally got `motion-reduce:animate-none` on the inner pulse divs (incidental improvement — previously missing). |
| axisLeftLegendKey | Sprint 3 follow-up | `WeeklyBarChartToggle` chart axis legend was still English only (`axisLeftLegend: string`). Sprint 3 Stream G deliberately left this for a follow-up field. | Added optional `axisLeftLegendKey?: string` to `ChartConfig`. Resolves via `t(axisLeftLegendKey)` when set; falls back to `axisLeftLegend` for backward compatibility. `dashboard/page.tsx` consumer updated with `"dashboard.chartJobsApplied"` / `"dashboard.chartTimeSpent"` keys in all 4 locales. |

### Fixed — Stream F: `size="icon"` → `size="icon-lg"` sweep (17 migrated, 6 kept with comment, 1 verified)

| File | Outcome |
|----|---------|
| `ActivitiesTable.tsx`, `admin/{Companies,JobLocations,JobSources,JobTitles,Tags}Table.tsx`, `automations/{AutomationContainer,AutomationDetailHeader,AutomationList}.tsx`, `Header.tsx` (mobile menu), `kanban/KanbanColumn.tsx`, `myjobs/{MyJobsTable,NoteCard}.tsx`, `profile/{EducationCard,ExperienceCard,ResumeTable}.tsx`, `questions/QuestionCard.tsx` | **17 Migrated to `size="icon-lg"`** (44×44). Several also removed redundant `h-7 w-7` / `h-11 w-11` class overrides now that the variant encodes the dimensions. |
| `settings/AutomationSettings.tsx`, `settings/DeveloperSettings.tsx` (×2), `settings/LogoAssetSettings.tsx` (×2) | **Kept at `size="icon"` (40×40)** with inline comment — buttons sit inside `Input`-adjacent form rows with a fixed `h-10` input height; growing to 44×44 would misalign the form controls. A project-wide `<Input>` height bump to h-11 is a design-review-gated follow-up. |
| `tasks/TasksTable.tsx` | **Kept at `size="icon"`** — dense h-9 row layout; growing would break row height. Density toggle is a suggested follow-up. |
| `ui/calendar.tsx`, `ui/calendar2.tsx` | **Kept at `size="icon"`** — react-day-picker header uses `--cell-size: 2rem` hard constraint. Promoting to 44×44 widens the popover significantly; user testing required. |
| `ui/button.tsx` | **Verified** — the variant definition at line 37 (`"icon-lg": "h-11 w-11"`) still exists. No code change. |

Stream F's migration (17/24 = 71%) comfortably clears the 62% floor in the prompt and satisfies WCAG 2.5.5 AAA for the majority of icon-only buttons. The 6 exceptions all carry inline comments explaining the layout constraint.

### Multi-stream honesty gate — Sprint 4 open follow-ups surfaced

Per `feedback_multi_stream_honesty_gate.md`, I extracted each of the 6 Sprint 4 stream reports' full "Open Questions" and "Risks / ripple-effects discovered" sections from the session transcript (stored in `/tmp/sprint4-stream-{a,b,c,d,e,f}.txt` during the scan) and cross-checked every item against this file. The scan surfaced items that the orchestrator's consolidated summary had under-represented:

**Architecture + event bus** (Stream A):
- **`rotateVapidKeysAction` invalidation gap**: the action deletes all `WebPushSubscription` rows (VAPID key rotation invalidates every subscription), which flips push-channel availability, but L-A-05 only wired `subscribePush` and `unsubscribePush`. For up to 30s after rotation the `isAvailable` cache may still say "push available". Single-line fix (`channelRouter.invalidateAvailability(user.id, "push")`) — slotted for a Sprint 4.x follow-up.
- **Prisma `data`-blob dual-write deprecation**: inline comments in `enforced-writer.ts`, `deep-links.ts`, `notification.model.ts` still describe the dual-write into top-level columns AND the legacy `data` blob as a rollout mechanism from ADR-030. Dedicated clean-up sprint once the Prisma migration is rolled everywhere.
- **`notifications` namespace cross-locale check**: Stream D added `staging`, `automations`, `settings` to the `dictionaries.spec.ts` namespace consistency check, but `notifications` is still NOT covered. Stream A manually mirrored 8 new + 4 removed keys across en/de/fr/es and verified. Follow-up: extend the test to include `notifications` so drift is caught automatically.
- **Webhook `message` vs title divergence**: the long-form English `message` column powers email/webhook/push body fallbacks while the new `notifications.webhook.*.title` keys render a short localized title. This is the correct 5W+H pattern (message = fallback, titleKey = headline) but it's a semantic split new contributors should be aware of.

**Performance + UI polish** (Stream B):
- **L-P-SPEC-02 audit inline comment**: ✅ applied during honesty-gate resolution at `src/actions/notification.actions.ts:93`. Stream B flagged that the file was out of Stream B's scope.
- **`SuperLikeCelebration` globals.css placement**: Stream B edited `src/app/globals.css` (implicit scope allowance from the L-P-03 fix description). Alternative was a `SuperLikeCelebration.module.css` file but would have needed PostCSS plugin verification — inline globals was cheaper.

**Security** (Stream C):
- "None. All findings in scope are resolved." (verbatim). Confirmed.

**Testing infrastructure** (Stream D):
- **MatchScoreRing cross-stream coordination**: Stream E changed `stroke-emerald-500` → `stroke-emerald-600` (L-Y-05 contrast fix). Stream D's L-T-05 tests use `stroke-red-500` (negative-score clamp test) which is unaffected. Cross-referenced.
- **`keyboard-ux.spec.ts` CI race risk**: 37 `waitForTimeout` calls replaced in that file; some used `waitForLoadState("domcontentloaded")` which is faster than the original timers. If CI exposes races, follow-up fix is more specific `safeWait` calls per the `selectOrCreateComboboxOption` reference pattern.
- **`mockStagedVacancyWithAutomation` migration path**: `DeckCard.spec.tsx`, `useDeckStack.spec.ts`, `StagingContainerDeckSheetRouting.spec.tsx` still use inline spread patterns. Non-blocking migration follow-up.
- **`db.notification.*` grep false-positive scope**: the extended pattern could false-positive on test code that uses `db.notification` as a variable name — but the script is `src/` only, so the blast radius is contained.

**Accessibility** (Stream E):
- **DeckView `lastAction` 3s timeout interaction**: with the consolidated single live region, the card announcement keeps re-reading while `lastAction` is present (concatenated as a prefix). Acceptable because `aria-atomic="true"` means a combined single-announcement per update + the timer clears the prefix after 3s. A stricter fix would stage the announcements — out of scope for L-*.
- **Dark-mode `MatchScoreRing` contrast**: L-Y-05 audited only the light-mode (white background) contrast. Dark-mode shades (`-400` variants on a dark card background) are not audited. Stream F or a future sprint can reuse the `getStrokeColorClass` audit-table structure.
- **StatusFunnelWidget `motion-reduce:animate-none`** added incidentally during the skeleton migration. The old inline implementation was missing it entirely. If considered out of scope for L-*, can be reverted — but the fix is inside the replaced block.

**`size="icon-lg"` sweep** (Stream F):
- **6 input-adjacent settings buttons remediation**: would require growing `<Input>` to `h-11` project-wide. Design-review-gated follow-up.
- **`react-day-picker --cell-size: 2rem` promotion**: eliminates the calendar exception but widens the popover significantly. User testing required.
- **TasksTable "density" toggle**: opt-in 44×44 rows for AAA compliance while power users keep the dense 36px view. Suggested by Stream F per Sprint 3 Stream F's pattern.
- **`DropdownMenuTrigger asChild` + JSX comment fragility**: adding a `{/* comment */}` between `<DropdownMenuTrigger asChild>` and `<Button>` trips Radix Slot's `React.Children.only` invariant at runtime. Latent codebase-wide footgun. Suggested remediation: ESLint rule forbidding JSX expression containers as direct children of `asChild`-prop JSX elements.

**Skill invocation result (Sprint 4)**:
All 6 Sprint 4 stream agents invoked their assigned skill via the Skill tool with the combined (a)+(b) instrumentation — verbatim quoted passage + rejected alternative with justification. Pattern continues to work across 4 sprints (1, 1.5, 2, 3, 4).

**Honesty gate caught (Sprint 4)**:
1. Post-sprint full-jest verification surfaced 8 test failures across 4 suites — all test-side (Promise executor race in queue-bound helper fixture, duplicate-DOM-text from L-Y-02's intentional dual-surface, settings dictionary multi-prefix reality, `.click()` vs `fireEvent.click()` React 18 flush timing, pre-existing `developer.*` / `smtp.*` prefixes in `settings.ts` surfaced by Stream D's cross-locale check). ZERO production bugs. All 4 suites fixed inline with javascript-testing-patterns skill guidance. Final run: 211 suites / 4031 passed / 2 todo / 0 failed.
2. Multi-stream honesty-gate scan extracted each of the 6 raw agent return messages from the session transcript (not the orchestrator's consolidated summary) per `feedback_multi_stream_honesty_gate.md`. The scan caught the L-P-SPEC-02 inline comment that Stream B could not apply (out of scope) — applied during this pass.

## Sprint 3 MEDIUM Fixes (2026-04-09)

45+ findings resolved across 8 parallel streams, plus 9 Sprint 2 "Open follow-ups" closed and Sprint 1.5 `runHealthCheck` audit closed as confirmed-safe. Each stream's implementer agent invoked a dimension-specific skill via the Skill tool with combined (a)+(b) instrumentation.

**Skills per stream**:
- Stream A / B: `backend-development:architecture-patterns`
- Stream C: `security-scanning:threat-mitigation-mapping`
- Stream D: `developer-essentials:sql-optimization-patterns`
- Stream E: `javascript-typescript:javascript-testing-patterns`
- Stream F / G / H: `ui-design:accessibility-compliance`

### Fixed — Stream A: Notification + event bus arch cleanup (commit `b1671d2`)
| ID | Severity | Summary |
|----|----------|---------|
| M-A-01/08 | MEDIUM | `formatNotificationActor` in `deep-links.ts` had no case for `"module"` or `"enrichment"` actor types. Added exhaustive switch with `never` guard + new i18n keys `notifications.actor.module` / `notifications.actor.enrichment` in all 4 locales. |
| M-A-02 | MEDIUM | `ModuleDeactivatedPayload` / `ModuleReactivatedPayload` carried slug (`moduleId`) but not display name. Extended with optional `moduleName`; emit sites in `module.actions.ts` populate it from `registered.manifest.name`. Dispatcher handlers prefer `payload.moduleName ?? payload.moduleId`. |
| M-A-05 | MEDIUM | `channelRouter` registration was a module-import side-effect in `notification-dispatcher.ts` — race-prone under HMR + parallel test imports. Moved to explicit `registerChannels()` called from `registerNotificationDispatcher()` with `__channelRouterRegistered` globalThis guard. |
| M-A-06 | MEDIUM | `enrichment-trigger.handleCompanyCreated` and `handleVacancyPromoted` had `await findFirst` BEFORE the fire-and-forget closure, blocking EventBus publish on DB round-trips. Moved all DB I/O INSIDE the closure — orchestrator's internal `cache-before-chain` guarantees dedup is preserved. |
| M-P-01 + M-P-SPEC-02 | MEDIUM | `ChannelRouter.route` hit the DB per enabled channel on every dispatch via `isAvailable()`. Added `availabilityCache` with 30s TTL + `invalidateAvailability(userId?, channelName?)` hook for Settings UI (hook exposure is tracked as Sprint 3 open follow-up — Settings action files are in Stream C scope). |
| M-T-09 | MEDIUM | The Sprint 0/1 dispatcher locale fix had no dedicated regression guard. Added 3 tests: German fallback message, late-binding column persistence, `t()` locale-arg propagation. |
| event-bus.allium sync | Sprint 2 follow-up | `ErrorIsolation` invariant rewritten to describe `Promise.allSettled` parallel dispatch (H-P-06). Per-handler isolation preserved; intra-publish ordering no longer guaranteed; cross-publish ordering still holds. |

### Fixed — Stream B: Deck + staging + celebration context (commit `300c666`)
| ID | Severity | Summary |
|----|----------|---------|
| M-A-04 | MEDIUM | `StagingContainer.handleDeckAction` fired `reload()` mid-animation, racing with `useDeckStack.performAction`'s setTimeout. New `scheduleDeckReload()` defers reload by 500ms (covers 300ms animation + promise + commit flush). Unmount cleanup clears pending timer. |
| M-A-07 | MEDIUM | `useSuperLikeCelebrations` was invoked INSIDE DeckView — when user navigated to `/dashboard/myjobs/:id` via the "Open job" CTA, DeckView unmounted and the queue was destroyed. Lifted to new `SuperLikeCelebrationsContext` provider at `src/app/dashboard/layout.tsx`. DeckView falls back to a component-local queue when no provider is mounted (keeps isolated component tests working). |
| M-A-09 | MEDIUM (trimmed) | `useDeckStack.undoStack` (client) and `src/lib/undo/undo-store.ts` (server-truth via UndoToken rows) are not synchronized. Trimmed-scope fix: documented inline, added defensive `console.error` branch in `handleDeckUndo` for future non-reversible-action leaks, pinned allowlist via regression test. Full `ActionResult.data.undoTokenId` pipe-through deferred to dedicated follow-up stream. |
| H-A-03 symmetric | Sprint 2 follow-up | `StagingContainer.handleDeckAction:296-301` had the same defensive branch as PromotionDialog but still silently forwarded `createdJobId:undefined`. Fixed symmetrically: destructive toast + `{success:false}` early return on contract drift. |
| M-P-04 | MEDIUM | PromotionDialog + BlockConfirmationDialog mounted unconditionally every parent re-render. Now conditional (`{open && <Dialog ... />}`). |
| M-P-SPEC-01 | MEDIUM | `handlePromote` not memoized — fresh function identity every render. Wrapped in `useCallback([])` (relies on stable React setters). |
| M-T-07 | MEDIUM | `useDeckStack.spec.ts` existed but did not cover ADR-030 callback contract. Added 10+ tests: onSuperLikeSuccess invocation paths, keyboard shortcuts (d/p/s/b/n/z + 4 arrow keys), isDetailsOpen gate, enabled=false gate, input/textarea target guards, MAX_UNDO_STACK=5 enforcement. |
| M-T-08 | MEDIUM | `SuperLikeCelebrationHost` router.push side effect was mocked but never asserted. Added explicit `router.push` called with correct URL pattern + exactly once + dismiss-before-push ordering. |
| M-T-10 | MEDIUM | `DeckCard.onInfoClick` had no unit test. Added 3 tests pinning click handler invocation, button presence gating, and stopPropagation. |

### Fixed — Stream C: Security hardening + runHealthCheck audit (commit `b250c95`)
| ID | Severity | Summary |
|----|----------|---------|
| M-S-01 | MEDIUM | `markAsRead` / `dismissNotification` returned `{success:true, data:[]}` on zero-match (silent no-op on non-owned ids). Added explicit `findFirst` pre-flight — returns `{success:false}` with NOT_FOUND. |
| M-S-02 | AUDIT | `checkConsecutiveRunFailures` — confirmed-safe per-automation scope (not cross-user). Inline invariant comment added documenting the carve-out. |
| M-S-03 | MEDIUM | `GET /api/logos/[id]` — enumeration oracle via different 404 bodies for not-owned vs disk-miss. Normalized to uniform 404; disk-miss logged server-side only. |
| M-S-04 | MEDIUM | `checkLogoUrl` — added global 200/min cap ON TOP of per-user 20/min to bound amplification by multi-session attackers. |
| M-S-05 | LOW | `response.body?.cancel()` on manual redirects not awaited in `logo-asset-service.ts` + `meta-parser/index.ts`. Now awaited with `.catch(() => {})`. |
| M-S-06 | MEDIUM | `undoStore` TOCTOU between get-ownership + use-compensate. New atomic `undoById(tokenId, userId?)` method removes from Map BEFORE compensate. |
| M-S-07 | MEDIUM | `buildNotificationMessage` stringified objects as `[object Object]` in email bodies. Added `ALLOWED_DATA_FIELDS` allowlist + `safeStringValue()` primitive-only extractor. |
| M-S-08 | MEDIUM | `resolveWikimediaUrl` no `response.ok` check + no Wikimedia domain validation. Both guards added. |
| runHealthCheck | Sprint 1.5 follow-up closed | Full audit of `checkModuleHealth` call chain — writes only `healthStatus` (HEALTHY/DEGRADED/UNREACHABLE), never `status` (ACTIVE/INACTIVE). Zero automation-pause cascade. CONFIRMED SAFE without admin gate. Documented inline + in `specs/module-lifecycle.allium` + this file. |
| M-T-02 | LOW | `enrichment-actions.spec.ts` mutated `globalThis.__enrichmentInflight` without cleanup. Added `afterEach` that `.clear()`s the Map (NOT `delete` — production code at `enrichment.actions.ts:31-33` caches a module-level REFERENCE that would be orphaned by delete). Orchestrator fixup after full-suite verification caught the reference-orphaning bug. |

### Fixed — Stream D: Small perf (commit `e5c2b52`)
| ID | Severity | Summary |
|----|----------|---------|
| M-P-02 | MEDIUM | `getStagedVacancies` used `include` → full scalar + JSON overfetch. Replaced with explicit `STAGED_VACANCY_LIST_SELECT` shape (new non-server module `stagedVacancy.select.ts`); omits `matchData` JSON blob. Regression guard spec locks the shape. |
| M-P-06 | MEDIUM | `DeckView` keydown useEffect re-subscribed on every card advance (deps: onOpenDetails, isDetailsOpen, currentVacancy). Rewrote to subscribe once with `[]` deps, reading per-render state via `detailsKeyHandlerStateRef`. Sprint 1.5 forwardRef/DeckViewHandle block untouched. |
| M-A-03 | MEDIUM | `getUserLocale` read `parsed.locale` but writers save to `parsed.display.locale` — silent bug, all locale lookups fell back to default. Fix prefers canonical path with legacy fallback. |

### Fixed — Stream E: Testing infrastructure (commit `9ee6f8e`)
| ID | Severity | Summary |
|----|----------|---------|
| M-T-01 | MEDIUM | `DeckView.spec.tsx` module-level `mockOnAction.mockResolvedValue(undefined)` hid the CRIT-A2 class-of-bug. Changed default to `{success:true}` to match the real ADR-030 contract. |
| M-T-03 | MEDIUM | `e2e/crud/staging-details-sheet.spec.ts` used `test.skip` which accumulates into false positives. Replaced with hard-failure throw + clear error message on missing seed data. |
| M-T-04 | MEDIUM | `e2e/helpers/index.ts:selectOrCreateComboboxOption` used `waitForTimeout` (flaky-by-design per Playwright docs). Replaced with deterministic `waitFor` conditions; added `safeWait` helper; documented policy in `e2e/CONVENTIONS.md`. |
| M-T-05 | MEDIUM | `a11y-deck-view.spec.tsx` stubbed `DeckCard` entirely, so axe-core never ran against real card markup. Removed the stub; mocked only heavy dependencies (CompanyLogo, MatchScoreRing). |
| M-T-06 | MEDIUM | `StagedVacancyDetailSheet.spec.tsx` mocked the entire Sheet primitive, hiding focus-trap and Escape behavior. Removed the Sheet mock; mocked only ScrollArea + CompanyLogo. Added regression tests for focus trap, close button, Escape dismissal. Orchestrator fixup: `aria-modal="true"` assertion swapped for `data-state="open"` (Radix focus-trap attribute is jsdom-unreliable). |

### Fixed — Stream F: A11y target sizes + memoization (commit `4f29f69`)
| ID | Severity | Summary |
|----|----------|---------|
| M-Y-01 | MEDIUM | `StagedVacancyCard` footer buttons 28×28 (fails WCAG 2.5.5 AAA). New `FooterActionButton` helper wraps each in a 44×44 outer button with aria-hidden inner pill. Every tab's footer (Details/Promote/Dismiss/Archive/Trash/Block/Restore) gets the hit-area wrapper. |
| M-Y-04 | MEDIUM | `ApiStatusOverview` per-row health-check button 32×32. Migrated to new `size="icon-lg"` button variant. |
| M-Y-05 | MEDIUM | `KanbanCard` drag handle ~20×20 — failed BOTH WCAG 2.5.5 AAA AND 2.5.8 AA (worst). Grown to 44×44 via hit-area wrapper. `{...attributes}{...listeners}` preserved on the native button for @dnd-kit behavior. |
| M-Y-06 | MEDIUM (conservative) | `ui/button.tsx size="icon"` default 40×40. CONSERVATIVE: default preserved (26 call sites have layout constraints), new `size="icon-lg"` variant at 44×44 introduced for opt-in migration. |
| M-NEW-03 + Sprint 2 follow-up | MEDIUM | `StagingLayoutToggle` buttons ~28×28 + primitive migration debt. Replaced 50-line hand-rolled radiogroup with 20-line `ToolbarRadioGroup<StagingLayoutSize>` call. Sprint 1 CRIT-Y2 regression suite stays green via preserved `activeIndicatorTestId`. Target-size AAA fix deferred to primitive-level refactor. |
| M-P-03 | MEDIUM (paired) | `StagedVacancyCard` not memoized + `useStagingActions.createHandler` returned fresh closures. Paired fix: `useCallback([])` + ref-backed Map cache keyed by (action, successKey) + `React.memo(StagedVacancyCardImpl)`. Both land together — memo is useless without closure stability. |

### Fixed — Stream G: A11y labels + live regions + Sprint 2 follow-ups (commit `b0fa89f`)
| ID | Severity | Summary |
|----|----------|---------|
| M-Y-08 | MEDIUM | Skeleton loader hardcoded English `aria-label="Loading"`. Created shared `src/components/ui/skeleton.tsx` primitive with translatable `label` prop + `role="status"` + `aria-busy`. |
| M-NEW-01 | MEDIUM | `NumberCardToggle` Progress bar aria-label hardcoded English "increase"/"decrease". Routed through new i18n keys `dashboard.progressIncrease` / `dashboard.progressDecrease` × 4 locales. |
| M-NEW-02 | MEDIUM | `BulkActionBar` "Delete Permanently" — WCAG 3.3.4 violation (destructive data action with no confirmation). Wrapped in Radix AlertDialog with default focus on Cancel (WAI-ARIA APG guidance). 4 new i18n keys × 4 locales. |
| global-error.tsx | Sprint 2 follow-up | Full rewrite mirroring Stream H Sprint 2's `dashboard/error.tsx` pattern: i18n via useTranslations + eager `<html lang>` capture (survives Next.js error-boundary html swap), `role="alert"` + focus management + scrubbed `error.message`. |
| auth layout `<main>` | Sprint 2 follow-up | `(auth)/layout.tsx` didn't render `<main id="main-content">`, so the Stream H SkipLink was a no-op on /signin + /signup. Added `<main id="main-content" tabIndex={-1}>`. |
| Sidebar demote | Sprint 2 follow-up | Secondary `<nav>` with single link → `<div>`. WAI-ARIA discourages landmarks with one meaningful child. Stream H aria-label removed (redundant after demote). Landmark count drops from 3 to 2 — intentional. |
| NavLink startsWith typo | Sprint 2 follow-up | `pathname.startsWith(\`${route}/dashboard\`)` was a historical typo that never matched real routes. Replaced with `pathname === route \|\| pathname.startsWith(\`${route}/\`)` + root-`/dashboard` special case. 11-test regression suite. **Behavior change**: sub-routes now correctly highlight their parent nav entry — visible UX change, needs QA smoke. |
| WeeklyBarChartToggle labelKey | Sprint 2 follow-up | Chart labels still English. Added optional `labelKey` to `ChartConfig`; component uses `t(labelKey)` with raw `label` fallback. Updated `dashboard/page.tsx` consumer. Total-hours gate still uses stable `label === "Activities"` (not translated text). Orchestrator fixup: regression test `getByText("Std.")` → `getByText(/5\s+Std\./)` regex to match full span content. |

### Fixed — Stream H: Notification UI perf + a11y (commit `2084bae`)
| ID | Severity | Summary |
|----|----------|---------|
| M-P-05 | MEDIUM | `NotificationItem.parseNotificationData` ran every render (JSON.parse + type coercion per render). Wrapped in `useMemo` keyed on notification id + data blob. |
| M-P-SPEC-03 | MEDIUM | `NotificationDropdown.fetchNotifications` had no request dedup. Rapid open/close spammed the server action. Added `pendingFetchRef` + epoch counter + `isMountedRef` stale-result guard. Next.js RPC doesn't propagate AbortSignal, so cancellation is at the result level. |
| M-Y-02 | MEDIUM | `NotificationItem` dismiss button 32×32. Hit-area wrapper to 44×44 (CRIT-Y1 flashlight completion). |
| M-Y-03 | MEDIUM | `NotificationDropdown` mark-all-read button 32×32. Same hit-area wrapper pattern. |
| M-Y-07 | MEDIUM | `NotificationBell` badge count changed silently — screen reader users never heard about new notifications. Added sibling `role="status" aria-live="polite" aria-atomic="true"` region with 500ms stability debounce on INCREASES only (decreases = user acted, no announcement). Badge is `aria-hidden="true"` to prevent double-announcement. |

### Multi-stream honesty gate — open follow-ups surfaced

Per `feedback_multi_stream_honesty_gate.md`, explicitly scanned each of the 8 stream agents' "Open questions" and "Risks / ripple-effects discovered" sections against this file. The following items are NOT tracked elsewhere, remain open, and are NOT planned for Sprint 4's LOW tier — adding them here so they're durable:

**Architecture + event bus**:
- **Settings UI invalidation hooks** (Stream A): `webhook.actions.ts`, `smtp.actions.ts`, `push.actions.ts` should call `channelRouter.invalidateAvailability(userId, channelName)` after their mutations so users see channel state changes within ms instead of waiting for the 30s TTL cache. One-line change per action site (~4-5 sites) but the action files were Stream C scope in Sprint 3 — best handled as a Sprint 3.1 follow-up.
- **Channel-router circular import** (Stream A): `channel-router.ts` statically imports `webhook.channel.ts` which re-imports `prepareEnforcedNotification` from channel-router. Works under ES-module hoisting but brittle. Sprint 4+ should extract `prepareEnforcedNotification` + `EnforcedNotificationDraft` into `src/lib/notifications/enforced-writer.ts`.
- **`NotificationActorType = "enrichment"` dead variant** (Stream A): the type union includes it, Stream A added a formatter case + i18n key for it, but no production writer populates `actorType: "enrichment"` today. Flagged for the sprint that introduces enrichment failure notifications.
- **`M-A-09` full pipe-through** (Stream B): the undoStore split-brain architectural fix — pipe `ActionResult.data.undoTokenId` through `useDeckStack.onAction` → `UndoEntry` → `handleDeckUndo` → `undoStore.compensate(tokenId)`. Then `REVERSIBLE_DECK_ACTIONS` can grow to include promote/superlike/block. Stream B shipped the minimal trimmed scope; the full refactor is a dedicated follow-up.
- **`scheduleDeckReload` magic number** (Stream B): the 500ms delay (ANIMATION_DURATION 300ms + 200ms buffer) is a hard-coded literal. Could be DRY-ed up by importing `ANIMATION_DURATION` from useDeckStack, but that leaks a hook-internal constant into the container.

**Performance**:
- **`getStagedVacancies` pagination** (Stream D): still uses `skip`/`offset`. Degrades at large offsets even with the new select shape. Cursor-based pagination is the proper fix but ripples into StagingContainer, RecordsPerPageSelector, BulkActionBar select-all flow, and StagingNewItemsBanner "new items since X" logic.
- **Missing `discoveredAt DESC` index** (Stream D): existing `[userId, createdAt]` is close but not a perfect match for `ORDER BY discoveredAt DESC`. Today's M-P-02 fix reduces column read cost; the sort cost is unchanged. A follow-up migration `@@index([userId, discoveredAt])` would close the loop.
- **`STAGED_VACANCY_LIST_SELECT` location** (Stream D): currently in `src/actions/stagedVacancy.select.ts` (non-server module). When ROADMAP 7.1 Phase 2 exposes staged vacancies via `/api/v1/staging`, move to `src/lib/api/helpers.ts` alongside `JOB_LIST_SELECT` and update both consumers.

**Accessibility**:
- **25 `size="icon"` call sites still at 40×40** (Stream F): documented candidates for a dedicated AAA target-size sweep sprint. Each needs individual layout verification before migration (26 files identified — 1 migrated in Sprint 3).
- **3 inline skeleton sites NOT migrated** (Stream G): `EnrichmentStatusPanel.tsx`, `StatusHistoryTimeline.tsx`, `StatusFunnelWidget.tsx` still have hardcoded `aria-label="Loading"` / `"Loading pipeline data"`. ~5-minute follow-up to replace each with `<Skeleton label={t("common.loading")}>...</Skeleton>`.
- **`WeeklyBarChartToggle.axisLeftLegend` still English** (Stream G): the Nivo `axisLeft.legend` prop accepts only a raw string. Stream G added `labelKey` for the toolbar + card title but deliberately left the axis legend for a `axisLeftLegendKey?: string` follow-up.
- **`useStagingActions` cache never evicts** (Stream F): a `useRef<Map>` holds handler closures keyed by (action, successKey). Safe today (5 module-level action imports, stable identity) but a dynamic action factory could leak. Defensive guard: if a new caller passes dynamically-constructed actions, either memoize at caller or add TTL.
- **`FooterActionButton` no focus-visible forwarding** (Stream F): hover feedback uses `group-hover` (mouse) but keyboard users see only the outer 44×44 focus ring, not the inner pill. WCAG-compliant but visually different from Sprint 1 CRIT-Y1 DeckCard Info button.

**Testing**:
- **Silent-skip accumulation in other E2E specs** (Stream E): the `test.skip(condition, "...")` anti-pattern exists in other specs (none in Stream E's owned files). The M-T-03 fix pattern (throw instead of skip) should be applied project-wide in a follow-up.
- **`waitForTimeout` outside the fixed helper** (Stream E): other E2E specs have their own `waitForTimeout` calls OUTSIDE the `selectOrCreateComboboxOption` helper. Stream E's M-T-04 fix only covered the helper. A project-wide grep + audit is a follow-up testing sprint.
- **Dictionary cross-locale check excludes `staging` namespace** (Stream G): the existing `__tests__/dictionaries.spec.ts` "consistent keys across all locales" check only covers dashboard/jobs/activities/tasks. Stream G added keys to `staging.ts` and verified manually but the test-level automated check would catch future drift. Follow-up: extend the dictionaries spec to include `staging` and the other namespaces.
- **`notification-dispatcher.spec.ts` relies on rejection swallowing** (Stream A): Promise.allSettled swallows undefined-Prisma-mock rejections for webhook/email/push. Explicit mocks for `webhookEndpoint`/`smtpConfig`/`vapidConfig`/`webPushSubscription` would make the tests robust.

**Notification UI**:
- **Live-region "unread notifications" i18n key** (Stream H): current announcement reuses `notifications.title` which yields "3 Notifications" / "3 Benachrichtigungen" — the M-Y-07 finding suggested the stricter phrasing "3 unread notifications". Needs a new i18n key `notifications.unreadLiveRegion` with `{count}` placeholder in all 4 locales.
- **Next.js server actions don't propagate AbortSignal** (Stream H): Stream H's request dedup is at the RESULT level (discard stale payloads) rather than the REQUEST level (cancel in-flight). True request cancellation would require refactoring `getNotifications` to a REST route — out of scope.

**Skill invocation test result (Sprint 3)**:
All 8 stream agents invoked their assigned skill via the Skill tool with the combined (a)+(b) instrumentation — verbatim quoted passage + rejected alternative with justification. Pattern continues to work across 3 sprints (1, 1.5, 2, 3).

**Honesty gate caught (Sprint 3)**:
1. During full-suite verification, 3 test failures surfaced — all test-side (mock shape, reference caching vs delete, exact-text match vs regex), zero production bugs. Fixed inline applying `javascript-typescript:javascript-testing-patterns` skill guidance (Best Practice 7 "test behavior not implementation"). Orchestrator fixups are folded into Streams C (M-T-02 cleanup reference bug), E (aria-modal → data-state), and G (regex match for `5 Std.`) per file ownership.
2. LSP diagnostics shown during parallel agent spawn were transient mid-edit state (7 apparent "errors" in DeckView / StagingContainer / NotificationDropdown / StagedVacancyCard / stagedVacancy.actions all resolved before commit). `tsc --noEmit` against the final state is clean. Same pattern as Sprints 1 / 1.5 / 2.

## Sprint 2 HIGH Fixes (2026-04-09)

36 HIGH findings across 8 parallel work streams (Stream A through H).
Each stream's implementer agent invoked a dimension-specific skill via
the Skill tool with the combined (a)+(b) instrumentation — verbatim
quoted passage from the skill + rejected-alternative with justification.
Detailed per-finding analysis lives in the review reports under
`.team-feature/stream-5b-*.md`; this section summarizes what each
stream delivered.

### Fixed — Stream A: Notification architecture + dispatcher perf (4 findings)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-A-01 | HIGH | `activateModule` was a dead publisher — never emitted `ModuleReactivated` even though `notification-dispatcher.handleModuleReactivated` was fully wired. Symmetric twin of Sprint 1 CRIT-A1. | `5925785` |
| H-A-04 | HIGH | 5 legacy direct-writer notification sites (degradation.ts × 3, webhook.channel.ts × 2) bypassed `shouldNotify()` preference gating, violating `QuietHoursRespected` invariant. | `5925785` |
| H-A-07 | HIGH | `shouldNotify` was architecturally exempt by construction — called only by `ChannelRouter.route`, so every direct writer bypassed it. Fixed by introducing a shared `prepareEnforcedNotification[s]` helper at the channel-router layer that the 5 legacy sites call BEFORE their physical prisma.notification.create*. | `5925785` |
| H-P-01 | HIGH | Double `userSettings.findUnique` per notification event (resolveLocale + dispatchNotification internally resolving again). `dispatchNotification` now accepts optional `preferences` argument; handlers read once and thread through. | `5925785` |

### Fixed — Stream B: Deck + staging contract fixes (6 findings)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-A-02 | HIGH | "Undo theatre" — `useDeckStack` pushed every successful action to `undoStack` but `handleDeckUndo` only reverses dismiss. Fixed via type-narrowed `REVERSIBLE_DECK_ACTIONS = ["dismiss"] as const` allowlist + `isReversibleAction` guard. | `7969542` |
| H-A-03 | HIGH | `PromotionDialog` `success && !data` defensive branch produced contradictory UX (green success toast + card rollback). Fixed by failing loud — destructive toast + `console.error` + dialog stays open. | `7969542` |
| H-T-01 | HIGH | Sprint 1 CRIT-Y1 had no regression guard — deck button 44×44 sizes could silently regress. Added className pinning on DeckCard Info + DeckView Block/Skip/Undo. | `7969542` |
| H-T-03 | HIGH | Sprint 1.5 CRIT-A-06 only covered the DISMISS sheet adapter; promote/superLike/block had no coverage. Extended `StagingContainerDeckSheetRouting.spec.tsx` with 3 more adapter tests. | `7969542` |
| H-T-06 | HIGH | `StagedVacancyCard` body was mouse-only (`role="presentation"` + `onClick`, no keyboard handler). Fixed by removing the body handler entirely; Details button is the sole keyboard entry point. | `7969542` |
| H-NEW-04 | HIGH | Footer buttons (Promote/Dismiss/Archive/Trash/Block/Restore/Details) had generic aria-labels; 20 cards = 120 undifferentiated announcements. Now threads `vacancy.title + employerName` into each button's aria-label. | `7969542` |

### Fixed — Stream C: Blacklist event seam + DB index (2 findings)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-A-05 | HIGH | `companyBlacklist.addBlacklistEntry` retroactively trashed StagedVacancy rows via `updateMany` without emitting domain events. Consumers (audit, notification, analytics) silently missed bulk trashings. Rewrote to use `$transaction` callback form with pre-flight `findMany`; emits one `VacancyTrashed` per row + one `BulkActionCompleted` envelope with `actionType: "blacklist_trash"` post-commit. | `1024dba` |
| H-P-02 | HIGH | `StagedVacancy.employerName` had no index for the new retroactive `updateMany` contains/startsWith filter. Added `@@index([userId, employerName])` via a new Prisma migration `20260409220000_add_staged_vacancy_employer_name_index`. | `1024dba` |

### Fixed — Stream D: Security hardening (5 findings)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-S-01 | HIGH | **SVG XSS loophole — the claimed fix in commit `db2f050` was never actually applied.** `git show --name-only db2f050` revealed the claimed files were never touched, and `__tests__/svg-sanitizer.spec.ts:337-343` literally asserted `data:image/svg+xml` XSS vectors were ALLOWED through. Fixed by closing the `svg+xml` allowlist and inverting the bad assertion. | `5133bb6` |
| H-S-02 | HIGH | Meta parser SSRF allowlist drifted from `validateWebhookUrl` (missing CGNAT 100.64.0.0/10, 192.0.0.0/24, 198.18.0.0/15, 240.0.0.0/4, IPv4-mapped IPv6). Fixed by deleting the local allowlist and delegating to the canonical `validateWebhookUrl`. | `5133bb6` |
| H-S-03 | HIGH | `applyLogoWriteback` persisted tokenized URLs verbatim to `Company.logoUrl`, safe only by the accident that logo-dev pre-cleans. Added defense-in-depth `stripCredentialsFromUrl` at the writeback site. | `5133bb6` |
| H-S-05 | HIGH | `stripTokenFromUrl` only handled `token` param; missed `key`, `api_key`, `access_token`, `sig`, `signature`, `X-Amz-Signature`, `auth`, and 4 more common credential patterns. Replaced with `stripCredentialsFromUrl` covering 11 default parameter names + optional extra list. | `5133bb6` |
| H-T-05 | HIGH | `withEnrichmentLimit` semaphore had zero tests and a race-risk comment. Added `resetSemaphoreForTesting` + `getActiveEnrichmentsCountForTesting` helpers (ESM exports are read-only from consumers) and an 8-test spec covering single-task, max-parallel, race guard, queue drain, error release, and unblock-after-throw. | `5133bb6` |

### Fixed — Stream E: DB + event-bus performance (5 findings)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-P-04 | HIGH | `bulk-action.service.ts` ran 2·N sequential Prisma queries per bulk action (1000 items = 2000 round-trips). Rewrote as batched `findMany` + `updateMany`/`deleteMany`. | `b40e7e8` |
| H-P-05 | HIGH | `retention.service.ts` ran 2·N + batch sequentially (5000 rows = ~10k round-trips). Rewrote as batched `findMany` + dedup pre-filter (SQLite has no `skipDuplicates`) + `createMany` + `deleteMany`, chunked at 300 per call. 5000 rows now ~40 round-trips. | `b40e7e8` |
| H-P-06 | HIGH | `eventBus.publish` dispatched consumers via sequential `for ... await` — any slow consumer blocked every publisher. Fixed via `Promise.allSettled`. OrderGuarantee preserved; consumer ordering assumption verified across all 5 consumers. | `b40e7e8` |
| H-P-07 | HIGH | `runner.ts` dedup scan was unbounded by time — scanned the user's ENTIRE staging history every run. Added 90-day `createdAt` bound + status-aware filter (`notIn: ["dismissed", "promoted"]`). | `b40e7e8` |
| H-P-08 | HIGH | `promoter.ts` ran 3 fuzzy `OR`-`contains` scans INSIDE a write transaction (SQLite global write lock held during scans). Rewrote as two-phase resolve-then-commit — scans run outside the transaction, commit holds the lock briefly. | `b40e7e8` |

### Fixed — Stream F: Test coverage gaps + Jest config (2 findings + orchestrator fixups)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-T-04 | HIGH | 5 production files without matching specs. Created `StagedVacancyCard.spec.tsx` (40 tests), `DiscoveredJobDetail.spec.tsx` (27 tests), `SuperLikeCelebrationHost.spec.tsx` (5 tests). (`NotificationDropdown.spec.tsx` is owned by Stream H; `StagedVacancyDetailContent` confirmed LOW — transitively covered.) | `e446bc6` |
| H-P-03 | HIGH | Jest `collectCoverage: true` default ran v8 coverage on every invocation (3-5× slower). Switched to `collectCoverage: false` default + opt-in `--coverage` flag in `scripts/test.sh`. | `e446bc6` |

### Fixed — Stream G: Accessibility UI components (7 findings)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-Y-01 | HIGH | `MatchScoreRing.tsx` hardcoded English `aria-label="Match score: {score}"`. Added `ariaLabel` + `ariaHidden` props, decorative-by-default. | `3c2f338` |
| H-Y-02 | HIGH | `StagedVacancyDetailContent` MatchScoreRing had no sr-only fallback. Now passes translated `ariaLabel` via the new prop. | `3c2f338` |
| H-Y-03 | HIGH | `DiscoveredJobsList` icon-only Accept/Dismiss buttons had empty accessible names. Added translated, context-rich aria-labels. | `3c2f338` |
| H-Y-04 | HIGH | External-link anchors in DiscoveredJobsList + DiscoveredJobDetail had no accessible name. Added translated `externalLinkAria` with `{job}` and `{employer}` placeholders. | `3c2f338` |
| H-Y-05 | HIGH | `DiscoveredJobsList` clickable `<span>` job title with no keyboard affordance. Replaced with native `<button type="button">` (unstyled visual). | `3c2f338` |
| H-Y-06 | HIGH | `ViewModeToggle` + `KanbanViewModeToggle` color-only active state (WCAG 1.4.1). Migrated to new shared `ToolbarRadioGroup` primitive with Check-glyph overlay. | `3c2f338` |
| H-Y-07 | HIGH | `RecentCardToggle` + `NumberCardToggle` + `WeeklyBarChartToggle` had NO role, NO aria-checked — plain color-swap button groups. Migrated to `ToolbarRadioGroup` primitive. | `3c2f338` |

### Fixed — Stream H: A11y site-wide + NotificationDropdown (5 findings)
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| H-NEW-01 | HIGH | **Site-wide missing skip link (WCAG 2.4.1 Level A).** No `<a href="#main">` anywhere. Added SkipLink as first focusable element in root `<body>`, `<main id="main-content" tabIndex={-1}>` in dashboard layout. | `c85af40` |
| H-NEW-02 | HIGH | Three anonymous `<nav>` landmarks (NVDA: "navigation, navigation, navigation") + no `aria-current="page"` on active NavLink. Added translated aria-labels + `aria-current`. | `c85af40` |
| H-NEW-03 | HIGH | `DashboardError` had 3 hardcoded English strings, no `role="alert"`, no focus management, leaked `error.message` to AT users. Full rewrite with i18n + `role="alert"` + programmatic focus + scrubbed error message. | `c85af40` |
| H-NEW-05 | HIGH | `NotificationDropdown` used `role="feed"` with nested `<section>` children — WAI-ARIA spec violation (feed owns `article` only). Replaced with `role="region"`. Also fixed a subtle DST bug in `getGroupKey`. | `c85af40` |
| H-T-07 | HIGH | `NotificationDropdown.groupNotifications` pure function had no tests + 6 subtle bug classes (DST, timezone, future dates, bucket boundaries, empty-group omission, non-deterministic default `new Date()`). Added 17 regression tests. | `c85af40` |

### Deferred (out of Sprint 2 scope)
| ID | Severity | Summary | Reason deferred |
|----|----------|---------|-----------------|
| H-P-09 | HIGH | **Zero observability infrastructure.** No OpenTelemetry, no Prometheus metrics, no distributed tracing, no Core Web Vitals. Every other perf finding is invisible in production. | Massive cross-cutting piece that deserves its own dedicated sprint with an architectural design phase. Deferring does NOT make any of the other 5 Stream E perf fixes less valid — those stand on their own merits. Tracked in `.team-feature/stream-5b-performance-specialist.md`. |

### Open follow-ups surfaced during Sprint 2 (not in scope for Sprint 3 HIGH tier)
- **`specs/event-bus.allium` out of sync** — still describes the sequential `ErrorIsolation` loop that Stream E's H-P-06 fix replaced with `Promise.allSettled`. Invariants are still preserved, but the spec text should be updated or annotated with a small ADR documenting the switch. Not urgent because the invariants are still correct.
- **`StagingContainer.handleDeckAction:296-301` has a similar H-A-03 defensive branch** that still silently proceeds with `createdJobId:undefined` in the auto-approve flow. Stream B fixed only the PromotionDialog side; the StagingContainer side is a symmetric leak that a follow-up should patch the same way (destructive toast + early return).
- **`StagingLayoutToggle` not migrated to `ToolbarRadioGroup` primitive** (Sprint 1 CRIT-Y2 owner, intentionally not touched). Two implementations of the same pattern coexist until a future migration. The primitive's spec enforces the same invariants, so migration will be behavior-preserving.
- **`src/app/global-error.tsx`** likely has the same hardcoded-English issue that Stream H fixed for the dashboard error boundary. Not in Sprint 2 scope; should be audited in a follow-up.
- **`/signin` + `/signup` layouts don't render `<main id="main-content">`**, so the skip link is a no-op on auth pages. Follow-up: add the main landmark to the auth layout.
- **`NavLink` active-route detection uses `pathname.startsWith(\`${route}/dashboard\`)`** which looks like a pre-existing typo. NOT fixed by Stream H (unrelated to a11y scope). Flagged for architecture review.
- **`WeeklyBarChartToggle` chart labels still English** ("Jobs", "Activities") — they are caller-provided `label` field on `ChartConfig`. Requires a ChartConfig `labelKey`/`labelFallback` refactor, out of scope for Stream G.
- **`Sidebar` secondary `<nav>` wrapping a single link** — the a11y specialist review suggested demoting it from a `<nav>` landmark to a plain `<div>` on the grounds that "a single link is not a navigation landmark" (WAI-ARIA landmark guidelines recommend against landmarks with only one meaningful child). Stream H took the less disruptive fix — added an `aria-label` — but the cleaner structural refactor is still pending. Low-severity a11y cleanup; fold into a future sprint that touches Sidebar.

### Skill invocation test results (Sprint 2)
All 8 Sprint 2 stream agents invoked their assigned skills via the Skill tool with the combined (a)+(b) instrumentation. The verbatim quoted passages + rejected alternatives were present in every report. Specialization uplift from the spot-check phase (~82% median on HIGH findings) justified the pattern. Skills used:
- `backend-development:architecture-patterns` — Streams A, B, C
- `security-scanning:threat-mitigation-mapping` — Stream D
- `developer-essentials:sql-optimization-patterns` — Stream E
- `javascript-typescript:javascript-testing-patterns` — Stream F
- `ui-design:accessibility-compliance` — Streams G, H

### Honesty-gate catches during Sprint 2
1. **`db2f050` claimed SVG sanitizer fixes that were never applied** (Stream D / H-S-01). `git show --name-only db2f050` revealed the claimed files were never touched, AND the test file literally encoded the vulnerability as expected behavior. This is a paper-trail honesty failure from a prior sprint; Sprint 2 fixed both the code and the test.
2. **22/3792 test failures discovered during the final verification run** (not during agent-level tsc checks) — all test-side issues, no production bugs. Fixed inline:
   - Stream D's enrichment-trigger-semaphore had 8 failures because ESM `export let` is read-only from consumers; fixed by adding `resetSemaphoreForTesting` helper.
   - Stream E's retention.spec had 6 failures because `jest.clearAllMocks()` doesn't drain unconsumed `mockResolvedValueOnce` queue values (leaking between tests); fixed by switching to `mockReset`.
   - Stream F's DiscoveredJobDetail had 4 failures because DialogTitle accessible name includes the external-link aria-label (exact-match vs regex); fixed by switching to regex matching. Also fixed a wrong expectation about the raw-enum fallback.
   - Stream F's StagedVacancyCard had 1 failure because the CompanyLogo mock rendered the employer name as children, creating a multi-match; fixed by making the mock empty.
   - Stream B's DeckView H-T-01 Undo test had 1 failure because real-timer + setTimeout(400) raced against useDeckStack's internal setTimeout(300); fixed by switching to `jest.useFakeTimers()` + `advanceTimersByTime`.
   - Stream E's runner-dedup-bounds had 1 failure because raw-ms subtraction drifts by the DST offset when production uses `setDate(getDate() - 90)`; fixed by using the same calendar-day math.
   - Stream C's companyBlacklist refactor broke `security-sprint-c.spec.ts:SEC-14` which still mocked the array-form `$transaction`; fixed by updating the mock to invoke the callback.

## Sprint 1.5 CRITICAL Hotfixes (2026-04-09)

Out-of-cycle security hotfixes triggered by the specialist-reviewer pass
(`.team-feature/stream-5b-security-specialist.md`). Both findings were missed
by Sprint 1's team review + Sprint 2 Phase 1 baseline reviewers.

### Fixed — Security (1 finding)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CRIT-S-04 | **CRITICAL** | `src/actions/module.actions.ts:activateModule/deactivateModule` were `"use server"` exports that accepted any authenticated user and toggled modules GLOBALLY across all tenants. Any logged-in user could call `deactivateModule({ moduleId: "eures" })` from devtools and pause every other user's EURES automations on the deployment — one-line cross-tenant privilege escalation (OWASP A01). Missed by `/agent-teams:team-review` Stream 5, Sprint 1 CRIT-A1 (which refactored the same function without reviewing its auth), and all 5 baseline Sprint 2 reviewers. Only the specialist `comprehensive-review:security-auditor` caught it (H-S-04). | Added `src/lib/auth/admin.ts` + `src/lib/auth/admin-rate-limit.ts`. Introduced tiered admin authorization (Tier A: `ADMIN_USER_IDS` env var allowlist — matches ADR-018 pattern; Tier B: sole-user-in-DB implicit admin for zero-config self-hosted UX; Tier C: multi-user without env var fails closed). Gated `activateModule` and `deactivateModule` with `authorizeAdminAction()` + `checkAdminActionRateLimit()` (10/min per user). Every admin call emits a structured `[admin-audit]` JSON line to stderr for observability. Added new invariant `AdminOnlyModuleLifecycle` to `specs/module-lifecycle.allium` and wired it into the `ModuleActivation` / `ModuleDeactivation` rules. Added 10 regression tests covering all three tiers, the stale-session guard, rate-limit overflow, and the DB-error fail-closed path. |

### Fixed — Architecture (1 finding)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CRIT-A-06 | **CRITICAL** | The ADR-030 Decision C hotfix commit `2caab7e` was semantically incomplete: it routed the `StagedVacancyDetailSheet` adapters in deck mode to `StagingContainer.handleDeckAction`, which is the SERVER-ACTION dispatcher consumed by `useDeckStack` via its `onAction` prop — NOT the state machine `useDeckStack.performAction` itself. Result: when the user dismissed from the sheet in deck mode, the server dismiss succeeded but `currentIndex`, `undoStack`, `stats`, and the exit animation all stayed stale — the card remained visible in front of the user after the sheet closed. Promote/superlike/block masked the symptom via the auto-approve `reload()` path, but dismiss (which has no `reload()`) fully exposed the bug. No test caught it because the existing sheet test was isolated with mocked callbacks and never mounted a real `StagingContainer` + `DeckView` + `useDeckStack` integration. Architecture specialist finding H-A-06 in `.team-feature/stream-5b-architecture-specialist.md`. The honesty gate had claimed the Decision C invariant was enforced — in reality, the invariant was false in the code. | Refactored `src/components/staging/DeckView.tsx` to `forwardRef` with a `DeckViewHandle` interface that exposes the hook's public imperatives (`dismiss`, `promote`, `superLike`, `block`, `skip`) via `useImperativeHandle`. Rewrote the sheet adapters in `src/components/staging/StagingContainer.tsx` so that `detailsDismissAdapter`, `detailsPromoteAdapter`, `detailsSuperLikeAdapter`, and `detailsBlockAdapter` call `deckViewRef.current?.<action>()` in deck mode — the SAME imperatives the swipe handlers and action-rail buttons invoke. `handleDeckAction` now remains exclusively the `onAction` dispatcher for the hook. Added `__tests__/StagingContainerDeckSheetRouting.spec.tsx` — a NEW integration test that mounts the real container + view + hook + sheet and asserts the deck counter advances from "1 / 3" to "2 / 3" after a sheet-originated dismiss (the regression that had no prior test coverage). Updated ADR-030 Decision C with a Sprint 1.5 correction note and strengthened `DeckActionRoutingInvariant` in `specs/vacancy-pipeline.allium` to explicitly distinguish `performAction` (state machine) from `handleDeckAction` (server-action dispatcher). |

### Skill invocation test result
Sprint 1.5 continues the Sprint 1 experiment of delegating work to subagents with explicit skill invocation instructions. The CRIT-S-04 agent invoked `backend-development:architecture-patterns`, quoted a literal load-bearing passage from the skill, named three concrete rules that shaped the fix, and named one alternative it rejected because of a specific rule from the skill. See the agent's final report for the combined (a)+(b) instrumentation output.

### Open follow-ups (out of scope for this hotfix)
- ~~`.env.example` needs a new `ADMIN_USER_IDS` entry — the hotfix scope did not include `.env.example`, so the orchestrator should append this in the merge commit or a follow-up.~~ **CLOSED** by commit `5265a7a`: `.env.example` now has a documented `ADMIN_USER_IDS` block with the Tier A/B/C rule and example values.
- `src/lib/connector/degradation.ts` still bypasses the admin gate for its internal signals (`handleAuthFailure`, `handleCircuitBreakerTrip`, `checkConsecutiveRunFailures`). This is **intentional** per the existing `AutomationDegradation` rules — module-level runtime signals affect the shared external service and are not user-initiated toggles. Sprint 3 Stream C added explicit inline invariant comments to `degradation.ts:checkConsecutiveRunFailures` documenting the per-automation scope and the system-initiator carve-out. `handleAuthFailure` and `handleCircuitBreakerTrip` are intentionally cross-user (module-level failures affect ALL users running that module — by design per Allium spec and CLAUDE.md § Cross-User Degradation).
- Promoting `[admin-audit]` from `console.warn` to a dedicated `AdminAuditLog` Prisma model is a follow-up sprint task — the hotfix pipeline cannot run migrations, so audit entries currently live only on stderr. The structured JSON format is stable enough to be ingested by a log aggregator in the interim, but a Prisma model would give query-ability + retention policy + admin UI review.
- ~~**`runHealthCheck` in `src/actions/module.actions.ts` is NOT admin-gated.**~~ **CLOSED by Sprint 3 Stream C audit (2026-04-09).** Full call-chain trace of `checkModuleHealth` in `src/lib/connector/health-monitor.ts` confirms: (a) it calls `moduleRegistry.updateHealth(moduleId, newHealthStatus, ...)` — writes ONLY health-status fields (HEALTHY/DEGRADED/UNREACHABLE), NOT activation status; (b) it calls `prisma.moduleRegistration.upsert({ update: { healthStatus, updatedAt } })` — NOT `status` (active/inactive). Neither write calls `moduleRegistry.setStatus()`. Health-status changes do NOT pause any user's automations and do NOT alter the activation state visible in the module toggle UI. Conclusion: `runHealthCheck` is **confirmed-safe** without an admin gate. The per-user rate limit (`checkHealthCheckRateLimit`) and the read-mostly nature of health checks are sufficient bounds. The distinction from CRIT-S-04 is: activation/deactivation toggling module.status → pauses N users' automations (cross-tenant write cascade); health checks write module.healthStatus → zero downstream cascade, informational only. Documented in `specs/module-lifecycle.allium` and `src/actions/module.actions.ts:runHealthCheck` inline comments (Sprint 3 Stream C).
- **Multi-user upgrade UX (accepted regression)**: on any deployment with more than one user, leaving `ADMIN_USER_IDS` unset after this hotfix lands will cause the Settings UI module activate/deactivate toggles to return `UNAUTHORIZED`. This is the intended Tier C fail-closed behavior (documented in CLAUDE.md § Admin Authorization Tiered Rule, `.env.example`, and `specs/module-lifecycle.allium` invariant `AdminOnlyModuleLifecycle`) — NOT a bug to fix, but operators upgrading across this commit range MUST configure `ADMIN_USER_IDS` and restart before the Settings UI toggles will work. This should be called out in release notes when the next release ships.

## Sprint 1 CRITICAL Fixes (2026-04-09)

5 findings from the `/agent-teams:team-review` run (Stream 5 of the UX sprint). Scope: 2 architecture + 3 accessibility.

### Fixed — Architecture (2 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CRIT-A1 | **CRITICAL** | `src/actions/module.actions.ts:deactivateModule` called `prisma.notification.createMany()` directly with a pre-composed English string. Violated `LateBoundLocale` (non-English users saw English text), violated the aspirational `SingleNotificationWriter` invariant, and the adjacent `notification-dispatcher.handleModuleDeactivated` handler was dead code because `ModuleDeactivated` was subscribed but never emitted. | Deleted the direct `createMany` call and replaced it with `emitEvent(createEvent(DomainEventTypes.ModuleDeactivated, ...))` — one event per distinct affected user. The dispatcher handler now activates as the single writer, populates 5W+H structured fields, and routes through all enabled channels. Side-effect: users get ONE summary notification per deactivation (previously N, one per paused automation). Removed `module.actions.ts` from `scripts/check-notification-writers.sh` allowlist. |
| CRIT-A2 | **CRITICAL** | `PromotionDialog.onSuccess: () => void` dropped the created `jobId` returned by `promoteStagedVacancyToJob`. `promotionResolveRef.current({ success: true })` then resolved `useDeckStack.performAction` without `createdJobId`, so the super-like celebration fly-in was dead in the default (auto-approve=OFF) flow. No test caught it because every existing test mocked or used the auto-approve path. | Refined `onSuccess` to `(result: PromotionDialogSuccessResult) => void`, destructured `result.data.jobId` in `handlePromote`, and updated `StagingContainer`'s `<PromotionDialog onSuccess>` callback to resolve the ref with `{ success: true, createdJobId: result.jobId }`. Added 5 regression tests covering the happy path, the full resolveRef chain, the microtask race with `onOpenChange`, the failure path, and a defensive `success && !data` warn-and-drop branch. |

### Fixed — Accessibility (3 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CRIT-Y1 | **CRITICAL** | DeckCard Info button was `h-7 w-7` (28×28 px) — fails WCAG 2.5.8 AA (24×24 minimum for adjacent targets) and 2.5.5 AAA (44×44). DeckView Block / Skip / Undo buttons were `h-10 w-10` (40×40) — pass AA but fail AAA. | Info button grown to 44×44 via an invisible hit-area wrapper (visible 28×28 pill preserved inside, feedback forwarded via Tailwind `group-hover` / `group-active`). Block/Skip/Undo grown from 40×40 to 44×44 directly. Focus ring preserved; keyboard `i` shortcut unchanged. Full 29-test suite passing (DeckCard + DeckView + a11y-deck-view). |
| CRIT-Y2 | **CRITICAL** | `StagingLayoutToggle` signalled the active radio ONLY via background color (fails WCAG 1.4.1 Use of Color). Each radio had THREE redundant accessible name sources: `aria-label`, `sr-only` span, AND `title` attribute (causing multi-announcement + keyboard-interfering tooltip). | Added a `Check` glyph overlay (absolute, `pointer-events-none`, `aria-hidden`) in the top-right corner of the active radio — shape-based indicator survives protanopia/deuteranopia/tritanopia/forced-colors. Kept ONLY `aria-label`; removed `sr-only` span and `title` attribute. Layout dimensions unchanged. Added 14 unit tests covering the non-color indicator, keyboard nav, E2E selector preservation, and accessible name hygiene. |
| CRIT-Y3 | **CRITICAL** | `SuperLikeCelebration` had 4 a11y issues: (1) "Open job" CTA was keyboard-orphaned (no programmatic focus on mount), (2) no global Escape listener (inner onKeyDown only fired if user had already Tab-ed in), (3) `aria-label` on the `role="status"` container masked the vacancy title from screen readers, and (4) auto-dismiss timer was not focus-pause-aware (only pointer-pause), violating WCAG 2.2.1. | (1) `ctaRef` + 320ms-delayed mount-focus effect respecting `prefers-reduced-motion`. (2) Global `document.addEventListener("keydown", ...)` with cleanup on unmount, guarded by `isExiting`. (3) Replaced static `aria-label` with `aria-labelledby={\`${titleId} ${subtitleId}\`}` via `useId()`, so the announcement contains BOTH "Super-liked!" and the vacancy title. (4) `skipNextFocusPauseRef` flag consumed by `handleFocusIn` so the programmatic mount-focus does not pause the timer indefinitely; subsequent user focus events pause normally. Added 9 new tests (25 total in the suite). |

### Honesty gate catch
ADR-030 had originally speculated that `deactivateModule` duplicated the dispatcher's work. During CRIT-A1 remediation, the agent discovered this was FACTUALLY WRONG — the dispatcher handler was dead code (event declared + subscribed but never emitted). The fix is still correct (activates the handler) but the UX side-effect is different from what the ADR predicted: fewer notifications per deactivation, not de-duplication of existing duplicates. ADR-030 has been corrected.

### Skill invocation test result
Sprint 1 was an experiment in delegating work to subagents with explicit skill invocation instructions ("invoke `<skill>` via the Skill tool before planning"). All 5 agents invoked their assigned skill (`backend-development:architecture-patterns` for A1/A2, `ui-design:accessibility-compliance` for Y1/Y2/Y3) and reported the concrete rules that shaped their fix. Option 3 from the pre-sprint plan (delegated with explicit skill invocation) worked as intended.

## UX Sprint + Honesty Gate Fixes (2026-04-09)

### Fixed — UI / Rendering (1 finding)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| HYDR-1 | MEDIUM | `<div>` cannot be a descendant of `<p>` in DeckCard. After the Building2 → CompanyLogo swap, `CompanyLogo` (which renders a `<div role="img">`) was wrapped in a `<p>` tag in `DeckCard.tsx` / `StagedVacancyCard.tsx`, causing React hydration errors on the staging page. | Changed the wrapper `<p>` to `<div>`. Fixed in commit `b69c6e1`. |

### Fixed — i18n / Late-Binding (1 finding, 5 sites)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| NOTIF-LB1 | MEDIUM | Notification dispatcher stored locale-resolved strings in `Notification.message` at dispatch time, freezing notifications into the dispatcher-time locale. Same bug existed in 5 sites: `notification-dispatcher.ts` + `degradation.ts` (3 sites, `handleAuthFailure`/`checkConsecutiveRunFailures`/`handleCircuitBreakerTrip`) + `webhook.channel.ts` (2 sites, `notifyDeliveryFailed`/`notifyEndpointDeactivated`). | Store `titleKey + titleParams` in `data: Json` and resolve at render time via `formatNotificationTitle(data, message, t)`. Legacy `message` kept as English fallback for email/webhook/push. Dispatcher fixed in previous sprint (commit `42ea3cb`); degradation + webhook.channel fixed in Stream C this sprint. See ADR-030. |

### Fixed — UX / Action Routing (1 finding)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| DECK-ROUTE1 | **HIGH** | `StagedVacancyDetailSheet` action buttons in deck mode bypassed `useDeckStack.performAction`, silently breaking deck stats, undo stack, exit animation, card advancement, and the super-like celebration fly-in. Additionally, `onSuperLike={detailsPromoteAdapter}` wired super-like to the promote adapter by mistake — super-like from the sheet silently behaved as a plain promote. | Made sheet adapters mode-aware: deck-mode actions route through `handleDeckAction(vacancy, action)`, list-mode actions use the direct handlers. Added `detailsSuperLikeAdapter`. Fixed in hotfix commit `2caab7e`. See ADR-030. |

## Cross-User Enrichment Cache Fix (2026-04-08)

### Fixed — Security (1 finding)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CACHE-1 | **HIGH** | Enrichment in-memory cache key did not include userId, allowing cross-user data leakage. User B could receive User A's cached enrichment result, bypassing DB persistence and audit trail. | Added userId to `buildEnrichmentCacheKey()` in orchestrator.ts. See ADR-029. |

## Bugfix Session (2026-04-08)

### Fixed — Test Failures (5 suites, 23 tests)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BF-T1 | **HIGH** | notification-dispatcher: missing `prisma.automation.findFirst` mock | Added mock |
| BF-T2 | **HIGH** | CreateResume/AddJob/ProfileContainer: missing `useRouter` mock | Added next/navigation mock |
| BF-T3 | MEDIUM | CreateResume: ambiguous "Save" button match (2 buttons) | `getAllByRole` instead of `getByRole` |

### Fixed — i18n (4 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BF-I1 | MEDIUM | staging.promote DE: "befoerdern" (missing umlaut) | Fixed to "befördern" |
| BF-I2 | MEDIUM | 4 missing settings.notificationType keys for Settings UI | Added in all 4 locales |
| BF-I3 | LOW | NotificationItem "Dismiss" aria-label hardcoded English | i18n key `notifications.dismiss` |
| BF-I4 | LOW | Unused `Trash2` import in NotificationItem | Removed |

### Fixed — Notifications (3 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BF-N1 | **HIGH** | `NotificationDraft.data` not persisted to DB (jobId lost) | `data Json?` field + migration |
| BF-N2 | MEDIUM | vacancy_promoted notification has no link to created job | `getNotificationLink()` + `notifications.viewJob` i18n |
| BF-N3 | MEDIUM | "Mark all as read" button text always visible | Icon-only with aria-label/title |

### Fixed — API Key ENV Sync (1 finding)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BF-E1 | MEDIUM | .env API keys invisible in Settings UI | `getEnvApiKeyStatus()` + blue ENV badge |

### Fixed — DeckView UX (7 features)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BF-D1 | **HIGH** | No block company action in deck | Swipe-down + Ban button + confirmation dialog |
| BF-D2 | MEDIUM | No skip/next action in deck | Skip button + N key |
| BF-D3 | MEDIUM | No auto-approve option | Checkbox with localStorage + hint text |
| BF-D4 | MEDIUM | No button highlight on swipe | Conditional ring-2 + scale-110 |
| BF-D5 | MEDIUM | Card too narrow on desktop | Responsive max-w-lg md:max-w-xl lg:max-w-2xl |
| BF-D6 | LOW | Cancel promotion doesn't return card to deck | Promise-ref pattern |
| BF-D7 | LOW | Keyboard shortcuts missing for new actions | B/ArrowDown = block, N = skip |

### Fixed — VERIFY Findings (20 findings from design review + silent failure hunter)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| BF-V1 | **CRITICAL** | Block company no confirmation dialog | AlertDialog with company name + consequences |
| BF-V2 | **CRITICAL** | Promise-ref leak on unmount → permanent UI freeze | useEffect cleanup |
| BF-V3 | **CRITICAL** | Silent JSON parse catch in NotificationItem | console.warn logging |
| BF-V4 | **HIGH** | getEnvApiKeyStatus reuses wrong error key | Distinct error key |
| BF-V5 | **HIGH** | ApiKeySettings silently ignores server action failures | Error logging + catch handlers |
| BF-V6 | **HIGH** | Block silently skips when employerName missing | Guard + error toast |
| BF-V7 | **HIGH** | useDeckStack .catch() swallows all errors | console.error logging |
| BF-V8 | **HIGH** | useDeckStack undo .catch() suppresses errors | console.error logging |
| BF-V9 | MEDIUM | NotificationDropdown no feedback on action failures | Error toasts added |
| BF-V10 | MEDIUM | localStorage catches don't log | console.warn added |
| BF-V11 | MEDIUM | PromotionDialog missing catch block | catch + error toast |
| BF-V12 | MEDIUM | Auto-approve localStorage read no logging | console.warn added |
| BF-V13 | MEDIUM | Action buttons without visual grouping | Dividers between groups |
| BF-V14 | MEDIUM | Auto-approve no explanation | Hint text via i18n |
| BF-V15 | MEDIUM | Notification job link too subtle | Own line, text-primary |
| BF-V16 | MEDIUM | Skip/undo buttons visually identical | Undo: dashed border |

### Infrastructure
| ID | Finding | Fix |
|----|---------|-----|
| BF-INF1 | `.tracks/` directories (2.8GB) causing Jest duplicate mock warnings | Removed |

## Manifest v2 Self-Contained Modules (2026-04-08)

### Fixed in Manifest v2 — CHECK Phase (13 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| MV2-C1 | **CRITICAL** | enrichment.actions.ts missing register-all import (silent empty enrichment) | Added import |
| MV2-C2 | **CRITICAL** | health-scheduler.ts missing register-all import (0 health timers) | Added import |
| MV2-C3 | **CRITICAL** | Silent catch hides notification failures on module deactivation | Added error logging |
| MV2-H1 | HIGH | syncRegistryFromDb swallows all DB errors silently | Added error logging |
| MV2-H2 | HIGH | checkModuleHealth fire-and-forget discards errors | Added error logging |
| MV2-H3 | HIGH | handleHealthCheck catch has no error variable (3 components) | Added error + console.error |
| MV2-I1 | IMPORTANT | ApiKeySettings uses module.name instead of manifest.i18n | Migrated to i18n pattern |
| MV2-M1 | MEDIUM | No English intermediate fallback in getModuleDescription | Added en fallback chain |
| MV2-M2 | MEDIUM | No English intermediate fallback in ApiStatusOverview | Added en fallback chain |
| MV2-M3 | MEDIUM | Registry register() silently ignores duplicate IDs | Dev-mode console.warn |
| MV2-M4 | MEDIUM | Health monitor DB persistence catch is silent | Added error logging |
| MV2-L1 | LOW | Test mock has stale i18n keys (dead code) | Removed stale keys |
| MV2-S1 | SPEC | CachePolicy value type missing from Allium spec | Added to spec |

### Deferred (Allium weed — pre-existing, not Manifest v2)
| ID | Severity | Finding | Reason |
|----|----------|---------|--------|
| AW-1 | LOW | RegisteredModule.activatedBy in spec but not in code | Audit trail aspirational — implement when needed |
| AW-2 | LOW | automationType optional in code vs defaulted in spec | TypeScript idiomatic — all modules set explicitly |

## ESCO Occupation URI Persistence Fix (2026-04-06)

### Fixed — ESCO URIs not persisted (1 finding)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| ESCO-1 | **CRITICAL** | EuresOccupationCombobox stored ESCO title as keyword instead of URI; EURES connector searched by free-text instead of occupationUris filter | Store URI as keyword value, resolve titles for display via ESCO details API; chips show "Title (Code)" not raw URI; new EscoKeywordBadge component for list/detail/review display |

## S5b-Resume Review Findings (2026-04-05)

### Fixed in S5b-Resume — Comprehensive Review (33 findings)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| A1 | **CRITICAL** | sendTestPush sends raw i18n key "push.testBody" as notification body | Translate via t(locale, key) before dispatch |
| A2 | HIGH | sendTestPush uses wrong NotificationType module_unreachable | Changed to vacancy_promoted |
| A3 | HIGH | sendTestPush double-charges rate limits (new PushChannel instance) | Direct web-push call, bypassing dispatch rate limit |
| A4 | HIGH | PushChannel deletes subscriptions on 401/403 (VAPID auth = transient) | Only delete on 404/410, preserve on 401/403 |
| A5 | MED | No input length validation on subscribePush | Max lengths: endpoint 2048, p256dh 256, auth 128 |
| A6 | LOW | PushSettings uses pushTestFailed toast for non-test errors | Dedicated pushSubscribeFailed/pushUnsubscribeFailed keys |
| B1 | **HIGH** | SmtpSettings inputs not in form element (WCAG 1.3.1) | Wrapped in form with onSubmit |
| B2 | HIGH | Password toggle tabIndex={-1} (keyboard unreachable) | Removed tabIndex |
| B3 | HIGH | No progress indication during 30s SMTP timeout | Added smtpTestingConnection i18n text |
| B4 | HIGH | Edit/Delete clickable during test-in-flight | Disabled when testing |
| B5 | MED | SmtpSettings Edit button reuses Save i18n key | New smtpEdit key |
| B6 | MED | Missing aria-required on required inputs | Added aria-required="true" |
| B7 | MED | Missing aria-live for cooldown countdown | Added aria-live="polite" |
| B8 | MED | VAPID rotation button uses primary not destructive styling | Changed to destructive variant |
| B9 | MED | Push Enable stays clickable after browser blocks permission | Disabled + hint text |
| B10 | MED | autoComplete="new-password" triggers password gen | Changed to current-password |
| C1 | HIGH | Sequential channel dispatch blocks push behind SMTP | Promise.allSettled for concurrent dispatch |
| C2 | HIGH | 6 channel files missing import "server-only" | Added to all 6 files |
| C3 | MED | Dispatcher 2 DB calls for same user row | Combined into resolveUserSettings |
| D1 | HIGH | resolveUserLocale duplicated 4x with inconsistent behavior | Extracted to shared locale-resolver.ts |
| D2 | HIGH | Nodemailer transport config duplicated | Extracted to shared email/transport.ts |
| D4 | MED | buildNotificationMessage double replacement bug | Single PLACEHOLDER_MAP pass |
| D5 | MED | No input length validation on saveSmtpConfig | Max lengths: host 255, username 255, password 1024, from 320 |
| D6 | MED | Email template footer contrast 4.2:1 < 4.5:1 AA | Changed to #636363 (4.78:1) |
| D7 | MED | Plain-text email body no control-char sanitization | sanitizePlainText strips control chars |
| L1 | LOW | ToastProvider missing explicit duration | Added duration={5000} |
| L2 | LOW | StatusFunnelWidget no hover tooltips | Added title with count + percentage |
| L3 | LOW | StatusHistoryTimeline no pagination | take:50 + Load more button |
| L5 | LOW | totalJobs not displayed in funnel | Added "N jobs tracked" line |

### Deferred to Next Session (documented, not S5b-resume bugs)
| ID | Severity | Finding | Reason |
|----|----------|---------|--------|
| PERF-2 | HIGH(perf) | Sync PBKDF2 in encryption.ts blocks event loop | Shared module needs broader testing |
| PERF-3 | HIGH(perf) | 15 redundant DB queries per notification | Architectural refactor (DispatchContext) |
| PERF-4 | MED(perf) | No SMTP connection pooling | Enhancement, backlog |
| FL-3 | MED | auth.actions.ts signup/authenticate no rate limiting | Pre-existing, not S5b-introduced |

## S5b Review Findings (2026-04-05)

### Fixed in S5b — CHECK Phase (6 findings + 1 pre-existing test fix)
| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S5b-F01 | **HIGH** | sw-push.js open redirect via push payload URL | Validate relative path, block external URLs |
| S5b-F02 | MEDIUM | Unused `t()` import in email.channel.ts | Removed |
| S5b-F03 | MEDIUM | Hardcoded English aria-labels on password toggle | i18n keys for show/hide password |
| S5b-F04 | MEDIUM | HTML lang="en" hardcoded in email templates | Locale-aware `<html lang>` |
| S5b-F05 | MEDIUM | Push 404 not treated as stale subscription | Cleanup on 404+410 |
| S5b-F06 | MEDIUM | Missing role="alert" on error states | Added to SmtpSettings + PushSettings |
| S5b-F07 | MEDIUM | env-sync.spec.ts failing (pre-existing) | Aligned with allowlisted keys + auth gate |

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
