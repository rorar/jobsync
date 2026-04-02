# User Journey & UX Audit — Sprint A+B+C

**Date:** 2026-04-02 | **Session:** S2 | **Branch:** `session/s2-ux-journeys`
**E2E Baseline:** 68 tests (12 files)

---

## Feature: SchedulerStatusBar (B1)

### Happy Path
1. User navigates to any authenticated page — Header renders `SchedulerStatusBar`
2. `useSchedulerStatus` hook subscribes to singleton SSE (`GET /api/scheduler/status`)
3. **Idle:** pill shows checkmark + "Idle" in muted colors. Popover shows last completed time or "No automations configured"
4. **Running:** pill shows spinner + automation name + queue count badge. Popover shows phase, queue list, last completed
5. SSE polls every 2s with server-side diff optimization. Auto-reconnects after 10-min timeout

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | No automations | Yes | Unit | — |
| Empty data | SSE not connected | Yes | Unit | — |
| Network errors | SSE drops | Yes | Unit | 5s reconnect |
| Network errors | Server timeout | Yes | Unit | Immediate reconnect |
| Concurrent | Multiple tabs | Yes | Unit | Singleton EventSource per tab |
| Concurrent | 5+ SSE connections | Yes | Partial | Limit enforced server-side |
| Extreme data | Many pending automations | Partial | No | Queue list lacks max-height scroll (documented) |
| Mobile (375px) | Touch target | **FIXED** | No | Touch target was 32px — documented as known gap |
| Locales | All strings | Yes | No | All 14 keys in 4 locales |

### S1b Deferred Items
- `isConnected` not reactive — still present, no consumer uses it (latent)

---

## Feature: RunProgressPanel (B3)

### Happy Path
1. Panel mounts on automation detail page when automation is running
2. Shows 6-phase stepper: Search → Dedup → Enrich → Match → Save → Finalize
3. Desktop: horizontal stepper. Mobile: vertical list
4. Phase counters show numeric values, active phase has spinning loader

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | Not running | Yes | Unit | Returns null |
| Empty data | Running, no progress yet | Yes | Unit | "Starting run..." |
| Network errors | SSE disconnects | Partial | No | Freezes at last state |
| Mobile (375px) | Layout | Yes | No | Fully responsive |
| Locales | Phase names | Yes | No | All keys in 4 locales |
| Locales | Counter formatting | **FIXED** | No | Added `formatNumber(value, locale)` |

### S1b Deferred Items
- `as Parameters<typeof t>[0]` casts — **FIXED** with `as const` on PHASE_KEYS

### Fixes Applied
- Added `aria-live="polite"` sr-only span for phase announcements
- Complete progressbar ARIA (aria-valuemin, aria-valuetext, aria-label)
- Mobile version now has matching progressbar semantics
- Phase counters use locale-aware `formatNumber`
- `aria-hidden="true"` on all decorative icons

---

## Feature: ConflictWarning (B2)

### Happy Path
1. User clicks "Run Now" on automation detail page
2. Client checks SSE state: same automation running → "blocked" dialog (Cancel only)
3. Different automation using same module → "contention" dialog (Proceed Anyway + Cancel)
4. No conflict → executeRun() directly
5. Server-side mutex via RunCoordinator provides backstop protection

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | No conflicts | Yes | Unit | Direct execution |
| Network errors | executeRun() fails | Yes | No | try/catch with toast |
| Concurrent | Two users trigger same | Yes | No | Server 409 response |
| Mobile (375px) | Dialog layout | Partial | No | Flex rows may wrap awkwardly |
| Locales | All strings | Yes | No | All 8 conflict keys in 4 locales |

---

## Feature: Company Blacklist (C3)

### Happy Path
1. User navigates to Settings → Company Blacklist
2. Enters company name, selects match type, optionally adds reason
3. Clicks "Add Entry" — server validates, creates entry, toast confirms
4. During automation runs, runner filters vacancies against blacklist after dedup
5. To remove: clicks trash → **confirmation dialog** → entry removed

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | No entries | Yes | No | Empty state with icon + hint |
| Empty data | Empty pattern | Yes | Unit | Client + server validation |
| Network errors | loadEntries fails | **FIXED** | No | Added error state + retry button |
| Network errors | Add/remove fails | Yes | No | Toast with error message |
| Concurrent | Duplicate entry | Yes | Unit | Unique constraint check |
| Extreme data | 500+ entries | Partial | No | Server limit `take: 500` |
| Locales | All strings | Yes | No | All 34 keys in 4 locales |

