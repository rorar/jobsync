# JobSync Roadmap

## Index

| Sektion | Bereich | Zielgruppe |
|---------|---------|------------|
| [0. Infrastruktur-Refactoring](#0-infrastruktur-refactoring-priorität) | Codebase-Architektur | Dev |
| [1. Connectors](#1-connectors) | Externe Integrationen | User + Dev |
| [2. UX/UI](#2-uxui) | Benutzeroberfläche | User |
| [3. Quality of Life](#3-quality-of-life) | Komfort-Features | User |
| [4. Bewerbungsunterlagen](#4-bewerbungsunterlagen) | Dokumente & CV | User |
| [5. CRM](#5-crm) | Kontakt-Management | User |
| [6. Datenschutz & Compliance](#6-datenschutz--compliance) | Sicherheit | User + Dev |
| [7. API & Dokumentation](#7-api--dokumentation) | API-Docs | User + Dev |
| [8. Developer Experience (intern)](#8-developer-experience-intern) | Dev-Tooling, CI, DX | Dev only |
| [9. Experimentell](#9-experimentell) | Forschung & Prototypen | Dev |

---

## 0. Infrastruktur-Refactoring (Priorität)

### 0.1 App ↔ Connector ↔ Module Umstellung -- DONE
Bestehende Infrastruktur auf das ACL-Pattern (Anti-Corruption Layer) migriert. Siehe ADR-010.

Der **Connector** ist die gemeinsame Schnittstelle (ACL). **Module** sind die konkreten Anbindungen an externe Systeme.

```
src/lib/connector/                          ← Unified Connector Architecture
  job-discovery/                            ← Job Board Connectors (DataSourceConnector)
    types.ts                                ← ConnectorResult<T>, DiscoveredVacancy, SearchParams
    connector.ts                            ← DataSourceConnector Interface (der ACL-Vertrag)
    registry.ts                             ← Context Map (Module-Name → Factory)
    runner.ts                               ← App-Layer Orchestrierung
    mapper.ts                               ← mapDiscoveredVacancyToJobRecord
    modules/                                ← Konkrete Anbindungen (je ein Bounded Context)
      eures/                                ← Module: EURES API
      arbeitsagentur/                       ← Module: Arbeitsagentur API
      jsearch/                              ← Module: JSearch/Google Jobs API
  ai-provider/                              ← AI Connector (AIProviderConnector)
    modules/
      ollama/                               ← Module: Ollama (lokal)
      openai/                               ← Module: OpenAI (Cloud)
      deepseek/                             ← Module: DeepSeek (Cloud)
```

- **Migration abgeschlossen:**
  - `src/lib/scraper/` -> `src/lib/connector/job-discovery/`
  - `src/lib/ai/` -> `src/lib/connector/ai-provider/`
  - Module-Ordner (`eures/`, `arbeitsagentur/`, `jsearch/`) -> `src/lib/connector/job-discovery/modules/`
  - `mapScrapedJobToJobRecord` -> `mapDiscoveredVacancyToJobRecord`
- **Imports aktualisiert:** `@/lib/scraper/` -> `@/lib/connector/job-discovery/`, `@/lib/ai/` -> `@/lib/connector/ai-provider/`
- **Tests bestanden**

### 0.2 ActionResult<T> Typisierung vervollständigen -- DONE
- **Pattern A** (73 Funktionen): ✅ Alle `ActionResult<unknown>` → spezifische Domain-Typen migriert
  - 14 Dateien, 73 Funktionen mit konkreten Typen (Job, Company, Activity[], Tag, etc.)
  - `as unknown as T` Casts überbrücken Prisma null/undefined Gap (wird in 0.3 aufgelöst)
  - ApiKey (3): von Inline-Typen auf `ActionResult<ApiKeyClientResponse>` migriert
- **Pattern B** (5 Funktionen): `getAllX()` gibt raw Arrays zurück — unverändert
  - `getAllCompanies`, `getAllJobTitles`, `getAllJobLocations`, `getAllTags`, `getAllActivityTypes`
  - Caller-Refactoring → separates Ticket
- **Pattern C** (14 Funktionen): Custom Return-Types
  - Automation (12): ✅ auf ActionResult<T> migriert in 0.3
  - Dashboard (7): domänenspezifische Returns — bleiben custom
  - Auth (2): untypisiert — Auth-Refactoring separat
- Siehe `specs/action-result.allium` für die vollständige Klassifikation

### 0.3 Domain-Model Alignment -- DONE
- **Domain Models aligned** mit Prisma Schema (Feld-für-Feld Synchronisation):
  - `activity.model.ts`: ActivityType +createdBy/description, Activity required fields + `| null`
  - `job.model.ts`: JobResponse nullable fields (`appliedDate`, `dueDate`, `salaryRange`, `jobUrl`), optional Relations (`Location?`, `JobSource?`), JobLocation/Company `| null` für Prisma-nullable
  - `profile.model.ts`: DateTime `string` → `Date` (Summary, WorkExperience, Education), FK-Scalare hinzugefügt, Relations optional, `Boolean` → `boolean`
  - `automation.model.ts`: `connectorParams: string | null`, `matchScore: number | null`, `discoveryStatus | null`, `discoveredAt | null`
- **`handleError(): ActionResult<never>`** — typisiert mit Bottom-Type, kompatibel zu allen `ActionResult<T>`
- **`as unknown as` Casts:** 74 → 10 (86% Reduktion). Verbleibende: 9 Pattern-B + 1 Mock-Boundary
- **Schmale Enum-Casts** (`as TaskStatus`, `as SectionType`, `as AutomationStatus`) ersetzen breite `as unknown as`
- **Architektur-Invariante:** `null` in DB → `| null` im Domain Model. `undefined` = "Feld nicht im Response"
- **automation.actions.ts** auf Projekt-Konventionen migriert (ActionResult, handleError, prisma-Alias)
- **Bugfixes via Review:** `updateJob` createdAt-Überschreibung, `deleteJobById` unnötige includes, Job-Detail notFound-Guard
- **Verbleibend für spätere Tickets:**
  - Pattern B `getAllX` Funktionen → ActionResult Migration
  - `?:` vs `| null` Vereinheitlichung (z.B. task.model.ts)
  - Mapper-Funktionen für Task/Profile (DRY)

### 0.4 Module Lifecycle Manager -- DONE
Module registrieren sich mit einem **Manifest** beim Connector und deklarieren ihre Settings-Anforderungen. Der Lifecycle Manager propagiert Settings, verwaltet Aktivierung/Deaktivierung und überwacht Health.

**Implementiert (2026-03-29):**
- Phase 1: ModuleManifest Types + Unified Registry (6 Module mit Manifests)
- Phase 2: Credential PUSH + Manifest-driven Settings UI (hardcoded MODULES eliminiert)
- Phase 3: Activation/Deactivation + Automation Pausing (pauseReason auf Automation)
- Phase 4: Health Monitoring (Probe, Status-Transitions, Persistenz)
- Phase 5: Resilience Shared Kernel (Cockatiel aus Manifests, Duplikat eliminiert)
- Phase 6: Automation Degradation (Auth/CB/RunFailure Escalation Rules)
- Allium Spec synchronisiert (17 Divergenzen gefixt)
- 114 Tests in 6 Suites (Registry, Credentials, Manifests, Degradation, Health, Resilience)
- UI: Health-Indikator in Settings, pauseReason in Automations-Liste

**Schichten:**
1. **Module Manifest** — Jedes Modul deklariert bei Registrierung:
   - ID, Name, Connector-Zugehörigkeit
   - Settings-Schema (API-Key? Default-Params? Auth-Flow?)
   - Health-Check Endpoint (falls vorhanden)
   - Resilience-Konfiguration (Circuit Breaker, Retry, Rate Limit)
   - Capabilities: `{ availabilityCheck: boolean }` — deklariert optionale Fähigkeiten (z.B. `isAvailable` für Job-Aktualitäts-Check → 3.8)
2. **Settings Registry** — Brücke zwischen Manifest und Settings-UI:
   - Settings-UI wird aus Manifests generiert (kein hardcoded `MODULES`-Array mehr)
   - Settings fließen per PUSH zum Modul bei Instanziierung (nicht ad-hoc PULL)
   - Validierung von `connectorParams` gegen Modul-Schema
3. **Activation/Deactivation** — Lifecycle-Management:
   - Modul aktiviert → Connector-Status wird derived (aktiv wenn ≥1 Modul aktiv)
   - Modul aktiviert → `JobSource.findOrCreate(module.id, module.name)` — Referenzdaten automatisch aktuell (ex 1.4)
   - Modul/Connector deaktiviert + Automation nutzt es → Automation pausiert + User benachrichtigt
   - Deaktivierte Module erscheinen nicht im Automation Wizard
4. **Health Monitoring** — Pro Modul:
   - Status-Anzeige (grün/gelb/rot) basierend auf Health-Check
   - Letzte erfolgreiche Verbindung mit Timestamp
   - Circuit Breaker Status (offen/geschlossen/halb-offen)
5. **Resilience als Shared Kernel (Cockatiel):**
   - Cockatiel-Policies werden auf **Connector-Ebene** instanziiert, nicht pro Modul dupliziert
   - Module deklarieren Resilience-Bedarf im Manifest (`retryAttempts`, `circuitBreaker`, `timeout`, etc.)
   - Connector erstellt die Policy-Stacks und stellt sie bei Modul-Instanziierung bereit
   - Eliminiert `resilience.ts`-Duplizierung (aktuell: EURES + Arbeitsagentur identisch, 4 Module ohne)
6. **Automation-Degradation (Circuit Breaker → Automation):**
   - Da der Connector die Policies besitzt, kennt er den CB-Status jedes Moduls
   - **Sofort pausieren:** `auth_failed`, `blocked` (heilt sich nicht selbst)
   - **Nach Schwellenwert pausieren:** N konsekutive `failed` Runs oder CB seit X Minuten offen
   - **Nie pausieren:** `rate_limited`, einzelne Timeouts (selbstheilend)
   - Pausierte Automations + User-Benachrichtigung mit Fehlergrund

**Connector-Rolle:** Der Connector ist kein eigenständiges Lifecycle-Objekt, sondern:
- **Interface-Vertrag** (was Module implementieren müssen) — erweitert um optionale `isAvailable?(externalId): ConnectorResult<boolean>` Methode für Maintenance Automations (→ 3.8)
- **Settings-Schema-Kategorie** (welche Art Settings Module haben können)
- **Resilience-Infrastruktur (Shared Kernel)** — besitzt Cockatiel-Policies, Module konsumieren sie
- **Derived Status** (aktiv wenn ≥1 Modul aktiv)
- **CB-Status-Propagation** — leitet Circuit Breaker Zustand an den Lifecycle Manager weiter

**Ist-Zustand (6 Module):**

| Modul | Connector | API-Key | ConnectorParams | Health-Check | Resilience |
|---|---|---|---|---|---|
| eures | Job Discovery | Nein | `language` | Nein | Cockatiel (voll) |
| arbeitsagentur | Job Discovery | Nein (hardcoded) | `umkreis`, `veroeffentlichtseit`, `arbeitszeit`, `befristung` | Nein | Cockatiel (voll) |
| jsearch | Job Discovery | Ja (`RAPIDAPI_KEY`) | — | Nein | Keine |
| ollama | AI | Nein | URL (localhost) | Ja | Keine |
| openai | AI | Ja (`OPENAI_API_KEY`) | — | Ja | Keine |
| deepseek | AI | Ja (`DEEPSEEK_API_KEY`) | — | Ja | Keine |

- Voraussetzung für: Marketplace UI (→ 2.11), Unified Automation Wizard (→ 2.10), Onboarding Modul-Aktivierung (→ 2.1)
- Allium Spec: `specs/module-lifecycle.allium`
- **DDD-Pattern:** Published Language — der Connector publiziert einen Settings-Vertrag (`ModuleManifest`), Module erfüllen ihn mit ihren spezifischen Anforderungen. Basis-Vertrag mit connector-spezifischen Extensions (`JobDiscoveryManifest`, `AiManifest`).

### 0.5 Vacancy Pipeline (Staging → Inbox → Tracking → Archive/Trash)
Entkopplung der LLM-Abhängigkeit: Die App funktioniert in den Grundfunktionen ohne LLMs. Stellenangebote durchlaufen eine Pipeline mit klaren Aggregate-Grenzen.

**Architektur:**
```
Intake (Automation ODER Manual) → Staging Area → Processing → Inbox → Tracking → Archive
                                  (ungefiltert)   (manuell      (Event Hub:        Trash
                                                   ODER LLM,     - Company create    (Retention)
                                                   optional)      - Data Enrichment
                                                                  - CRM "Chance"
                                                                  - Bewerbungsunterlagen)
```

**Neue Aggregates:**

1. **StagedVacancy** (Discovery Context) — Rohes Stellenangebot, ungefiltert
   - Eigene Identität: `sourceBoard:externalId` (Dedup-Key), getrennt von Job
   - Pipeline-Status: `staged → processing → ready → promoted` oder `→ dismissed`
   - Optional: matchScore (wenn LLM verfügbar und konfiguriert)
   - Kein Company-Bezug, kein JobStatus, keine Interviews — reine Intake-Daten
   - **Felder (abgeleitet aus bestehendem Add-Job-Modal):**
     - Pflicht: `title` (einziges Pflichtfeld — Queue soll schnell sein)
     - Optional: `employerName`, `locationLabel`, `jobUrl`, `employmentType`, `salary`, `description`, `tags`
     - Auto: `source` (manual | automation:{id}), `createdAt`, `userId`
     - Nicht in Staging: `company` (FK), `status`, `applied`, `dueDate`, `resume` — das ist Tracking-Kontext (erst bei Promotion)
2. **Inbox als Event Hub** (Domain Events Pattern)
   - Promotion von StagedVacancy → Job ist ein **Creation Event**, keine State-Transition
   - Publiziert `VacancyPromoted` Domain Event — Consumer subscriben unabhängig:
     - `CompanyNeeded` → Company find-or-create + Data Enrichment Connector (1.13)
     - `EnrichmentRequested` → Logo, Firmendaten anreichern
     - `CrmChanceCreated` → CRM (5)
     - `DocumentsAvailable` → Bewerbungsunterlagen (4)
   - **Design-Entscheidung:** Domain Events (B), nicht Event Sourcing. Events entkoppeln Promotion von Consumern, sind optional loggbar (Audit), aber Entities bleiben Source of Truth.
3. **Archive + Trash** (Lifecycle-Endpunkte)
   - Archive: Abgeschlossene Bewerbungen, nachschlagbar
   - Trash: Soft Delete mit benutzer-konfigurierbarer Aufbewahrungsfrist
     - Default: Best-Practice-Schwellenwert (z.B. 90 Tage)
     - Option: "Immer behalten" (auf eigenes Risiko)
   - DSGVO-Alignment: → Löschkonzept (6.1)

**Deprecated Fields auf Job:**
- `discoveryStatus`, `automationId`, `matchScore`, `matchData`, `discoveredAt` → wandern zu StagedVacancy
- Job behält `originVacancyId` als Rückverweis für Audit/Dedup

**Manuelle Jobs:**
- Default: Manuell erstellte Jobs landen direkt in der Inbox (User hat bereits reviewt)
- Option: User kann wählen "in Queue erfassen" für spätere Verarbeitung

**Job-Tinder Dual-Use (→ 2.7):**
- Queue-Modus: Vor-Review (Accept/Dismiss/Super-Like)
- Inbox-Modus: Finale Bewerbungsentscheidung
- Super-Like in Queue = sofortige Promotion → Inbox + Downstream-Triggers

**Staging-UI:**
- Tab "Neu" (staged + processing + ready) — Default-Ansicht
- Tab "Abgelehnt" (dismissed) — sichtbar, filterbar, wiederherstellbar
- Filter: Status, Quelle, Datum, Match-Score
- `dismissed → staged` Transition erlaubt (Wiederherstellung per UI)

**Undo/Redo (UX):**
- Aktionen in der Pipeline (Dismiss, Promote, Delete, Archivieren) sind per UI-Element UND Tastenkombination (Ctrl+Z / Cmd+Z) rückgängig machbar
- Toast-Notification mit "Rückgängig"-Button nach jeder destruktiven Aktion
- Zeitfenster für Undo: konfigurierbar (Default: 10 Sekunden nach Aktion)
- Gilt für: Staging (Dismiss/Restore), Inbox (Promote/Zurückstellen), Tracking (Archive/Trash/Delete)

**Dedup-Retention (DSGVO Privacy by Design):**
- Nach Ablauf der Retention-Frist: StagedVacancy-Daten werden **gelöscht**, aber ein **Hash des Dedup-Keys** (`hash(sourceBoard + ":" + externalId)`) bleibt in einer `DedupHash`-Tabelle
- Hash ist One-Way (nicht rekonstruierbar) → keine personenbezogenen Daten
- Nächster Automation-Run vergleicht gegen DedupHash → bereits gesehene Jobs werden übersprungen
- Minimale Datenspeicherung: ein Hash + userId + Timestamp pro Eintrag
- DSGVO Art. 25 (Privacy by Design) + Art. 5(1)(c) (Datenminimierung)

**Staging-Performance & Langzeit-Nutzung:**
- Bei 50 Jobs/Tag → ~18.000 StagedVacancies/Jahr. Braucht Cleanup-Strategie:
  - Dismissed: Retention-Frist → DedupHash behalten, Daten löschen
  - Promoted: StagedVacancy kann nach Promotion archiviert/komprimiert werden (nur ID + Hash + Timestamp)
  - Bewerbungspause: User kann Automations pausieren; Staging-Daten bleiben unberührt bis Retention greift
- Pagination/Virtualisierung in der Staging-UI für große Datenmengen

**Bulk Actions (Domain Service, nicht nur UI-Loop):**
- Multi-Select + Batch-Operation: bulk dismiss, bulk promote, bulk archive, bulk tag, bulk delete
- **Partial-Success-Semantik:** Jedes Item wird einzeln validiert. Invalid Items werden übersprungen, nicht die ganze Batch gerollt.
- **Ein Undo-Eintrag pro Batch** (nicht pro Item). Ctrl+Z reverst die gesamte Batch.
- **Ein `BulkActionCompleted` Domain Event** pro Batch (nicht N einzelne Events).
- Consumer (Notifications, Audit-Log) erhalten die Item-ID-Liste aus dem Batch-Event.

**Open Questions:**
- Undo-Implementierung: Command Pattern (Action-Stack) oder einfacher Timer-basierter Soft-Revert?
- Partial Undo innerhalb einer Batch: Separate "Restore"-Aktion oder Undo-Granularität pro Item?

- **Reihenfolge:** Nach 0.4 (Module Lifecycle), da Inbox-Events die Connector-Infrastruktur nutzen
- **Voraussetzung für:** Job-Tinder Dual-Use (2.7), CRM (5), Bewerbungsunterlagen (4)
- Allium Spec: `specs/vacancy-pipeline.allium` (zu erstellen)

### 0.6 Unified Notification System
Application Service für Dispatch + bestehende Connectors für Delivery. **Dispatch ≠ Delivery.**

- **Dispatch (intern):** `NotificationDispatcher` subscribt Domain Events → prüft User-Preferences → routet an Channels
- **Delivery (extern):** E-Mail (→ Communication Connector 1.12), Browser Push, Webhook (→ 1.3), In-App (DB-Write)
- **Preferences:** Teil von UserSettings (kein eigenes Aggregate). Channels, Digest-Modus, Quiet Hours, per-Typ-Overrides.
- **Phasen:**
  1. In-App Notifications (Bell-Icon, DB-backed) — unblocked 0.4 (Degradation) und 0.5 (Promotion)
  2. E-Mail Channel via Communication Connector (1.12)
  3. Browser Push Channel
  4. Webhook Channel für n8n-Integration (1.3)
- **Key Insight:** Job-Alerts (1.5) und CRM-Reminders (5.4) sind **Notification-Rules**, keine eigenen Systeme. Sie werden als Konfiguration des Dispatchers modelliert.
- **Domain Event Bus (architektonischer Owner):**
  - 0.6 besitzt den Event Bus als Infrastruktur — nicht nur für Notifications, sondern als **genereller Publish/Subscribe-Mechanismus** für Domain Events
  - Events: `VacancyPromoted` (0.5), `JobExpired` (3.8), `DocumentsAvailable` (4.2), `BulkActionCompleted` (0.5), `ModuleDeactivated` (0.4)
  - NotificationDispatcher ist ein Consumer des Event Bus, nicht der Bus selbst
  - Andere Consumer: CRM (5), Data Enrichment (1.13), Dokumenten-Generatoren (4.2), Administrative Queue (8.4)
- **Reihenfolge:** NACH 0.4 und 0.5 (die Events produzieren), VOR 0.7 (Search)
- Allium Spec: `specs/notification-dispatch.allium` (zu erstellen — inkl. Event Bus Definition)

### 0.7 Volltextsuche
Application Service (CQRS-lite Read-Projektion), kein Connector. Indiziert eigene Domain-Daten, kein externes System.

- **Default:** SQLite FTS5 (same-process, zero Dependencies) — ausreichend für Self-Hosted
- **Phasen:**
  1. FTS5 auf Job + StagedVacancy (Kern-Suche, Quick Win)
  2. Erweitert auf Contact, Company, Resume, Notes (Cross-Aggregate-Suche für CRM)
  3. Optional: Meilisearch/Typesense als externes Search-Backend (eigener Connector mit Modulen, nur wenn SQLite FTS5 nicht mehr ausreicht)
- **Invarianten:** Tenant-Isolation (Suche nur eigene Daten), DSGVO-Deletion propagiert zum Index, Eventually Consistent
- **Cross-Ref:** Staging (0.5) — dismissed StagedVacancies suchbar im "Abgelehnt"-Tab aber nicht in Default-Ergebnissen

### 0.8 PWA / Offline Support (Read-Only)
Progressive Web App für mobile Nutzung. **Split: Read-Only zuerst, Offline-CRUD separat (später).**

- **Phase 1 (0.8):** Read-Only PWA — Service Worker, Cache-First für Static Assets, Offline-Cache von Jobs/Contacts/Staging
  - Usecases: Job-Details unterwegs lesen, Staging-Queue auf dem Handy reviewen, Notizen bei Interviews nachschlagen
  - Kein Offline-Write. Alle Mutationen erfordern Connectivity.
- **Phase 2 (3.10, später):** Offline-CRUD — lokale Action-Queue, Optimistic Locking (Version-Field), Conflict Resolution bei Sync
  - Nur bei konkretem User-Demand. Multi-Device (Handy + Laptop) ist der reale Conflict-Vektor.
- **Invarianten:** Offline-Actions in FIFO-Reihenfolge replayed, keine Offline-Automation-Runs (erfordern Server-Side API-Calls)

---

## 1. Connectors

### 1.1 Arbeitsagentur Jobsuche (Job Discovery Modul)
Bestehendes Modul für die Jobsuche über den Job Discovery Connector. Funktioniert unabhängig vom arbeitsagentur.de Account-Modul (1.9).
- **Status:** Implementiert — Suche über öffentliche Jobsuche-API
- **Ressourcen:**
  - https://github.com/bundesAPI/deutschland/blob/main/docs/jobsuche/README.md
  - https://github.com/bundesAPI/jobsuche-api
  - https://jobsuche.api.bund.dev/
- **Shared Kernel mit 1.9:** Vom Arbeitsvermittler erhaltene Bewerbungsvorschläge können als Jobs in JobSync importiert werden. Statuswechsel (→ beworben) wird zurück nach arbeitsagentur.de propagiert.

### 1.2 Workflow Connector
- **Modul: n8n** — Workflow-Automatisierung für komplexe Multi-Step Workflows (z.B. Job gefunden → CV anpassen → Bewerbung senden)
- (zukünftig: Modul: Zapier, Modul: Make)

### 1.3 Webhook Connector
- **Eingehend:** Externe Systeme können Jobs/Events an JobSync pushen
- **Ausgehend:** JobSync sendet Events (neuer Job, Statusänderung) an externe Systeme
- Konfigurierbare Endpoints als Module pro externem System
- **Beispiel-Usecases für Doku:**
  - Home Assistant: Lampe blinken / Sound abspielen bei neuem Jobangebot oder erfolgreicher Bewerbung (outgoing Webhook → HA Automation)
  - Slack/Discord: Notification in Channel bei neuen Jobs
  - IFTTT/Zapier: Trigger für beliebige Aktionen

### 1.4 ~~Connector → JOB_SOURCES Sync~~ → verschoben nach 0.4
- Überführt in den Module Lifecycle Manager (→ 0.4) als Lifecycle-Seiteneffekt: Bei Modul-Aktivierung wird der entsprechende `JobSource`-Eintrag automatisch via `findOrCreate` angelegt.

### 1.5 Job-Alerts (→ Notification-Rule in 0.6)
- Wird als Notification-Rule im Unified Notification System (→ 0.6) implementiert, nicht als eigenständiges System
- Benachrichtigungen bei neuen Jobs, die den Suchkriterien entsprechen
- Push-Benachrichtigungen (Browser), E-Mail-Alerts, Webhook-Notifications
- Konfigurierbar pro Automation (Frequenz, Schwellenwert, Kanal)

### 1.6 Dokumentenworkflow Connector
- **Modul: Paperless-ngx**
  - Dokumente aus JobSync an Paperless-ngx senden/empfangen
  - Automatische Ablage von Bewerbungsunterlagen nach Paperless-ngx Tags/Correspondent-Schema
  - Bidirektionale Synchronisation

### 1.7 Kalender Connector
- **Modul: CalDAV** — Standardprotokoll für Kalender-Synchronisation
- **Modul: Google Kalender** — OAuth2-Authentifizierung, Events erstellen/lesen
- **Modul: Outlook** — Microsoft Graph API, Events + Erinnerungen

### 1.8 Bewertungsportal Module (→ Data Enrichment Connector 1.13)
Bewertungsdaten sind Unternehmens-Enrichment — überführt in den Data Enrichment Connector (1.13) als Review-Module.
Siehe 1.13 für die vollständige Modul-Liste und API-Recherche.

### 1.9 arbeitsagentur.de Account-Modul
Anbindung an den eigenen arbeitsagentur.de Account — unabhängig vom Jobsuche-Modul (1.1), aber mit Shared Kernel für Job-Import und Status-Propagation.

**Phase 1 — Machbarkeitsprüfung Authentifizierung (Prio):**
- Programmatische Anmeldung bei arbeitsagentur.de über JobSync
- **Anmeldemethoden:** Online-Ausweis (eID), PassKey, Benutzername+Passwort, ELSTER-Zertifikat
- **OIDC-Details:** Keycloak-basiert (Realm `OCP`, Client `profil-online`), PKCE-Flow (S256)
- **eID-Integration (Recherche nötig):**
  - AusweisApp: https://github.com/Governikus/AusweisApp/ / https://www.ausweisapp.bund.de/open-source
  - Open eCard: https://github.com/ecsec/open-ecard
  - Klären: Headless-Auth SDK? Token-Persistierung? PassKey als Ersatzmethode?
- **Ergebnis Phase 1:** PoC der Anmeldung mit mindestens einer Methode

**Phase 2 — Seiten-Discovery & API-Analyse:**
- Nach erfolgreicher Anmeldung: Seiten discovern, Netzwerkverkehr analysieren
- Prüfen ob (in)offizielle API-Anbindungen existieren
- **Bot-Detection:** Maßnahmen prüfen (Playwright-Flagging, Rate Limits, CAPTCHAs)
- **Falls keine offizielle API:** OpenAPI-Spezifikation in separatem Repository erstellen (wie `rorar/EURES-API-Documentation`), damit andere Entwickler profitieren
- Sitzungs-Management (Timeout nach 30 Min Inaktivität)

**Phase 3 — Account-Verwaltung:**
- **Nachrichten:** Empfangen und senden mit Anhang
- **Tracking:**
  - Termine (Arbeitsvermittler Video-Call / vor Ort) + Kalender Connector (→ 1.7)
  - Fristen (aus Dokumenten extrahieren)
  - Eingelegte Widersprüche
  - Bewerbungsvorschläge vom Arbeitsvermittler → Import in JobSync (Shared Kernel mit 1.1)
- **Status-Propagation:** Job-Status in JobSync (→ beworben) wird nach arbeitsagentur.de propagiert

**Phase 4 — Dokumentenverwaltung & Formulare:**
- Dokumente abrufen, verwalten, teilen/weiterleiten → Paperless-ngx (→ 1.6)
- **Formulare ausfüllen:**
  - PDF Formulare und Online Formulare
  - "Lokale Bewerbungsbemühungen" automatisch ausfüllen
  - Tag für "Bewerbung Online" / "Bewerbung Persönlich"
  - Übersetzungen der Formulare anbieten

**Weitere Länder:** Modulare Architektur für Arbeitsagenturen anderer EU-Länder (eigene Module pro Land)

### 1.10 Geo/Map Connector
Entfernungsberechnung und Kartenintegration als Connector mit austauschbaren Modules.

**DDD-Boundary Google Maps:** Google Maps ist ein externes System das von ZWEI Connectors genutzt wird. Geo/Map (1.10) nutzt Geocoding/Directions/Maps SDK ("Wo und wie?"), Data Enrichment (1.13) nutzt Places ("Was weiß ich über das Unternehmen?"). Beide teilen einen `google-maps-client` Utility (API-Key, HTTP-Client) als Infrastruktur.

- **Connector Interface (`GeoConnector`):**
  - `geocode(address)` → `{ lat, lon }` — Adresse in Koordinaten
  - `reverseGeocode(lat, lon)` → Adresse
  - `distance(from, to, mode)` → `{ km, duration, mode }` — Entfernung + Fahrzeit
  - `route(from, to, mode)` → Routengeometrie für Kartenanzeige
  - **Verkehrsmittel (`mode`):** `car` | `transit` | `bike` | `walk`

**Phase 1 — Geocoding + Entfernungsberechnung (Luftlinie):**
- **Modul: Nominatim/OSM** (kostenlos, self-hostable, DSGVO-konform) — empfohlen als Default
- **Modul: Google Geocoding** (API-Key, genauer bei Adressen) — optional
- Vorhandene Daten nutzen: Arbeitsagentur liefert `koordinaten` (lat/lon), EURES liefert `countryCode` + Stadt
- Entfernungsfilter (Luftlinie) als Quick Win

**Phase 2 — Routing (Auto, Fahrrad, Fußweg):**
- **Modul: OSRM** (kostenlos, self-hosted) — Auto, Fahrrad, Fußweg
- **Modul: Valhalla** (kostenlos, self-hosted) — multimodal
- **Modul: Google Directions** (API-Key)
- **Modul: Mapbox Directions** (API-Key)

**Phase 3 — ÖPNV (Achtung: Google Maps ist bei Fernstrecken in DE ungenau!):**
- **Modul: HAFAS/Deutsche Bahn** (npm: `hafas-client`) — **empfohlen für DACH**
  - DB, ÖBB, SBB + Nahverkehr (S-Bahn, U-Bahn, Bus, Tram)
- **Modul: OpenTripPlanner** (GTFS-basiert, multimodal)
- **Modul: Transitous/MOTIS** (europaweit)
- **Modul: Google Transit** (nur Fallback)

**Phase 4 — Kartenanzeige:**
- **Modul: OpenStreetMap** (kostenlos, Standard)
- **Modul: Google Maps JS SDK** (API-Key)
- **Modul: Mapbox GL** (API-Key, anpassbare Stile)
- Integration mit Kartenansicht (→ 2.5)

### 1.11 Architekturprinzip: App ↔ Connector ↔ Module (ACL)

Alle externen Integrationen folgen dem **Anti-Corruption Layer** Pattern:

```
App (Kernlogik) ↔ Connector (ACL) ↔ Module (Externes System)
```

- **Module:** Die externe API/Service (EURES, Arbeitsagentur, Paperless-ngx, CalDAV). Kann crashen, Timeouts haben, API-Änderungen durchlaufen.
- **Connector:** Übersetzt zwischen Module-Protokoll und App-Domäne. Implementiert Resilience (Circuit Breaker, Retry, Rate Limit). Wenn ein Module abstürzt, gibt der Connector einen sauberen Fehler zurück.
- **App:** Sieht nur `ConnectorResult<T>` — unabhängig davon ob das Module eine REST API, Browser-Instanz oder lokaler Service ist.

**Vorteile:** Fehler-Isolation, Module austauschbar, unabhängiges Testing, klare Verträge.

### 1.12 Communication Connector
- **Modul: E-Mail** — Bewerbungs-E-Mails senden/empfangen
  - **Anbindungsmöglichkeiten (User wählt in Settings):**
    - SMTP/IMAP direkt (eigener Mailserver, Gmail App Password, etc.)
    - Microsoft Graph API (Outlook/M365 — OAuth2)
    - Google Gmail API (OAuth2)
    - Transactional E-Mail Services: Resend, SendGrid, Mailgun, Amazon SES (API-Key)
  - **Dokumentation/Anleitung:** Schritt-für-Schritt Setup pro Anbindung — wie der E-Mailverkehr zum Mailserver kommt und umgekehrt zu JobSync
  - **Empfang (Inbox-Sync):** IMAP-Polling oder Webhook-basiert (je nach Provider) — empfangene E-Mails werden der CRM Timeline (→ 5.9) zugeordnet
  - **Senden:** Templates (→ 4.9), Anhänge, Application Locale Profile (→ Sektion 4 Cross-Cutting)
- **Modul: PBX** — Telefonie-Integration, Anruf-Tracking

### 1.13 Data Enrichment Connector
Anreicherung von Unternehmens-, Kontakt- und Bewerbungsdaten aus externen Quellen. Der Connector orchestriert Fallback-Chains pro Enrichment-Dimension.

**Logo-Module:**
- **Modul: Clearbit** — Logo via Domain (kostenlos, kein API-Key)
- **Modul: Google Favicon** — Fallback-Logo (`favicon?domain=...&sz=128`)
- **Modul: Brandfetch** — High-Res Logos (API-Key)

**Review-Module (ex 1.8 Bewertungsportal):**
- **Modul: Deep-Link** — Standardfunktion (immer aktiv), generiert Links zu Kununu/Glassdoor/Indeed-Profilseiten. Kein API-Key, kein Risiko.
- **Modul: RapidAPI/Glassdoor** — Scraping-basierte API (wie JSearch-Pattern), Reviews + Ratings + Gehalt ($25-150/Mo)
- **Modul: Scraper/Kununu** — Eigener Scraper als ACL-Fallback. Absicherung gegen Vendor Lock-In (API-Anbieter abgeschaltet/TOS geändert/Preiserhöhung). User wird über Risiken informiert (TOS, DSGVO, Fragilität) im Marketplace-UI (2.11).
- **Modul: Scraper/Glassdoor** — Eigener Scraper, gleiche Begründung
- **Modul: Coresignal** (optional, low priority) — Batch-Import von Review-Datasets ($49-800/Mo, 3-4 Monate Lag)
- Scraper-Module nutzen Cockatiel (Shared Kernel): Rate Limiting, Circuit Breaker, Retry mit Backoff, Bulkhead
- **API-Recherche (Stand 2026-03-28):** Kununu keine API, Glassdoor API eingestellt Nov 2024, Indeed keine Review-API

**Kununu-Module (erweitert — nicht nur Reviews):**
- **Modul: Kununu/Arbeitgeber** — Arbeitgeber finden, Firmenprofil abrufen
- **Modul: Kununu/Gehaltscheck** — Gehaltsvergleich nach Position, Branche, Region
- **Modul: Kununu/Jobs** — Jobsuche über Kununu (zusätzliche Quelle für Job Discovery)
- Reverse Engineering Ressourcen: https://github.com/orgs/kununu/repositories
- Community-Projekte zu reviewen: https://github.com/plimplom/kununu_scraper, https://github.com/KindImagination/Company-Lens, https://github.com/spvapech/KununuWebScraper
- Login-Credentials via `.env` konfigurierbar
- **Separates Repository:** OpenAPI-Spezifikation erstellen (wie `rorar/EURES-API-Documentation`)

**Handelsregister-Modul (DE):**
- **Modul: Handelsregister** — Unternehmensdaten aus dem deutschen Handelsregister
- Ressourcen: https://github.com/bundesAPI/deutschland#handelsregister → https://github.com/bundesAPI/handelsregister
- Firmenname → Handelsregisternummer, Rechtsform, Sitz, Geschäftsführung

**Entgeltatlas-Modul (DE):**
- **Modul: Entgeltatlas** — Gehaltsdaten der Bundesagentur für Arbeit
- API: https://entgeltatlas.api.bund.dev/ / http://entgeltatlas.api.bund.dev/openapi.yaml
- Community-Docs: https://github.com/nifl2000/Entgeltatlas-Analyse/blob/main/docs/api/ENTGELTATLAS_API_DOCS.md
- Gehaltsvergleich nach Beruf, Region, Geschlecht, Altersgruppe → Verdienst-Index (→ 4.8)

**Google Maps Places Modul:**
- **Modul: Google Maps Places** — Firmenname, Website, Branche, Bewertung, Fotos, Öffnungszeiten
- **DDD-Boundary:** Google Maps ist EIN externes System, aber die Domäne hat ZWEI Concerns. Jeder Connector nutzt nur seinen relevanten API-Subset:
  - Data Enrichment (1.13): **Places** (Was weiß ich über dieses Unternehmen?)
  - Geo/Map (1.10): **Geocoding, Directions, Maps SDK** (Wo ist es und wie komme ich hin?)
  - **Shared:** `google-maps-client` Utility (API-Key, HTTP-Client) — Infrastruktur, kein Modul
- **Out of Scope:** Autonomes Website-Crawling (Playwright + LLM für Karriereseiten-Discovery). Übersteigt den Projektscope → Dokumentation wie User dies per n8n/Workflow Connector (→ 1.2) lösen können.

**Kontakt-Extraktion (→ 5.7):**
- **Modul: NLP-Extraktor** — Extrahiert Ansprechpartner, Unternehmen, Kontaktdaten aus Jobbeschreibungen (Regex + optional LLM)

**Link-Parsing (→ 3.6):**
- **Modul: Meta/OpenGraph Parser** — URL → Titel, Firma, Logo, Beschreibung, strukturierte Daten

**Externe Datenanfragen:**
- Enrichment-Daten können auch via Webhook Connector (1.3) oder Workflow Connector (1.2/n8n) angefragt werden — User kann eigene Enrichment-Quellen anbinden

**(zukünftig):** Modul: Crunchbase, LinkedIn Company — Firmengröße, Branche, Social Links

**Konsumenten:** Unternehmensverwaltung (2.4), CRM (5), Job-Import via Automation, Inbox-Events (0.5), Verdienst-Index (4.8)

### 1.14 Weitere Job Discovery Module
Zusätzliche Module für den Job Discovery Connector — ein Modul pro Jobportal.

**DE:**
- **Modul: StepStone** — Jobsuche über StepStone.de
- **Modul: Indeed/DE** — Jobsuche über Indeed.de
- **Modul: Kununu/Jobs** — Jobsuche über Kununu (Shared Kernel mit Kununu-Enrichment in 1.13)

**EU Multi-Land:**
- **Modul: TotalJobs** 🇬🇧 — UK Jobportal
- **Modul: HelloWork** 🇫🇷 — Frankreich Jobportal
- **Modul: Werk.nl** 🇳🇱 — Niederlande Jobportal (öffentlicher Arbeitsvermittler)
- **Modul: Arbetsförmedlingen** 🇸🇪 — Schweden Jobportal (öffentlicher Arbeitsvermittler)

Alle Module implementieren `DataSourceConnector` (search + optional getDetails), nutzen Cockatiel (Shared Kernel) und registrieren sich via Module Manifest (→ 0.4).

### 1.15 mein-now / NEW PLAN Integration
- Anbindung an die NEW PLAN Plattform der Bundesagentur für Arbeit (Berufsorientierung, Weiterbildung)
- https://mein-now.de/new-plan
- API: https://github.com/bundesAPI/newplan-api
- **Entscheidung:** Modul im Data Enrichment Connector (→ 1.13) für Weiterbildungsempfehlungen als Enrichment-Dimension
- **Consumer:** Onboarding (→ 2.1 Karriereplanung), Selbstfindung (→ 2.14), Skillsets (→ 4.1)

### 1.16 Weitere Bundes-APIs (Discovery)
- Weitere nützliche APIs der Bundesregierung evaluieren und discovern:
  - https://bund.dev/apis/
  - https://andreasfischer1985.github.io/arbeitsagentur-apis/
- **Prozess:** Entdeckte APIs werden als Module unter bestehenden Connectors eingeordnet: 1.1/1.14 (Job Discovery), 1.13 (Data Enrichment), oder neue Connector-Kategorie falls kein bestehender passt

### 1.17 Briefversand Connector (low priority)
- **Modul: Briefversand** — Physische Briefbewerbungen, Amtswege die der Schriftform bedürfen
- Anbindung an Briefversand-APIs (z.B. Pingen, LetterXpress, Deutsche Post E-POST)
- Usecase: Briefbewerbung, Widersprüche, förmliche Korrespondenz

---

## 2. UX/UI

### 2.1 Onboarding-Assistent
Kontextsensitiver Einrichtungsassistent für neue Benutzer, der sich an deren Ziele und Situation anpasst. **Jederzeit überspringbar und wieder startbar.**

- **Willkommens-Flow (nach erstem Login):**
  - **"Überspringen"**-Button immer sichtbar — kein Zwang, alles sofort auszufüllen
  - Schritt 1: **Ziel erfragen** — "Was möchtest du erreichen?"
    - Aktive Jobsuche (→ betont Automations, Job-Matching, CV-Upload)
    - Passive Jobsuche / Marktbeobachtung (→ betont Alerts, Bookmarks)
    - Bewerbungsmanagement (→ betont CRM, Tracking, Follow-Ups)
    - Karriereplanung (→ betont Skills, ESCO-Taxonomie, Gehaltsvergleich)
  - Schritt 2: **Benutzer kennenlernen** — Funktionsrelevante Daten:
    - Bevorzugte Sprache (UI + API-Sprache, setzt Locale)
    - Vorname, Nachname (für Bewerbungsunterlagen, CRM)
    - Geburtsdatum (für CV-Generierung, Altersberechnung in Templates)
    - Standort / Heimatadresse (→ Geo-Referenzpunkt für Entfernungsfilter)
    - Unterschrift (Upload/Zeichnen) — für automatisierte Bewerbungsunterlagen
  - Schritt 3: **CV hochladen** (optional) — automatische Skill-Extraktion (→ ESCO/NACE)
  - Schritt 4: **Skills bearbeiten** — Extrahierte Skills prüfen, ergänzen, entfernen
    - Chip-basierte Bearbeitung (→ bestehendes TagInput/ChipList Pattern)
    - ESCO-Taxonomie-Suche für fehlende Skills
    - Priorisierung: Kern-Skills vs. Neben-Skills
    - Wird auch ohne CV-Upload angezeigt (manuelle Eingabe möglich)
  - Schritt 5: **Module aktivieren** — Welche Jobportale? (EURES, Arbeitsagentur, JSearch)
    - Modul-spezifische Einstellungen direkt im Flow (z.B. Umkreis, Land, Sprache)
  - Schritt 6: **Erste Automation erstellen** — Geführter Mini-Wizard basierend auf Zielen
- **Kontextsensitivität:**
  - Überspringt Schritte die der Benutzer schon erledigt hat (z.B. CV bereits vorhanden)
  - Passt Empfehlungen an Land/Sprache an (DE → Arbeitsagentur vorschlagen, EU → EURES)
  - Zeigt nur relevante Module (deaktivierte ausblenden)
  - LLM-gestützt: Kann Fragen des Benutzers zum Onboarding beantworten
- **Progressive Disclosure:**
  - Fortgeschrittene Features (CRM, Dokumentengenerator) werden nicht im Onboarding gezeigt
  - Stattdessen: kontextsensitive Tooltips/Hinweise beim ersten Besuch jeder Seite
  - "Wusstest du?" Karten auf dem Dashboard basierend auf Nutzungsverhalten
- **Jederzeit wieder startbar:**
  - Über Settings → "Onboarding wiederholen" (startet den kompletten Flow)
  - Einzelne Schritte über Hilfe-Menü erreichbar (z.B. nur Skills bearbeiten)
  - Dashboard-Hinweis wenn Profil unvollständig: "Dein Profil ist zu 60% eingerichtet"
- **Gamification (optional):**
  - Fortschrittsbalken auf dem Dashboard
  - Checkliste mit empfohlenen nächsten Schritten

### 2.2 Kununu & Glassdoor in Jobdetails (→ Data Enrichment Connector 1.13, Review-Module)
- **Vorbedingung:** Modul-Evaluation abgeschlossen (→ 1.13 Review-Module), verfügbare Module bestimmen den UI-Scope
- Unternehmensbewertungen und Gehaltsinformationen in den Jobdetails anzeigen
- Filter für Bewertungen und Gehaltsinformationen für fundierte Bewerbungsentscheidungen
- LLM-gestützte Analyse und Zusammenfassung von Bewertungen (Vor-/Nachteile eines Unternehmens)

### 2.3 Lokalisierung (Erweiterung)
- Sprachumschaltung (bereits implementiert: EN, DE, FR, ES)
- Sprachspezifische Anpassungen: Datumsformat, Adressformat, Kommata/Punkt
- EURES/ISCO/ESCO Suchanpassungen pro Sprache

### 2.4 Auto-Fetch Firmenlogos (→ Data Enrichment Connector 1.13)
- Nutzt den Data Enrichment Connector mit Logo-Modulen (Clearbit, Google Favicon, Brandfetch)
- **Integration:**
  - Admin → Companies: Logo wird automatisch beim Erstellen/Bearbeiten gefetcht
  - Job-Import via Connector: Arbeitgeber-Domain wird extrahiert, Logo automatisch zugeordnet
  - CRM: Firmenlogos in Kontakt- und Unternehmensansichten
- **UX:**
  - Fallback auf Initialen-Avatar wenn kein Logo gefunden
  - Manueller Upload als Override möglich (bestehendes `logoUrl`-Feld)
  - Logo-Cache um wiederholte Requests zu vermeiden

### 2.5 Kartenansicht & Entfernungsfilter
- **Standort-Konfiguration:** Benutzer wählt Heimatstandort oder beliebigen Referenzpunkt in Settings
- **Entfernungsberechnung:** Distanz von Referenzpunkt zu jeder Arbeitsstelle (Luftlinie + Fahrzeit)
- **Filter:** Jobs nach maximaler Entfernung filtern (Slider: 0-200km)
- **Kartenansicht:** Jobs auf interaktiver Karte anzeigen (→ Geo/Map Connector 1.10)
  - Cluster für viele Jobs in einer Region
  - Click auf Pin → Job-Details
  - Farbkodierung nach Match-Score oder Status
- **Integration:**
  - Job-Tinder (2.7): Entfernung als Swipe-Kriterium
  - Automation Wizard: Umkreissuche (Arbeitsagentur hat `umkreis` Parameter)
  - CRM: Karte mit allen Unternehmen/Kontakten

### 2.6 Input Fields Verbesserungen
- Passende Icons für alle Input-Felder
- Date Picker: Datumseingabe als Text mit Validierung nach Lokalisation
- Text Input: Enter-Taste fügt Objekte hinzu (Chip-Pattern)

### 2.7 Job-Tinder + Inbox UI
- **Inbox als eigenständige UI-Surface:** Dedizierte Seite für promoted Jobs (nach Vacancy Pipeline → 0.5). Nicht nur Job-Tinder-Modus, sondern auch Listen-/Tabellen-Ansicht.
- **Job-Tinder Modus:** Swipe/Icon Click/Pfeiltasten Navigation
- Aktionen: Kein Match (Archiv) / Match / Favorit / Mehr Details
- Kartenbasierte Darstellung der entdeckten Jobs
- **Application Pipeline Overview:** Dashboard-Widget für 20+ aktive Bewerbungen gleichzeitig — Task-Triage, Status-Übersicht, nächste Aktionen

### 2.8 Datei-Management
- **Upload:** CV, Anschreiben, Zertifikate etc.
- **Dateiexplorer:** Verwaltung von Bewerbungsunterlagen (organisieren, umbenennen, löschen)
- **Teilen:**
  - Bewerbungsunterlagen direkt per E-Mail oder Bewerbungsportale versenden
  - QR-Code für Kontaktdaten und Unterlagen (z.B. auf Job-Messen)

### 2.9 API Key Setup-Hilfe
- Für jedes Modul mit API-Key in `/dashboard/settings → API Keys`:
  - Info-Text/Link wie und wo der API-Key erstellt werden kann
  - Modul-spezifische Anleitungen (Schritt-für-Schritt oder Link zur Docs-Seite):
    - **RapidAPI (JSearch):** Link zu RapidAPI JSearch, Erklärung Free-Tier
    - **OpenAI:** Link zu platform.openai.com/api-keys
    - **DeepSeek:** Link zu platform.deepseek.com
    - **Ollama:** Hinweis dass kein Key benötigt, nur URL-Konfiguration
  - Inline-Hilfe als Tooltip oder ausklappbarer Bereich unter jedem Key-Feld

### 2.10 Unified Add Automation Workflow (Dependency: 0.4)
- Voraussetzung: Module Lifecycle Manager (→ 0.4) — Modul-Manifests liefern die Settings-Schemas für dynamische Felder
- Einheitlicher Wizard für alle Job Discovery Module (JSearch, EURES, Arbeitsagentur, zukünftige)
- Modul-spezifische Felder werden dynamisch basierend auf dem gewählten Modul geladen
- Gemeinsame Felder (Name, Resume, Threshold, Schedule) bleiben einheitlich
- Modul-spezifische Widgets (z.B. EURES: NUTS-Combobox, Arbeitsagentur: Umkreis-Slider)

### 2.11 Connector & Module Marketplace
Marketplace-artige Verwaltung von Connectors und Modules in `/dashboard/settings`:

- **Marketplace-Übersicht:**
  - Alle verfügbaren Connectors mit zugehörigen Modules als aufklappbare Karten
  - Status-Badge pro Module: aktiv (grün), inaktiv (grau), Fehler (rot)
  - Ein-Klick Aktivierung/Deaktivierung per Toggle
- **Aktivierungs-Logik (Dependency Chain):**
  - Module aktiviert → Connector wird automatisch mit aktiviert
  - Connector deaktiviert + Module noch aktiv → **Warnung** an User mit Optionen:
    - "Alle Module auch deaktivieren" / "Abbrechen"
  - Module ODER Connector deaktiviert + Automation nutzt es → **Automation automatisch pausieren** + User-Benachrichtigung (Toast + optional E-Mail/Push)
  - Pausierte Automations werden bei Reaktivierung NICHT automatisch gestartet — bewusste User-Aktion
- **Module-Einstellungen (pro Module konfigurierbar):**
  - API-Keys (falls benötigt, z.B. RapidAPI für JSearch)
  - Default-Parameter (z.B. Standard-Umkreis für Arbeitsagentur, Sprache für EURES)
  - Rate-Limit-Konfiguration
  - Proxy-Einstellungen
- **Health Check & Monitoring:**
  - Status-Anzeige ob das Module erreichbar ist (Ping/Test-Request)
  - Letzte erfolgreiche Verbindung mit Timestamp
  - Fehlerlog pro Module (letzte N Fehler mit Details)
  - Circuit Breaker Status (offen/geschlossen/halb-offen)
- **Sichtbarkeit:**
  - Deaktivierte Module erscheinen nicht im Automation Wizard Job-Board-Selector
  - Onboarding-Assistent zeigt nur aktive Connectors/Module
- **DDD-Einordnung:** Sowohl die UI-Manifestation des Module Lifecycle Managers (→ 0.4) als auch ein eigenständiges Feature. Der Marketplace ist die **Surface** (im Allium-Sinne) über dem Lifecycle-Aggregate — er exponiert Activation/Deactivation/Configuration und konsumiert Health/CB-Status.

### 2.12 UI Tour / Guided Intro
Geführte Einführung über die UI-Elemente der App, kombinierbar mit dem Onboarding-Assistenten (→ 2.1).

- **Bibliothek:** `driver.js` (MIT, ~5 KB, zero Dependencies, React 19 safe, Tailwind/Shadcn-kompatibel, kein Phoning Home)
- **Integration:**
  - Thin `"use client"` Wrapper-Component (`src/components/ui/tour-guide.tsx`)
  - Tour-Steps mit i18n-Keys → `useTranslations()` für lokalisierte Texte (4 Locales)
  - Button-Labels (`nextBtnText`, `prevBtnText`, `doneBtnText`) lokalisiert
  - Theming via `popoverClass` + Shadcn Design Tokens
- **Tour-Completion:** Persistiert in `localStorage` oder `UserSettings` (Tour nicht erneut anzeigen)
- **Kombinierbarkeit mit Onboarding (2.1):**
  - Onboarding-Wizard = Multi-Step Setup Flow (Shadcn Dialog + Steps + State)
  - UI Tour = Element-Highlighting nach dem Onboarding ("Hier findest du X")
  - Kann sequentiell (erst Wizard, dann Tour) oder on-demand (Hilfe-Menü → "Tour starten")

### 2.13 Projekt Setup / Deployment UX
- **Ziel:** Jedermann kann JobSync aufsetzen — keine DevOps-Kenntnisse nötig
- One-Click-Setup für Docker, NixOS, lokale Installation
- Setup-Wizard: Datenbank-Konfiguration, Admin-Account, erste Einstellungen
- Dokumentation mit Schritt-für-Schritt-Anleitungen pro Plattform

### 2.14 Selbstfindung & Persona-Definition
- Workflow zur authentischen Selbstpräsentation ("Persona Me")
- Geführter Prozess: Hook, Claim, IBR (Identität-Beruf-Relevanz) — iterativ bis User sagt "Ja, das klingt nach mir!"
- **Lean Business Canvas für Self-Discovery:** Übertragung des Canvas-Modells auf persönliche Positionierung
- Output: Persönliches Profil-Statement für Bewerbungsunterlagen, Landingpage (→ 4.7), LinkedIn/XING (→ 9.2 Machbarkeit pending)

### 2.15 Company Blacklist
- User kann Unternehmen auf eine Blacklist setzen
- **Usecases:** Alter Arbeitgeber, ethisch/persönlich unpassende Unternehmen, bekannte Fake-Inserate
- Blacklisted Companies werden automatisch aus Staging gefiltert (→ 0.5 StagedVacancy → dismissed)
- Konfigurierbar: per Firmenname, Domain, oder Handelsregisternummer
- Blacklist-Grund optional dokumentierbar (nur für User sichtbar)

### 2.16 Keyboard Shortcuts
- Pure UI-Infrastruktur, keine Domain-Relevanz. Kein Allium-Spec nötig.
- **Navigation:** J/K (prev/next, vim-style), Pfeiltasten in Job-Tinder (→ 2.7)
- **Aktionen:** D (dismiss), P (promote), S (super-like), Ctrl+Z (undo)
- **Global:** ? (Shortcut-Hilfe anzeigen, GitHub/Gmail-Konvention), / (Suche öffnen)
- Single-Letter Shortcuts nur aktiv wenn Fokus auf der passenden Surface (nicht in Textfeldern)
- Shortcut-Hints als Tooltips auf Action-Buttons
- v1: Hardcoded Defaults, nicht konfigurierbar (Aufwand für Konfiguration zu hoch für wenige User)
- Accessibility: Keine Konflikte mit Screen-Reader-Navigation (Tab, Shift+Tab, F6, Alt+F4)

### 2.17 Browser Extension (Quick-Add)
- Ein-Klick "Job speichern" von jeder Website (LinkedIn, StepStone, Indeed, etc.) → landet in Staging Queue (→ 0.5)
- **Funktionen:**
  - Erkennt Jobseiten automatisch (URL-Pattern-Matching für bekannte Portale)
  - Extrahiert Titel, Firma, Standort, URL via Meta/OpenGraph + DOM-Parsing (→ Data Enrichment 1.13 Link-Parsing)
  - Fallback: User markiert Text auf der Seite → wird als Beschreibung übernommen
  - Optional: Direkt in Inbox statt Staging (User-Preference)
- **Technisch:**
  - Chrome Extension (Manifest V3) + Firefox Add-on
  - Kommuniziert mit JobSync-Instanz via Public API (→ 7.1) + API Key
  - Self-Hosted: User konfiguriert seine Server-URL in der Extension
- **Abgrenzung zu Link-Parsing (3.6):** Extension ist der Capture-Punkt (auf der fremden Website), Link-Parsing ist die Verarbeitung (in JobSync)

### 2.18 Analytics / Bewerbungsstatistiken
- Dashboard mit Insights zur Jobsuche-Effektivität
- **Metriken:**
  - Erfolgsquote pro Quelle/Modul (welches Modul liefert die besten Matches?)
  - Durchschnittliche Antwortzeit nach Bewerbung
  - Bewerbungsfunnel: Staging → Inbox → Applied → Interview → Offer (Conversion Rates)
  - Gehaltstrendentwicklung der beworbenen Stellen
  - Aktivitäts-Heatmap (wann wird am meisten beworben?)
  - Top-Skills in abgelehnten vs. erfolgreichen Bewerbungen
- **Datenquellen:** Job Aggregate, StagedVacancy, AutomationRun, Activity, CRM
- **Visualisierung:** Charts in Dashboard-Widget, detaillierte Statistik-Seite

---

## 3. Quality of Life

### 3.1 Job-Gruppierung
- Jobs mit gleichem Titel und Anbieter (z.B. "Krankenpfleger in Berlin/München/Bern") werden in einem Eltern-Element zusammengefasst
- Einzelne Bewerbungen pro Stadt möglich
- Cross-Ref: Dedup in Staging (→ 0.5) beeinflusst Gruppierungslogik

### 3.2 Duplikat-Erkennung
- Duplikate von verschiedenen Quellen finden und zusammenführen/löschen
- Cross-Ref: StagedVacancy-Dedup via Hash (→ 0.5) verhindert Duplikate bereits vor der Inbox
- **Cross-Board Fuzzy Matching:** Dedup-Hash fängt nur Duplikate innerhalb eines Moduls ab (gleiche `sourceBoard:externalId`). Derselbe Job auf EURES und Arbeitsagentur hat verschiedene IDs → braucht zweite Dedup-Schicht mit Fuzzy Matching (Titel + Firma + Standort Ähnlichkeit)

### 3.3 WYSIWYG Editor Erweiterung (Tiptap)
Aktuell: Tiptap v2 mit StarterKit (Bold, Italic, Heading, Listen). Erweiterung in drei Phasen:

**Phase 1 — Quick Wins:**
- `tiptap-markdown`: Markdown-Import/Export, Markdown-Paste wird automatisch als Rich Text gerendert
- `@tiptap/extension-typography`: Typographische Sonderzeichen automatisch korrigieren (Anführungszeichen, Gedankenstriche, Ellipsen)
- `@tiptap/extension-link`: URLs in Notizen/Beschreibungen klickbar machen, Auto-Link-Erkennung
- `@tiptap/extension-placeholder`: Kontextsensitive Placeholder-Texte im leeren Editor

**Phase 2 — PDF Copy & Paste + Toolbar:**
- Custom Paste-Transformer: ProseMirror `transformPastedHTML`/`transformPastedText` Hook
  - `• `-Bullets → `<li>` konvertieren
  - Zeilenumbrüche und Sonderzeichen aus PDFs normalisieren
  - Anführungszeichen-Konvertierung (bestehender Punkt)
- `@tiptap/extension-underline`: Standard-Formatierung
- `@tiptap/extension-highlight`: Skills/Keywords in Jobbeschreibungen hervorheben
- `@tiptap/extension-character-count`: Zeichenlimit für Anschreiben
- Toolbar erweitern: Link, Underline, Highlight Buttons

**Phase 3 — Erweiterte Features:**
- `@tiptap/extension-task-list` + `task-item`: Checkboxen in Notizen (passt zum Task-Feature)
- `@tiptap/extension-table`: Strukturierte Daten in Jobbeschreibungen
- Markdown-Toggle: Umschalten zwischen Rich Text und Markdown Source View
- Slash Commands: `/`-Menü für schnelles Einfügen von Formatierungen und Blöcken

### 3.4 Input Fields (Lokalisiert)
- Location: Geocoding-basiertes Autocomplete via Geo/Map Connector (→ 1.10 Phase 1, Nominatim/OSM) statt statischer Städte-Liste
- Degree: Liste von Abschlüssen (lokalisiert)

### 3.5 CV-PDF Parsing
- Extrahiert Informationen aus hochgeladenem CV
- Erstellt basierend auf ESCO- und NACE-Codes eine Liste von Skills und Tags
- Vorschläge für Skills die in Bewerbungsunterlagen hervorgehoben werden sollten
- **Unterstützte Formate:** PDF UND DOCX (in DE häufig von Arbeitsagentur verlangt)
- **LinkedIn-Profil-Import:** LinkedIn-Profildaten importieren als CV-Quelle (Export-Datei oder Scraping)
- **LLM-Entkopplung (→ 0.5 Prinzip):**
  - **Ohne LLM:** Bibliotheks-basiertes Parsing (z.B. pdf-parse, pdf2json, pdfjs-dist, mammoth für DOCX) — Textextraktion + Regex/Heuristik für Sektionen (Erfahrung, Ausbildung, Skills)
  - **Mit LLM (optional):** AI-gestützte Extraktion für bessere Sektions-Erkennung, Skill-Mapping zu ESCO/NACE, semantische Analyse
  - User wählt in Settings ob LLM-Verarbeitung aktiviert ist

### 3.6 Link-Parsing und Auto-Fill (→ Data Enrichment Connector 1.13)
- Nutzt das Meta/OpenGraph Parser Modul des Data Enrichment Connectors
- Wenn ein Link (z.B. Job-URL, Company-URL) in ein Formularfeld eingefügt wird:
  - **Auf Benutzeraktion** (Button "Link auflösen") ODER **automatisch** (konfigurierbar in Settings)
  - Link wird geparst (Meta-Tags, OpenGraph, strukturierte Daten)
  - Alle weiteren Felder im Formular werden automatisch befüllt (Titel, Company, Location, Description, Logo etc.)
  - Wird der Link entfernt → alle auto-gefüllten Felder werden zurückgesetzt
- Anwendbar auf: Add Job Modal (Job-URL → Titel, Company, Location), Add Company (URL → Name, Logo), Automation Wizard, StagedVacancy Quick-Add
- **Job-Board-spezifische Parser:** OpenGraph-Metadaten von Jobportalen sind oft unvollständig. Für häufige Portale (Indeed, LinkedIn, StepStone, Arbeitsagentur) braucht es spezifische Parser-Module im Data Enrichment Connector.
- Konfiguration in Settings: Auto-Parse an/aus, Standard-Verhalten (manuell vs. automatisch)

### 3.7 Suchzeitraum-Konfiguration
- Option wie viele Tage zurück Jobinserate gesucht werden sollen (pro Automation konfigurierbar)
- Default: 7 Tage (bestehender Wert), konfigurierbar: 1–90 Tage
- Beeinflusst den `publicationPeriod`/`veroeffentlichtseit` Parameter der Job Discovery Module

### 3.8 Job-Aktualitäts-Check (Maintenance Automation)
Eigener Automationstyp der über alle getrackten Jobs läuft — kein Job-Discovery-Run, sondern Bestandspflege.

**Zwei Prüf-Schichten:**
1. **Generischer URL-Check (modul-unabhängig):** HTTP HEAD auf `job.jobUrl` → 200 = verfügbar, 404/410/301 = abgelaufen. Quick Win, aber unzuverlässig (manche Portale zeigen "nicht mehr verfügbar" bei 200).
2. **Modul-spezifischer Availability-Check:** Nutzt `isAvailable?(externalId)` auf dem DataSourceConnector-Interface (→ 0.4 Interface-Erweiterung). Modul prüft über seine eigene API ob der Job noch existiert. Zuverlässiger, da modul-semantisch. Fallback auf Schicht 1 wenn Modul `isAvailable` nicht implementiert.

**Manifest-Deklaration:** `capabilities: { availabilityCheck: true }` — Module deklarieren ob sie den Check unterstützen.

| Job Discovery Automation | Maintenance Automation (3.8) |
|---|---|
| Sucht neue Jobs | Prüft bestehende Jobs |
| Läuft pro Modul | Läuft über alle Jobs (modul-übergreifend) |
| User konfiguriert Suchkriterien | System-konfiguriert (Frequenz, Batch-Größe) |
| Output: StagedVacancy | Output: Status-Update auf Job |

- **Manuell:** User kann "Noch aktuell?" pro Job triggern
- **Bei abgelaufenem Inserat:**
  - Option: E-Mail/Kontakt an Ansprechpartner ob Stelle noch besetzt wird (→ Communication Connector 1.12)
  - CRM-Status-Update: "Inserat abgelaufen" (→ 5.3 Job Status Workflow)
  - Domain Event: `JobExpired` → Routing via Event Bus (→ 0.6) an CRM, Notifications
- Konfigurierbar: Check-Frequenz, Batch-Größe, automatische Aktion bei Ablauf

### 3.9 LLM-gestützter Vertrags- und Angebotscheck
- Arbeitsverträge und Angebote durch LLM analysieren lassen
- Prüfpunkte: Gehalt vs. Markt (→ Entgeltatlas 1.13), Kündigungsfristen, Wettbewerbsklauseln, Probezeit, ungewöhnliche Klauseln
- **Weiterleitungsfunktion:** Vertrag per E-Mail/Kommunikationsweg an Gewerkschaft, Anwalt, Beratungsstelle weiterleiten (→ Communication Connector 1.12)
- LLM-Entkopplung: Ohne LLM nur Checkliste/Hinweise, mit LLM semantische Analyse

### 3.10 Offline-CRUD (später, abhängig von 0.8)
- Offline-fähige Schreiboperationen für die PWA (→ 0.8 Phase 2)
- Lokale Action-Queue, Optimistic Locking (Version-Field), Conflict Resolution bei Sync
- Nur bei konkretem User-Demand implementieren

---

## 4. Bewerbungsunterlagen

**Cross-Cutting: Application Locale Profile**
Jeder Job hat ein **Application Locale Profile** das Sprache + Land + kulturelle Konventionen + Gender-Handling bündelt. Bestimmt: Document-Templates, E-Mail-Templates, Briefformat, Datumsformat, Anrede, Adressformat, Dateinamen.

**Datenquellen (kein eigenes Repo nötig — Teil von JobSync's i18n):**

| Concern | Quelle | Status |
|---|---|---|
| Adressformat | `@fragaria/address-formatter` (251 Länder, OpenCage Data) | Production-ready, npm |
| Personenname-Format | `cldr-person-names-full` (Formalität, Länge, Reihenfolge) | Tech Preview, npm |
| Datum/Zahl/Währung | Built-in `Intl` API + `date-fns` (bereits installiert) | Vorhanden |
| Anrede/Grußformel | **Eigener Datensatz** (`src/data/locale-profiles/`) | Muss gebaut werden |
| Briefstruktur (DIN 5008, NF Z) | **Eigener Datensatz** | Muss gebaut werden |
| Gender-Handling pro Locale | **Eigener Datensatz** | Muss gebaut werden |

**Eigener Correspondence-Locale-Datensatz** (`src/data/locale-profiles/{locale}.json`):
- Pro Locale eine JSON-Datei mit Anrede, Grußformel, Briefstandard, Formalität, Gender-Optionen
- **Defaults mitgeliefert** für DE, EN, FR, ES — User kann alle Felder anpassen und eigene hinzufügen
- **User-Customization:** Anpassung in Settings-UI. Überschreibt Defaults per User-Preference (gespeichert in UserSettings). User kann eigene Locale-Profile anlegen (z.B. für CH-DE, AT-DE, BE-FR).
- Kein separates Repository — bei Bedarf später extrahierbar

- **Mehrsprachige Bewerbungen:** Ein Job kann **eine oder mehrere Sprachen** erfordern (z.B. "DE Anschreiben + EN CV"). User wählt pro Dokument die Sprache.
- **Auto-Detection:** Aus der Sprache des Stellenangebots ableiten (EURES liefert `language`, Arbeitsagentur → DE, StepStone → DE, HelloWork → FR, etc.)
- **User-Override:** Pro Job und pro Dokument konfigurierbar
- **Fallback:** User-Locale wenn keine Sprache erkennbar
- **Dateinamen lokalisiert:** `<Datum> <Lang-Code> <Dok-Titel>` (z.B. `2026-03-28 DE Anschreiben`, `2026-03-28 EN Cover Letter`). Bezeichnungen vom User anpassbar.
- **Gender-Handling Anrede:**
  - Wenn CRM-Kontaktperson vorhanden (→ 5.7): Geschlecht aus Kontakt → "Sehr geehrte Frau Müller" / "Sehr geehrter Herr Müller"
  - Wenn kein Geschlecht bekannt: Gender-neutrale Default-Variante (DE: "Guten Tag, [Name]" / "Sehr geehrte Damen und Herren", EN: "Dear [Name]", FR: "Madame, Monsieur")
- **Adressformat:** `@fragaria/address-formatter` als Single Source of Truth (251 Länder, OpenCage-Daten)
- **Kulturelle Konventionen:** Foto auf CV (DE/FR: ja, UK: nein), Formalitätslevel, Briefformat-Standard pro Land — als UX/UI Settings pro Locale Profile konfigurierbar, separater Kontext von Textinhalten
- **Dokumentbezeichnungen:** Lokalisiert (DE: "Lebenslauf", EN: "CV", FR: "CV") — vom User anpassbar
- **Konsumenten:** Dokumenten-Generatoren (4.2), Automatisches Datum (4.5), E-Mail-Templates (4.9), Format-Lokalisierung, Output-Struktur (4.3)

### 4.1 Skillsets
- Verwaltung von Skill-Profilen basierend auf ESCO/NACE Taxonomien
- **Konsumenten:** CV-PDF Parsing (→ 3.5) liefert Skills, Onboarding (→ 2.1 Schritt 4) bearbeitet Skills, CareerBERT (→ 9.1) matcht Skills semantisch, Dokumenten-Generatoren (→ 4.2) nutzen Skills für CV-Templates
- Kern-Skills vs. Neben-Skills Priorisierung

### 4.2 Dokumenten-Generatoren
- Consumer des `DocumentsAvailable` Domain Events bei Vacancy-Promotion (→ 0.5 Inbox)
- LLM-gestützte Erstellung basierend auf CV + Jobanforderungen
- Templates für verschiedene Länder und Branchen
- Output in mehreren Sprachen
- **Output-Formate:** PDF UND DOCX (in DE häufig gefordert) UND HTML (für E-Mail-Bewerbungen)
- **Format-Lokalisierung:** Deutsche Anschreiben folgen DIN 5008 (Briefnorm). Französische und spanische Bewerbungen haben eigene Formatkonventionen — nicht nur Inhalt, sondern auch Layout wird lokalisiert.
- **Template-Management:** UI zum Erstellen, Bearbeiten, Versionieren und Teilen von Templates
- **Dokumenttypen:**
  - Titelblatt
  - CV / Lebenslauf
  - Anschreiben
  - Motivationsschreiben
  - Exposé
  - Anhänge (Zertifikate)

### 4.3 Output-Struktur (Paperless-ngx Style)
Dynamische Dateipfade und Dateinamen:
- **Ordner:** `<Unternehmen>/<LANG>/<Jobtitel>/`
- **Dateiname:** `<Datum> <Bewerbername> - <Jobtitel>` oder `<Datum> <Bewerbername> - <Unternehmen> - <Jobtitel>`

### 4.4 Unterschrift
- Upload einer bestehenden Unterschrift (Bild/SVG)
- Zeicheneingabe direkt in der App (Canvas/Touch)
- Automatische Platzierung in Bewerbungsunterlagen (Anschreiben, CV)
- Automatisierte Unterschriftenerstellung (Name → Schrift-Rendering)

### 4.5 Automatisches Datum
- Aktuelles Datum wird automatisch in Bewerbungsunterlagen eingefügt
- Lokalisiertes Format je nach Zielland (z.B. "23. März 2026" für DE, "March 23, 2026" für EN)

### 4.6 Video-Vorstellung
- Bewerber können ein kurzes Vorstellungsvideo aufnehmen oder hochladen
- Einbettbar in Bewerbungsunterlagen als QR-Code/Link
- Optional: KI-gestützte Transkription und Zusammenfassung

### 4.7 Landingpage für Unternehmen
- Personalisierte Bewerber-Landingpage pro Bewerbung
- Enthält: Video-Vorstellung, CV, Portfolio, Skills, Kontaktdaten
- Teilbar per Link oder QR-Code
- Tracking: Aufrufe, Verweildauer (optional, erfordert Public API → 7.1)
- **DSGVO:** Öffentliche Seite mit personenbezogenen Daten → Datenschutzhinweis erforderlich, Passwortschutz/Expiring Links (→ 6.1)

### 4.8 Städte: Verdienst-Index
- Gehaltsvergleich nach Stadt/Region
- **Datenquellen:** Data Enrichment Connector (→ 1.13) — Modul: Glassdoor/Kununu Gehaltsdaten, Modul: Entgeltatlas (bereits in 1.13), Modul: Destatis (zu erstellen in 1.13 oder via Entgeltatlas-Modul falls Daten darüber verfügbar)

### 4.9 E-Mail-Bewerbungs-Templates & Versand
- Vorkonfigurierte E-Mail-Templates für Bewerbungen, Follow-Ups, Absagen, Danksagungen
- **Template-Variablen:** `{Firma}`, `{Ansprechpartner}`, `{Jobtitel}`, `{Datum}`, `{Bewerber}` — automatisch aus Job/CRM-Daten befüllt
- **Anhänge:** Generierte Dokumente (4.2) automatisch anhängen (CV, Anschreiben)
- **Versand:** Über Communication Connector (→ 1.12) Modul: E-Mail (SMTP/IMAP)
- **Tracking:** Gesendete Bewerbungs-E-Mails in CRM Timeline (→ 5.9) protokollieren
- **Lokalisierung:** Sprache wird automatisch aus `applicationLanguage` des Jobs gewählt (→ Sektion 4 Cross-Cutting). User kann Sprache pro E-Mail überschreiben.
  - **Anrede:** Sprachabhängig (DE: "Sehr geehrte/r Frau/Herr {Ansprechpartner}", EN: "Dear {Ansprechpartner}", FR: "Madame, Monsieur,")
  - **Formalität:** DE formell, EN semi-formell, FR très formell — pro Template konfigurierbar
  - **Footer/Signatur:** Sprachabhängige Grußformel + Kontaktdaten (DE: "Mit freundlichen Grüßen", EN: "Kind regards", FR: "Veuillez agréer...") + optionale Unterschrift (→ 4.4)

---

## 5. CRM

### 5.1 Kommunikation (→ Communication Connector 1.12)
- Nutzt den Communication Connector mit Modulen E-Mail und PBX
- CRM-spezifische Features: Kontakt-Zuordnung, Gesprächsnotizen, Follow-Up-Tracking

### 5.2 Kalender (→ Kalender Connector 1.7)
- Nutzt den Kalender Connector mit Modulen CalDAV, Google Kalender, Outlook
- Interviews, Follow-Ups automatisch eintragen

### 5.3 Job Status Workflow
- Bewerbung → Interview → Angebot → Abgelehnt etc.
- Notizen pro Status-Übergang
- **Abgrenzung zu Vacancy Pipeline (→ 0.5):** Pipeline endet bei Promotion (StagedVacancy → Job). Der Job Status Workflow beginnt dort — er ist der **Tracking-Lifecycle** nach der Inbox. CRM erweitert diesen Workflow um Kontakt-Zuordnung, Follow-Up-Automatisierung und Kalender-Events.

### 5.4 Automatisierung & Reminders (→ Notification-Rules in 0.6)
- CRM-Reminders werden als Notification-Rules im Unified Notification System (→ 0.6) implementiert
- Automatisierte Follow-Ups (Erinnerungen, Nachfass-E-Mails)
- Automatisierte Terminvereinbarungen
- **Reminder/Notification-System:** Allgemeine Erinnerungen für Deadlines, Interview-Termine, Nachfass-Fristen
  - In-App Notifications (Bell-Icon, Dashboard-Widget)
  - Optional: Push (Browser), E-Mail (→ Communication Connector 1.12)
  - Cross-Ref: Job-Alerts (→ 1.5) für Job-Discovery-Notifications

### 5.5 Dateiexplorer-Integration
- CRM ist direkt mit dem Dateiexplorer (Sektion 2.8) verbunden
- Bewerbungsunterlagen, E-Mails, Notizen und Anhänge pro Kontakt/Job sichtbar
- Drag & Drop von Dateien in CRM-Einträge
- Automatische Zuordnung von generierten Dokumenten (CV, Anschreiben) zum jeweiligen Job/Kontakt
- Cross-Ref: Dokumentenworkflow Connector (→ 1.6) für Paperless-ngx Synchronisation

### 5.6 Backlog (Visualisierung)
- Kanban-Board als **UI-View** über den Job Status Workflow (→ 5.3) — keine eigene Entität
- Visualisiert: Wer, wann, was, wo, wie, über welchen Kanal
- Spalten: Backlog → In Bearbeitung → Gesendet → Follow-Up → Abgeschlossen
- Priorisierung und Sortierung nach Deadline, Match-Score, Unternehmensbewertung
- Verknüpfung mit Kalender (Deadlines) und Automatisierung (Follow-Ups)

### 5.7 Kontakt- & Unternehmens-Extraktion (→ Data Enrichment Connector 1.13)
- Nutzt das NLP-Extraktor Modul des Data Enrichment Connectors
- Automatische Extraktion von Unternehmen, Kontaktpersonen und Ansprechpartnern aus:
  - Jobbeschreibungen (NLP/Regex: "Ansprechpartner: ...", "Kontakt: ...")
  - E-Mails (Signaturen parsen)
  - Websites (Impressum, Team-Seiten)
- Automatische Zuordnung zum CRM-Datensatz (Job → Unternehmen → Kontakt)
- Dublettenprüfung: gleicher Kontakt bei verschiedenen Jobs erkennen
- Anreicherung: LinkedIn-Profil, XING, Unternehmenswebsite verknüpfen

### 5.8 Import/Export
- **Import:** Kontakte aus LinkedIn, XING, vCard, CSV importieren — kritisch für CRM-Bootstrapping
- **Export:** Jobs, Kontakte, Bewerbungsdaten als CSV/JSON für Reporting und Backup
- Cross-Ref: DSGVO Datenportabilität Art. 20 (→ 6.1)

### 5.9 Timeline / Activity Log
- Chronologische Timeline pro Kontakt und Unternehmen
- Zeigt alle Interaktionen: E-Mails, Anrufe, Interviews, Notizen, Statusänderungen, Dokumente
- Automatisch befüllt aus CRM-Aktionen und Domain Events
- Filterbar nach Typ, Datum, Kanal

---

## 6. Datenschutz & Compliance

### 6.1 DSGVO-Konformität
- **Datenminimierung:** Nur für die Bewerbung notwendige Daten erfassen
- **Einwilligungsmanagement:** Nutzer stimmen der Datenverarbeitung explizit zu
- **Löschkonzept:**
  - Automatische Löschung abgelaufener Bewerbungsdaten nach konfigurierbarer Frist
  - "Recht auf Vergessenwerden": Vollständige Datenlöschung auf Anfrage (Account + alle verknüpften Daten)
  - Löschprotokoll für Nachweisbarkeit
- **Datenexport:** Vollständiger Export aller Nutzerdaten in maschinenlesbarem Format (JSON/CSV) — Art. 20 DSGVO Datenportabilität
- **Verschlüsselung:**
  - API-Keys bereits verschlüsselt gespeichert (AES)
  - Personenbezogene Daten (Name, E-Mail, Kontakte) verschlüsselt at-rest
  - TLS für alle externen API-Aufrufe
- **Audit-Log:** Protokollierung von Datenzugriffen und -änderungen
- **Impressum:** Konfigurierbare Impressum-Seite (Pflicht in DE/AT/CH)
  - Betreiber-Angaben, Kontaktdaten, Verantwortlicher i.S.d. § 55 RStV
  - Für Self-Hosted: Nutzer pflegt eigene Angaben in den Settings
- **Datenschutzerklärung:**
  - Vollständige Datenschutzerklärung als eigene Seite (Art. 13/14 DSGVO)
  - Auflistung aller verarbeiteten Daten, Zweck, Rechtsgrundlage, Speicherdauer
  - Auflistung aller Drittanbieter (EURES, ESCO, Eurostat, LLM-Module, Kununu, etc.)
  - Lokalisiert in allen unterstützten Sprachen
- **Cookie-Banner:**
  - Consent-Management für Cookies und lokale Speicherung
  - Unterscheidung: technisch notwendig (Session, NEXT_LOCALE) vs. optional (Analytics)
  - Opt-In für nicht-essentielle Cookies (DSGVO Art. 7)
  - Einstellungen jederzeit widerrufbar
- **Passwortschutz für Bewerbungsunterlagen (externer Zugriff):**
  - Geteilte Dokumente und Landingpages per Passwort schützen
  - Zeitlich begrenzte Zugangslinks (expiring share links)
  - Zugriffs-Log: wer hat wann auf welches Dokument zugegriffen
  - Optional: Wasserzeichen mit Empfängername in geteilten PDFs
- **Self-Hosted First:** Alle Daten bleiben auf dem eigenen Server — keine Cloud-Abhängigkeit für Kerndaten
- **LLM-Datenschutz:** Konfigurierbar, ob Daten an externe LLM-APIs gesendet werden dürfen (Opt-In pro Modul)
- **Vacancy Pipeline DSGVO (→ 0.5):**
  - StagedVacancy Dedup-Hashing: Nach Retention-Frist werden Daten gelöscht, nur One-Way Hash bleibt (Privacy by Design, Art. 25)
  - Dismissed StagedVacancies: Retention-Frist konfigurierbar, Hash-Only nach Ablauf (Datenminimierung, Art. 5(1)(c))
  - Inbox Domain Events können personenbezogene Daten enthalten → Notification-Retention beachten
- **Datenschutzerklärung automatisch aktuell halten:**
  - Aktivierte Module bestimmen, welche Drittanbieter in der Datenschutzerklärung gelistet werden
  - Bei Modul-Aktivierung/Deaktivierung (→ 0.4 Lifecycle): Datenschutzerklärung automatisch aktualisieren
  - Module deklarieren im Manifest: `privacy: { dataProcessor: "OpenAI", dataCategories: ["job descriptions"], legalBasis: "consent" }`
  - Template-basierte Generierung der Datenschutzerklärung aus aktivierten Modulen
- **Data Retention Framework (generell):**
  - Konfigurierbare Aufbewahrungsfristen **pro Entity-Typ** (nicht nur StagedVacancy)
  - Betrifft: StagedVacancies (0.5), Trash-Jobs, alte AutomationRuns, alte Activities, alte Notes, Notifications, Audit-Logs
  - Settings-UI: Retention-Konfiguration pro Kategorie (z.B. "AutomationRuns älter als 90 Tage löschen")
  - Automatischer Cleanup-Job in Administrative Queue (→ 8.4)
  - DSGVO Art. 5(1)(e): Speicherbegrenzung — Daten nur so lange wie nötig
- **Legal Review:** DSGVO-Konformität der gesamten Pipeline (0.5) + Dedup-Hashing + Module-Datenschutz mit Legal-Agent überprüfen

### 6.2 API Security (Best Practices)
- **Authentifizierung:** Alle API-Routes erfordern Session-Auth (bereits implementiert für ESCO/EURES). Public API (→ 7.1): API Key Auth (Bearer Token, SHA-256 gehasht), getrennt von Session-Auth.
- **Rate Limiting:** Request-Limits pro User/IP (bereits für manuelle Automation-Runs)
  - Erweiterung: globales Rate Limiting via Redis/Memory für alle Endpunkte
  - Public API (→ 7.1): In-Memory Sliding Window pro API Key (60 req/min Default), separate Limits für externe Consumer vs. Frontend
- **Input Validation:**
  - Zod-Schema-Validierung auf allen Eingaben (bereits implementiert)
  - URI-Whitelist für externe API-Proxies (SSRF-Schutz, bereits für ESCO)
  - Maximale Payload-Größe begrenzen
- **CORS:** Strikte Origin-Policy, nur eigene Domain erlauben
- **CSRF-Schutz:** Next.js Server Actions haben eingebauten CSRF-Schutz; API-Routes absichern
- **Content Security Policy (CSP):** Strikte CSP-Header für XSS-Schutz
- **Dependency Security:** Regelmäßige Audits (`bun audit`), Dependabot/Renovate
- **Secrets Management:**
  - API-Keys verschlüsselt in DB (AES, bereits implementiert)
  - Keine Secrets in Git (`.env` gitignored)
  - Environment Variables für Server-Secrets
- **Logging & Monitoring:**
  - Fehlgeschlagene Auth-Versuche loggen
  - Anomalie-Erkennung bei API-Nutzung
  - Optional: Sentry/OpenTelemetry Integration

### 6.3 Accessibility (WCAG / EU Accessibility Act)
Cross-cutting Quality Attribute — kein eigener Spec, sondern `@guarantee` Clauses auf jeder Surface.

- **EU Accessibility Act (EAA):** Seit 2025 in Kraft, relevant für EU-fokussiertes Projekt
- **Standard:** WCAG 2.2 AA Compliance
- **Kern-Anforderungen:**
  - **Focus Management:** Dynamische Inhalte (Pipeline-Transitions, Toasts, Modals) verschieben Fokus vorhersagbar. Fokus geht nie auf `<body>` verloren.
  - **ARIA Labels:** Jedes interaktive Element hat einen accessible name. Icon-Buttons nutzen `aria-label`.
  - **Farbkontrast:** WCAG AA Ratios (4.5:1 Text, 3:1 UI-Elemente). Shadcn Default-Theme erfüllt dies.
  - **Reduced Motion:** Alle Animationen respektieren `prefers-reduced-motion: reduce`.
  - **Screen Reader Announcements:** `aria-live` Regions für dynamische Inhalte (Toasts: `role="status"`, Fehler: `role="alert"`).
- **Job-Tinder (→ 2.7):** Swipe-UI ist inhärent visuell. Screen-Reader brauchen List-View Alternative mit expliziten Buttons. Toggle: "Card View" vs. "List View".
- **Bestehende Basis:** Shadcn UI / Radix bietet gute a11y-Foundation. `specs/ui-combobox-keyboard.allium` hat bereits `@guarantee AccessibleKeyboardNavigation` — dieses Pattern auf alle Surfaces anwenden.

---

## 7. API & Dokumentation

### 7.1 Public API (REST — Open Host Service)
JobSync exponiert eine stabile REST API für externe Tools (n8n, Webhooks, Custom Scripts). Die API ist eine **Published Language** (DDD) — manuell designte Surface, nicht auto-generiert aus Prisma.

**Architektur:**
- **Route-Namespace:** `/api/v1/*` (öffentlich, versioniert) neben `/api/*` (intern, Frontend-only)
- **Auth:** API Keys (Bearer Token, SHA-256 gehasht, nie Plaintext). Eigenes `PublicApiKey` Model, getrennt von Module-API-Keys.
- **Session-Bridge:** `AsyncLocalStorage` injiziert API-Key-User in `getCurrentUser()` — Server Actions funktionieren ohne Änderung für beide Auth-Wege.
- **ActionResult→HTTP Bridge:** Thin Route Handler ruft bestehende Server Actions auf, `actionToResponse()` übersetzt `ActionResult<T>` in HTTP Status Codes + JSON Envelope (`{ data, pagination }` / `{ error }`).
- **Rate Limiting:** In-Memory Sliding Window pro API Key (60 req/min Default). Kein Redis nötig für Self-Hosted.

**Aggregate-Grenzen in der API:**
- Nested Routes für Aggregate-Children: `/api/v1/jobs/:id/notes`, `/api/v1/automations/:id/runs`
- Flat Routes für Aggregate-Roots: `/api/v1/jobs`, `/api/v1/tasks`, `/api/v1/activities`
- Action-Endpoints (RPC-Style) für Seiteneffekte: `POST /automations/:id/pause`, `POST /automations/:id/resume`

**Phasen:**
1. Foundation: PublicApiKey Model + Auth + Jobs-Endpoints + Key-Management-UI in Settings
2. Full Surface: Tasks, Activities, Automations, Tags, Statuses
3. Hardening: Scoped Keys (read-only vs. read-write), Audit-Log, Key-Rotation

- **Design-Entscheidungen:** REST (nicht GraphQL), API Keys (nicht OAuth), manuell designte Surface (nicht Prisma-auto-gen)
- Voraussetzung: 0.3 (Domain-Model Alignment — typisierte Response Bodies), 0.4 (Module Lifecycle — API Key Infrastruktur)
- Cross-Ref: Webhook Connector (1.3) incoming nutzt die Public API Layer, Workflow Connector (1.2/n8n) konsumiert die API, Browser Extension (2.17) ist primärer externer Consumer

### 7.2 API-Dokumentation (automatisch generiert)
- OpenAPI/Swagger Dokumentation für alle Public API Endpunkte
- **Workflow:** Zod-Schemas (für Validierung) → `zod-to-json-schema` → OpenAPI-kompatible Schemas → Swagger UI
- Endpoint-Definitionen (Pfade, Methoden, Beschreibungen) manuell designt
- Schema-Dokumentation (Feld-Typen, Validierung, Beispiele) automatisch aus Zod generiert
- Swagger UI unter `/api-docs` serviert
- Tooling: `@asteasolutions/zod-to-openapi` oder `zod-to-json-schema` + handgeschriebene OpenAPI-Spec

---

## 8. Developer Experience (intern)

> **Hinweis:** Diese Features betreffen nur die Entwicklung, nicht den End-User. Sie werden nicht im Docker-Image ausgeliefert und sind im Projekt unter `tools/` separiert.

### 8.1 Automatische Screenshot/GIF/Video-Dokumentation
- Playwright-basiertes Capture-Script (`tools/capture-docs/`) für automatische Erstellung von Screenshots, GIFs und Videos der wichtigsten UI-Flows
- **Ziel:** README.md und Docs bleiben bei UI-Änderungen automatisch aktuell

**Trennung vom End-User-Projekt:**
- Scripts in `tools/capture-docs/` (nicht `scripts/`) — nicht Teil des App-Builds
- Dependencies als `devDependencies` — vom Docker-Image ausgeschlossen via `--omit=dev` / `standalone` Output
- `.dockerignore` schließt `tools/`, `docs/media/` aus
- `devenv.nix`: optionales Profil für Doc-Capture (ffmpeg)
- End-User der das Docker-Image nutzt sieht davon nichts

**Screenshots (statisch):**
- Playwright `page.screenshot()` für definierte Routes (Dashboard, Settings, Profile, Automation Wizard)
- Ablage in `docs/media/screenshots/` mit konsistenter Namenskonvention (`{flow}-{step}-{timestamp}.png`)

**GIFs/Videos (Flows):**
- Playwright Traces mit `video: 'on'` für komplette User-Flows
- ffmpeg-Pipeline: Screenshots → GIF für kurze Animationen
- Ablage in `docs/media/gifs/` und `docs/media/videos/`

**Zu automatisierende Flows (Top 10):**
1. Dashboard-Übersicht (Hero-Screenshot für README)
2. Vacancy Pipeline: Staging Queue → Review → Promote to Inbox (GIF)
3. Automation Wizard (Schritt-für-Schritt Flow als GIF)
4. Job-Tinder Swipe UI — Queue-Modus + Inbox-Modus (wenn implementiert)
5. Settings / Module Marketplace — Aktivierung/Deaktivierung
6. Profil + CV-Verwaltung
7. Onboarding-Assistent Flow (wenn implementiert)
8. CRM Timeline / Activity Log
9. API Key Management + API-Docs Swagger UI
10. Backup & Restore Flow

**Integration:**
- Als CI-Step oder Hook nach dem Build bei UI-Änderungen
- Zusammenhängende Medien erhalten gleichbleibende Namenskonvention für Auffindbarkeit
- Optional: Claude-Skill für on-demand Capture-Erstellung
- Trade-off: Nur die wichtigsten Flows automatisieren, Rest manuell halten

**Voraussetzungen:** Playwright + System-Chromium (bereits vorhanden), ffmpeg (für GIF-Konvertierung, nur in devenv)

### 8.2 Client-Side Error Reporting Dashboard -- DONE
- Error Boundary mit Error-Reporting in Developer Settings UI
- **Ziel:** React-Errors, Hydration-Mismatches, Client-Side Exceptions in der App sichtbar machen (nicht nur in der Browser-Konsole)

**Komponenten:**
- `src/app/error.tsx` / `src/app/global-error.tsx` — Next.js Error Boundaries (fangen unbehandelte Fehler)
- `src/lib/error-reporter.ts` — Client-Side Error Collector (in-memory Ring-Buffer, max ~100 Entries)
- Developer Settings: "Error Log" Tab mit Liste der letzten Fehler (Timestamp, Message, Stack, Component)
- Toggle: "Client Error Reporting" aktivieren/deaktivieren (default: aktiv in dev, deaktiviert in prod)

**Was wird erfasst:**
- React Error Boundary Crashes (Component-Stack)
- Hydration Mismatches (SSR vs Client)
- Unhandled Promise Rejections (`window.onunhandledrejection`)
- Console.error Überschreibung (optional, konfigurierbar)

**Trennung:** Nur in dev aktiv. In Production (`NODE_ENV=production`) deaktiviert oder opt-in via Developer Settings.

### 8.3 Dependabot
- GitHub Dependabot aktivieren und konfigurieren (`.github/dependabot.yml`)
- Automatische PRs für Dependency-Updates (Security + Version)
- Konfiguration: wöchentlicher Schedule, gruppierte Updates nach Ecosystem (npm), Auto-Merge für Patch-Updates
- Ignorieren von Major-Updates die Breaking Changes erwarten lassen (manuell reviewen)

### 8.4 Administrative Queue
- System-interne Queue für anstehende/abzuarbeitende automatische Aufgaben
- **Sichtbar in Developer Settings / Admin UI:**
  - Pending Tasks (Enrichment-Requests, Health-Checks, Dedup-Cleanup)
  - Fehlgeschlagene Tasks mit Fehlermeldung und Retry-Option
  - Task-Backlog mit Priorität und Status
- **Notifications:** Fehlgeschlagene Tasks und kritische Systemereignisse lösen Notifications aus (→ 0.6 Unified Notifications) an Admin/User bzw. "whom it concerns"
- Nicht zu verwechseln mit der Vacancy Staging Area (→ 0.5) — dies ist eine System-Queue, keine User-Queue

### 8.5 DB-Migrationstool (Gsync → rorar)
- Migrationsskript für Datenbankumzug von Gsync-Fork zu eigenem Repository (rorar)
- Schema-Mapping, Daten-Export/Import, Validierung
- Einmalige Migration mit Rollback-Möglichkeit

### 8.6 Backup & Restore
Infrastructure Service — kein Domain-Concern. Distinct von DSGVO-Export (6.1): Export = per-User Datenportabilität, Backup = Operator-level Disaster Recovery.

- **Was wird gesichert:** SQLite DB-File + hochgeladene Dateien (Resumes, Unterschriften)
- **Was NICHT:** node_modules, .next Build-Cache, Search-Index (rebuildable), .env (Security-Risiko → separat sichern)
- **Manuell:** "Backup jetzt" Button in Settings → .tar.gz/.zip Download
- **Scheduled:** Cron-Config (täglich/wöchentlich), schreibt in konfigurierbaren Pfad
- **Restore:** Backup-Datei hochladen → Validierung (Checksum, Format, Schema-Version) → Bestätigung → Daten ersetzen
- **Retention-Rotation:** Max N Backups, ältere automatisch gelöscht. DSGVO-aware: Backups älter als Retention-Period rotieren.
- Config: `BACKUP_SCHEDULE`, `BACKUP_STORAGE_PATH`, `BACKUP_RETENTION_DAYS`, `BACKUP_MAX_COUNT`

### 8.7 Module SDK & Package Convention
Strukturierte Methode für Community-Module ohne Core-Fork. Phase 1 des Plugin-Systems.

- **Package-Format:** npm Package das ein `ModuleManifest` exportiert
- **Konvention:** `package.json` → `"jobsync": { "manifest": "./manifest.ts" }` Feld
- **Auto-Discovery:** Lifecycle Manager scannt installierte Packages nach `jobsync`-Feld bei Startup
- **Installationsquellen:**
  - **npm Registry:** `bun add jobsync-module-xyz` → Restart → auto-registriert
  - **Externes Git-Repository:** User gibt Repository-URL an (GitHub, GitLab, Self-Hosted Git) → Clone/Pull → auto-registriert. Ermöglicht private/interne Module ohne npm-Veröffentlichung.
  - **Lokaler Pfad:** `file:../my-module` für Entwicklung
- **Repository-Management UI (→ 2.11 Marketplace):** User kann externe Repositories hinzufügen/entfernen. Ähnlich wie Home Assistant HACS Custom Repositories.
- **Update-Mechanismus:** Git-basierte Module können per UI auf neue Commits/Tags geprüft und aktualisiert werden
- **Kein neuer Spec nötig** — nutzt bestehenden ModuleManifest-Vertrag aus `module-lifecycle.allium`
- **Trust-Modell:** Wie Home Assistant / Obsidian — Community vertrauen, nicht sandboxen (Phase 1)
- **Developer-Doku:** Template-Repository für Modul-Entwickler, Manifest-Referenz, Testing-Guide
- Cross-Ref: Marketplace UI (2.11) zeigt auch Community-Module. Plugin-Sandboxing als experimentelles Feature (→ 9.3)

### 8.8 Production Monitoring (Self-Hosted)
- **Health Endpoint:** `GET /api/health` — DB-Connectivity, Disk Space, Module-Status Zusammenfassung
- **System-Info Endpoint:** `GET /api/system` (auth-gated) — Version, Uptime, DB-Größe, Anzahl Jobs/StagedVacancies/Automations
- **In-App Monitoring Dashboard (Admin/Developer Settings):**
  - Ressourcenverbrauch (DB-Größe, Upload-Verzeichnis, Cache)
  - Module Health-Übersicht (aggregiert aus 0.4 Module Lifecycle)
  - Automation-Statistiken (Runs/Tag, Fehlerrate)
  - Letzte Errors aus Error Reporter (→ 8.2)
- **Externe Monitoring-Integration:** Health Endpoint kompatibel mit Uptime Kuma, Healthchecks.io, etc.
- Cross-Ref: Administrative Queue (8.4) zeigt fehlgeschlagene Tasks

### 8.9 Docker & Deployment Improvements
- **Docker Compose:** Fertige `docker-compose.yml` für One-Command Setup
- **Multi-Arch Builds:** ARM64 Support (Raspberry Pi, Synology NAS, Apple Silicon)
- **Dockerfile Health Check:** `HEALTHCHECK` Directive nutzt `/api/health` Endpoint (→ 8.8)
- **Update-Mechanismus:** Watchtower-kompatibel, Versionscheck im Admin UI ("Update verfügbar")
- **Environment-Konfiguration:** `.env.example` mit allen Variablen dokumentiert, Setup-Wizard (→ 2.13) generiert `.env`
- Cross-Ref: Projekt Setup UX (2.13) — Docker ist der primäre Deployment-Pfad für Non-Dev User

---

## 9. Experimentell

### 9.1 CareerBERT
- Integration und Optimierung von [CareerBERT](https://github.com/julianrosenberger/careerbert)
- Spezialisiertes NLP-Modell für Karriere- und Jobtexte (basierend auf BERT)
- **Anwendungsfälle:**
  - Semantisches Matching zwischen CV-Skills und Job-Anforderungen (besser als Keyword-Match)
  - Automatische Skill-Extraktion aus Jobbeschreibungen und Lebensläufen
  - Ähnlichkeitssuche: "Jobs ähnlich zu diesem" basierend auf Beschreibungstext
  - Klassifikation von Jobs nach ESCO/ISCO Taxonomie
  - Ranking von Bewerbungen nach semantischer Relevanz
- **Technisch:**
  - Self-hosted Inference (z.B. via ONNX Runtime oder Hugging Face Transformers)
  - Optional: Finetuning auf eigene Jobdaten für bessere Ergebnisse
  - API-Endpunkt für Embedding-Generierung und Similarity-Search
  - Integration mit dem bestehenden AI Match-Score System
- **DDD-Einordnung:** Bei Implementierung als neues AI-Modul im AI Connector registrieren (wie Ollama, OpenAI, DeepSeek). Implementiert `AIProviderConnector` Interface mit `createModel()` für Embedding-Generierung.
- **Konsumenten:** Skillsets (→ 4.1), Duplikat-Erkennung (→ 3.2 Fuzzy Matching)
- **Ressourcen:**
  - https://github.com/julianrosenberger/careerbert

### 9.2 LinkedIn / XING Machbarkeitsstudie
Research Spike — KEIN Connector, KEIN Modul. Erst Machbarkeit klären, dann entscheiden.

**DDD-Boundary:** LinkedIn/XING sind **Module** die sich bei bestehenden Connectors registrieren (wie Google Maps: ein externes System, mehrere Module hinter verschiedenen Connectors). Shared `linkedin-client` / `xing-client` Utility für Auth + HTTP:
- **Modul: LinkedIn/Jobs** → Job Discovery Connector (1.14)
- **Modul: LinkedIn/Company** → Data Enrichment Connector (1.13)
- **Modul: LinkedIn/Contact** → Data Enrichment Connector (1.13)
- **LinkedIn Data Export Import** → File Import (3.5 / 5.8), kein Modul nötig
- **Modul: LinkedIn/Messaging** → Communication Connector (1.12)
- **Modul: XING/Jobs, XING/Company** → analog, aber deprioritisiert (API tot, Kununu deckt DACH ab)

**Deliverables der Studie:**
1. LinkedIn API-Landscape Dokumentation (welche Endpoints, welche Approval nötig)
2. Community-Library Evaluation (linkedin-api Python, etc.)
3. Legal/DSGVO Risk Assessment: Job-Listings (non-personal, lower risk) vs. Profil-Daten (personal, high risk)
4. Risk Matrix: Account-Ban-Wahrscheinlichkeit, TOS-Enforcement, Detection
5. Go/No-Go Entscheidung pro Fähigkeit (Jobs, Company, Contact, Import)

**Priorisierung:**
- **Zero-Risk sofort machbar:** LinkedIn Data Export Import (JSON/CSV → Profil). Kein API nötig. → 3.5 / 5.8
- **Lower Risk:** LinkedIn/Jobs als Job Discovery Modul (öffentliche Listings)
- **Medium Risk:** LinkedIn/Company als Enrichment Modul
- **High Risk / Deprioritisieren:** LinkedIn/Contact Scraping (personal data, DSGVO), XING (API tot, Kununu deckt DACH ab)

### 9.3 Plugin Sandboxing (low priority)
Capability-basierte Isolation für untrusted Community-Module. Nur wenn Community-Ecosystem sich entwickelt.

- **Capability Model:** Module deklariert benötigte Permissions im Manifest:
  - `network: ["api.example.com"]` — erlaubte Outbound-Hosts
  - `database: read_only | none` — DB-Zugriffslevel
  - `filesystem: none` — kein Dateisystemzugriff
  - `env: ["MY_MODULE_KEY"]` — nur spezifische Env-Vars
- **Isolation-Optionen:** Worker Threads / Child Processes (OS-Level) oder WASM (Browser-Level)
- **Abgrenzung:** Phase 1 + 2 (→ 8.7) vertrauen Community (wie Home Assistant). Phase 3 nur bei konkretem Missbrauch.
- Depends on: 8.7 (Module SDK)

### 9.4 Automation Modes (Semi-YOLO + YOLO)
**Drei Stufen der Automatisierung** — User wählt in Settings pro Automation oder global:

| Modus | LLM bereitet vor | User reviewt | Versand |
|---|---|---|---|
| **Manual** (Default) | Nein | Alles manuell | Manuell |
| **Semi-YOLO** (Assistent) | Ja — generiert CV, Anschreiben, E-Mail | Ja — User gibt finalen Klick | Ein-Klick nach Review |
| **YOLO** (Full Autopilot) | Ja | Nein | Automatisch |

**Semi-YOLO (empfohlen bei LLM-Setup):**
- LLM übernimmt: Staging-Bewertung, Promotion-Empfehlung, Dokumenten-Generierung, E-Mail-Entwurf
- **PAUSIERT** vor jedem Versand → User sieht Vorschau (Dokumente + E-Mail) → Ein Klick zum Absenden oder Bearbeiten
- Batch-Review: Morgens 5 vorbereitete Bewerbungen durchgehen, alle auf einmal absegnen
- Vermutlich der Modus den 90% der User tatsächlich nutzen

**YOLO (Full Autopilot):**
Wenn der User ein volles LLM-Setup hat — ein Modus der den kompletten Bewerbungsprozess autonom durchführt.

**Pipeline im YOLO Mode:**
```
Automation findet Jobs → LLM filtert & bewertet (Staging) → LLM promoted zu Inbox
→ LLM generiert CV + Anschreiben (Application Locale Profile) → LLM verfasst E-Mail
→ Automatischer Versand via Communication Connector → CRM-Eintrag → Follow-Up Timer
→ Bei Antwort: LLM analysiert & schlägt nächste Aktion vor
```

- **Aktivierung:** Opt-In in Settings, hinter Bestätigungsdialog mit Warnhinweis
- **Warnung:** "YOLO Mode übernimmt den kompletten Bewerbungsprozess autonom. Bewerbungen werden OHNE manuelle Prüfung versendet. Das kann spektakulär schief gehen. Auf eigenes Risiko."
- **Safeguards:**
  - Tägliches Bewerbungslimit (Default: 5) — verhindert Spam
  - Company Blacklist (→ 2.15) wird respektiert
  - Match-Score Minimum (konfigurierbar, Default: 90%)
  - Review-Queue: User kann nachträglich sehen was gesendet wurde
  - Kill-Switch: Sofort deaktivierbar, pausiert alle pending Actions
  - Dry-Run Modus: Macht alles außer tatsächlich senden — User reviewt Entwürfe
- **Depends on:** Praktisch alles — 0.4, 0.5, 0.6, 1.12 (E-Mail), 4.2, 4.9, Application Locale Profile, AI Connector

---

## Implementierte Features (Stand: 2026-03-28)

| Feature | Status |
|---|---|
| Roadmap 0.1: Connector Architecture Unification (ADR-010) | ✅ Implementiert |
| ADR-012: Provider→Module Terminology Harmonization | ✅ Implementiert |
| EURES Modul (EU Jobs) | ✅ Implementiert |
| JSearch Modul (Google Jobs) | ✅ Upstream |
| Arbeitsagentur Modul (DE Jobs) | ✅ Implementiert |
| EURES Location Combobox (NUTS + Flags) | ✅ Implementiert |
| ESCO Occupation Combobox (Multi-Select + Details) | ✅ Implementiert |
| i18n (EN, DE, FR, ES) — 496 Keys | ✅ Implementiert |
| Locale-aware Date/Number Formatting | ✅ Implementiert |
| EU API Language Integration | ✅ Implementiert |
| User Language Settings | ✅ Implementiert |
| Roadmap 0.2: ActionResult<T> Typisierung | ✅ Implementiert |
| Roadmap 8.2: Client-Side Error Reporting Dashboard | ✅ Implementiert |
| Allium Spec: Module Lifecycle Manager (`specs/module-lifecycle.allium`) | ✅ Spezifiziert |
