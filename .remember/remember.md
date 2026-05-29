# Handoff

## State
Two active workstreams:
- **(B) JobSync ROADMAP — LATEST (2026-05-29):** ROADMAP 1.21 GeoCode + 1.22 Holiday DONE; all 7 follow-ups + comprehensive-review + blind-spot pass DONE & pushed. 12 commits this session (`db86060`..`7975f08`). 252 suites, 4997 tests, 0 failures. Details in "## GeoCode + Holiday" below.
- **(A) arbeitsagentur Keep-Alive (2026-05-17):** v6 failed; v7 approach pending. Details in the CDP/Keep-Alive sections below.

### CDP Scripts Status
| Script | Status | Notes |
|---|---|---|
| `cdp-login-bundid.mjs` | **ROBUST** | Poll-based, 3/3 successful logins (74-99s) |
| `cdp-keep-alive.mjs` | **PARTIAL** | Idle timer solved, 30-min bypass works, but dies at ~32 min |
| `cdp-session-status.mjs` | **NEW** | Reads JWT + DOM timer, --watch mode |
| `cdp-anonymize.mjs` | Stable | 30 PII patterns |

### Keep-Alive Architecture (v4)
| Layer | Purpose | Status |
|---|---|---|
| 1: Synthetic keypress | Idle timer reset | **WORKS** — `document.dispatchEvent(new KeyboardEvent('keypress'))` via `Runtime.evaluate` |
| 2: Fetch.failRequest | Block 30-min logout | **WORKS** — blocks GET /openid-connect/logout |
| 3: Manual token refresh | Server session alive | **WORKS** — refreshes every ~200s, resets lastSessionRefresh |
| 4: SessionStorage protection | Prevent token deletion | **FAILS** — oiam-oauth-wc destroys JS context before patch takes effect |

### Critical Findings
1. **oiam-oauth-wc activity detection**: `addEventListener("keypress")` + `addEventListener("mouseup")` on document. Does NOT check `isTrusted`. Source: `p-Bn5gH4YR.js` (142KB)
2. **Shift key doesn't work**: generates `keydown`/`keyup` but NOT `keypress`
3. **mouseMoved causes navigation**: triggers hover/click on page links (Vermittlungspostfach redirect)
4. **DOM timer freezes**: when only synthetic keypress is sent (no real UI events), the shadow DOM timer stops updating (cosmetic)
5. **Post-logout sequence**: Logout blocked → ~90s delay → WC destroys JS context (SPA navigation) → evaluate_failed → session dies at ~32 min
6. **Popup types**: `popupIdle` (inactivity, `is-visible` class), `popupHL` (5-min warning, `is-visible` class). Both in bahf-header closed shadow DOM.

### ACH Root Cause (3-Agent parallel debugging, 2026-05-17)
- **H1 CONFIRMED (90%)**: `check(t)` has silent-death path — `if(!e){return}` when `oiamsession` cookie deleted
- **H4 CONFIRMED (85%)**: 7 logout paths total, 4 bypass `oiamLogoutEvent`. Primary path is `checkOiamSession()` → `oiamMaxSessionExpirationEvent` (different event!)
- **H5 FALSIFIED (95%)**: Event name IS `"oiamLogoutEvent"`, `window.self === window`, no custom EventBus
- Two cookies: `oiamsession` (client JS, gates `check()`) vs `BA-SessionId` (server OAG, gates `hasSessionBeenTerminated()`)

### Keep-Alive v5 (implemented, needs live test)
5 layers: synthetic keypress + 6-event interception + Fetch block + token refresh + cookie/sessionStorage protection.
Key change from v4: blocks ALL 6 logout events (not just `oiamLogoutEvent`) + protects `oiamsession` cookie from deletion via `document.cookie` setter patch.

