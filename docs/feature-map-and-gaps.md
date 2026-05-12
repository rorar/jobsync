# JobSync — Feature-Karte, Deferrals & Lücken

Stand: 2026-05-12 — aus Code-Analyse (Single Source of Truth)

---

## 1. Was ist deferred?

### Spec-Deferred (crm.allium `deferred` Keyword)

| Item | Abhängigkeit |
|------|-------------|
| `CommunicationConnector.sync` | Roadmap 1.12 — Email-Sync (Gmail/Outlook/IMAP) |
| `CalendarConnector.sync` | Roadmap 1.7 — Kalender-Integration (CalDAV) |
| `ContactExtraction.extract` | Roadmap 5.7 — NLP aus Job-Beschreibungen |
| `ImportExport.bulkImport` | Roadmap 5.8 — CSV Import/Export für Personen |

### Spec-Rules ohne Implementation

| Rule | Status | Warum |
|------|--------|-------|
| `AutoCreatePersonFromEmail` | Kein Code | Braucht `CommunicationConnector` (deferred) |

### TODOs im Code

| Datei | TODO |
|-------|------|
| `PromotionDialog.tsx:61` | Tag-Multi-Select statt Text-Input beim Promoten |
| `AddCompany.tsx:579` | File-Upload Dropzone für Logo |

### ActivityTypes deklariert aber nie projiziert

Diese 6 existieren im Enum (`person.model.ts`) aber werden nirgends in `CrmActivityLog` geschrieben:

- `email_sent`, `email_received` — braucht CommunicationConnector
- `call_logged` — kein Call-Tracking-Feature existiert
- `document_attached` — kein Dokument-Management existiert
- `follow_up_sent` — kein Follow-Up-Automation existiert
- `application_submitted` — nicht vom Code verwendet

### Prisma-Modelle ohne Nutzung

| Model | Status |
|-------|--------|
| `ConnectedAccount` | Schema existiert, kein Action-File, keine UI — Structural Placeholder |
| `AdminAuditLog` | Write-Path existiert, kein Read/UI — Admin UI fehlt |

### Nicht gebaute Spec-Surfaces

| Surface aus crm.allium | UI existiert? |
|------------------------|--------------|
| `PersonDirectory` | `/dashboard/contacts` |
| `PersonDetail` | `/dashboard/contacts/[id]` |
| `InterviewCalendar` | `/dashboard/interviews` |
| `TaskBoard` | `/dashboard/crm-tasks` |
| `PersonTimeline` | (in PersonDetail) |
| `JobTimeline` | **Kein Component** |
| `CompanyTimeline` | **Kein Component, kein `/dashboard/companies`** |
| `BlocklistSettings` | (in Settings) |

### Pre-existing Bugs

- `handleError` in 6 CRM Action-Files leaked raw `error.message` an den Client (Prisma-Fehler sichtbar)
- `job.actions.spec.ts` hat 1 pre-existing Testfailure (`deleteJobById`)

---

## 2. Welche Funktionen SOLLTEN verknüpft sein, sind es aber nicht?

### Events ohne Consumer (Fire-and-Forget ins Nichts)

13 Events werden publiziert aber niemand hört zu:

| Event | Publiziert von | Sollte konsumiert werden von |
|-------|---------------|------------------------------|
| `ReminderTriggered` | CRM Cron | **Notification Dispatcher** — User soll Erinnerungen als In-App/Email/Push/Webhook bekommen |
| `ContactDeleted` | `anonymizePerson`, `mergePersons` | **Notification Dispatcher** — GDPR-Audit, "Person wurde anonymisiert" |
| `InterviewScheduled` | `scheduleInterview` | **Notification Dispatcher** — "Interview geplant für morgen" |
| `InterviewCompleted` | `completeInterview` | **CRM Activity Logger** — Timeline sollte Completion zeigen (tut es nur über direkten ActivityLog-Write, nicht über Event) |
| `CrmTaskCreated` | `createCrmTask` | **Notification Dispatcher** — optional, wenn andere User Tasks zugewiesen bekommen |
| `CrmTaskCompleted` | `completeCrmTask` | **Notification Dispatcher** — "Task erledigt" |
| `CrmNoteCreated` | `createCrmNote` | Kein Consumer nötig (Timeline wird direkt geschrieben) |
| `AutomationRunStarted/Completed` | RunCoordinator | SSE-Endpoint liest nicht Events — liest stattdessen direkt den RunCoordinator-State |
| `SchedulerCycleStarted/Completed` | RunCoordinator | Gleich — SSE liest State direkt |
| `EnrichmentFailed` | Orchestrator | Kein Consumer — Logo.dev Failure wird geloggt aber nicht berichtet |

**Kritischste Lücke:** `ReminderTriggered` → Notification Dispatcher. Der CRM-Cron feuert Events, aber kein Consumer wandelt sie in Notifications um. Die Erinnerungen existieren nur als ActivityLog-Einträge — der User sieht sie nur, wenn er die Timeline manuell öffnet.

### CRM ↔ Job Aggregate: Fehlende Bidirektionale Verknüpfungen

