Hey Claude, sei mein Full-Stack Senior Software Engineer und unterstütze mich bei der Planung, Architektur und Implementierung von neuen Features, Bugfixes und Verbesserungen für JobSync, einer SaaS-Plattform für die Automatisierung von Job-Discovery und Bewerbungsprozessen. Die Plattform ist in TypeScript mit Shadcn/Tailwind, Next.js und Prisma gebaut.

[ ] @projekte/jobsync Lies zuerst CLAUDE.md, reminders und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md) ein.
[ ] Bei Entscheidungen wählst du nicht den einfacheren Weg; Du wählst den Weg des Nachhaltigkeitsprinzip: Was ist die nachhaltigste, fundierteste und basierend auf DDD und auf der ROADMAP die beste Lösung? Macht es bei der Entscheidung Sinn /allium zu befragen?
[ ] Beachte **Kritische Regeln**

## Quick-Verify (Handoff prüfen)

Führe aus:
```bash
git log --oneline -15
source scripts/env.sh && bun run build
bash scripts/test.sh --workers=1
```

Prüfe: Build grün? Tests grün (220 Suites, 4215+ Tests)?

## Kontext

**Was BEREITS fertig ist (NICHT nochmal machen):**
- 5.3 Job Status Workflow — implementiert (crm-workflow.allium + Code, seit 2026-04-02)
- 5.6 Kanban Board — implementiert (crm-workflow.allium + Code, seit 2026-04-02)
- Allium CRM Spec — `specs/crm.allium` (1074 Zeilen, 0 Errors, 9 Entities, 18 Rules, 6 Surfaces)
- Reference Specs — 3 Reference Specs distilliert (Atomic CRM, Twenty CRM, Kommo UI Kit)
- GDPR Spec — `specs/crm-gdpr.allium` (Data Subject Rights, Retention, Erasure)
- PERF-2 (async PBKDF2) + PERF-3 (DispatchContext) — implementiert
- Notification System — alle 4 Channels (InApp, Webhook, Email, Push)
- 220 Test Suites, 4215 Tests, Build clean

**Was diese Session S3 implementiert (aus specs/crm.allium):**

| Feature | Spec-Entities | ROADMAP |
|---------|--------------|---------|
| Contact Management | Person, FullName, TypedEmail, TypedPhone, Address | 5.5 |
| Interview Tracking | Interview (scheduling, outcomes, reminders) | 5.8 |
| Tasks & Reminders | Task, TaskTarget (polymorphic: Job/Person/Company) | 5.4 |
| Notes | Note, NoteTarget (polymorphic: Job/Person/Company) | 5.5 |
| Activity Timeline | ActivityLog (immutable, 15 activity types) | 5.9 |
| Blocklist | Blocklist (email/phone/domain suppression) | 5.5 |
| CRM Domain Events | 9 neue Events (ContactCreated, InterviewScheduled, ...) | 0.6 |
| CRM Notifications | 4 neue Types (interview_scheduled, follow_up_due, ...) | 0.6 |

## Dein Auftrag

### PLAN-Phase

#### 1. Allium Spec lesen (NICHT neu erstellen — existiert bereits)
Lies `specs/crm.allium` KOMPLETT. Dies ist die authoritative Spezifikation:
- 9 Entities: Person, Interview, Task, TaskTarget, Note, NoteTarget, ActivityLog, Blocklist, ConnectedAccount
- 18 Rules: Person lifecycle (7), Interview (5), Task (4), Note (1), Timeline (1), Blocklist (2)
- 4 Invariants: ExactlyOneTaskTarget, ExactlyOneNoteTarget, BlocklistSuppressesAutoCreation, PersonOwnedByUser
- 6 Surfaces: PersonDirectory, PersonDetail, InterviewCalendar, TaskBoard, ActivityTimeline, BlocklistSettings
- 6 Open Questions: Lies sie und triff Entscheidungen basierend auf dem Nachhaltigkeitsprinzip

