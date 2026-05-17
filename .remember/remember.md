# Handoff

## State
Session 2026-05-17 continued (Keep-Alive v4 + Login robustness). 4 new commits (`108e6f6`..`e0eacfa`), 24 total on `main`.

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

## Next (v6 approach)
1. **`Page.addScriptToEvaluateOnNewDocument`** to monkey-patch `signoutRedirect` / `location.assign` / `location.replace` BEFORE the WC loads. This is the only way to prevent navigation since it happens synchronously in the same microtask.
2. **Alternative:** Intercept `oidc-client`'s `UserManager.signoutRedirect` method since the WC uses oidc-client-ts internally.
3. **Fix Login BundID Welcome hang** — `waitForAndClick` for Tml88 intermittently fails

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

## Context
- Nachhaltigkeitsprinzip: ROADMAP prüfen, DDD prüfen, Allium befragen vor Domain-Entscheidungen
- `/full-stack-orchestration:full-stack-feature` für ALLE Entwicklung, Honesty Gate PFLICHT vor Push
- Browser bridge: `~/bin/browser-bridge.sh` → CDP at 127.0.0.1:9223 (sapphire Chromium)
- BundID buttons need CDP `Input.dispatchMouseEvent` (Vue 3, `.click()` doesn't work)
- API calls require `credentials: 'include'` (sends ISTIOSESSIONID cookie) — without cookies = 403
- Never commit personal data
