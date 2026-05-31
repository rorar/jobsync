# S3 CRM Core Session — Handoff

Erstellt: 2026-05-10
Session: multi-company-implementation

## Was in dieser Session gebaut wurde

### CRM Core Foundation (3 Commits)
- `37a4971` — Prisma Schema (8 Models), Domain Events (9), Server Actions (6 Files), i18n
- `4c7858d` — UI: 4 Pages, 5 Components, Navigation, CRM Dictionary
- `c111944` — Docs: CLAUDE.md, CHANGELOG.md, ROADMAP.md

### CRM UX Improvements (8 Commits)
- `34ea41b` → `d86e8c9` — Phone primary toggle fix
- `e90a1e0` — Auto-activate primaryPhone
- `42195fd` — col-span-3 full-width layout
- `fdf85ac` — Person Edit + InterviewForm overhaul (ComboBoxes, Location toggle, Date/Time split, Locale-aware calendar)
- `a4f3de8` — Job list dedup in ComboBox
- `55f98e1` — Dialog width adapts to content
- `f869adf` — Remove check icon indentation
- `e79764f` — Locale-aware date picker (react-day-picker)

### Twenty CRM Gap Analysis + 3 Ketten (7 Commits)
- `8785745` — Gap Analysis doc (docs/crm-gap-analysis-twenty.md)
- `37ed13a` — Spec: Person.company → companies: List<CompanyAssociation>
- `57dc116` — Implementation: Multi-Company (Prisma + Actions + UI)
- `d3ebabb` — Spec Kette C: JobContact + Timeline Surfaces
- `21c4cc0` — Spec Kette A: Company.domain, Blocklist domain-pattern, updated_by
- `a78fef1` — Spec Kette B: headline + socialProfiles
- `3daa1b2` — Implementation: Alle 3 Ketten in einer Prisma-Migration

### Kette UI + Code Review Fixes (3 Commits)
- `e68f0ac` — UI Ketten A+B: headline, socialProfiles
- `b7fdb87` — UI Kette C: Related Jobs Tab + JobContact CRUD
- `af6b1d1` — 11 Code Review Findings gefixt (CRIT: merge dedup, HIGH: XSS, GDPR, cascade)

## Aktuelle Git-Situation

```
git log --oneline -20
```

Branch: `main`, nicht gepusht seit Session-Start. **21+ neue Commits.**

## Was noch offen ist

### Aus dem Code Review (erledigt in af6b1d1)
Alle 11 Findings sind gefixt. Keine offenen Review-Items.

### Aus der Gap-Analyse (docs/crm-gap-analysis-twenty.md)
Alle 7 Critical Gaps (Ketten A+B+C) sind spezifiziert UND implementiert.

### Spec-Divergenzen (bekannt, aspirational)
| Item | Status | Grund |
|------|--------|-------|
| ExpireAutoCreatedPersons (temporal rule) | Nicht implementiert | Braucht Scheduler-Integration |
| InterviewReminder (temporal rule) | Nicht implementiert | Braucht Scheduler-Integration |
| TaskOverdueReminder (temporal rule) | Nicht implementiert | Braucht Scheduler-Integration |
| AutoCreatePersonFromEmail | Nicht implementiert | Braucht CommunicationConnector (1.12) |
| Blocklist post-add cleanup | Nicht implementiert | Braucht AutoCreate-Trigger |
| CrmActivityLog→Company Prisma Relation | Fehlt | targetCompanyId ist bare String, kein FK |
| PersonDirectory search: companies | Fehlt | JSON-Column nicht im Search OR |
| JobContact spec: user_id + AddJobContact/RemoveJobContact rules | Fehlt in Spec | Spec hat Entity aber keine Lifecycle-Rules |

### Add Job Dialog Divergenzen (9 Issues)
Aus der letzten Review-Diskussion — das Gsync-Upstream "Add Job" Formular hat 9 Divergenzen gegen die CRM-Specs:

1. **Contact Person fehlt** — JobContact (Kette C) nicht im Formular
2. **Salary Range** — Bracket-Select vs. strukturierte min/max/currency/period
3. **Job Type** — 3 Typen vs. 8+ positionOfferingCodes
4. **Status** — Funktioniert, aber InitialStatusOnManualCreate Side-Effects nicht validiert
5. **"Send to Queue"** — Cross-Aggregate-Operation nicht spezifiziert
6. **Date Applied** — Browser-Locale statt User-Locale (gleiche Fix wie InterviewForm)
7. **"Add Skill"** — Tag-basiert, "Skill" als CRM-Konzept nicht spezifiziert
8. **Job Description** — TipTap Rich Text vs. CRM Notes plain text Inkonsistenz
9. **Company.domain** — Wird nicht gesetzt bei manueller Company-Erstellung