Lies auch `specs/crm-workflow.allium` (Job Status + Kanban — bereits implementiert, hier nur integrieren).
Lies auch `specs/crm-gdpr.allium` (GDPR Data Subject Rights — GDPR-Felder auf Person implementieren).

#### 2. Event Bus + Notification Types erweitern
Vor der Feature-Implementierung:
- Erweitere `src/lib/events/event-types.ts` um 9 CRM-Events:
  ContactCreated, ContactUpdated, ContactDeleted, InterviewScheduled, InterviewCompleted,
  ReminderTriggered, FollowUpSent, MessageReceived, DocumentAttached
- Erweitere NotificationType in `src/models/notification.model.ts` um 4 CRM-Types:
  interview_scheduled, interview_reminder, follow_up_due, contact_from_job
- Aktualisiere `specs/event-bus.allium` und `specs/notification-dispatch.allium` mit `/allium:tend`

#### 3. UI Wireframes ZUERST
Bevor du UI-Code schreibst:
- `/ui-design:create-component` für PersonDirectory, PersonDetail, InterviewCalendar, TaskBoard, ActivityTimeline
- `/ui-design:design-review` für die Wireframes
- `/ui-design:responsive-design` für Mobile (375px+)
- Warte auf Findings, dann implementiere

#### 4. Prisma Schema Design
Neue Models basierend auf crm.allium Entities:
- Person (mit FullName, TypedEmail/Phone als JSON, GDPR-Felder)
- Interview (mit status transitions, outcome)
- Task + TaskTarget (polymorphic nullable FKs)
- Note + NoteTarget (polymorphic nullable FKs)
- ActivityLog (immutable, append-only)
- Blocklist (handle + type)
- Migration mit `npx prisma migrate dev`

### DO-Phase

Starte `/full-stack-orchestration:full-stack-feature` für die Umsetzung.

**Implementierungs-Reihenfolge (Foundation-then-Fan-Out):**
1. Prisma Schema + Migration (alle CRM Models)
2. Domain Events + Notification Types (Event Bus Erweiterung)
3. Person Server Actions + i18n namespace `crm` (4 Locales)
4. Interview Server Actions
5. Task + Note Server Actions (polymorphic targeting)
6. ActivityLog consumer (EventBus → materialized read model)
7. Blocklist Server Actions
8. UI Komponenten (nach Wireframe-Review):
   - PersonDirectory (Liste + Suche + Filter)
   - PersonDetail (Einzelansicht + Timeline + verknüpfte Interviews/Tasks/Notes)
   - InterviewCalendar (Upcoming + Schedule)
   - TaskBoard (Pending/Overdue/Done)
   - ActivityTimeline (per Job ODER per Person)
   - BlocklistSettings (in Settings-Seite)
9. Navigation: CRM-Sektion im Dashboard Sidebar
10. Notification Dispatcher: CRM-Event-Handler registrieren

**UX-Pflicht für JEDE neue Komponente:**
- Loading State, Empty State, Error State
- Mobile Responsiveness (375px+)
- Keyboard Navigation + Focus Management
- Dark Mode Kompatibilität
- i18n (alle 4 Locales: EN, DE, FR, ES)
- Confirmation Dialogs für destruktive Aktionen
- Visuelles Feedback für jede User-Aktion

Committe nach jedem logischen Schritt. Build + Tests VOR jedem Commit.

### CHECK-Phase

1. `/allium:weed` über `specs/crm.allium` — Stimmt Implementation mit Spec überein?
2. `/comprehensive-review:full-review` (alle 5 Dimensionen: Architecture, Security, Performance, Testing, Best Practices)
3. User Journey + Edge Cases für CRM Features (7 Dimensionen: Empty, Error, Concurrent, Extreme Data, Mobile, Locales, External API)
4. UX 10-Punkte-Checkliste für alle neuen Komponenten
5. Blind Spot Check: "Woran haben wir nicht gedacht?"
6. Cross-Dependency Check: Sind Hooks/Events für 5.1 (Communication), 5.2 (Calendar), 5.7 (Contact Extraction) vorbereitet?
7. GDPR Check: data_source, processing_basis, retention_expires_at auf Person korrekt implementiert?

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. Aktualisiere ROADMAP.md (5.4, 5.5, 5.8, 5.9 Status markieren)
4. Aktualisiere CLAUDE.md (CRM Core Architektur-Sektion hinzufügen)
5. Aktualisiere CHANGELOG.md
6. Prüfe docs/documentation-agents.md — starte relevante Doku-Agents