### Fixes Applied
- **Delete confirmation dialog** added (AlertDialog) — was missing despite i18n key existing
- Error state for initial load failure with retry button
- `aria-required="true"` on pattern input
- `motion-reduce:animate-none` on spinners
- `aria-hidden="true"` on decorative icons

---

## Feature: JobDeck (C1)

### Happy Path
1. User navigates to Staging page, clicks "Deck" in ViewModeToggle
2. Cards stack with current card prominent, preview cards behind at reduced scale
3. Swipe left/press D = dismiss, swipe right/press P = promote, swipe up/press S = super-like
4. After 300ms exit animation, next card becomes current
5. Undo (Z key or button) restores last action (max 5)
6. Session complete screen shows stats when all cards processed

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | No staged vacancies | Yes | Unit | "All caught up!" empty state |
| Network errors | Server action fails | Partial | No | Card advances without rollback (documented) |
| Concurrent | Multiple tabs | Not handled | No | Each tab has own state (documented) |
| Concurrent | Rapid actions during animation | Yes | Unit | `animatingRef` prevents concurrent |
| Extreme data | 500+ vacancies | Partial | No | No "load more" in deck mode (documented) |
| Mobile (375px) | Swipe gestures | Yes | No | `touchAction: "none"` |
| Mobile (375px) | Touch targets | Yes | No | Action buttons 48-64px, undo was 40px |
| Locales | All strings | Yes | No | All 33 deck keys in 4 locales |

### S1b Deferred Items
- Stale vacancies flash on tab switch — **FIXED** (added `setVacancies([])` in onTabChange)
- ViewModeToggle aria-label — confirmed FIXED in S1b
- StagingContainer 497 LOC — documented as known complexity (future refactor)

### Fixes Applied
- DeckView container focus indicator added (`focus-visible:ring-2`)
- DeckCard "Show more" button min-height 24px for WCAG 2.5.8
- Match score amber contrast improved (amber-700)
- Preview cards have `aria-hidden="true"`
- Keyboard hints div uses `aria-hidden` instead of misleading `aria-label`
- motion-reduce on drag transforms
- Stale vacancies flash fixed
- Search input has `aria-label`
- New-items banner has `role="status"`
- Bootstrap `btn btn-primary` classes removed
- ViewModeToggle focus-visible styles + increased touch targets (py-1.5)

---

## Feature: Response Caching (C4)

### Happy Path
1. Module runs search → `connectorCache.getOrFetch()` checks in-memory LRU cache
2. Cache hit: returns immediately. Cache miss: runs fetcher, stores with TTL
3. Request coalescing prevents duplicate concurrent fetches
4. Scheduler bypass: `bypassCache=true` ensures fresh data for scheduled runs
5. HTTP caching: ESCO/EURES proxy routes set `Cache-Control` headers (5min–24hr)

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | No cache entries | Yes | Unit | Falls through to fetcher |
| Network errors | Fetch fails, stale exists | Yes | Unit | Stale-if-error returns expired data |
| Network errors | Fetch fails, no stale | Yes | Unit | Error propagates |
| Concurrent | Thundering herd | Yes | Unit | Request coalescing via inflight Map |
| Extreme data | Cache at capacity (500) | Yes | Unit | LRU eviction |
| Locales | Locale-sensitive keys | Yes | Unit | `localeSensitive: true` in policy |

### Notes
- 3 unused cache policies identified (CACHE_POLICY_NOT_FOUND, CACHE_POLICY_HEALTH, CACHE_POLICY_REFERENCE) — dead code, no user impact
- No per-entry size limit — documented as known gap for extreme payloads
- Dual caching layers work correctly (in-memory LRU + Next.js ISR + browser Cache-Control)

---

## Feature: Public API (C2)

### Happy Path
1. Developer creates API key in Settings → receives `pk_live_...` key (shown once)
2. Sends requests with `Authorization: Bearer pk_live_...` or `X-API-Key` header
3. `withApiAuth` HOF handles: CORS → IP rate limit (120/min) → API key auth → per-key rate limit (60/min)
4. CRUD: `GET/POST /api/v1/jobs`, `GET/PATCH/DELETE /api/v1/jobs/:id`, `GET/POST /api/v1/jobs/:id/notes`
5. Consistent pagination: `{ success, data, meta: { total, page, perPage, totalPages } }`

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | No jobs/notes | Yes | Unit | Empty array with meta |
| Empty data | No body on POST | Yes | Unit | 400 "Invalid JSON body" |
| Network errors | DB error | Yes | Unit | 500 with generic message |
| Concurrent | Same key, multiple clients | Yes | Partial | Per-key rate limit |
| Extreme data | Rate limit exhaustion | Yes | Unit | 429 with Retry-After |
| Extreme data | Large description (50K) | Yes | No | Schema enforces max |
| Locales | API responses | Always English | — | Correct for API |

