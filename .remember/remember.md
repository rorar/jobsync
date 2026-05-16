# Handoff

## State
Session 2026-05-15 (Twenty deep-dive). No code changes — research session. `main` @ `b4a69c8`. 245 suites, 4729 tests, 0 failures.

**Twenty CRM Deep-Dive abgeschlossen:**
- 16 spezialisierte Agents, ~860 Tool-Calls auf Twenty's Codebase
- `docs/twenty-crm-implementation-patterns.md` — 1218 Zeilen, 13 Sektionen
- S2 Prompt aktualisiert mit Twenty-Enhancements + Pre-Audit P0 Findings

## Next
1. **S2 UX Polish** — prompt at `~/s2-ux-polish-session.md` (AKTUALISIERT mit Twenty-Enhancements + P0 Findings)
2. **Allium V3 Syntax Overhaul** — event-bus.allium 76 parse errors + G16 Spec-Drift (1-2 hrs)
3. **notification-dispatch.allium** — 160 parse errors, dedicated allium:tend session (1-2 hrs)

## S2 Pre-Audit Findings (aus dieser Session)

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

## Twenty Reference
- Domain Model: `specs/reference-twenty-crm.allium` (27 Entities, 1296 Zeilen)
- Gap Analysis: `docs/crm-gap-analysis-twenty.md` (7/9 Gaps closed)
- Implementation Patterns: `docs/twenty-crm-implementation-patterns.md` (1218 Zeilen, 13 Sektionen)
- Sektionen: Timeline, Detail Pages, Workflow, Calendar/Email, Views, Architecture, ROADMAP Mapping, Feature Improvements, UX Design System, UX Improvements, UX Open ROADMAP, Auth/Sync/SSO

## Sicherheits-Erkenntnisse aus Twenty
- Twenty speichert OAuth Tokens UNVERSCHLÜSSELT — bei ROADMAP 1.7/1.12 NICHT übernehmen
- Twenty hat KEIN Auth Rate-Limiting — JobSync ist besser (Sliding Window)
- Twenty's OIDC mit PKCE ist direkt kompatibel mit arbeitsagentur.de Keycloak

## Context
- Nachhaltigkeitsprinzip: ROADMAP prüfen, DDD prüfen, Allium befragen vor Domain-Entscheidungen
- `/full-stack-orchestration:full-stack-feature` für ALLE Entwicklung, Honesty Gate PFLICHT vor Push