| Von | Nach | Status |
|-----|------|--------|
| Job Detail Page | CRM Contacts (JobContact) | **Keine UI** — Spec sagt `PersonDetail` zeigt Related Jobs, aber Job Detail zeigt KEINE Related Persons |
| Job Detail Page | CRM Activity Timeline | **`JobTimeline` Surface nicht gebaut** — Spec definiert sie, aber kein Component existiert |
| Company | CRM Activity Timeline | **`CompanyTimeline` Surface nicht gebaut** — Spec definiert sie |
| Company | Company Detail Page | **`/dashboard/companies` existiert nicht** — Company ist ein Lookup-Value ohne eigene Seite |

### Promotion Pipeline ↔ CRM

| Verknüpfung | Status |
|-------------|--------|
| StagedVacancy promote → Job → Auto-Link Contact Person | Nicht verbunden — promoted Job hat keinen JobContact |
| StagedVacancy promote → extract Company.domain | Gefixt (Session 2026-05-11) |
| Automation-imported Job → Company.domain → Person matching | Möglich über `extractDomain`, aber `AutoCreatePersonFromEmail` ist deferred |

---

## 3. Welche Abhängigkeiten SOLLTEN verknüpft sein, sind es aber nicht?

### Event Bus → Notification Dispatcher (CRM Events fehlen)

```
Ist-Zustand:                          Soll-Zustand:
notification-dispatcher hört auf:     notification-dispatcher SOLLTE AUCH hören auf:
  VacancyPromoted                       ReminderTriggered (Interview/Task/Retention)
  VacancyStaged                         InterviewScheduled
  BulkActionCompleted                   ContactDeleted (GDPR audit trail)
  ModuleDeactivated                     CrmTaskCreated (optional)
  ModuleReactivated
  RetentionCompleted
  JobStatusChanged
```

### CRM Activity Logger (inkonsistente Projektion)

```
Ist-Zustand:                          Problem:
Logger hört auf:                      Direkte ActivityLog-Writes in Actions:
  JobStatusChanged (via Event)          interview_scheduled (in scheduleInterview)
  ContactCreated (via Event)            interview_completed (in completeInterview)
  ContactUpdated (via Event)            task_created (in createCrmTask)
                                        task_completed (in completeCrmTask)
                                        note_added (in createCrmNote)
                                        reminder_triggered (in crm-cron)
```

**Architektur-Inkonsistenz:** Einige ActivityTypes werden via Event → Consumer projiziert (DDD-konform), andere werden direkt in der Action geschrieben (bypass EventBus). Die Spec sagt `contract TimelineProjection { project: ... }` — alle sollten über den Consumer laufen.

### handleError: Prisma-Fehler leaken

```
6 CRM Action-Files:                   Alle anderen Action-Files:
  return { message: error.message }     return handleError(error, "Safe message")
  ↓                                      ↓
  Prisma-Internals an Client             Generische Meldung an Client
```

Die 6 CRM-Files (`person.actions.ts`, `jobContact.actions.ts`, `crmInterview.actions.ts`, `crmTask.actions.ts`, `crmNote.actions.ts`, `crmBlocklist.actions.ts`) verwenden eine lokale `handleError` die `error.message` direkt zurückgibt. Die restlichen Action-Files verwenden `handleError` aus `@/lib/utils` die eine sichere generische Meldung zurückgibt.

### Spec → Code Drift (crm.allium)

| Spec-Element | Code-Realität |
|-------------|---------------|
| `rule AddJobContact` | Nicht in Spec (Entity existiert, keine Lifecycle-Rules) |
| `rule RemoveJobContact` | Nicht in Spec |
| `entity JobContact { user_id }` | Spec deklariert kein `user_id`, Code hat es |
| `entity ActivityLog { target_company: Company? }` | Jetzt mit @relation (Session 2026-05-11) |
| `surface JobTimeline` | Spec definiert, Code hat kein Component |
| `surface CompanyTimeline` | Spec definiert, Code hat kein Component |

---

## 4. Prioritäten

### Sofort behebbar (nächste Session)

1. `ReminderTriggered` → Notification Dispatcher verknüpfen (Events feuern, aber keiner hört zu)
2. `handleError` in 6 CRM-Files auf sichere Variante umstellen
3. Job Detail → Related Contacts UI bauen (per ui-design Agent Empfehlung)
4. CRM Activity Logger auf Event-basierte Projektion vereinheitlichen
5. Spec → Code Sync: AddJobContact/RemoveJobContact Rules + user_id in crm.allium

### Design-Entscheidung nötig

6. Company als eigene Page (`/dashboard/companies`) mit Timeline
7. ActivityTypes `email_sent`/`call_logged` etc. — wann implementieren?
8. PromotionDialog Tag-Multi-Select (TODO im Code)

### Roadmap-gebunden (nicht jetzt)

9. CommunicationConnector (1.12) → `AutoCreatePersonFromEmail`
10. CalendarConnector (1.7) → Interview ↔ Calendar sync
11. ContactExtraction (5.7) → NLP aus Job-Beschreibungen
12. ImportExport (5.8) → CSV Import/Export