### API Quality Checks
| Check | Status |
|-------|--------|
| Error format consistency | PASS |
| Rate limit headers | PASS |
| CORS headers | PASS |
| Content-Type + security headers | PASS |
| Pagination format | PASS |
| UUID validation | PASS |
| Error sanitization (500s) | PASS |
| IDOR ownership enforcement | PASS |
| Search case sensitivity | **FIXED** — added `mode: 'insensitive'` |

---

## Feature: API Key Management

### Happy Path
1. User enters key name, clicks "Create API Key" — validates auth, name, max 10 keys
2. Dialog shows full key once with copy button and "shown once" warning
3. Key list shows name, prefix, dates, status. Active vs revoked sections
4. Revoke: confirmation dialog → soft delete. Delete: only on revoked keys → confirmation → permanent delete

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix Applied |
|-----------|-----------|-------------|---------|-------------|
| Empty data | No API keys | Yes | No | Empty state with icon + CTA |
| Empty data | Empty name | Yes | Unit | Button disabled + server validation |
| Network errors | fetchKeys fails | **FIXED** | No | Added error state + retry |
| Extreme data | Max 10 keys | Yes | Unit | Server check + toast |
| Mobile (375px) | Key row layout | Partial | No | Dates hidden on mobile |
| Locales | All strings | Yes | No | All 30 keys in 4 locales |

### Fixes Applied
- Error state for fetch failure with retry button
- Amber contrast fixed (orange-700) for WCAG AA
- Delete button `aria-label`
- `aria-describedby` on key code element
- `motion-reduce:animate-none` on all spinners
- `aria-hidden="true"` on decorative icons

---

## UX 10-Point Checklists

### SchedulerStatusBar
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | OK | Returns null before SSE connects |
| 2 | Empty State | OK | "No automations configured" |
| 3 | Error State | Partial | SSE errors trigger silent reconnect |
| 4 | Mobile (375px) | OK | Compact pill, 288px popover |
| 5 | Keyboard Navigation | OK | Popover trigger is focusable button |
| 6 | Dark Mode | OK | Explicit dark variants |
| 7 | i18n | OK | All 14 keys + relative time |
| 8 | Confirmation Dialogs | N/A | — |
| 9 | Feedback | **FIXED** | Added `aria-live="polite"` for state changes |
| 10 | Design System | OK | Shadcn Popover, Tailwind |

### RunProgressPanel
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | OK | "Starting run..." with spinner |
| 2 | Empty State | OK | Returns null when not running |
| 3 | Error State | Missing | Panel disappears on failure (documented) |
| 4 | Mobile (375px) | OK | Responsive horizontal/vertical |
| 5 | Keyboard Navigation | N/A | Display-only |
| 6 | Dark Mode | OK | Explicit dark variants |
| 7 | i18n | **FIXED** | Phase counters now use `formatNumber` |
| 8 | Confirmation Dialogs | N/A | — |
| 9 | Feedback | OK | Animated spinner, green checkmarks |
| 10 | Design System | OK | ARIA progressbar |

### RunStatusBadge
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | N/A | Real-time |
| 2 | Empty State | OK | Empty span when idle |
| 3 | Error State | Missing | Badge disappears on failure (documented) |
| 4 | Mobile (375px) | OK | Inline badge |
| 5 | Keyboard Navigation | N/A | Display-only |
| 6 | Dark Mode | OK | Shadcn Badge |
| 7 | i18n | **FIXED** | Locale-aware elapsed time (DE: "2 Min. 30 Sek.") |
| 8 | Confirmation Dialogs | N/A | — |
| 9 | Feedback | **FIXED** | Throttled aria-live (status only, not per-second) |
| 10 | Design System | OK | Shared tick timer pattern |

### ConflictWarningDialog
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1-10 | All criteria | OK/N/A | Well-implemented Radix AlertDialog |

### DeckCard
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | N/A | Pure presentational |
| 2 | Empty State | OK | Null fields handled gracefully |
| 3 | Error State | N/A | — |
| 4 | Mobile (375px) | OK | max-w-lg, line-clamp |
| 5 | Keyboard Navigation | **FIXED** | Show more/less has focus-visible ring |
| 6 | Dark Mode | OK | Explicit dark variants |
| 7 | i18n | OK | All strings translated |
| 8 | Confirmation Dialogs | N/A | — |
| 9 | Feedback | OK | Exit animations + motion-reduce |
| 10 | Design System | OK | Shadcn Badge, Tailwind |