## Übergreifende Regeln

### Git
- Committe häufig mit logischer Gruppierung
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --workers=1`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.** Nur in eigene Branches/main mergen.
- **NIEMALS tests+builds parallel** — VM Resource Limits, single worker

### Implementierung
- Verwende IMMER `/full-stack-orchestration:full-stack-feature` für alle Entwicklungsarbeit
- ui-design Agent VOR UI-Implementierung konsultieren
- Foundation-then-Fan-Out: Typen sequentiell definieren, dann parallel implementieren
- `import "server-only"` auf allen Server-Dateien
- Alle Prisma-Queries mit userId (ADR-015 IDOR)
- encrypt()/decrypt() sind async — immer awaiten

### DDD-Prinzipien
- **Person ist ein eigenständiges Aggregate** — nicht Teil des Job Aggregate
- Job Aggregate bleibt unverändert (nur neue Relationen: Interview, TaskTarget, NoteTarget)
- Ubiquitous Language: Verwende Terms aus CLAUDE.md + crm.allium
- Domain Events: Alle 9 CRM-Events über TypedEventBus publizieren
- ACL: Keine externen Abhängigkeiten im CRM Core
- Polymorphic Targeting: TaskTarget/NoteTarget mit nullable FKs (Twenty CRM Pattern)

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings. Keine Ausnahmen.

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items
3. Schreibe eine Handoff-Notiz in .remember/remember.md
4. Starte KEINE neuen Feature-Implementierungen — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen an den User. Maximale kognitive Anstrengung.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] `specs/crm.allium` Implementation aligned: `/allium:weed` = zero Divergenzen
- [ ] Prisma Migration erstellt und angewendet
- [ ] Person CRUD funktional (Create, Read, Update, Archive, Merge)
- [ ] Interview Scheduling funktional (Schedule, Complete, Cancel, Reschedule)
- [ ] Task Board funktional (Create, Complete, Overdue-Anzeige, polymorphic targets)
- [ ] Notes funktional (Create, polymorphic targets)
- [ ] ActivityTimeline funktional (per Job + per Person)
- [ ] Blocklist funktional (Add, Remove, suppresses auto-creation)
- [ ] 9 CRM Domain Events registriert und publiziert
- [ ] 4 CRM Notification Types mit Event-Handler-Mapping
- [ ] GDPR-Felder auf Person: data_source, processing_basis, retention_expires_at
- [ ] Comprehensive Review bestanden (zero Findings)
- [ ] UX 10-Punkte-Checkliste für alle ~6 neuen Komponenten bestanden
- [ ] Blind Spot Check durchgeführt
- [ ] Cross-Dependencies: Hooks für 5.1, 5.2, 5.7 vorbereitet
- [ ] E2E Tests für CRM Features hinzugefügt
- [ ] docs/BUGS.md aktualisiert
- [ ] CLAUDE.md aktualisiert (CRM Architektur)
- [ ] CHANGELOG.md Einträge
- [ ] Build grün + Tests grün + E2E grün
- [ ] Honesty Gate VOR Push durchgeführt

## After S3: Session S2 — UX Polish

Nach Abschluss von S3 steht S2 (UX Polish) an — systematische UX-Qualitätsprüfung über ALLE 46 Komponenten (inkl. der neuen CRM-Komponenten aus S3). Der S2-Prompt liegt bereit als `~/s2-ux-polish-session.md`. Starte S2 in einer **frischen Session** nach S3-Push.