**Empfehlung:** Diese als S2 UX Polish oder eigene Session angehen — zusammenhängende Überarbeitung des Job Aggregate UI.

## Nächste Sessions

### Priorität 1: S2 UX Polish
- Prompt: `~/s2-ux-polish-session.md`
- Scope: Full-Codebase UX Audit inkl. neuer CRM-Komponenten + Add Job Divergenzen
- Umfang: 14 Features, 46+ Komponenten

### Priorität 2: Tests für CRM
- Keine Unit/Component/E2E Tests für CRM-Code geschrieben
- 220 bestehende Test Suites passieren, aber 0% Coverage für neuen Code
- jobContact.actions.ts, person.actions.ts (merge dedup, anonymize cascade) brauchen Tests

### Priorität 3: Temporal Rules (Scheduler-Integration)
- ExpireAutoCreatedPersons, InterviewReminder, TaskOverdueReminder
- Braucht Architektur-Entscheidung: cron in Scheduler vs. separate CRM-Cron

### Priorität 4: ROADMAP-Features die auf CRM aufbauen
- 5.7 Profile URL Auto-Fill (socialProfiles + Company.domain sind Prerequisite — DONE)
- 1.12 Communication Connector (Blocklist domain-pattern + AutoCreatePerson — Foundation DONE)
- 1.7 Calendar Connector (CrmInterview + ConnectedAccount — Foundation DONE)

## Technische Schulden

1. **CrmActivityLog.targetCompanyId** hat keine Prisma @relation — CompanyTimeline Surface funktioniert nur über bare String-Filter
2. **PersonDirectory Search** durchsucht nicht die `companies` JSON-Column
3. **handleError Pattern** leakt raw Prisma error.message an den Client (pre-existing in person.actions.ts, jetzt auch in jobContact.actions.ts)
4. **StatusHistoryTimeline.tsx** — Agent-erstellte Komponente, nie eingebunden
5. **crm.jobTitle i18n Key** — Wird als Company-Role-Placeholder wiederverwendet, semantisch unklar

## Dateien die sich geändert haben (Kurzübersicht)

```
prisma/schema.prisma                          — 8 CRM Models + Company.domain + JobContact
prisma/migrations/                            — 2 Migrations (add_crm_core + chains_abc)
specs/crm.allium                              — 1200+ Zeilen, alle 3 Ketten spezifiziert
docs/crm-gap-analysis-twenty.md               — Gap-Analyse mit Dependency Map
src/actions/person.actions.ts                  — 7 CRUD Actions + merge dedup + anonymize cascade
src/actions/jobContact.actions.ts              — 4 Actions (add, remove, getForPerson, getForJob)
src/actions/crmInterview.actions.ts            — 5 Interview Actions
src/actions/crmTask.actions.ts                 — 6 Task Actions
src/actions/crmNote.actions.ts                 — 4 Note Actions
src/actions/crmActivityLog.actions.ts          — Timeline Queries
src/actions/crmBlocklist.actions.ts            — Blocklist CRUD
src/actions/job.actions.ts                     — deleteJobById cascade fix
src/models/person.model.ts                     — Types, validators, parse helpers
src/lib/events/event-types.ts                  — 9 CRM events
src/lib/events/consumers/crm-activity-logger.ts — Timeline projection
src/app/dashboard/contacts/                    — PersonDirectory + PersonDetail pages
src/app/dashboard/interviews/                  — InterviewCalendar page
src/app/dashboard/crm-tasks/                   — TaskBoard page
src/components/crm/                            — PersonForm, InterviewForm, CrmTaskForm, ActivityTimeline
src/i18n/dictionaries/crm.ts                   — ~200 Keys x 4 Locales
```

## Memory-Updates nötig

Die Memory-Dateien in `~/.claude/projects/-home-pascal/memory/` sollten aktualisiert werden:
- `project_current_sprint.md` — Session-Ergebnis dokumentieren
- `project_next_session_planning.md` — S3 als DONE markieren
- Neue Memory-Datei für CRM-Architektur-Entscheidungen (Multi-Company, headline vs. jobTitle, JobContact als Join-Entity)