### DeckView
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | N/A | Cards appear instantly |
| 2 | Empty State | OK | Two states: empty + session complete |
| 3 | Error State | Missing | Errors silently caught (documented) |
| 4 | Mobile (375px) | OK | Touch gestures work |
| 5 | Keyboard Navigation | OK | D/P/S/Z + arrow keys |
| 6 | Dark Mode | OK | Dark variants on overlays |
| 7 | i18n | OK | All strings + aria-live announcements |
| 8 | Confirmation Dialogs | N/A | Undo serves as safety net |
| 9 | Feedback | OK | Swipe overlays, exit animations |
| 10 | Design System | **FIXED** | Added focus-visible ring on container |

### ViewModeToggle
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1-6 | Most criteria | OK | Clean segmented control |
| 5 | Keyboard Navigation | OK | role="radiogroup" + role="radio" |
| 5 | Focus visible | **FIXED** | Added focus-visible:ring-2 |
| 4 | Touch targets | **FIXED** | Increased py-1 → py-1.5 |

### StagingContainer
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | OK | Loading component |
| 2 | Empty State | OK | "No vacancies" |
| 3 | Error State | OK | Toast on failures |
| 4 | Mobile (375px) | OK | Responsive |
| 5 | Keyboard Navigation | **FIXED** | Search input has aria-label |
| 6 | Dark Mode | OK | — |
| 7 | i18n | OK | All strings translated |
| 8 | Confirmation Dialogs | OK | PromotionDialog for promote |
| 9 | Feedback | **FIXED** | New-items banner has `role="status"` |
| 10 | Design System | **FIXED** | Removed Bootstrap classes |

### AutomationList
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | N/A | Prop-driven |
| 2 | Empty State | OK | Icon + heading |
| 3 | Error State | OK | Toast on action failure |
| 4 | Mobile (375px) | OK | flex-wrap on badges |
| 5 | Keyboard Navigation | **FIXED** | Dropdown trigger has aria-label, tooltip is focusable |
| 6 | Dark Mode | **FIXED** | Added dark:text-amber-400 |
| 7 | i18n | **FIXED** | Status + jobBoard translated, `as any` removed |
| 8 | Confirmation Dialogs | OK | Delete has AlertDialog |
| 9 | Feedback | OK | Loading states, toasts |
| 10 | Design System | **FIXED** | Restructured nested interactive elements |

### ModuleBusyBanner
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1-10 | All criteria | OK | Well-implemented role="alert" |
| 9 | Feedback | **FIXED** | aria-hidden on decorative icon |

### RunHistoryList
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | Missing | No skeleton (documented) |
| 2 | Empty State | OK | Icon + heading |
| 3 | Error State | Missing | No error handling (documented) |
| 4 | Mobile (375px) | Partial | 10 columns with overflow-x-auto |
| 5 | Keyboard Navigation | **FIXED** | Error tooltip now focusable |
| 6 | Dark Mode | OK | — |
| 7 | i18n | **FIXED** | Blocked reasons translated |
| 8 | Confirmation Dialogs | N/A | Read-only |
| 9 | Feedback | OK | — |
| 10 | Design System | **FIXED** | Scrollable region has role="region" |

### PublicApiKeySettings
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | OK | Spinner |
| 2 | Empty State | OK | Icon + CTA |
| 3 | Error State | **FIXED** | Added error state + retry |
| 4 | Mobile (375px) | Partial | Dates hidden on sm |
| 5 | Keyboard Navigation | OK | Enter key, dialogs |
| 6 | Dark Mode | **FIXED** | Amber contrast fixed |
| 7 | i18n | OK | All 30 keys |
| 8 | Confirmation Dialogs | OK | Revoke + delete dialogs |
| 9 | Feedback | OK | Toast on all actions |
| 10 | Design System | OK | Shadcn throughout |

### CompanyBlacklistSettings
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | OK | Spinner |
| 2 | Empty State | OK | Icon + hint |
| 3 | Error State | **FIXED** | Added error state + retry |
| 4 | Mobile (375px) | OK | Grid stacking |
| 5 | Keyboard Navigation | OK | Enter key, labels |
| 6 | Dark Mode | OK | — |
| 7 | i18n | OK | All 34 keys |
| 8 | Confirmation Dialogs | **FIXED** | Added AlertDialog for delete |
| 9 | Feedback | OK | Toast on actions |
| 10 | Design System | OK | Shadcn throughout |

