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

## Next (Keep-Alive v5 — solve the post-logout navigation)
The 30-min bypass almost works — server session stays alive, but the client navigates away ~90s after the blocked logout. Approaches to try:
1. **Broader Fetch interception**: intercept ALL navigations away from `web.arbeitsagentur.de` after a blocked logout
2. **Page.addScriptToEvaluateOnNewDocument with localStorage backup**: save tokens to localStorage (cross-origin persistent), restore on page load
3. **Monkey-patch the oiam-oauth-wc's internal navigation**: find and override the function that triggers the redirect
4. **Accept 30-min limit, auto-relogin**: instead of fighting the logout, detect it and automatically re-login (cdp-login-bundid.mjs is now reliable)

Option 4 might be the most sustainable — the login is fast (74s) and reliable.

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
