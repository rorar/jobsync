# Handoff

## State
Session 2026-05-17 (arbeitsagentur.de CDP Automation + API Deep-Dive). 17 commits on `main` (`681adfc`..`6043e5c`).
Blindspots closed: #2 (NachrichtDetail+Anhang), #6 (Inaktivität=2-3min), #9 (cdp-anonymize shared module).
CDP scripts: `cdp-anonymize.mjs`, `cdp-login-bundid.mjs` (verified 72s), `cdp-keep-alive.mjs` (trigger fixed, not yet live-verified).
OpenAPI spec: 37 paths, 39 schemas. Key finding: API gateway requires cookies (`credentials: 'include'`), NOT x-api-key.

**Previous (2026-05-15 Twenty deep-dive) still valid:**
- `docs/twenty-crm-implementation-patterns.md` — 1218 Zeilen, 13 Sektionen
- S2 Prompt aktualisiert mit Twenty-Enhancements + Pre-Audit P0 Findings

## Next
1. **Keep-Alive live verification** — Login → start `cdp-keep-alive.mjs` immediately → wait 5 min → confirm popup auto-dismissed (trigger: `inactivity-countdown` in shadow DOM)
2. **Login script bug** — Phase 4 "Anmelden" button sometimes covered by grid cards. Fix: retry with `elementsFromPoint` check or scroll offset
3. **GraphQL Introspection** (Blindspot #3) — Standard `__schema` query rejected (`FieldUndefined`). Try: `{ __schema { types { name kind } } }` or `{ __type(name: "Query") { fields { name } } }`
4. **S2 UX Polish** — prompt at `~/s2-ux-polish-session.md` (AKTUALISIERT mit Twenty-Enhancements + P0 Findings)

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
- Inactivity popup: `#session-expiration-idle-warn-popup-continue-btn` in bahf-header shadow DOM, only detectable via `DOM.performSearch`
- API calls require `credentials: 'include'` (sends ISTIOSESSIONID cookie) — without cookies = 403
- Keep-alive old version spam-clicked (found button always in DOM) — fixed version checks `inactivity-countdown` existence