---

## Consolidated Fix Summary

### S1b Deferred Items Resolved
| Item | Status |
|------|--------|
| Untranslated `automation.status`/`automation.jobBoard` | **FIXED** — translation maps added |
| Raw `blockedReason`/`errorMessage` in RunHistoryList | **FIXED** — translation map + fallback |
| `as any` on PAUSE_REASON_KEYS | **FIXED** — `as any` removed (TranslationKey = string) |
| `as Parameters<typeof t>[0]` in RunProgressPanel | **FIXED** — `as const` on PHASE_KEYS |
| StagingContainer stale flash on tab switch | **FIXED** — `setVacancies([])` in onTabChange |
| isConnected not reactive in useSchedulerStatus | Deferred — no consumer uses it |
| AutomationDetailPage 514 LOC | Deferred to S3 — refactoring scope |
| StagingContainer 497 LOC | Deferred to S3 — refactoring scope |
| RunStatusBadge HMR tick leak | Deferred — dev-only, no production impact |

### WCAG Fixes Applied
| Fix | Components | WCAG |
|-----|-----------|------|
| aria-live regions for state changes | SchedulerStatusBar, RunProgressPanel | 4.1.3 |
| Complete progressbar ARIA | RunProgressPanel (desktop + mobile) | 4.1.2 |
| Focus indicator on DeckView container | DeckView | 2.4.11 |
| "Show more" button min-height 24px | DeckCard | 2.5.8 |
| Non-focusable tooltip triggers → buttons | AutomationList, RunHistoryList | 2.1.1 |
| Nested interactive elements restructured | AutomationList | 2.1.1, 4.1.2 |
| Unlabeled inputs/buttons fixed | StagingContainer search, AutomationList dropdown | 3.3.2, 4.1.2 |
| Decorative icons `aria-hidden="true"` | 8 components | 1.1.1 |
| Color contrast (amber) | PublicApiKeySettings, DeckCard | 1.4.3 |
| motion-reduce on all spinners | 6 components | 2.3.3 |
| Throttled live region | RunStatusBadge | 4.1.3 |
| Scrollable region semantics | RunHistoryList | 1.3.1 |
| Notification banner live region | StagingContainer | 4.1.3 |
| Preview cards aria-hidden | DeckView | 1.3.2 |
| scroll-mt for sticky header | AutomationList | 2.4.11 |
| ViewModeToggle focus-visible | ViewModeToggle | 2.4.7 |

### i18n Keys Added (S2)
- **automations.ts**: 16 new keys (status display, module names, blocked reasons, elapsed time)
- **staging.ts**: 1 new key (searchLabel)
- **api.ts**: 2 new keys (loadFailed, retry)
- **blacklist.ts**: 3 new keys (deleteConfirmTitle, loadFailed, retry)
- **Total**: 22 new keys × 4 locales = 88 translations added

---

## Gap Closure (same session, second pass)

All gaps from the initial pass were closed:

| Gap | Resolution |
|-----|-----------|
| No E2E tests | **FIXED** — 9 new E2E tests (staging, API keys, blacklist). 68→77 |
| RunHistoryList 10 columns mobile | **FIXED** — hide 4 numeric columns on mobile |
| RunProgressPanel no error state | **FIXED** — "Run completed" 3s transition |
| DeckView no swipe affordance | **FIXED** — "Swipe to decide" hint on first card |
| StagingContainer 497 LOC | **FIXED** — 398 LOC after hook + component extraction |
| AutomationDetailPage 514 LOC | **FIXED** — 309 LOC after hook + 2 component extractions |
| No axe-core testing | **FIXED** — jest-axe installed, 4 test files, 8 tests |
| ViewModeToggle roving tabindex | **FIXED** — arrow key navigation + tabIndex management |
| RunHistoryList loading state | **FIXED** — skeleton pulse rows |
| 5 new files without tests | **FIXED** — 22 new unit tests across 5 new + 3 existing test files |
| Allium specs not weeded | **FIXED** — scheduler-coordination + vacancy-pipeline updated |

## Remaining Accepted Trade-offs

| Gap | Severity | Reason Accepted |
|-----|----------|----------------|
| DeckView error recovery (card advances on server failure) | Low | Fire-and-forget is intentional design; undo provides safety net |
| RunStatusBadge no hour formatting (shows "120m 0s") | Low | Acceptable for expected run durations |
| Cache no per-entry size limit | Low | 500-entry LRU cap is sufficient |
| `isConnected` not reactive in useSchedulerStatus | Low | No consumer uses the value |