### v5 Live-Test Result (2026-05-17, 34 Min — 4 Min beyond limit)
- Layer 2: `oiamMaxSessionExpirationWarnEvent` BLOCKED at T+25 → NO popup ✓
- Layer 2: `oiamLogoutEvent(max-session-timed-out)` BLOCKED at T+30 ✓ (first time ever!)
- Layer 3: GET /openid-connect/logout BLOCKED by Fetch ✓
- Layer 5: sessionStorage.removeItem BLOCKED ✓
- Layer 5: oiamsession cookie deletion NOT blocked ✗ (document.cookie setter patch didn't catch it)
- Session died at T+34 because cookie gone → zombie state → navigation to www.arbeitsagentur.de

### Root cause of remaining failure
Cookie deletion via `document.cookie = "oiamsession=; expires=Thu, 01 Jan 1970..."` cannot be intercepted:
- Instance-level `Object.defineProperty(document, 'cookie', ...)` → WC bypasses it
- Prototype-level `Object.defineProperty(Document.prototype, 'cookie', ...)` → Chrome security prevents override
- The cookie setter is a native browser API that cannot be monkey-patched

### v5.2 Cookie-Restore: ALSO FAILED
200ms poll-based cookie restore implemented but never fires — WC destroys JS context synchronously after event dispatch via `handleLogoutEvent → doLogout → signoutRedirect`. The 200ms poller is gone before it can detect the cookie deletion.

### Verified: direct state-machine path is the real killer
The `check(t)` timer dispatches `oiamLogoutEvent` (which we block), but the WC's internal event queue handler `handleLogoutEvent` runs synchronously and calls `doLogout → doSignout → signoutRedirect` which navigates the page away. `stopImmediatePropagation` only prevents OTHER listeners — the WC's OWN handler (registered first) still fires.

### v6 location.assign/replace/href patches: ALSO FAILED
`Page.addScriptToEvaluateOnNewDocument` patches `location.assign`, `location.replace`, and `location.href` setter. `n=0` navigations blocked — WC does NOT use these APIs. The oidc-client-ts `RedirectNavigator` caches `location[method].bind()` — but our patch should intercept the `.bind()` call since it runs pre-load. Unknown escape mechanism remains.

## Next (Keep-Alive v7 approach)
1. **Patch `signoutRedirect` on oidc-client's UserManager prototype** via `Page.addScriptToEvaluateOnNewDocument`. The WC creates `UserManager` at init time. If we patch the prototype before the module loads, `signoutRedirect()` becomes a no-op. Alternative: patch `RedirectNavigator.prototype.prepare` to return a no-op navigator.
2. **Fix Login BundID Welcome hang** — `waitForAndClick` for Tml88 intermittently fails

## Previous session state (still valid)
- OpenAPI spec: 37 paths, 39 schemas (`docs/arbeitsagentur-api/openapi.yaml`)
- Auth docs: `auth-flow.md`, `session-lifecycle.md`, `postfach-protocol-spec.md`
- Twenty reference: `docs/twenty-crm-implementation-patterns.md` (1218 lines)
- S2 UX Polish prompt: `~/s2-ux-polish-session.md` (AKTUALISIERT mit Twenty-Enhancements + P0 Findings)

## S2 Pre-Audit Findings (aus Session 2026-05-15)

### P0 — CRITICAL (9 Findings, in S2 zuerst fixen)
1. NotificationSettings: Kein Error State bei Fetch-Failure
2. NotificationSettings: Kein Confirmation bei Global Disable
3. PushSettings:414 — Hardcoded `bg-green-600` ohne dark: Variant
4. StagedVacancyDetailSheet:90 — Silent Error in runAction
5. NotificationDropdown:171 — Fetch-Failure = Spinner forever
6. NotificationBell:52 — Silent Error bei Poll-Failure
7. ActivityTimeline:93 — Select w-[200px] Overflow 375px
8. NotificationSettings:316 — Native select statt Shadcn
9. NotificationSettings:283 — grid-cols-3 zu eng auf 375px

### P1 — Twenty-Enhancements (7 Items, nach P0)
1. Spinner→Skeleton Migration (73 Stellen, Top-10 migrieren)
2. Sticky Headers auf MyJobsTable + KanbanBoard
3. CompanyDetail Page (NEUE Route + Timeline + Jobs Tabs)
4. JobDetail CRM Tab (ActivityTimeline einbetten)
5. ActivityTimeline Month Grouping + Infinite Scroll
6. Hover-Reveal Actions auf MyJobsTable
7. Nav Sidebar Badge Counts (Staging, Interviews, CRM Tasks)

### P2 — Nice-to-have (6 Items)
8-13: Shortcut Help Dialog, Scroll Restoration, Kanban Aggregate, Card Checkbox Hover, Settings H2Title, Extra Bottom Padding

### Nicht in S2 (bewusst ausgeschlossen)
- Autosave Debounce (Design-Entscheidung nötig)
- Context Menus / Right-Click (neues UX Pattern)
- Floating UI Migration (Radix reicht)
- Toast Progress Bar (Custom Radix Toast funktioniert)
- AnimatedExpand Pattern (braucht framer-motion Entscheidung)

## arbeitsagentur.de Blindspots (aktualisiert)

| # | Blindspot | Status |
|---|---|---|
| 1 | Vermittlungspostfach (vamJB REST-API) | Offen (Mittel) |
| 2 | ~~Nachricht-Detail-Schema~~ | **GESCHLOSSEN** (Session 2026-05-17) |
| 3 | GraphQL Schema | Offen — Introspection-Query anpassen |
| 4 | miso Notifications Detail-API | Offen (Niedrig) |
| 5 | Bescheide-API | Offen (Niedrig) |
| 6 | ~~Inaktivitäts-Timeout~~ | **GESCHLOSSEN** (~2-3 Min, API≠Activity) |
| 7 | Profil-Wechsel API | Offen (Niedrig) |
| 8 | ~~Token-Claims~~ | Erledigt |
| 9 | ~~CDP-Scripts anonymize()~~ | **GESCHLOSSEN** (shared module) |
| 10 | Keep-Alive UserScript/Extension | Offen (separates Projekt) |

## Twenty Reference
- Domain Model: `specs/reference-twenty-crm.allium` (27 Entities, 1296 Zeilen)
- Gap Analysis: `docs/crm-gap-analysis-twenty.md` (7/9 Gaps closed)
- Implementation Patterns: `docs/twenty-crm-implementation-patterns.md` (1218 Zeilen, 13 Sektionen)
- Sektionen: Timeline, Detail Pages, Workflow, Calendar/Email, Views, Architecture, ROADMAP Mapping, Feature Improvements, UX Design System, UX Improvements, UX Open ROADMAP, Auth/Sync/SSO
- Twenty's OIDC mit PKCE ist direkt kompatibel mit arbeitsagentur.de Keycloak

## Sicherheits-Erkenntnisse aus Twenty
- Twenty speichert OAuth Tokens UNVERSCHLÜSSELT — bei ROADMAP 1.7/1.12 NICHT übernehmen
- Twenty hat KEIN Auth Rate-Limiting — JobSync ist besser (Sliding Window)

## GeoCode + Holiday (ROADMAP 1.21 + 1.22)

### Base session (2026-05-28)
- ROADMAP 1.21 GeoCode: 3-layer architecture (i18n-iso-countries + countries-data-json vendored + amckenna41/iso3166-2 vendored)
- ROADMAP 1.22 Holiday: date-holidays + 3-layer cache + Intl.Locale.getWeekInfo() primary + cldr-core fallback + locale passthrough (78 langs)
- Prisma: Person.addressCountryCode + addressSubdivisionCode (ISO 3166)
- UI: CountrySelect + SubdivisionSelect (Combobox, flags, cascading)
- Integration: EURES/Arbeitsagentur countryCode extraction, Location.country promoter fix
- Weed report: 10 findings fixed (5 spec-bugs + 5 code-bugs)
- Design-doc validation: 4 divergences found, 2 fixed (W-1 Intl primary, D-L1 locale), 2 deferred (D-TZ, D-W2)
- Follow-ups: `docs/superpowers/plans/2026-05-28-next-session-followups.md` (7 items)

### Follow-up + review + blind-spot session (2026-05-28/29) — DONE & PUSHED
- All 7 follow-ups DONE: Allium contract cleanup; Perf (DayCache LRU maxSize=500 via `lruGetOrBuild`, iso3166-2-db Map); Security (server-only ×6, flag URL allowlist, getPersons pageSize [1,100]); PersonDetail Holiday PoC; migration script; UI design-review; comprehensive-review.
- **DDD:** reference lookups extracted to `src/actions/reference-data.actions.ts` (OUT of person.actions.ts — Person Repository pure). All 3 auth-gated (ADR-019). getPersonHolidayInfo delegates to HolidayService.isBusinessDay().
- **UI:** CountrySelect/SubdivisionSelect adopt EuresLocationCombobox pattern (shouldFilter=false + manual filter + diacritic folding via `foldDiacritics` in @/lib/utils + controlled inputValue reset + aria-live + loading prop).
- **Holiday badge:** extracted `HolidayBadge` component (+7 tests, role="status" aria-live). Stale-write race in PersonDetailClient effect fixed.
- **KNOWN GAP (D-TZ):** getPersonHolidayInfo uses SERVER clock `new Date()`, not contact-country local date → off-by-one near midnight. Documented in code. Top remaining holiday item = derive country IANA TZ.
- Migration: `bun scripts/migrate-person-address-country-codes.ts` (DRY_RUN=1 supported, per-row try/catch, verified runnable). normalizeCountry intentionally forked (CLI runs outside Next.js server-only).
- `.replace("{x}", ...)` is the established i18n interpolation pattern (65 sites) — not a finding.
- Reports archived in `.full-review/`.

## Add Job Modal UX Findings (2026-05-27)
- 9 Findings dokumentiert in `docs/add-job-modal-ux-findings.md` (F-AJ-01 bis F-AJ-09)
- Quick Wins: Titel Breite, Status-Layout, Due Date optional
- Medium: Applied Toggle→Status ComboBox, Profil Adresse+Währung, CRM Person
- Large: Salary Slider+Währung+Fixum, Recruiter Dreiecksmodell
- XL: Benutzerdefinierter Status (Custom JobStatus + dynamisches Kanban)
- NICHT in der aktuellen Session bearbeiten

## Context
- Nachhaltigkeitsprinzip: ROADMAP prüfen, DDD prüfen, Allium befragen vor Domain-Entscheidungen
- `/full-stack-orchestration:full-stack-feature` für ALLE Entwicklung, Honesty Gate PFLICHT vor Push
- **Handoff/Memory-Dateien: NUR Neues anhängen, bestehenden Inhalt NIE überschreiben (KRITISCHE REGEL — am 2026-05-29 verletzt, 100 Zeilen verloren & wiederhergestellt)**
- Browser bridge: `~/bin/browser-bridge.sh` → CDP at 127.0.0.1:9223 (sapphire Chromium)
- BundID buttons need CDP `Input.dispatchMouseEvent` (Vue 3, `.click()` doesn't work)
- API calls require `credentials: 'include'` (sends ISTIOSESSIONID cookie) — without cookies = 403
- Never commit personal data
