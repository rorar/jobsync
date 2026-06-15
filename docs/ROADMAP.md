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
- **Follow-Ups (alle geschlossen 2026-03-30):**
  - ✅ Pattern B `getAllX` → ActionResult: Bereits in 0.4 migriert (7 Funktionen)
  - ✅ `?:` vs `| null` in task.model.ts: Bereits aligned (?: = optional Relation, | null = DB nullable)
  - ✅ Mapper-Funktionen: Narrow Mappers `toTask()`, `toResumeSection()` ausreichend (DRY ohne Over-Engineering)

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
- **Connector Feinschliff (2026-03-29):**
  - Arbeitsagentur: Cockatiel Error-Handling hinzugefuegt
  - JSearch: Resilience Wrapper (Retry, CB, Timeout, Rate Limit)
  - EURES: EuresApiError Handling hinzugefuegt
  - Alle 3 Job-Discovery-Module: 106 Connector-spezifische Tests, Pagination Safety Cap (MAX_PAGES=20)
  - Pattern B `getAllX` auf ActionResult<T[]> migriert

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
   - `src/lib/connector/resilience.ts` enthält `buildResiliencePolicy()` als **shared Builder**
   - Module deklarieren Resilience-Bedarf im Manifest (`retryAttempts`, `circuitBreaker`, `timeout`, etc.)
   - Lokale `resilience.ts` Wrapper pro Modul existieren noch, sind aber **keine Duplikate** — sie rufen den shared Builder mit ihrem Manifest auf
   - Code-Duplizierung eliminiert, Datei-Struktur beibehalten (dünne Wrapper)
6. **Automation-Degradation (Circuit Breaker → Automation):**
6. **Automation-Degradation (Circuit Breaker → Automation):**
   - Da der Connector die Policies besitzt, kennt er den CB-Status jedes Moduls
   - **Sofort pausieren:** `auth_failed`, `blocked` (heilt sich nicht selbst)
   - **Nach Schwellenwert pausieren:** N konsekutive `failed` Runs oder CB seit X Minuten offen
   - **Nie pausieren:** `rate_limited`, einzelne Timeouts (selbstheilend)
   - Pausierte Automations + User-Benachrichtigung mit Fehlergrund
   - **Hinweis:** Notifications aktuell als Toasts (nicht persistiert). Persistierte Notifications sind 0.6 (Unified Notification System).

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

### 0.5 Vacancy Pipeline (Staging → Inbox → Tracking → Archive/Trash) — KERN DONE (2 Follow-Ups offen)
Entkopplung der LLM-Abhängigkeit: Die App funktioniert in den Grundfunktionen ohne LLMs. Stellenangebote durchlaufen eine Pipeline mit klaren Aggregate-Grenzen.

**Implementiert (Kern-Pipeline):**
- ✅ StagedVacancy Model + Prisma Migration
- ✅ Runner schreibt in StagedVacancy (nicht direkt Job)
- ✅ CRUD Actions (`stagedVacancy.actions.ts`)
- ✅ Promotion Flow: StagedVacancy → Job (`PromotionDialog.tsx`)
- ✅ Staging UI: Tabs + Karten (`StagingContainer.tsx`, `StagedVacancyCard.tsx`)
- ✅ Allium Spec (`specs/vacancy-pipeline.allium`)
- ✅ Dedup via Hash (Review Fix)
- ✅ Domain Events via Event Bus (0.6)

**Implementiert (2026-03-29):**
- ✅ Archive + Trash Lifecycle-Endpunkte (mit Undo-Token)
- ✅ Undo/Redo System (UndoStore mit TTL, Kompensations-Funktionen, userId-Ownership)
- ✅ Bulk Actions Domain Service (Partial-Success-Semantik, BulkActionBar UI, Multi-Select)
- ✅ Dedup-Retention Service (SHA-256 Hash → DedupHash, DSGVO Privacy by Design)
- ✅ Manuelle Jobs → Queue Option (sendToQueue Toggle in AddJob, `addJobToQueue()` Action)
- ✅ 31+ neue Tests (event-bus, undo-store, retention, bulk-actions)

**Ausstehend (Follow-Ups):**
- ❌ JobDeck Dual-Use (→ 2.7)
- ❌ Company Blacklist Filter (→ 2.15)

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

**JobDeck Dual-Use (→ 2.7):**
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
- **Voraussetzung für:** JobDeck Dual-Use (2.7), CRM (5), Bewerbungsunterlagen (4)
- Allium Spec: `specs/vacancy-pipeline.allium` (zu erstellen)

### 0.6 Unified Notification System — ALL 4 CHANNELS DONE
Application Service für Dispatch + bestehende Connectors für Delivery. **Dispatch ≠ Delivery.**

**Implementiert (2026-03-29 bis 2026-04-05):**
- ✅ TypedEventBus (in-process pub/sub, error isolation, wildcard, async handlers)
- ✅ 12 Domain Event Types (typed discriminated union, incl. JobStatusChanged)
- ✅ NotificationDispatcher Consumer (Event→Notification mapping, staged vacancy batching)
- ✅ AuditLogger Consumer (wildcard subscriber für Debug-Logging)
- ✅ Consumer Registration at startup (`instrumentation.ts`, hot-reload guard)
- ✅ In-App Notification UI (NotificationBell + NotificationDropdown + NotificationItem)
- ✅ Notification Preferences (JSON on UserSettings, per-type enable/disable, quiet hours, 4-channel config)
- ✅ NotificationSettings UI Komponente
- ✅ Allium Specs: `event-bus.allium`, `notification-dispatch.allium` (all 4 channels)
- ✅ emitEvent() → EventBus.publish() Migration (alle Callsites)
- ✅ ChannelRouter Multi-Channel Architecture (ADR-026)

- **Dispatch (intern):** `NotificationDispatcher` subscribt Domain Events → prüft User-Preferences → routet an Channels
- **Delivery (extern):** E-Mail (nodemailer SMTP), Browser Push (VAPID), Webhook (HMAC), In-App (DB-Write)
- **Preferences:** Teil von UserSettings (kein eigenes Aggregate). Channels, Digest-Modus, Quiet Hours, per-Typ-Overrides.
- **Phasen:**
  1. ✅ In-App Notifications (Bell-Icon, DB-backed) — unblocked 0.4 (Degradation) und 0.5 (Promotion)
  2. ✅ Webhook Channel (HMAC signing, retry, auto-deactivation, Settings UI) — S5a
  3. ✅ E-Mail Channel (nodemailer SMTP, TLS enforcement, rate limiting, templates × 4 Locales, Settings UI) — S5b
  4. ✅ Browser Push Channel (web-push VAPID, service worker, stale subscription handling, Settings UI) — S5b
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

### 0.9 Response Caching (Stufenweise) -- DONE (Stufe 1, Sprint C)
Server-Side Caching-Strategie für externe API-Responses und Referenzdaten. **Stufenweise Einführung** — jede Stufe ist eigenständig nutzbar, höhere Stufen sind optional wählbar. Client-Side Data Caching ist ein separater Concern (→ 2.19).

**Motivation:**
- External API Rate Limits schonen (EURES, Arbeitsagentur, JSearch, ESCO)
- UX verbessern: Wiederholte Anfragen sofort beantworten
- ESCO/EURES Referenzdaten (Berufe, Länder, NUTS-Regionen) ändern sich selten
- SQLite ist für DB-Queries bereits schnell — Caching-Fokus liegt auf externen APIs

**Stufe 1 — Boardmittel (zero Dependencies):**
- Next.js `cache()` für Request Deduplication in Server Components
- In-Memory LRU-Cache für Connector-Responses
  - Pro Modul konfigurierbar (TTL, Max-Entries) via Manifest-Extension
  - Default-TTLs: ESCO Lookups (24h), Job-Suche (15min), Health-Checks (5min)
  - Implementierung: Einfache Map + TTL-Prüfung, oder `lru-cache` npm (~5KB, zero deps)
- **HTTP Cache Headers** auf API-Proxy-Routes (`/api/esco/*`, `/api/eures/*`):
  - `Cache-Control: public, max-age=86400` für ESCO Referenzdaten (Berufe, Länder, NUTS)
  - `Cache-Control: private, max-age=900` für Job-Suche-Responses
  - `ETag` / `Last-Modified` für conditional Requests (304 Not Modified)
- Cache-Invalidation: TTL-basiert + manueller "Cache leeren" Button in Settings
- **Kein Setup-Aufwand für User** — funktioniert out-of-the-box

**Stufe 2 — SQLite-backed Persistent Cache (optional):**
- Neue Prisma-Tabelle `CacheEntry` (key, value, ttl, createdAt, module)
- Cache überlebt App-Restarts (In-Memory LRU verliert Daten bei Restart)
- Nutzt bestehende Prisma-Infrastruktur — keine neue Dependency
- Automatische Cleanup-Routine (expired Entries, Cron → bestehender Scheduler)
- **Kein zusätzlicher Setup-Aufwand** — SQLite ist bereits da

**Stufe 3 — Redis (optional, wählbar in Settings):**
- Für Multi-Instance-Deployments (mehrere Container, Load Balancer)
- Docker Sidecar Pattern (wie Docling 1.18): `docker-compose.yml` Profile
- Konfiguration: `CACHE_BACKEND=memory|sqlite|redis`, `REDIS_URL`
- Manifest-Extension: Module können Cache-Backend-Preference deklarieren
- **Nur relevant wenn User mehrere Instanzen betreibt** — für Single-Instance ist Stufe 1+2 ausreichend

**Architektur:**
- Cache-Layer als Shared Kernel im Connector (`src/lib/connector/cache.ts`)
- Runner ruft `cache.getOrFetch(key, fetcher, ttl)` auf
- Backend austauschbar (Strategy Pattern): MemoryCache → SQLiteCache → RedisCache
- Module deklarieren Cache-Config im Manifest (TTL, Cache-Key-Strategy)

**Invariante — Locale-Aware Cache Keys:**
- EURES, ESCO und Eurostat liefern lokalisierte Responses (Berufsbezeichnungen, NUTS-Regionen, Job-Titel)
- Cache Keys MÜSSEN die Locale enthalten: `{module}:{operation}:{params}:{locale}`
- Beispiel: `esco:occupations:softw:de` vs. `esco:occupations:softw:en` — verschiedene Einträge
- Ohne Locale im Key: DE-User bekommt gecachte EN-Responses → falsche Sprache in der UI
- Cache-Key-Strategy im Manifest deklariert ob Modul locale-sensitive Responses liefert

**Invariante — Tenant-Isolation bei AI-Responses:**
- Job Discovery Responses (EURES, Arbeitsagentur, JSearch) sind öffentliche Listings → shared Cache über User hinweg ist sicher und spart Rate Limits
- AI Provider Responses (Match-Score, Resume-Analyse) sind **user-spezifisch** (mein Lebenslauf ≠ dein Lebenslauf) → Cache Key MUSS `userId` enthalten
- Manifest deklariert Cache-Scope: `shared` (öffentliche Daten) oder `per-user` (personenbezogene Daten)
- DSGVO-Relevanz: Gecachte AI-Responses enthalten indirekt personenbezogene Daten → Löschung bei User-Deletion (→ 6.1)

**Invariante — Automation-Bypass:**
- Cron-gesteuerte Automations (Scheduler) sollen **frische Daten** holen, nicht den Cache nutzen — ihr Zweck ist neue Jobs zu entdecken
- UI-Browsing (Staging-Queue durchsehen, ESCO-Combobox öffnen) nutzt Cache — hier zählt Geschwindigkeit
- Runner erhält `bypassCache: boolean` Parameter, Scheduler setzt `true`

**Invariante — Cache-Type-spezifischer Bypass (Manifest):**
- Module deklarieren im Manifest welche Cache-Stufen sie nutzen bzw. bypassen: `cachePolicy.bypass: CacheType[]`
- `CacheType = "memory" | "sqlite" | "redis" | "http"`
- **Usecases:**
  - **Debugging:** Modul-Entwickler bypassed In-Memory-Cache (`"memory"`) um frische API-Responses zu sehen, behält aber SQLite-Cache für Wiederholbarkeit
  - **Echtzeit-Module:** Module die immer frische Daten brauchen (z.B. Health-Checks, Rate-Limit-Status) setzen `bypass: ["memory", "sqlite", "redis"]` → kein Cache
  - **Modul ohne persistenten Cache:** Kurzlebige Daten die keinen Restart überleben müssen → `bypass: ["sqlite"]` (nur In-Memory)
- **Manifest-Deklaration:**
  ```ts
  cachePolicy: {
    ttl: 900,                    // Default-TTL in Sekunden
    scope: "shared" | "per-user",
    localeSensitive: boolean,
    bypass: CacheType[],         // Welche Cache-Stufen werden übersprungen
  }
  ```
- **Runtime-Override:** Settings UI oder Debug-Modus kann `bypass` temporär erweitern (z.B. "alle Caches aus für Modul X")
- **Runner-Integration:** `cache.getOrFetch()` prüft `manifest.cachePolicy.bypass` und überspringt die deklarierten Stufen

**Invariante — Thundering Herd Prevention:**
- Cache-Entry expired + N gleichzeitige Requests = alle N treffen die externe API → Rate Limits gesprengt
- **Request Coalescing:** Erste Anfrage fetcht, Rest wartet auf dasselbe Promise (Cockatiel Bulkhead Pattern bereits vorhanden → erweitern)
- Kritisch bei ESCO-Combobox: User tippt → Debounce → aber mehrere Komponenten könnten gleichzeitig anfragen

**Invariante — Negative Caching:**
- Fehler-Responses (5xx, Timeouts) werden NICHT gecacht — sonst liefert der Cache wiederholt Fehler
- "Not Found" (404) DARF gecacht werden (kurze TTL, z.B. 5min) — verhindert wiederholte Lookups für nicht-existierende Ressourcen
- Netzwerk-Fehler → Cache liefert letzten bekannten guten Wert (Stale-If-Error Pattern)

**Cache Observability (→ 8.8 Production Monitoring):**
- Hit/Miss-Ratio pro Modul und Cache-Backend
- Cache-Größe und Eviction-Rate
- Sichtbar im Admin Monitoring Dashboard (→ 8.8)

**Abgrenzung:**
- KEIN Prisma Query Cache (SQLite ist lokal, kein Netzwerk-Overhead)
- KEIN Service Worker Cache (→ 0.8 PWA — separater Scope)
- KEIN Client-Side Data Caching (→ 2.19 eigener Scope)
- Fokus: Server-Side Caching für Connectors + HTTP Transport Caching

**Discovery (zu evaluieren):**
- [cached-prisma](https://github.com/JoelLefkowitz/cached-prisma) — wraps Prisma Client mit LRU/Redis. Evaluieren ob für Stufe 1 nutzbar oder ob eigener LRU ausreicht.
- [lru-cache](https://www.npmjs.com/package/lru-cache) npm — bewährte LRU-Implementierung (~5KB)
- Next.js `unstable_cache` — Server-Side-Cache mit Revalidation
- [keyv](https://www.npmjs.com/package/keyv) — Unified Key-Value Store mit austauschbaren Backends (SQLite, Redis, etc.)

**Reihenfolge:** Nach 0.5 (Vacancy Pipeline), da Pipeline-Responses cacheable sind. Unabhängig von 0.6-0.8.

### 0.10 Scheduler Transparency & Run Coordination -- DONE
RunCoordinator als Single Entry Point für alle Automation-Runs (Scheduler + Manual). Verhindert Doppel-Ausführung, exponiert Scheduler-State via SSE, zeigt Queue-Status und Modul-Kontention in der UI.

**Implementiert (2026-03-30):**
- ✅ Allium Spec `specs/scheduler-coordination.allium` (700+ Zeilen)
- ✅ RunCoordinator Singleton (`src/lib/scheduler/run-coordinator.ts`) — In-Memory Mutex, State Tracking, Event Emission
- ✅ Prisma Migration — `runSource` Feld auf AutomationRun (`"scheduler" | "manual"`)
- ✅ Runner-Signatur erweitert mit `RunOptions { runSource, bypassCache? }` (vorwärtskompatibel für 0.9)
- ✅ 4 neue Domain Events: `SchedulerCycleStarted`, `SchedulerCycleCompleted`, `AutomationRunStarted`, `AutomationRunCompleted`
- ✅ SSE-Endpoint `/api/scheduler/status` mit 2s-Polling
- ✅ `useSchedulerStatus()` Client-Hook (EventSource, Tab-Visibility, Auto-Reconnect)
- ✅ UI: `RunStatusBadge` (Running/Queued), `ModuleBusyBanner` (Kontention-Warnung), RunSource-Badge in Run-History
- ✅ Ghost Lock Prevention: `reconcileOrphanedRuns()` bei Startup
- ✅ 52 Tests in 1 Suite (RunCoordinator)
- ✅ i18n: 8 neue Keys × 4 Locales
- ✅ Manual Run Route: 409 Response bei Double-Run mit Info

**Architektur:**
```
POST /api/automations/[id]/run   Scheduler cron (hourly)
          │                              │
          └─────────┬────────────────────┘
                    ▼
          RunCoordinator (Singleton)
           ├─ Mutex: Map<automationId, RunLock>
           ├─ State: SchedulerPhase + Queue + Progress
           ├─ Events: AutomationRunStarted/Completed
           └─ Delegates to: runAutomation(automation, options)

          SSE: /api/scheduler/status → useSchedulerStatus() → UI
```

**Invarianten (Allium Spec):**
- `NoConcurrentSameAutomation` — maximal ein RunLock pro Automation
- `EveryRunHasSource` — jeder AutomationRun hat `runSource`
- `SchedulerStateReflectsReality` — kein stale State
- `QueuePositionMonotonic` — Positionen nur absteigend

**Cross-Refs:** Vorbereitung für 0.9 (bypassCache via RunOptions), 8.4 (RunCoordinator Interface → TaskQueue Adapter)

### 0.11 Logo Asset Cache (Lokale Logo-Speicherung) -- DONE
Firmenlogos werden beim Enrichment lokal heruntergeladen und auf dem persistenten Docker-Volume gespeichert. Reduziert externe Requests, eliminiert Abhängigkeit von Drittanbieter-Verfügbarkeit und schafft die Grundlage für Ordner-Icons und File Explorer.

**Implementiert (2026-04-06):**
- ✅ `LogoAsset` Prisma-Model + `Company.logoAssetId` Relation
- ✅ Domänenbereich: `src/lib/assets/` (LogoAssetService Singleton, Subscriber, SVG-Sanitizer, Magic-Bytes-Validator, Image-Processor)
- ✅ Download-Pipeline: SSRF-Validierung (validateWebhookUrl) → Fetch mit sicherer Redirect-Verfolgung (max. 3 Hops) → Content-Type + Magic-Bytes-Prüfung → SVG-Sanitisierung → Speicherung auf Disk
- ✅ SVG-Sanitizer: Entfernt `<script>`, `<foreignObject>`, Event-Handler, `javascript:`-URIs, externe Referenzen. `data:`-URIs auf `image/*`-MIME-Typen beschränkt.
- ✅ API-Route `/api/logos/[id]`: Authentifizierte Dateiauslieferung mit Cache-Control, ETag, CSP-Sandbox für SVGs
- ✅ CompanyLogo Zwei-Slot-Fallback: Lokales Asset → Externe URL → Initialen-Avatar
- ✅ AddCompany-Statusanzeige: Zeigt Bereit/Ausstehend/Fehlgeschlagen mit Löschen- und Erneut-Herunterladen-Buttons
- ✅ LogoAssetSettings: Konfigurierbare Max-Dateigröße (512KB) und Max-Dimension (512px Bounding-Box)
- ✅ Event-Subscriber: EnrichmentCompleted (Logo-Dimension) → automatischer Download (Fire-and-Forget)
- ✅ Manuelle URL-Synchronisation: updateCompany erkennt logoUrl-Änderung → löst Download aus
- ✅ Aufräumen bei Unternehmens-Löschung: Prisma-Cascade + Disk-Datei-Entfernung
- ✅ Wikipedia-URL-Resolver: Löst Wikipedia-Medienseiten-URLs automatisch in direkte Wikimedia-Commons-Bild-Links auf
- ✅ Logo-URL-Content-Type-Prüfung: Serverseitige HEAD-Anfrage erkennt Nicht-Bild-URLs
- ✅ i18n: logoAsset-Dictionary in allen 4 Locales (EN, DE, FR, ES)
- ✅ 101 Tests (4 Suites)
- ✅ Allium Spec: `specs/logo-asset-cache.allium`

**Architektur:**
```
EnrichmentCompleted Event (Logo-Dimension)
        │
        ▼
  LogoAssetSubscriber (src/lib/assets/)
        │
        ├─ companyId aus domainKey + userId auflösen
        ├─ SSRF-Validierung (validateWebhookUrl)
        ├─ Download mit redirect:"manual" (max. 3 Hops)
        ├─ Content-Type + Magic-Bytes-Prüfung
        ├─ SVG: Sanitisierung / Raster: Dimensionen lesen
        ├─ Speicherung: /data/logos/{userId}/{companyId}/logo.{ext}
        ├─ LogoAsset-Upsert (status: ready)
        └─ Company.logoAssetId setzen

  CompanyLogo-Komponente
        │
        ├─ logoAssetId gesetzt → /api/logos/{id} (lokal)
        ├─ logoUrl gesetzt     → externe URL (Fallback)
        └─ Nichts              → Initialen-Avatar
```

**Sicherheit:**
- SSRF: validateWebhookUrl auf alle Downloads + Redirect-Hops
- SVG-XSS: Sanitizer + CSP-Sandbox bei Auslieferung (Belt-and-Suspenders)
- MIME-Spoofing: Magic-Bytes-Validierung (Datei-Header muss zum Content-Type passen)
- Pfad-Traversal: filePath nur aus UUIDs konstruiert, nie aus User-Input
- IDOR: userId in allen Queries (ADR-015)
- Download-DoS: 1MB Streaming-Limit, 10s Timeout

**Erweiterungspunkte (future):**
- **EP-1: Ordner-Icon-Generierung** — OS-spezifische Ordner-Icons (.ico/.icns) aus LogoAsset ableiten. Für netzwerkgemountete Unternehmensordner. Speicherung: `{companyId}/folder.ico`, `folder.icns`
- **EP-2: File Explorer Integration** — LogoAsset als durchsuchbares Asset im File Explorer. Unternehmensordner zeigen Logo als Ordner-Icon. Setzt File Explorer Implementierung voraus.
- **EP-3: Wikipedia Logo Discovery Modul** — Enrichment-Modul für Logo-Dimension-Fallback-Chain. Input: Firmendomain → Output: Wikimedia Commons URL. Chain: Clearbit → Google Favicon → **Wikipedia** → Placeholder. Wikimedia-API erfordert User-Agent-Header und Rate Limits.

**Cross-Refs:** Nutzt 1.13 Data Enrichment Events, 0.10 EventBus. Vorbereitung für File Explorer (2.x), Ordner-Icons (EP-1), Wikipedia-Modul (EP-3).

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

### 1.1b EURES/Arbeitsagentur Translator Erweiterung (Follow-Up)
Felder die von den APIs geliefert aber noch nicht in `DiscoveredVacancy` extrahiert werden.

**Phase 1 — Strukturierte Felder (Translation, kein Enrichment):**
- `employer.website` → `DiscoveredVacancy.companyUrl` (neues Feld)
- `employer.sectorCodes` (NACE) → `DiscoveredVacancy.industryCodes` (neues Feld)
- `employer.organisationSizeCode` → `DiscoveredVacancy.companySize` (neues Feld)
- `employer.description` → `DiscoveredVacancy.companyDescription` (neues Feld)
- Voraussetzung: `DiscoveredVacancy` Interface erweitern, Prisma-Schema für StagedVacancy anpassen
- DDD-Einordnung: Reine ACL-Arbeit im EURES Translator, kein neuer Concern

**Phase 2 — Kontaktdaten-Extraktion aus Freitext (Research Spike):**
- `description` und `applicationInstructions` enthalten häufig eingebettete Kontaktdaten (E-Mail, Telefon, Ansprechpartner) als unstrukturierten Freitext
- **Stichproben-Analyse erforderlich:** 50-100 EURES-Listings in DE/EN/FR sammeln, Freitext manuell annotieren
  - Wie oft stehen Kontaktdaten drin? In welchem Format? Welche Sprachen?
  - Wie konsistent sind die Muster? (Regex-fähig vs. NLP-nötig)
- **Entscheidung nach Analyse:**
  - Option A: Regex/Heuristiken im Translator (einfach, fragil, sprachabhängig)
  - Option B: AI-gestützte Extraktion als Data Enrichment Dimension `contact` (→ 1.13, `FUTURE_ENRICHMENT_DIMENSIONS`)
  - Option C: Hybrid — Regex für E-Mail/Telefon, AI für Ansprechpartner/Kontext
- **Nicht nur EURES:** Arbeitsagentur und zukünftige Module (1.14 StepStone, Indeed) haben dasselbe Problem
- Cross-Ref: Data Enrichment `contact` Dimension (→ 1.13), Document-Parsing Connector (→ 1.18), CareerBERT NLP (→ 9.1)

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
- **Dependency:** Holiday Reference Module (→ 1.22) für Feiertags-Anzeige im Kalender
- **Dependency:** GeoCode Reference Module (→ 1.21) für länderspezifische Feiertage

### 1.8 Bewertungsportal Module (→ Data Enrichment Connector 1.13)
Bewertungsdaten sind Unternehmens-Enrichment — überführt in den Data Enrichment Connector (1.13) als Review-Module.
Siehe 1.13 für die vollständige Modul-Liste und API-Recherche.

### 1.9 arbeitsagentur.de Account-Modul
Anbindung an den eigenen arbeitsagentur.de Account — unabhängig vom Jobsuche-Modul (1.1), aber mit Shared Kernel für Job-Import und Status-Propagation.

**Phase 1 — Live-Browser-Session & Authentifizierung (Entwickler-Intervention nötig):**

Die Authentifizierung bei arbeitsagentur.de erfordert zwingend manuelle Entwickler-Intervention, da der Login über Keycloak SSO (`sso.arbeitsagentur.de`, Realm `OCP`, Client `profil-online`, PKCE S256) mit interaktiven Methoden geschützt ist:
- **Option a)** BA-Konto: Benutzername oder Passkey
- **Option b)** BundID: Online-Ausweis (eID) oder ELSTER-Zertifikat

**Workflow (Agent + Entwickler kollaborativ):**
1. **Agent:** Startet eine Playwright-Browser-Session, navigiert zu `https://web.arbeitsagentur.de/profil/profil-ui/pd/` (→ Redirect zum SSO-Login)
2. **Entwickler-Aktion:** Meldet sich manuell über die gewählte Login-Methode an (Agent wartet + beobachtet)
3. **Agent:** Loggt den gesamten Netzwerkverkehr mit (Request/Response Headers, Cookies, Tokens, Redirects)
4. **Agent:** Exploration aller Funktionen mit Rückfragen an den Benutzer
5. **SICHERHEITSREGEL:** Kein Löschen von Accounts, Daten oder Einstellungen — ausschließlich Read-Operationen und explizit freigegebene Aktionen!

**Was aus der Live-Session erfasst wird:**
- Gesamter Netzwerkverkehr analysieren (Requests, Responses, Headers, Redirects, WebSockets — offen für unerwartete Entdeckungen)
- Login-Prozess vollständig (OIDC-Flow, Token-Handling, Cookie-Struktur)
- Versteckte API-Endpunkte hinter der authentifizierten Session (XHR/Fetch-Requests)
- Code-Strukturen und Patterns für die programmatische Umsetzung
- Session-Timeout-Verhalten (arbeitsagentur.de: Hard-Timeout nach 30 Min UND Inaktivitäts-Timeout nach 5 Min)

**Anmeldemethoden (Referenz):**
- **BA-Konto:** Benutzername+Passwort oder Passkey — einfachste Methode für PoC
- **BundID:** Online-Ausweis (eID via AusweisApp) oder ELSTER-Zertifikat — höheres Trust-Level
- **eID-Integration (spätere Phase):**
  - AusweisApp: https://github.com/Governikus/AusweisApp/ / https://www.ausweisapp.bund.de/open-source
  - Open eCard: https://github.com/ecsec/open-ecard
  - Klären: Headless-Auth SDK? Token-Persistierung? PassKey als Ersatzmethode?

**Ergebnis Phase 1:** Vollständig dokumentierter Auth-Flow + erfasste API-Endpunkte + Session-Token-Management-Strategie

**Phase 2 — API-Analyse & Reverse Engineering (aus Live-Session-Daten):**

> **Hinweis:** Der aktuelle Stand ist ein erstes "Reinschnuppern" aus statischem HTML. Die vollständige API-Discovery und Vervollständigung erfolgt durch Agenten in dedizierten Live-Browser-Sessions. Alle unten aufgeführten Endpunkte müssen in der Live-Session verifiziert, erweitert und auf Vollständigkeit geprüft werden.

- Aus dem mitgeschnittenen Netzwerkverkehr: API-Endpunkte identifizieren und dokumentieren
- Prüfen ob (in)offizielle REST/GraphQL-APIs hinter der Session existieren
- Request/Response-Schemas ableiten und als OpenAPI-Spec dokumentieren
- **Bot-Detection:** Maßnahmen prüfen (Playwright-Flagging, Rate Limits, CAPTCHAs, WAF-Header)
  - *Vorläufiger Befund aus statischer HTML-Analyse — NICHT als "erledigt" betrachten, Agent muss hinterfragen:*
  - **Im HTML NICHT gefunden:**
    - Kein CAPTCHA (kein reCAPTCHA, kein hCaptcha, kein Cloudflare Turnstile)
    - Kein JavaScript-Challenge (kein Cloudflare, kein Akamai Bot Manager, kein DataDome, kein PerimeterX/HUMAN, kein Shape Security)
    - Kein Fingerprinting (kein FingerprintJS, keine Canvas/WebGL-Fingerprints)
    - Kein `navigator.webdriver`-Check in den Scripts
    - Kein Proof-of-Work-Challenge
    - Keine WAF-Indikatoren (`__cf_bm`, `_abck`, `bm_sz` fehlen alle)
    - Kein Rate-Limiting-Hinweis im HTML
  - **Vorhanden, aber KEINE Bot-Detection (Security-Mechanismen die Automation beeinflussen):**

    | Mechanismus | Zweck | Auswirkung auf Automation |
    |---|---|---|
    | CSRF-Token (`CSRFToken` in vamJB-Formularen) | Anti-CSRF | Token muss aus HTML extrahiert und mitgesendet werden |
    | CSP-Nonces (`csp-nonce` Meta-Tag) | XSS-Schutz | Irrelevant für Playwright (wir injizieren kein JS) |
    | `encs=` verschlüsselte Entity-Referenzen | Anti-Parameter-Tampering (IDOR-Schutz) | URLs können nicht konstruiert werden, nur aus Navigation extrahiert |
    | Spring Web Flow State (`execution=e{n}s{n}`) | Session-State-Integrität | Flow muss Schritt für Schritt traversiert werden |
    | `<meta name="referrer" content="same-origin">` | Referrer-Leakage verhindern | Irrelevant |
    | `<meta name="robots" content="follow,index">` | SEO | Lädt Crawler sogar **ein** (!) |
    | Matomo Tag Manager | Analytics | Nur Tracking, kein Blocking |
    | OAuth PKCE (S256) | Auth-Security | Standard OIDC, kein Bot-Hindernis |
    | Session-Timeouts | Inaktivitäts-Schutz | Keep-Alive löst das |

  - **ACHTUNG — Agent MUSS in Live-Session aktiv hinterfragen:**
    - Serverseitige Rate-Limits (`X-RateLimit-*`, `Retry-After` Response-Header?)
    - WAF-Regeln die erst bei bestimmten Patterns triggern (z.B. schnelle Requests, unübliche User-Agents)
    - IP-basierte Throttling oder Blocking
    - Anomaly Detection auf API-Ebene (unübliche Request-Patterns)
    - Honeypot-Endpoints (Links die nur Bots folgen)
    - Unterschiedliche Schutzlevel pro Subsystem (vamJB vs. moderne Apps vs. REST-API)
    - **Befund "nichts erkannt" aus statischem HTML ist KEIN Freifahrtschein!**
- **Falls keine offizielle API:** OpenAPI-Spezifikation in separatem Repository erstellen (wie `rorar/EURES-API-Documentation`), damit andere Entwickler profitieren

**Bereits identifizierte API-Endpunkte & Services (zur Verifikation durch Agenten):**

| Endpunkt / Service | Quelle | Vermuteter Zweck |
|---|---|---|
| `rest.arbeitsagentur.de/portal/ota-service/pd/v1` | Termine-App Config (`window.appConfig`) | REST-API für Termine (CRUD, Liste, Details) |
| `miso-glocke` / `miso-webcomponents` | Profil-Shell Script-Tags | Notification-API (Glocke/Bell — polling für neue Events) |
| `miso-einstellungen-benachrichtigungen` | Profil-Shell WC-Registry | Benachrichtigungs-Präferenzen (Kanäle: Online, SMS, etc.) |
| `web.arbeitsagentur.de/verlauf/verlauf-ui/pd/` | Profil-Shell Link | History/Audit-Trail (filterbar per Leistungsart) |
| `web.arbeitsagentur.de/kokos/kokos-ui/pd/` | Kontakt-Sektion | Leistungspostfach (Nachrichten bzgl. Geldleistungen) |
| `web.arbeitsagentur.de/post/post-kpf-ui/pd/` | Geldleistungen-Kontakt | Allgemeines Kommunikationspostfach |
| `jobboerse.arbeitsagentur.de/vamJB/postfachUebersichtAnzeigen.html` | Kontakt-Sektion | Vermittlungspostfach (Nachrichten an Betreuer) |
| `web.arbeitsagentur.de/besch/ui/pd/` | Kontakt-Sektion | Bescheide und Nachweise (Dokument-Abruf) |
| `web.arbeitsagentur.de/vermittlung/nks-ui/pd` | Arbeitsmarktprofil-Sektion | "Nächste Schritte" — geführter Prozess mit Status |
| `jobboerse.arbeitsagentur.de/vamJB/betreuerAnzeigen.html` | Stellensuche-Sektion | Betreuer-Liste + Kontaktdetails + Nachricht verfassen |
| `jobboerse.arbeitsagentur.de/vamJB/bewerbungenAnzeigen.html` | Stellensuche-Sektion | Plattform-eigener Bewerbungstracker |
| `jobboerse.arbeitsagentur.de/vamJB/stellengesucheVerwalten.html` | Stellensuche-Sektion | Stellengesuche (Profil-Daten für Vermittlung) |
| `web.arbeitsagentur.de/sgb2vaem/vaem-ui/pd/` | Veränderung-Sektion | Veränderungsmitteilung (Jobcenter SGB II) |
| `web.arbeitsagentur.de/sgb2wba/wba-ui/pd/` | Geldleistungen-Aktionen | Weiterbewilligungsantrag |
| `web.arbeitsagentur.de/aue/antragsuebersicht/pd/` | Geldleistungen-Aktionen | Antrags-/Vorgangsübersicht (filterbar: `?la=BUERGELD`) |
| `vk.arbeitsagentur.de/vkid/{id}?d={dienststelle}` | Termin-Detail | Video-Termin-Links (Direkt-Join) |
| `web.arbeitsagentur.de/chatbot/web-component/` | Profil-Shell Script-Tags | Chatbot-API (automatisierte Anfragen?) |
| `epayment-offene-forderungen` (WC) | Profil-Shell WC-Registry | Offene Zahlungsforderungen |
| `web.arbeitsagentur.de/guo/guo-webcomponents/` | Profil-Shell Script-Tags | Dokument-Upload (getrennt: SGB II + SGB III) |
| `web.arbeitsagentur.de/kusos/` | Profil-Shell WC-Registry | Persönliche Daten + Kommunikations-Einstellungen |
| `web.arbeitsagentur.de/kusos/einstelloptionen-wcs/` | Profil-Shell WC-Registry | Kanal-Settings: Online-Bereitstellung, Online-Zustellung, Video-Komm., SMS-Benachrichtigung, Online-Kommunikation |
| `web.arbeitsagentur.de/kostaf/person/` | Profil-Shell Script-Tags | Persönliche Angaben (Adressen, Kontakte, Steuer-ID, Zahlungsverbindung) |
| `web.arbeitsagentur.de/kostaf/online-kommunikation/` | Profil-Shell Script-Tags | Online-Kommunikation Einstellungen |
| `web.arbeitsagentur.de/ubvo/ubvo-webcomponents/` | Profil-Shell Script-Tags | Bevollmächtigte, Rollenverwaltung, Persönliche Angaben, Anschriften, Kommunikation |
| `web.arbeitsagentur.de/portal/ota-upcoming-appointment-ui/` | Profil-Shell Script-Tags | Nächster Termin Widget (Dashboard-Kachel) |
| `web.arbeitsagentur.de/portal/otv-agencies-ui/` | Termine-App Script-Tags | Dienststellen-/Agentur-Suche (Termin vereinbaren) |
| `jobboerse.arbeitsagentur.de/vamJB/faehigkeitenVerwalten.html` | Stellensuche-Sektion | Fähigkeiten/Skills-Verwaltung |
| `jobboerse.arbeitsagentur.de/vamJB/dokumenteUndAnlagenVerwalten.html` | Stellensuche-Sektion | Anlagen hochladen/verwalten (Bewerbungsdokumente) |
| `web.arbeitsagentur.de/profil/profil-ui/pd/einstellungen/` | Veränderung-Sektion | Profil-Einstellungen + Persönliche Daten ändern |
| `web.arbeitsagentur.de/portal/termine/pd` | Kontakt-Sektion | Termin-Verwaltung (Angular 21 App, nutzt `ota-service` API) |
| `geois.arbeitsagentur.de/arcgis_js_api/` | vamJB Script-Tags | ArcGIS Kartendienste (Standort-Anzeige Dienststellen) |
| `web.arbeitsagentur.de/oiambk/oiam-oauth-wc/v1/` | Profil-Shell + Termine | OAuth Web Component (Token-Management, Session-Refresh) |

**Session-Verhalten (verifiziert aus HTML-Analyse):**

- **Dual-Timeout-System** (bestätigt durch Web Components im DOM):
  - `session-expiration-30m-warn-popup` → Hard-Timeout nach 30 Minuten (Session-Ende unabhängig von Aktivität)
  - `session-expiration-5m-warn-popup` → Warnung 5 Min vor Session-Ende
  - `session-expiration-inactivity-warn-popup` → Inaktivitäts-Timeout (Warnung + Logout nach ~5 Min ohne Interaktion)
  - `session-timer` / `session-timer-mock-header` → Countdown-Anzeige im Header
- **Legacy-System (vamJB) eigene Session:** `var sessiontimeout = 1800` (30 Min, in Sekunden) — separates Session-Cookie
- **OAuth-Komponente:** `oiam-oauth-component` managt Tokens zentral für `web.arbeitsagentur.de`-Apps
- **Konsequenz:** Zwei Session-Domänen:
  - `web.arbeitsagentur.de` → OAuth-Token-basiert (alle modernen Apps teilen SSO)
  - `jobboerse.arbeitsagentur.de` → Eigene Session-Cookies (Spring Web Flow State), SSO-gekoppelt aber separate Timeout-Verwaltung
- **Keep-Alive muss beide ansprechen:** Ein Keep-Alive nur auf einer Domain reicht nicht — beide Session-Typen müssen erhalten werden

**Architektonische Constraints (für Agenten-Exploration wichtig):**

- **Spring Web Flow (vamJB):** Kein Deep-Linking möglich! Navigation nur über Flow-Traversal (`execution=e{flow}s{step}` + `_eventId_*`). Jede Aktion ändert den serverseitigen State.
- **Verschlüsselte Entity-Referenzen (`encs=`):** Links zu Betreuer-Details/-Nachrichten enthalten Base64-verschlüsselte Parameter. URLs können NICHT selbst konstruiert werden — müssen aus der vorherigen Seite extrahiert werden.
- **CSRF-Token:** Alle POST-Formulare in vamJB enthalten `CSRFToken` — muss bei jedem Submit mitgesendet werden.
- **Multi-App-Architektur:** Die Profil-Shell lädt >20 Web Components aus verschiedenen Microservices. Jedes Sub-System kann eigene Auth-Patterns, API-Formate und Session-Cookies haben.
- **Multi-Client OAuth:** Jede App hat einen eigenen OAuth-Client (`profil-online`, `ota-online`, `kokos`). SSO funktioniert über shared Keycloak Session, aber jeder Client tauscht seinen eigenen Auth-Code gegen ein Token. Token-Lifetime: Access 240s, Refresh 3600s.
- **BundID Transient-Fehler ("Datenverarbeitung-Fehler"):** BundID wirft gelegentlich `id.bund.de/de/datenverarbeitung-fehler` obwohl die Authentifizierung erfolgreich war. Die Weiterleitung funktioniert trotzdem — das "WEITER"-Modal erscheint danach. **Lösung: Guardian-Pattern** — ein Watcher-Loop der auf URL-Änderungen und Modal-Erscheinen reagiert statt auf lineare Navigation zu vertrauen. Muss resilient gegen Zwischen-Fehlerseiten sein (Retry-on-Error-Page + Modal-Detection als Erfolgs-Signal).

**Verifiziertes Auth-Pattern (aus Live-Session 2026-05-17):**

- **Token-Refresh automatisch alle 4 Min** (Access Token expires_in: 240s)
- **Public Client:** `client_secret=profil-online` ist im Request sichtbar — kein echtes Secret!
- **PKCE:** Alle Clients nutzen PKCE (code_verifier/code_challenge mit S256)
- **Scope:** `openid baportal` auf allen Clients
- **Session-Timer vs. Token-Lifetime (VERIFIZIERT 2026-05-17):**
  - **Browser-Session:** 30 Min Hard-Limit. Der OAuth-Client selbst triggert `GET /openid-connect/logout?id_token_hint=...` → Server invalidiert Session sofort.
  - **OAuth Access Token:** 240s (4 Min) — muss via Refresh erneuert werden
  - **OAuth Refresh Token:** 3600s (1 Std) technische Lifetime laut Token-Response — **ABER NUTZLOS nach Session-Ende!**
  - **VERIFIZIERT:** Refresh Token nach 30 Min → `{"error":"invalid_grant","error_description":"Session not active"}`. Server invalidiert serverseitig.
  - **API-Fenster = exakt 30 Minuten, NICHT 1 Stunde.**
  - **Logout wird CLIENT-seitig ausgelöst** (nicht Server-Push). Der `session-timer` WC in `profil-ui` zählt runter und triggert den Logout-Endpoint. Kokos-App hat KEINEN eigenen Timer — nutzt aber dieselbe SSO-Session.
  - **Keep-Alive-Strategie:** Muss den Logout-Request abfangen/verhindern BEVOR er gesendet wird, ODER die Session vor Ablauf refreshen via User-Interaktion simulieren.
- **Rate-Limit:** `X-RateLimit-Limit: 1000` bestätigt auf vamio-jsonapi
- **REST-API-Pattern:** `rest.arbeitsagentur.de/{service}/{api-name}/pd/v{n}/{resource}` (pd = persönlich, pc = public)
- **API-Formate Mix:** Standard JSON, JSON:API 1.0 (Vermittlung), GraphQL (Vorgänge/Leistungen), HATEOAS (Dienststellen)

**Agents-Discovery-Aufgaben (in Live-Session zu klären):**

- [ ] `rest.arbeitsagentur.de` — Welche weiteren `/portal/*/pd/v1` Endpunkte existieren?
- [ ] `miso-glocke` — Welche API steckt dahinter? Polling-Endpoint? WebSocket?
- [ ] Verlauf-API — Gibt es eine JSON-API hinter `/verlauf/verlauf-ui/`?
- [ ] Postfach-APIs — Sind die 3 Postfächer (kokos, post-kpf, vamJB) jeweils REST oder nur HTML?
- [ ] OAuth-Token-Struktur — Scope, Expiry, Refresh-Token vorhanden?
- [ ] vamJB Session-Kopplung — Reicht OAuth-Token-Refresh oder braucht vamJB eigenen Keep-Alive?
- [ ] `kusos` — Welche Einstellungen sind per API änderbar? (SMS, Online-Zustellung, etc.)
- [ ] Chatbot-API — Authentifiziert? Rate-Limited? Für automatisierte Anfragen nutzbar?
- [ ] Bewerbungen-API — Gibt es hinter `/vamJB/bewerbungenAnzeigen.html` einen XHR/Fetch-Call?
- [ ] NKS "Nächste Schritte" — Sind Schritte+Status per API abrufbar?

**Separates Begleitprojekt — Session Keep-Alive Tool (unabhängig von JobSync):**

> Eigenständiges UserScript oder Browser-Extension (Firefox + Chrome), das das aggressive Session-Timeout-Problem (~5 Min Inaktivität) von arbeitsagentur.de löst. Betrifft nicht nur JobSync-Nutzer — viele Nutzer kämpfen mit diesem Problem.

- **Format:** Greasemonkey/Tampermonkey UserScript ODER WebExtension (Manifest V3)
- **Mechanismus:** Periodischer Keep-Alive-Request (z.B. alle 2-3 Min) gegen einen Session-erhaltenden Endpunkt (löst Inaktivitäts-Timeout; Hard-Timeout nach 30 Min bleibt bestehen → Re-Auth nötig)
- **Scope:** Nur aktiv auf `*.arbeitsagentur.de` Domains
- **Unabhängigkeit:** Eigenes Repository, keine JobSync-Abhängigkeit, eigenständig nutzbar
- **Veröffentlichung:** Öffentlich (GitHub + ggf. Addon-Stores), hilft der Community

**Phase 3 — CRM-Integration & Ansprechpartner:**
- **Ansprechpartner → CRM Person Propagation (Shared Kernel mit 5.4):**
  - Betreuer/Berater als `Person` im CRM anlegen (Rolle: `advisor` / `caseworker`)
  - Kontaktdaten: Name, Dienststelle, Adresse, Zimmernummer, Telefon, E-Mail, Öffnungszeiten
  - Zuordnung zu Institution (Arbeitsagentur vs. Jobcenter → `CompanyAssociation` auf Person)
  - **Mehrere Betreuer pro Sachbereich:** Vermittlung, Leistung, Familienkasse — jeweils eigene Ansprechpartner
  - Automatische Aktualisierung bei Betreuerwechsel (Datum der Zuordnung tracken)
- **Termine → Kalender Connector (→ 1.7) + CRM Interview:**
  - Termine importieren: Datum, Uhrzeit, Art (Video / vor Ort / Telefon), Ansprechpartner
  - Video-Termin-Links extrahieren und speichern (Format: `https://vk.arbeitsagentur.de/vkid/...`)
  - Termin-Badges: "In Kürze", "Bestätigt", etc.
  - Als `CrmInterview` mit Typ `institutional_appointment` anlegen
  - Erinnerungen synchronisieren (CRM Cron → ReminderTriggered)
- **Nachrichten (Multi-Postfach-Architektur):**
  - **Vermittlungspostfach** (`jobboerse.arbeitsagentur.de/vamJB/postfachUebersichtAnzeigen.html`): Nachrichten an/vom Arbeitsvermittler, Bewerberprofil als Anhang
  - **Leistungspostfach** (`web.arbeitsagentur.de/kokos/kokos-ui/pd/`): Nachrichten bzgl. Geldleistungen (Bürgergeld, ALG)
  - **Post/KPF** (`web.arbeitsagentur.de/post/post-kpf-ui/pd/`): Allgemeines Kommunikationspostfach
  - Nachrichten empfangen und senden mit Anhang
  - Konversations-Thread in CRM Activity Timeline projizieren
- **Vorgänge (Cases) → CRM Timeline:**
  - Vorgänge mit Status tracken (gesendet, in Bearbeitung, abgeschlossen, abgelaufen)
  - Vorgangstypen: Weiterbewilligung, Veränderungsmitteilung, Erstantrag, Widerspruch
  - Status-Änderungen als `CrmActivityLog` Einträge
  - Fristen aus Vorgängen extrahieren → `CrmTask` mit Deadline
- **Vermittlungsvorschläge & Bewerbungsvorschläge (Shared Kernel mit 1.1 — Kern-Feature!):**
  - Vom Arbeitsvermittler aktiv vorgeschlagene Stellen importieren (`jobboerse-vv-se` WC)
  - Import als `DiscoveredVacancy` mit Quelle `arbeitsagentur_vermittlung`
  - Höhere Gewichtung als eigene Jobsuche — Vermittler kennt Anforderungen und Arbeitsmarkt
  - Bidirektional: Bewerbungsstatus in JobSync (→ beworben/abgelehnt) zurück nach arbeitsagentur.de propagieren
  - Plattform-eigene Bewerbungen (`/vamJB/bewerbungenAnzeigen.html`) mit JobSync synchronisieren
- **Status-Propagation:** Job-Status in JobSync (→ beworben) wird nach arbeitsagentur.de propagiert

**Phase 4 — Dokumentenverwaltung & Formulare:**
- **Bescheide und Nachweise** (`web.arbeitsagentur.de/besch/ui/pd/`): Abrufen, verwalten → Paperless-ngx (→ 1.6)
- Dokumente abrufen, verwalten, teilen/weiterleiten → Paperless-ngx (→ 1.6)
- **Formulare ausfüllen:**
  - PDF Formulare und Online Formulare
  - "Lokale Bewerbungsbemühungen" automatisch ausfüllen
  - Tag für "Bewerbung Online" / "Bewerbung Persönlich"
  - Übersetzungen der Formulare anbieten
- **Dokumente einreichen** (Upload an Jobcenter/Agentur, verschiedene Sachbereiche)

**Systemarchitektur-Erkenntnisse (aus Live-Session-Analyse):**

> arbeitsagentur.de ist KEIN monolithisches System — es besteht aus vielen unabhängigen Web-Components und Microservices, die über verschiedene Subdomains/Pfade zusammengeschaltet werden.

- **Haupt-Shell:** `web.arbeitsagentur.de/profil/profil-ui/` (Angular/Stencil-basiert, lädt WCs dynamisch)
- **Jobboerse (Legacy):** `jobboerse.arbeitsagentur.de/vamJB/` (Server-rendered JSP, eigene Session `var sessiontimeout = 1800`, Spring Web Flow mit `execution=e{n}s{n}` State)
- **Termine:** `web.arbeitsagentur.de/portal/termine/` (Angular 21, eigene App)
- **Geldleistungen:** `web.arbeitsagentur.de/aue/` (Web Components: `aue-lip-pp`, `lip-tile-geldleistung`)
- **Nachrichten:** Mindestens 3 separate Systeme (kokos-ui, post-kpf-ui, vamJB/postfach)
- **Bescheide:** `web.arbeitsagentur.de/besch/ui/` (eigene WC: `besch-webcomponent`)
- **Session-Warnung:** Web Components `session-expiration-30m-warn-popup`, `session-expiration-5m-warn-popup`, `session-expiration-inactivity-warn-popup` — bestätigt Dual-Timeout
- **OAuth:** `oiam-oauth-component` (eigene WC für Token-Management)
- **Konsequenz für Modul:** Jedes Sub-System kann eigene Session-Cookies/Tokens haben → Keep-Alive muss ggf. mehrere Endpoints ansprechen

**Offene Architektur-Fragen (müssen vor/während Implementierung beantwortet werden):**

1. **Nutzungsbedingungen / Rechtliches:**
   - Ist automatisierter Zugriff laut den Nutzungsbedingungen (`arbeitsagentur.de/nutzungsbedingungen`) erlaubt?
   - DSGVO Art. 20 (Recht auf Datenportabilität) — gilt das hier als Rechtsgrundlage?
   - Grauzone: Eigene Daten abrufen vs. automatisierte Interaktion (Nachrichten senden, Status ändern)
   - **UX-Pattern (wie bei EURES-Modul):** Bei Modul-Aktivierung muss der Benutzer einen Risikohinweis akzeptieren + Link zu den Nutzungsbedingungen angezeigt bekommen. Keine stillschweigende Nutzung — informierte Zustimmung durch den User.

2. **"Profil wechseln" — Multi-Profil-Support:**
   - Im HTML: `<a id="profileProfilWechseln">Profil wechseln</a>` — Nutzer können mehrere Profile haben!
   - Welche Profile gibt es? (Privatperson, Unternehmen, Partner — aus Login-Seite bekannt)
   - Modul muss wissen welches Profil aktiv ist und ggf. explizit auswählen
   - Kann ein Nutzer mehrere Privatperson-Profile haben? (z.B. verschiedene Kundennummern?)

3. **Session-Window-Scheduling — fundamental anderes Pattern als stateless APIs:**
   - Max. 30 Min Session → Automationen können NICHT 24/7 laufen wie bei EURES/JSearch
   - Pattern: Login → alle Operationen gebatcht innerhalb 30 Min → Session endet
   - Wie interagiert das mit dem JobSync RunCoordinator? Braucht einen speziellen "session-windowed" Runner
   - Was passiert wenn eine Operation länger als 30 Min dauert? (z.B. viele Nachrichten abrufen)
   - Re-Auth-Strategie: Automatisch (wenn Credentials gespeichert) oder manuell (Notification an User)?

4. **Credential Storage & Autonomie-Level:**
   - **Szenario A:** BA-Konto (Username+Password) in JobSync gespeichert → programmatischer Login möglich → Modul kann autonom laufen (wie ein Cron-Job)
   - **Szenario B:** Passkey/eID → Login IMMER manuell → Modul ist rein reaktiv (nur während manueller Session aktiv)
   - **Szenario C:** Hybrid → manueller Login, aber Session-Token wird persistiert und refreshed solange gültig
   - Welches Szenario wird unterstützt? Bestimmt die gesamte Architektur (Scheduler vs. Event-driven)
   - Wenn Credentials gespeichert: AES-verschlüsselt wie andere Modul-Credentials (ADR-016)?

5. **Vermittlungsvorschläge — Kern des Shared Kernel mit 1.1:**
   - `jobboerse-vv-se` Web Component zeigt Vermittlungsvorschläge und Suchaufträge
   - Das sind Jobs die der Arbeitsvermittler **aktiv vorschlägt** — höchste Relevanz für den Nutzer!
   - Import als `DiscoveredVacancy` mit Quelle `arbeitsagentur_vermittlung` (nicht `arbeitsagentur_jobsuche`)
   - Unterschied zu 1.1: Dort sucht der USER, hier schlägt der VERMITTLER vor → andere Gewichtung im Matching

6. **Sync-Richtung & Frequenz:**
   - **Pull (arbeitsagentur → JobSync):** Termine, Nachrichten, Betreuer, Vorgänge, Vermittlungsvorschläge
   - **Push (JobSync → arbeitsagentur):** Bewerbungsstatus propagieren, Nachrichten senden, Bewerbungsbemühungen melden
   - Wie oft pollen? Innerhalb einer 30-Min-Session alles einmal durchlaufen, oder gezielt nur Deltas?
   - Aggressives Polling (jede Minute) vs. seltene Sync-Sessions (1x täglich, manuell ausgelöst)?
   - Kein Webhook/Push von arbeitsagentur.de → Polling ist die einzige Option (es sei denn miso-glocke hat WebSocket)

7. **Test-Strategie — kein Sandbox-Environment:**
   - arbeitsagentur.de bietet KEINE Sandbox/Staging-Umgebung
   - Wie entwickelt man weiter ohne produktive Daten zu gefährden?
   - Option A: Recorded Sessions (HAR-Files) als Mock-Basis → Playwright Replay
   - Option B: Dedizierter Test-Account (falls erlaubt/möglich)
   - Option C: Snapshot-Tests gegen gespeicherte HTML-Strukturen
   - Jedes UI-Update von arbeitsagentur.de kann das Modul brechen → braucht Health-Check-Strategie

8. **Notification-Forwarding (miso-glocke → JobSync Channels):**
   - Neue Nachrichten, Termin-Erinnerungen, Fristablauf → in JobSync's Notification-System weiterleiten
   - Über welchen Channel? Webhook, Push, Email, In-App — alle 4 möglich
   - Echtzeit vs. verzögert (abhängig von Sync-Frequenz, siehe Punkt 6)
   - Deduplizierung: Wenn miso-glocke und eigenes Polling dieselbe Info liefern

9. **Mehrere Rechtskreise — verschiedene Institutionen, verschiedene Prozesse:**
   - **SGB III** (Arbeitsagentur): ALG I, Vermittlung, Stellensuche, Bewerbungen
   - **SGB II** (Jobcenter): Bürgergeld, Eingliederungsvereinbarung, Veränderungsmitteilungen
   - **Familienkasse**: Kindergeld, Kinderzuschlag (eigene Kachel im eServices-Bereich)
   - Verschiedene Ansprechpartner pro Rechtskreis (nicht derselbe Betreuer!)
   - Verschiedene Postfächer pro Rechtskreis (Vermittlungspostfach ≠ Leistungspostfach)
   - Modul muss kontextbewusst operieren: "Wer ist zuständig für was?"

10. **Fragile Selektoren — Resilience bei fehlender stabiler API:**
    - Kein stabiles REST-API (außer ota-service für Termine) = HTML-Scraping/DOM-Navigation
    - Jedes Redesign/Update/A-B-Test von arbeitsagentur.de kann das Modul brechen
    - Braucht: Feature-Detection statt feste CSS-Selektoren wo möglich
    - Braucht: Health-Check der DOM-Struktur vor jeder Operation ("Finde ich die erwarteten Elemente?")
    - Braucht: Graceful Degradation — wenn ein Sub-Feature bricht, soll der Rest weiterlaufen
    - Monitoring: Automatische Alerts wenn Selektoren nicht mehr greifen (→ Degradation-Event)

**Weitere Länder:** Modulare Architektur für Arbeitsagenturen anderer EU-Länder (eigene Module pro Land)

### 1.10 Geo/Map Connector
Entfernungsberechnung und Kartenintegration als Connector mit austauschbaren Modules.

**Abgrenzung zu GeoCode Reference Module (→ 1.21):** Geocoding = Koordinaten-Auflösung (Adresse → lat/lng). GeoCode = administrative Klassifikation (ISO 3166 Codes, NUTS Mapping). Beide teilen ISO-3166-Daten, aber unterschiedliche Concerns. 1.10 ist ein aktiver Connector mit externen API-Calls, 1.21 ist ein offline Reference Data Module.

**DDD-Boundary Google Maps:** Google Maps ist ein externes System das von ZWEI Connectors genutzt wird. Geo/Map (1.10) nutzt Geocoding/Directions/Maps SDK ("Wo und wie?"), Data Enrichment (1.13) nutzt Places ("Was weiß ich über das Unternehmen?"). Beide teilen einen `google-maps-client` Utility (API-Key, HTTP-Client) als Infrastruktur.

- **Connector Interface (`GeoConnector`):**
  - `geocode(address)` → `{ lat, lon }` — Adresse in Koordinaten
  - `reverseGeocode(lat, lon)` → Adresse
  - `parseAddress(text)` → `{ street, houseNumber, postalCode, city, state?, country }` — Freitext-Adresse in strukturierte Komponenten
  - `distance(from, to, mode)` → `{ km, duration, mode }` — Entfernung + Fahrzeit
  - `route(from, to, mode)` → Routengeometrie für Kartenanzeige
  - **Verkehrsmittel (`mode`):** `car` | `transit` | `bike` | `walk`

**Phase 1 — Geocoding + Entfernungsberechnung (Luftlinie) + Address Parsing:**
- **Modul: Nominatim/OSM** (kostenlos, self-hostable, DSGVO-konform) — empfohlen als Default für Geocoding
- **Modul: Google Geocoding** (API-Key, genauer bei Adressen) — optional
- **Modul: libpostal** (Docker Sidecar, ML-trainiert auf 1B+ OSM-Adressen, 99.45% Accuracy) — Address-String → strukturierte Komponenten
  - Docker: `pelias/libpostal-service` auf Port 4400, ~2GB Disk
  - Fully offline, kein API-Key, DSGVO-konform
  - Parst internationale Adressen (DE: "Musterstr. 42, 12345 Berlin", FR: "42 Rue de l'Exemple, 75001 Paris", etc.)
- **Library (kein Modul): `localized-address-format`** (5KB, zero deps) — Feld-Metadaten pro Land (welche Felder, welche Reihenfolge, welche Pflicht). Für dynamische Formular-Generierung (→ 2.6 AddressInput).
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

**Shared-Client-Pattern:** Wenn ein externes System nur ein **Transport/Gateway** ist (API-Marketplace, Proxy), ist es kein Modul — es ist Infrastruktur. Die Services dahinter sind die Module. Faustregel: Wenn der Transport austauschbar ist ohne die Domänensemantik zu ändern, ist es ein Shared Client.

| Plattform | Shared Client (Infrastruktur) | Module (Domäne) |
|---|---|---|
| Google Maps | `google-maps-client` (API Key, HTTP) | Places → Data Enrichment (1.13), Geocoding → Geo/Map (1.10) |
| RapidAPI | `rapidapi-client` (API Key, `X-RapidAPI-Host`) | JSearch → Job Discovery, OpenWeb Ninja/Glassdoor → Data Enrichment (1.13) |
| LinkedIn | `linkedin-client` (OAuth, HTTP) | Jobs → Job Discovery (1.14), Company → Data Enrichment (1.13), Contact → Data Enrichment (1.13) |

### 1.12 Communication Connector
**Autopilot-Rolle (Spec-Hinweis):** Dieser Connector ist der Eigentümer der **Outreach-Delivery** für die Automation-Modi (9.4) — Channel-Auswahl (welcher Kanal je Job), Recipient-/Adress-Auflösung und der eigentliche Versand. `automation-modes.allium` referenziert `OutreachChannel` + `Outreach.deliver` als extern und gated nur; `application-documents.allium` liefert die `OutreachMessage` (Content). Eigene Allium-Spec offen (separater Bounded Context).
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

### 1.13 Data Enrichment Connector -- Phase 1 DONE (Sprint C6)
Anreicherung von Unternehmens-, Kontakt- und Bewerbungsdaten aus externen Quellen. Der Connector orchestriert Fallback-Chains pro Enrichment-Dimension.

**Phase 1 implementiert (2026-04-03):**
- DataEnrichmentConnector Interface + Fallback-Chain-Orchestrator
- 3 Module: Clearbit Logo (free), Google Favicon, Meta/OpenGraph Parser
- EnrichmentResult Cache (TTL, stale-if-error) + EnrichmentLog Audit Trail
- CompanyLogo Komponente (Skeleton → Image → Initials Fallback) → erweitert in 0.11 mit lokalem Zwei-Slot-Fallback
- EnrichmentModuleSettings in Settings (Activation Toggles)
- Domain Events: EnrichmentCompleted, EnrichmentFailed
- i18n: enrichment Namespace in 4 Locales
- Allium Spec: `specs/data-enrichment.allium`
- Security Hardened: SSRF Protection, Rate Limiting, XSS Sanitization, IDOR Compliance

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

### 1.18 Document-Parsing Connector
Separater Connector für Dokumenten-Inhaltsextraktion — getrennt vom Dokumentenworkflow Connector (1.6, Storage/Sync).

**Interface:** `parse(file) → ConnectorResult<StructuredDocument>` + `supportedFormats()`
- Output: `StructuredDocument` mit Volltext, erkannten Sektionen (Erfahrung, Ausbildung, Skills, Zusammenfassung), Metadaten (Titel, Autor, Seitenzahl)
- Sektions-Typen: `summary | experience | education | skills | certifications | other` mit Confidence-Score

**Module:**
- **Modul: Docling** (Docker Sidecar) — PDF+DOCX+PPTX+Images, tiefe Layout-Analyse, OCR, kein LLM nötig
  - Manifest: `endpoint_url` (Default: `http://localhost:5001`), `DOCLING_URL` Env-Fallback, Health-Check `/health`, Circuit Breaker
  - [docling-project/docling](https://github.com/docling-project/docling) (IBM/Linux Foundation, 56K Stars)
  - [docling-project/docling-serve](https://github.com/docling-project/docling-serve) (REST API, Docker Image ~4.4GB)

**In-Process Fallback (KEINE Module — Libraries):**
- LiteParse (PDF, TypeScript-nativ), mammoth (DOCX-only) — als Library-Dependencies im Connector
- Kein Manifest, kein Health-Check, kein Lifecycle — `import` ist kein externes System
- Fallback wenn Docling nicht konfiguriert/verfügbar ist
- **DDD-Regel:** `import` = Library, separater Prozess/Container = Modul

**CV-Parsing Pipeline (→ 3.5):**
1. Document-Parsing Connector: `parse(file)` → `StructuredDocument`
2. (optional) AI Connector: `enrich(structuredDocument)` → Skills, ESCO/NACE Mapping (bestehender AI Connector, kein neuer)

**Abgrenzung zu 1.6 (Dokumentenworkflow):** 1.6 = Dokumente **lagern/synchronisieren** (Paperless-ngx: send/receive/sync). 1.18 = Dokumente **verstehen** (parse → strukturierte Daten). Null Interface-Überschneidung.

**Open Questions:**
- Soll `supportedFormats()` auf dem Interface oder als Manifest-Capability deklariert werden?
- Soll der In-Process Fallback transparent (Connector entscheidet) oder User-wählbar sein?

### 1.19 Task Sync Connector
Bidirektionale Synchronisation von JobSync-Tasks mit externen Aufgaben-Management-Systemen. Ermöglicht Nutzern ihre Bewerbungsaufgaben dort zu verwalten, wo sie ohnehin ihre Tasks pflegen.

**Interface:** `TaskSyncConnector`
- `pushTask(task) → ConnectorResult<ExternalTaskRef>` — JobSync-Task → externes System
- `pullTasks() → ConnectorResult<ExternalTask[]>` — Externe Tasks → JobSync
- `syncStatus(taskRef) → ConnectorResult<TaskStatus>` — Status bidirektional abgleichen
- `deleteTask(taskRef) → ConnectorResult<void>` — Cleanup bei Task-Löschung

**Module:**
- **Modul: Google Tasks** — Google Tasks API (OAuth2, REST). Gut integriert mit Google Kalender/Gmail.
- **Modul: TickTick** — TickTick Open API. Unterstützt Prioritäten, Tags, Subtasks.
- **Modul: Todoist** — Todoist REST API v2. Labels, Projekte, Kommentare.
- (zukünftig: Modul: Microsoft To-Do, Modul: Apple Reminders via CalDAV)

**Sync-Regeln:**
- Mapping: JobSync-Task ↔ externe Task (Titel, Beschreibung, Fälligkeitsdatum, Status)
- Konfliktstrategie: "Last Write Wins" mit User-Notification bei Konflikten
- Job-Referenz im externen Task: Link zur JobSync Job-Detail-Seite
- Sync-Richtung konfigurierbar: Push-only, Pull-only, Bidirektional
- Sync-Intervall via Manifest `healthCheck`-Mechanismus (Polling) oder Webhook wenn vom Modul unterstützt

**Abgrenzung:**
- ≠ Workflow Connector (1.2): Workflow = Multi-Step Automatisierung (n8n). Task Sync = Aufgaben-Synchronisation.
- ≠ Kalender Connector (1.7): Kalender = Termine/Interviews. Task Sync = Aufgaben/To-Dos.

### 1.20 Reference Data Connector (Klassifikationssysteme)
Eigener Connector-Typ (`reference_data`) für externe Klassifikations- und Taxonomie-Dienste, die von anderen Modulen als Dependencies konsumiert werden. Löst das architektonische Problem, dass Referenzdaten-APIs (ESCO, Eurostat) weder Job Discovery noch Data Enrichment sind — sie sind eigenständige externe Systeme mit eigener Verfügbarkeit.

**Motivation:**
- EURES hängt von 3 externen EU-APIs ab (ESCO Classification, Eurostat NUTS, EURES Stats), die unabhängig ausfallen können
- Aktuell als `data_enrichment` mit `supportedDimensions: []` modelliert — Kategorie-Hack, verletzt `DataEnrichmentManifest`-Semantik
- Beantwortet die offene Allium-Frage: "Should modules be able to declare dependencies on other modules?"

**Interface:** `ReferenceDataConnector`
- `lookup(query) → ConnectorResult<ReferenceEntry[]>` — Nachschlagen von Klassifikationseinträgen
- `resolve(uri) → ConnectorResult<ReferenceEntry>` — Einzelnen Eintrag per URI auflösen
- `listVersions() → ConnectorResult<TaxonomyVersion[]>` — Verfügbare Taxonomie-Versionen

**EU-Module (Ist-Zustand, umzuziehen):**
- **Modul: ESCO Classification** — `ec.europa.eu/esco/api` — Berufsklassifikation (Occupations, Skills, Qualifications). Consumer: EURES Occupation-Combobox, CareerBERT (→ 9.1), Skillsets (→ 4.1)
- **Modul: Eurostat NUTS** — `ec.europa.eu/eurostat/api/dissemination/sdmx` — Regionale Gebietseinheiten (NUTS-Codes, i18n-Namen). Consumer: EURES Location-Combobox
- **Modul: EURES Country Stats** — `europa.eu/eures/api/.../getCountryStats` — Länderdaten mit Job-Zählung. Consumer: EURES Location-Hierarchie

**Internationale Module (Discovery — zu evaluieren):**
- **Modul: O\*NET** — `services.onetcenter.org` — US-Berufsklassifikation (Standard Occupational Classification). 1.000+ Berufsprofile mit Skills, Abilities, Work Styles. Frei nutzbar (US DoL). Relevant für: US-Job-Discovery-Module, Cross-Referenzierung ESCO↔SOC, CareerBERT Skill-Taxonomie-Erweiterung
- **Modul: NAICS** — `api.census.gov` — North American Industry Classification System. Wirtschaftszweigklassifikation (US/CA/MX). Relevant für: Branchen-Filter in US-Job-Discovery-Modulen, Firmenklassifikation, Analogon zu EU-NACE-Codes
- (zukünftig: NACE Rev. 2 von Eurostat, SOC UK von ONS)
- Hinweis: ISCO-08 wird NICHT separat benötigt — ISCO-Gruppen kommen als embedded Relation aus der ESCO API (`broaderIscoGroup`)

**Manifest-Erweiterung — Module Dependencies:**
```
contract ModuleManifest {
  ...existing fields...
  dependencies: ModuleDependency[]?  -- other modules this module requires
}
value ModuleDependency {
  moduleId: String       -- e.g. "esco_classification"
  required: Boolean      -- false = degraded mode possible, true = cannot function
  usedFor: String        -- human-readable: "Occupation search in Automation Wizard"
}
```

**UI:** API Status Overview zeigt Dependencies als Baumstruktur unter dem Eltern-Modul (→ bestehende `ApiStatusOverview.tsx` erweitern). Degraded-Dependencies lösen Warning-Badge am Eltern-Modul aus.

**Abgrenzung:**
- ≠ Data Enrichment (1.13): Enrichment = reaktive Datenanreicherung (Logo, Link-Preview). Reference Data = aktive Taxonomie-Nachschlage-Dienste.
- ≠ AI Provider: Keine Inferenz, rein deklarative Klassifikationsdaten.
- Cross-Ref: CareerBERT (→ 9.1) nutzt ESCO-Centroids, Skillsets (→ 4.1) nutzt ESCO/NACE, Onboarding (→ 2.1) nutzt ESCO-Taxonomie

### 1.21 GeoCode Reference Module (ISO 3166 + NUTS Mapping) ✅ DONE (2026-05-28)
Reference Data Module (`taxonomy: "geo_codes"`) als Single Source of Truth für geographische Code-Normalisierung. Foundation für Holiday (→ 1.22), Kalender (→ 1.7), CRM (→ 5.x) und alle zukünftigen geo-abhängigen Features.

**Dreischicht-Architektur mit gegenseitigen Fallbacks:**

| Schicht | Quelle | Stärke |
|---|---|---|
| **1. Ländernamen (npm)** | `i18n-iso-countries` (2M DL, 78 Sprachen, TypeScript) | Alpha-2/3/Numeric Conversion, lokalisierte Ländernamen |
| **2. Subdivision-Übersetzungen (vendored)** | `countries-data-json` (primary, 80+ Sprachen) + `iso3166-2-db` (npm fallback, 9 Sprachen) | Lokalisierte Subdivision-Namen für UI-Anzeige |
| **3. Codes + Geo + Flags (vendored)** | `amckenna41/iso3166-2` (3.4MB JSON, 5046 Subs, 100% Geo, 2843 Flags, 50+ Typen) | Validierung, Hierarchie (parentCode), Koordinaten, Flags |

**Scope:**
- ISO 3166-1 Länder-Lookup mit lokalisierten Namen (78 Sprachen)
- ISO 3166-2 Subdivision-Lookup mit lokalisierten Namen (80+ Sprachen, Fallback-Chain)
- Geo-Koordinaten pro Subdivision (100% Abdeckung, 5046/5046)
- Subdivision-Flags (2843 SVGs)
- Subdivision-Typ (Land, State, Province, Canton, etc. — 50+ Typen)
- NUTS-zu-ISO-3166-2 Crosswalk (Custom File aus Eurostat Correspondence Tables)
- Normalisierungsfunktion: Freitext → ISO-Code (z.B. "Germany" → "DE", "Bayern" → "DE-BY")
- Validierungsfunktionen für Country- und Subdivision-Codes
- CountrySelect + SubdivisionSelect UI-Komponenten
- Prisma Migration: `addressCountryCode`, `addressSubdivisionCode` auf Person
- Location.country Befüllung im Promoter (Quick-Fix für Datenverlust bei EURES→Job Promotion)

**Online-Erweiterung (optional):**
- `amckenna41/iso3166-2` REST-API (Vercel, kostenlos): Fuzzy Name Search + Geo→Subdivision-Lookup
- Offline-Betrieb ohne API vollständig funktionsfähig

**Update-Mechanismus:**
- npm-Pakete (`i18n-iso-countries`, `iso3166-2-db`, `cldr-core`): Renovate/Dependabot PRs
- Vendored JSON (`countries-data-json`, `amckenna41/iso3166-2`): CI/CD-Job synchronisiert periodisch gegen Upstream-Repos, erstellt PR bei Änderungen

**Konsumiert von:** Holiday Module (1.22), Kalender Connector (1.7), Geo/Map Connector (1.10), AddressInput (2.6), CRM (5.x)

**Abgrenzung:**
- ≠ Geo/Map Connector (1.10): Geocoding = Koordinaten. GeoCode = administrative Klassifikation.
- ≠ Address-Parsing: `localized-address-format`/libpostal sind ROADMAP 1.10/2.6 Concerns.
- ≠ Holiday-Lookups: Feiertags-Daten gehören zu 1.22.

**Allium Spec:** [`specs/geo-codes.allium`](specs/geo-codes.allium) — GeoCodeLookupContract, GeoCodeValidationContract, CountryInfo/SubdivisionInfo Value Objects (RegionInfo → holiday-reference-data.allium)

### 1.22 Holiday Reference Module (Feiertage + Weekend + BusinessDay) ✅ DONE (2026-05-28)
Reference Data Module (`taxonomy: "holidays"`) als Single Source of Truth für Feiertage weltweit (international, national, Bundesebene/State-Level, regional). Liefert Lookups für Consumer-Module (Kalender, CRM, Automationen).

**Datenquelle:** `date-holidays` npm-Paket (offline, 200+ Länder, 78 Sprachen, islamischer+hebräischer Kalender, 3-stufige Hierarchie Country→Subdivision→Region).

**Scope:**
- Feiertags-Lookup: `getHolidays(country, year, subdivision?, region?)` mit 5 Typen (public/bank/school/optional/observance)
- Holiday-Check: `isHoliday(date, country, subdivision?)` → `HolidayEntry[]` (mehrere pro Datum möglich)
- Weekend-Patterns: `getWeekendDays(country)` via `Intl.Locale.getWeekInfo()` (Node.js 22) + `cldr-core` Fallback
- Business-Day-Check: `isBusinessDay(date, country, subdivision?)` (kein Feiertag UND kein Wochenende)
- Batch-Lookup: `isHolidayBatch(date, locations[])` für CRM-Directory (50+ Kontakte → deduplizierte Lookups)
- 3-Layer Caching: Day-Cache + Instance-Cache + Pre-Warm (Pflicht bei Startup)
- TZ-Handling: Subdivision-basiert auto-derive + IANA-Override für Edge-Cases
- i18n: date-holidays liefert Übersetzungen in 78 Sprachen, User-Locale durchreichen
- 3-stufige Hierarchie: Country → Subdivision → Region (z.B. DE → BY → A für Augsburger Friedensfest)
- Historische Lookups (rückwirkend für CRM-Timeline)
- Substitute Holidays (Ersatz-Feiertage), Halbtags-Feiertage, mehrtägige Feiertage

**Fallback-Chains:**
- Feiertage: `date-holidays` → [zukünftig: Nager.Date API als zweites Modul] → leeres Array
- Weekend: `Intl.Locale.getWeekInfo()` → `cldr-core` weekData.json
- Namen: date-holidays i18n (78 Sprachen) → English Fallback

**Performance (verifiziert durch Benchmarks):**
- Pre-Warm: ~88ms für 20 Länder (einmalig bei Startup)
- Batch 50 Kontakte (cached): <0.1ms
- Memory: ~18MB Basis + ~7MB für 20 Länder

**Bekannte Limitationen:**
- Islamische Feiertage: ±1-2 Tage Unsicherheit (Umm al-Qura Approximation, Mondsichtung variiert pro Land)
- Historische Weekend-Changes: Nicht abgebildet (z.B. UAE-Wechsel 2022)
- Multi-TZ States: Primary TZ wird verwendet (z.B. US-TX → Chicago statt Denver für El Paso)

**Abhängigkeiten:**
- Benötigt: GeoCode Reference Module (1.21) für ISO-Code-Validierung
- Konsumiert von: Kalender Connector (1.7), CRM Kalender (5.2), CRM Availability (5.x), Automationen (zukünftig)

**Abgrenzung:**
- ≠ Kalender-Feature (5.2/1.7): Holiday liefert Daten, Kalender zeigt sie an
- ≠ Availability-Service: Holiday ist Supplier, CRM komponiert mit Company Closures + Personal Absences
- ≠ Weekend-Kalender: Weekend-Patterns sind Referenzdaten ("UAE hat Fr+Sa"), keine Business-Logik

**Spätere Erweiterung (Open-Closed):**
- Zweites Holiday-Modul (z.B. Nager.Date API) hinzufügbar ohne Änderung am Interface
- Fallback-Chain-Orchestrierung analog zum Logo-Enrichment Pattern

**Allium Spec:** [`specs/holiday-reference-data.allium`](specs/holiday-reference-data.allium) — HolidayLookupContract, HolidayEntry/HolidayType, Caching-Invarianten, TZ-Regeln

**Design Spec:** [`docs/superpowers/specs/2026-05-28-holiday-reference-data-design.md`](docs/superpowers/specs/2026-05-28-holiday-reference-data-design.md) — Vollständige Evaluierung, Dependency-Graphen, Architektur-Entscheidungen

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
  - JobDeck (2.7): Entfernung als Swipe-Kriterium
  - Automation Wizard: Umkreissuche (Arbeitsagentur hat `umkreis` Parameter)
  - CRM: Karte mit allen Unternehmen/Kontakten

### 2.6 Input Fields Verbesserungen
- Passende Icons für alle Input-Felder
- Date Picker: Datumseingabe als Text mit Validierung nach Lokalisation
- Text Input: Enter-Taste fügt Objekte hinzu (Chip-Pattern)
- **AddressInput-Komponente (Shadcn):**
  - Ein Eingabefeld das sich per Land-Auswahl in strukturierte Unterfelder aufteilt (Straße, Hausnummer, PLZ, Stadt, C/O, etc.)
  - **Land-Auswahl:** CountrySelect-Combobox aus GeoCode Reference Module (→ 1.21) — emittiert ISO 3166-1 alpha-2 Code
  - **Subdivision-Auswahl:** SubdivisionSelect (cascading) aus GeoCode Module (→ 1.21) — emittiert ISO 3166-2 Code
  - **Feld-Layout pro Land:** Dynamisch generiert via `localized-address-format` Library (→ 1.10) — DE: Straße+Nr | PLZ+Stadt; FR: Nr+Rue | Code+Ville; US: Street | City | State+ZIP
  - **"Adresse einfügen" (Paste):** Freitext-Adresse wird via libpostal Modul (→ 1.10 Geo/Map Connector) geparst und in Unterfelder verteilt. User bestätigt/editiert.
  - **Graceful Degradation:** Wenn libpostal nicht verfügbar (Docker nicht konfiguriert), bleibt das manuelle Ausfüllen der Unterfelder. Kein Parsing-Fallback nötig — die Felder sind ja da.
  - **Output-Formatierung:** Strukturierte Daten → `@fragaria/address-formatter` für Anzeige (→ Application Locale Profile, Sektion 4)

### 2.7 JobDeck + Inbox UI -- DONE (JobDeck Phase 1, Sprint C)
- **Inbox als eigenständige UI-Surface:** Dedizierte Seite für promoted Jobs (nach Vacancy Pipeline → 0.5). Nicht nur JobDeck-Modus, sondern auch Listen-/Tabellen-Ansicht.
- **JobDeck Modus:** Swipe/Icon Click/Pfeiltasten Navigation
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

### 2.10 Unified Add Automation Workflow (Dependency: 0.4) — Phase 1 DONE
- Voraussetzung: Module Lifecycle Manager (→ 0.4) — Modul-Manifests liefern die Settings-Schemas für dynamische Felder
- **Phase 1 implementiert:**
  - `DynamicParamsForm` rendert connectorParams-Felder dynamisch aus Manifest-Schema (Array-Format)
  - `searchFieldOverrides` + Widget Registry für EURES Comboboxes (kein Hardcoding im Wizard)
  - `useAutomationWizard` Headless Hook + `WizardShell` Presenter (composable für 2.1 Onboarding)
  - `scheduleFrequency` als eigenes Automation-Feld (Prisma-Migration, ex connectorParams)
  - EURES: 9 neue konfigurierbare API-Filter (publicationPeriod, Experience, Offering, Schedule, Education, Sector, EURES Flag, Languages, Sort)
  - Arbeitsagentur: 4 Felder exponiert (umkreis, veroeffentlichtseit, arbeitszeit, befristung)
  - `manifestVersion` + `automationType` auf allen Manifests
  - Dynamic JobBoard Validation (kein hardcoded enum)
  - 141 neue Tests, Security + Performance Review durchgeführt
- **Phase 2 (später):** Maintenance Automations (3.8), Onboarding Embedding (2.1), Module SDK Widget Contract (8.7)

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

### 2.15 Company Blacklist -- DONE (Sprint C)
- User kann Unternehmen auf eine Blacklist setzen
- **Usecases:** Alter Arbeitgeber, ethisch/persönlich unpassende Unternehmen, bekannte Fake-Inserate
- Blacklisted Companies werden automatisch aus Staging gefiltert (→ 0.5 StagedVacancy → dismissed)
- Konfigurierbar: per Firmenname, Domain, oder Handelsregisternummer
- Blacklist-Grund optional dokumentierbar (nur für User sichtbar)

### 2.16 Keyboard Shortcuts
- Pure UI-Infrastruktur, keine Domain-Relevanz. Kein Allium-Spec nötig.
- **Navigation:** J/K (prev/next, vim-style), Pfeiltasten in JobDeck (→ 2.7)
- **Aktionen:** D (dismiss), P (promote), S (super-like), Ctrl+Z (undo), Ctrl+Enter (Formular bestätigen — Add Note, Add Job, etc.)
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

#### 2.18.1 Sankey-Diagramm: Bewerbungsfluss (Application Flow)
Sankey-Visualisierung des gesamten Bewerbungstrichters — zeigt, wie sich alle Bewerbungen über die Status-Stufen verzweigen, mit absoluten Flow-Mengen pro Pfad. Ergänzt die Conversion-Rate-Metrik (2.18) um eine intuitive Fluss-Darstellung.

**Referenz-Layout** ([SankeyMATIC](https://sankeymatic.com/)-Stil):
```
Total Applications ─┬─→ No Response
                    ├─→ Rejected
                    └─→ First Interview ─┬─→ Rejected
                                         └─→ Second Interview ─┬─→ Rejected
                                                               ├─→ Offer ──→ Declined / Accepted
                                                               └─→ Third Interview ──→ Offer
```
- Jeder Knoten = Status-Stufe, jede Kante-Breite = Anzahl Bewerbungen auf diesem Pfad
- Terminale Knoten: `No Response`, `Rejected`, `Declined`, `Accepted` (Outcome-Sinks)
- Zwischenknoten: `First/Second/Third Interview`, `Offer` (Flow-through)

**Datenquelle:** Job-Status-Historie. Knoten/Kanten werden aus den Status-Übergängen abgeleitet (`JobStatusChanged` Domain Events / Activity-Log → Status-Workflow 5.3). Kanten-Gewicht = Count der Jobs, die den Übergang `A → B` durchlaufen haben. Erfordert Status-Transition-Tracking (vorhanden via 5.3 Job Status Workflow + `JobStatusChanged` Event).

**Status-Mapping (JobSync → Sankey-Knoten):** Bestehende JobStatus-Werte auf Funnel-Stufen abbilden. Mehrfach-Interviews benötigen ggf. eine Stage-Zählung (Interview-Runde) aus dem CRM (`CrmInterview`, 5.4) statt nur des flachen JobStatus.

**Technik:** Reine SVG-Berechnung oder Lib evaluieren:
- [`d3-sankey`](https://github.com/d3/d3-sankey) — De-facto-Standard, volle Kontrolle (zu evaluieren)
- [Recharts `Sankey`](https://recharts.org/en-US/api/Sankey) — falls Recharts bereits als Chart-Lib gewählt wird (Konsistenz mit übrigen 2.18-Charts)
- Bundle-Kosten + SSR-Kompatibilität (Next.js 15) vor Lib-Wahl prüfen

**Invarianten:**
- **Flow-Konservierung:** Summe der ausgehenden Kanten eines Knotens = eingehender Flow (außer Wurzel/Sinks). Offene Bewerbungen (noch in einer Zwischenstufe) als eigener „In Progress"-Sink darstellen, damit die Summen aufgehen.
- **Tenant-Isolation:** Nur Jobs des eingeloggten Users (ADR-015, `userId` in allen Queries).
- **Zeitfilter:** Diagramm respektiert den globalen Zeitraum-Filter der Statistik-Seite (z.B. „letzte 90 Tage").
- **i18n:** Knoten-Labels lokalisiert (EN/DE/FR/ES), Zahlen via `formatNumber(locale)`.
- **Leerzustand:** < N Bewerbungen → Hinweis statt leeres Diagramm.

**Cross-Refs:** Conversion-Funnel (2.18), Job Status Workflow (5.3), `JobStatusChanged` Event (0.6), CRM Interviews (5.4).

#### 2.18.2 Bewerbungsbemühungen-Report (Vermittler-/Coach-Nachweis)
Nachweis der Eigenbemühungen für den Arbeitsagentur-/Jobcenter-Betreuer (Arbeitsvermittler, Job-Coach). Generiert aus den realen Bewerbungsdaten — kein manuelles Abtippen. Kombinierbar mit dem Sankey-Diagramm (2.18.1) als visuelle Trichter-Übersicht plus tabellarische Detail-Liste.

**Report-Inhalt:**
- Tabelle pro Bewerbung: Datum, Unternehmen, Position, Quelle/Kanal (online/persönlich), aktueller Status, letzte Aktivität
- Aggregat-Kennzahlen: Anzahl Bewerbungen im Zeitraum, Interviews, Absagen, offene Vorgänge
- Optional: Sankey-Trichter (2.18.1) als eingebettete Grafik
- Zeitraum-Filter (z.B. „seit letztem Termin", „letzte 4 Wochen") — deckt sich mit dem Statistik-Zeitfilter
- Tag-Mapping zu `Bewerbung Online` / `Bewerbung Persönlich` (vorhanden in 1.9 Phase 4)

**Drei Zustellwege (alle optional, User entscheidet):**

1. **Geteilte Read-Only-Ansicht (Advisor/Coach-Zugang) — zweistufig (beide Mechanismen, phased):**
   - Scoped, read-only Sicht auf eine **kuratierte Report-Seite** — NIE Vollzugriff auf das Backend
   - **Stufe A (zuerst) — signierter Share-Link:** ablaufender, widerrufbarer, signierter Link auf eine Report-Seite. Kein Account für den Coach. Kleinster GDPR-/Architektur-Footprint. Optional passwortgeschützt (→ 6.x „Geteilte Dokumente/Landingpages per Passwort schützen").
   - **Stufe B (später) — Gast-/Viewer-Rolle:** echtes Permission-Modell (Owner / Viewer-Scope), Freigabe user-gesteuert; bei Multi-User-Deployments kann der Admin (Tier A) den Zugriff setzen. Wird gebaut, wenn Multi-User-Bedarf entsteht.
   - **Architektur-Hinweis (wichtig):** JobSync hat HEUTE **kein RBAC/Rollenmodell** — Admin-Status ist eine tiered Regel (`ADMIN_USER_IDS`, siehe CLAUDE.md / ADR-018). Stufe B ist das **erste echte Rollen-/Berechtigungskonzept** → braucht vorab ADR + Allium-Spec (Owner / Viewer-Scope). Stufe A umgeht das, weil ein signierter Token-Scope kein Account/Rolle ist.
   - Pflicht (beide Stufen): Ablauf-Datum, jederzeit widerrufbar, genau ein Report-Scope (keine Navigation ins restliche Backend), nicht enumerierbarer Token.

   **→ Gemeinsame Domäne „Shared Surface" (Architektur-Vorbereitung, mit Website-Plänen verzahnen):** Der Share-Link-Mechanismus ist NICHT report-spezifisch. Dieselbe Infrastruktur — signierter, ablaufender, widerrufbarer, optional passwortgeschützter, read-only **öffentlicher Surface** über personenbezogene JobSync-Daten, mit Abruf-Audit und Datenminimierung — wird auch gebraucht von:
   - **4.7 Landingpage für Unternehmen** (Expiring/Password-protected Links, DSGVO — bereits notiert)
   - **9.5 Bewerber-Landingpage / Reverse-Funnel** (öffentliche Profil-Seite)
   - **6.x** „Geteilte Dokumente und Landingpages per Passwort schützen"
   - **Empfehlung:** Ein eigener Bounded Context **`shared-surface`** (Domäne: `SharedLink` Aggregate = Token + Scope + Ablauf + Passwort-Hash + Revocation + Audit; Renderer pro Surface-Typ: `report` | `company-landingpage` | `applicant-landingpage` | `document`). Vor 2.18.2-Implementierung als gemeinsames Fundament spezifizieren (ADR + Allium-Spec `specs/shared-surface.allium`), damit Report, 4.7 und 9.5 dieselbe Freigabe-/Widerrufs-/Audit-Logik teilen statt drei Insellösungen. Rendering-Kontext-Pattern analog 4.2 („eine Datenstruktur, mehrere Rendering-Kontexte").

**Pre-Planning (graph-gestützt — `/understand-anything` Knowledge- + Domain-Graph @ commit `e34fb5f3`, src-Knoten aktuell):**

Der Domain-Graph zeigt 13 Bounded Contexts — **kein** Sharing-/Report-/Landingpage-Kontext existiert → `shared-surface` ist echt neu. Konkrete Wiederverwendung (NICHT neu bauen):

| Baustein | Existierender Code | Rolle für `shared-surface` / Report |
|---|---|---|
| **Token-Mechanik** | `src/lib/account/deletion-token.ts` | Near-exact Vorlage für `SharedLink`-Token: Prefix + 32 random bytes + **nur SHA-256-Hash speichern** (nie Raw) + TTL + Format-Regex + Single-Use. Erweitern um: konfigurierbare TTL, `scope`, Revocation-Flag. |
| **Token-Serving + Rate-Limit + No-Leak** | `src/lib/api/with-api-auth.ts`, `api/auth.ts`, `api/response.ts` (explicit `select`), `api/rate-limit.ts` | Muster für die öffentliche Report-Route: Pre-Auth IP-Limit → Token-Validierung → explizite Feld-Selects (kein Leak interner Felder). |
| **Passwortschutz** | bcrypt aus Auth-Domäne (`Authenticate User` Flow) | Optionaler Passwort-Hash auf `SharedLink` (NICHT `encryption.ts` AES — Passwort = Hash, nicht entschlüsselbar). |
| **Audit** | `src/lib/audit/data-audit.ts` (`writeDataAuditLog`), `specs/audit-trail.allium` | Share-Erstellung + JEDER Abruf geloggt — Infra vorhanden, nur neue Audit-Events. |
| **Report-Datenquelle** | `Change Job Status` Flow + `JobStatusChanged` Event + `audit-logger.ts` | Status-Übergänge → Sankey-Kanten + Report-Zeilen. Tracking existiert (5.3). |
| **E-Mail-Zustellung** | Notifications-Domäne: `email.channel.ts`, `email/templates.ts`, `DispatchContext`/`ChannelRouter` | Report-per-Mail = neuer Notification-Typ + Template, kein neuer Channel. |
| **Daten-Export-Präzedenz** | `src/lib/export/collect-user-data.ts`, `export-rate-limit.ts` | GDPR-Export-Muster (Daten sammeln + rate-limiten) als Vorlage für Report-Datensammlung. |

**Genuin NEU zu bauen (Graph bestätigt: kein Präzedenzfall im Code):**
- `SharedLink` Aggregate + Prisma-Modell + `shared-surface` Bounded Context (Renderer-Registry).
- **PDF-Engine** — ⚠️ **keine Runtime-PDF-Lib vorhanden** (Export nutzt `archiver`→ZIP-of-JSON; Playwright ist nur devDependency). Entschieden (Web-Research 2026, → **4.2.1**): `DocumentRenderingConnector` mit **WeasyPrint** (leichter Default-Sidecar) + **Gotenberg** (opt-in Chromium-Upgrade) + Browser-Print-Fallback. Kein TS-native Shortcut (react-pdf/pdfme/Satori reichen für reflow+SVG+mehrseitig nicht). Report serverseitig zu statischem HTML+SVG rendern.
- Viewer-Rolle / RBAC (Stufe B) — erstes Permission-Modell, eigener ADR.
- Portal-Push-Schreibzugriff ins Vermittlungspostfach — Teil von 1.9.

**Integration-Punkte (Domänen, an die `shared-surface` andockt):** Authentication & Privacy (Token/bcrypt/GDPR), Public API v1 (Serving-Muster), Multi-Channel Notifications (Versand), Job Application Tracking (Report-Daten). Diese 4 sind die Naht-Stellen für die Spec.

2. **PDF-Report:**
   - Server-seitige PDF-Generierung (→ Dokumenten-Generatoren 4.2, gleiche Engine; PDF/DOCX bereits in 4.2/4.9 vorgesehen)
   - Lokalisiert (EN/DE/FR/ES), druckfertiges Layout, Branding optional
   - Download ODER als Anhang an Zustellweg 3

3. **Per Nachricht senden (inkl. direktem Portal-Push):**
   - E-Mail-Channel (0.6 Phase 3) als Versandweg, PDF als Anhang
   - **UND direkt ins Arbeitsagentur-Vermittlungspostfach** (1.9 — `postfachUebersichtAnzeigen.html`, Push-Richtung „Bewerbungsbemühungen melden") — gewünschter Kern-Zustellweg, nicht nur Alternative
   - **Abhängigkeit:** Portal-Push erfordert das 1.9 Arbeitsagentur-Account-Modul (Auth-Flow, Session, verschlüsselte `encs=`-Entity-Referenzen, Vermittlungspostfach-Schreibzugriff). Bis 1.9 steht: PDF + E-Mail als Fallback-Zustellweg, Portal-Push als Phase 2 von 2.18.2.
   - Überschneidung mit 1.9 Phase 4 („Lokale Bewerbungsbemühungen automatisch ausfüllen") — der Report ist die **standalone/offline** Variante, der Portal-Push ist die direkte Einreichung. Gemeinsame Datenquelle + gemeinsames Tag-Mapping (Online/Persönlich).

**Security & GDPR (kritisch — Weitergabe an Dritte):**
- Der Report enthält personenbezogene Bewerbungsdaten → Weitergabe an Dritte (Vermittler) ist eine **Datenübermittlung**. Datenminimierung: nur die für den Nachweis nötigen Felder (Datum, Firma, Position, Status) — keine internen Notizen, Match-Scores, AI-Daten, CRM-Privatfelder, sofern nicht explizit aufgenommen.
- Share-Link: kryptographisch signiert, ablaufend, widerrufbar; kein Enumerieren (random Token, nicht inkrementell). Rate-Limit auf Link-Abruf.
- Alle Queries `userId`-gescoped (ADR-015). Viewer sieht ausschließlich den freigegebenen Report, nie andere Aggregate.
- Audit-Log: Erstellung + jeder Abruf eines geteilten Reports geloggt.
- Cross-Ref: DSGVO-Konformität (6.1), API Security (6.2).

**Reihenfolge / Phasen:**
- **Phase 1:** Report-Datenmodell + Sankey (2.18.1) + PDF (nach 4.2 Dokumenten-Engine) + E-Mail-Versand (0.6 Phase 3) + Share-Link **Stufe A** (auf `shared-surface`-Domäne).
- **Phase 2:** Portal-Push ins Vermittlungspostfach (abhängig von 1.9) + Viewer-Rolle **Stufe B** (RBAC, eigener ADR).
- **Vorab-Fundament:** `shared-surface` Bounded Context (ADR + `specs/shared-surface.allium`) — gemeinsam mit 4.7 / 9.5 spezifizieren, BEVOR Stufe A gebaut wird.

**Cross-Refs:** Sankey (2.18.1), Analytics (2.18), Arbeitsagentur-Modul Bewerbungsbemühungen-Push (1.9 Phase 4), Dokumenten-Generatoren (4.2), E-Mail-Versand (4.9 / 0.6), Shared Surface ↔ Company-Landingpage (4.7), Bewerber-Landingpage (9.5), Passwortschutz geteilter Surfaces (6.x), DSGVO (6.1), API/Auth-Security (6.2), Admin-Tier-Modell (CLAUDE.md / ADR-018).

### 2.19 Client-Side Data Layer (TanStack React Query)
Paradigmenwechsel im Frontend-Datenmanagement: Von manuellen `fetch` + `useState`/`revalidatePath` zu deklarativem Server-State-Management mit [`@tanstack/react-query`](https://tanstack.com/query).

**Warum eigener Punkt (nicht Teil von 0.9 Caching):**
- React Query ist kein "Cache-Layer" — es ist eine **Architekturänderung** im Frontend. Es betrifft wie Server Actions aufgerufen werden, wie Loading/Error States gehandhabt werden, und wie Daten zwischen Komponenten geteilt werden.
- 0.9 (Response Caching) ist Server-Side-Infrastruktur. 2.19 ist Frontend-UX. Beide sind unabhängig einsetzbar.

**Integrations-Pattern (Next.js 15 App Router + Server Actions):**
React Query ruft Server Actions nicht direkt auf — es ist ein **komplementärer State-Management-Layer**. Best Practice 2025 ist ein Hybrid-Pattern:
1. **Server Prefetch:** Daten in Server Components via `prefetchQuery()` laden (schnell, SEO-freundlich)
2. **HydrationBoundary:** Prefetched State via `dehydrate()` an Client Components weitergeben — kein zweiter Fetch
3. **Server Actions für Mutations:** `useMutation()` wraps Server Actions, `queryClient.invalidateQueries()` ersetzt `revalidatePath()`
4. **Streaming-Support:** Prefetches müssen nicht geawaited werden → React Query v5.40+ unterstützt pending Queries

```
Server Component                    Client Component
  prefetchQuery() ──dehydrate()──→ HydrationBoundary → useQuery() (Daten sofort da)
                                    useMutation() → Server Action → invalidateQueries()
```

**Kein Wrapper-Pattern nötig** — Server Actions werden in `mutationFn` aufgerufen, Prefetch geschieht serverseitig. Das ist das offizielle TanStack-Pattern für Next.js App Router.

**Provider-Setup:** `QueryClientProvider` in `app/providers.tsx` (Client Component), eingebunden in Root Layout. Server: neue `QueryClient`-Instanz pro Request. Client: Singleton.

**Core Features:**
- **Stale-While-Revalidate:** Gecachte Daten sofort anzeigen, im Hintergrund aktualisieren — keine Loading-Spinner bei wiederholter Navigation
- **Optimistic Updates:** UI reagiert sofort auf Mutationen (Promote, Dismiss, Status-Änderung), automatischer Rollback bei Fehler
- **Query Invalidation:** Mutation auf Job → invalidiert Job-Liste + Dashboard-Counts automatisch (ersetzt manuelle `revalidatePath()`)
- **Prefetching:** Daten vorladen bei Hover/Focus (z.B. Job-Details beim Hover über Staging-Karte)
- **Polling:** `refetchInterval` für Live-Daten (Health-Status, Automation-Runs)
- **Offline-Ready:** Gecachte Queries bleiben bei kurzen Verbindungsunterbrechungen verfügbar (Synergie mit 0.8 PWA)
- **DevTools:** React Query DevTools für Cache-Inspektion, Query-Status, Refetch-Debugging (nur in dev)

**Migrations-Kandidaten (nach Priorität):**
1. ESCO Occupation/Location Lookups — Combobox-Daten, selten ändernd → `staleTime: Infinity`
2. Job-Listen, Staging-Queue, Dashboard-Aggregationen → `staleTime: 30s`
3. Module Health-Status → `refetchInterval: 60s` (Polling ersetzt manuelle Refreshes)
4. Automation-Runs → Live-Updates während Ausführung

**Evaluierte Alternativen:**

| Kriterium | React Query | SWR | Next.js `useTransition` |
|-----------|-------------|-----|-------------------------|
| Bundle | ~35KB | ~4KB | 0KB |
| Mutations | Excellent | Basic | Adequate |
| Caching | Advanced | Simple | Keins |
| DevTools | Ja | Nein | Nein |
| SSR Hydration | HydrationBoundary | Begrenzt | N/A |
| Optimistic Updates | Built-in | Manuell | Manuell |
| Offline-Ready | Ja | Nein | Nein |

**Entscheidung:** React Query — höherer Bundle-Impact, aber der einzige Kandidat mit vollständigem Feature-Set (Mutations, Hydration, DevTools, Offline). SWR wäre leichter, verliert aber bei Mutations und Optimistic Updates. `useTransition` ist zero-dependency, aber ohne Caching unbrauchbar für das Ziel.

**Reihenfolge:** Unabhängig von 0.9 (Server-Side Caching). Synergien mit 0.8 (PWA Offline) und 0.5 (Staging-Queue Interaktion).

### 2.19b Perceived Performance / Loading UX
**Problem:** Aktuell zeigt jede async-Operation einen Spinner (Loader2 + animate-spin). Kein Skeleton, kein Suspense, kein Streaming. User-Erlebnis: Klick → Spinner → Content. Ziel: Klick → Skeleton/Instant → Content Fade-In.

**Drei Ebenen der Verbesserung:**

| Ebene | Technik | Effekt | Abhängigkeit |
|-------|---------|--------|-------------|
| **1. Skeleton Screens** | Skeleton-Komponenten statt Spinner — zeigen Layout-Platzhalter während Daten laden | Perceived Performance ↑, kein Layout-Shift | Keine — sofort umsetzbar |
| **2. Next.js Streaming** | `loading.tsx` pro Route-Segment + `<Suspense>` Boundaries in Layouts | Instant Navigation, progressive Content-Anzeige | Next.js App Router (bereits vorhanden) |
| **3. Optimistic Updates** | React Query `useMutation` mit `onMutate` → UI updated sofort, Server-Bestätigung im Hintergrund | Gefühlt instant, kein Warten auf Server-Response | 2.19 (React Query) |

**Migration (Strangler Fig):**
- Phase 1: Skeleton-Komponenten erstellen (Shadcn `<Skeleton />` existiert bereits im UI-Kit). Spinner → Skeleton in den meistgenutzten Seiten (Dashboard, Jobs, Automations)
- Phase 2: `loading.tsx` für Top-Level-Routes hinzufügen (Dashboard, Jobs, Settings, Automations, Profile) — Next.js rendert sie automatisch während Server Components laden
- Phase 3: React Query (2.19) + Optimistic Updates für Mutations (Job create/edit, Status-Transition, Kanban Drag-and-Drop)
- Phase 4: Prefetching — React Query `prefetchQuery` in `<Link onMouseEnter>` für Hover-Prefetch

**Aktueller Stand (Audit):**
- ~30+ Stellen mit `Loader2 + animate-spin` als einzigem Loading-Pattern
- 0 Skeleton-Screens
- 0 `loading.tsx` Dateien
- 0 Suspense Boundaries
- Shadcn `<Skeleton />` Komponente ist verfügbar aber ungenutzt

**Cross-Ref:** 0.9 (Server-Side Caching — reduziert Wartezeit), 2.19 (React Query — Optimistic Updates), 0.8 (PWA — Offline/Cache-First), `/ui-design:interaction-design` für Transition-Patterns

### 2.20 Spotlight / Command Palette (Cmd+K)
Universelle Such- und Aktionsleiste im macOS-Spotlight-Stil. Öffnet per `Cmd+K` (oder `Ctrl+K`) und durchsucht alle Entities und Aktionen.

**Drei Stufen:**
- **Navigation:** "Go to Siemens" → Company-Detail. "Open EURES Automation" → Automation-Detail. "Settings" → Settings-Page. Alle Seiten und Entities erreichbar ohne Klicken durch Menüs.
- **Search:** "Jobs in Berlin" → gefilterte Job-Liste. "Rejected last week" → Status-Query. Volltextsuche über Jobs, Companies, Contacts, Automations, Notizen, Dokumente.
- **Actions:** "Run EURES" → startet Automation. "Create Job at BMW" → Pre-filled Modal. "Switch to Dark Mode" → Setting-Toggle. "Export CV as PDF" → Dokumenten-Generierung.

**AI-Bridge (Zukunft):**
- Natürliche Spracheingabe: "Schreib ein Anschreiben für den Siemens-Job" → LLM-Action
- "Wie viele Bewerbungen habe ich diesen Monat?" → Analytics-Query (→ 2.18)
- "Zeig mir alle offenen Interviews" → CRM-Filter (→ 5.3)
- Spotlight wird zum primären Chatbot-Interface — kein separater Chat-Screen nötig

**Technisch:**
- **Package:** `cmdk` (Vercel/Paco) — React, auf Radix/Shadcn gebaut, passt in den bestehenden UI-Stack
- **Datenquellen:** Server Actions für Entity-Suche, Client-Side für Actions/Navigation
- **Index:** Fuzzy-Search über Entity-Namen (Jobs, Companies, Automations), Page-Routes, Action-Registry
- **Action-Registry:** Manifest-driven (wie Widget-Registry) — Actions deklarieren sich mit Label, Icon, Shortcut, Handler
- **Keyboard-First:** Pfeiltasten navigieren, Enter führt aus, Escape schließt — volle Keyboard-Navigation (→ 2.16)

**Cross-Ref:** Keyboard Shortcuts (2.16), Analytics (2.18), CRM (5.3), Dokumenten-Generatoren (4.2), LLM AI-Provider

---

### 2.20 CompanyDetail Page

Dedizierte Detailseite pro Company (`/dashboard/companies/[id]`) — heute nur als Navigationsziel
referenziert (Spotlight 2.19, Enrichment-Panel E1.1), aber **noch keine eigene Seite**.

- **Inhalt:** Firmenstammdaten + Logo, Enrichment-Status-Panel (→ 1.13), alle Jobs bei dieser Company,
  verknüpfte Personen/Kontakte (CRM), und eine **Company-CRM-Timeline**.
- **Company-Timeline (Welle-3-Anschluss):** Die `ActivityTimeline` akzeptiert bereits `targetCompanyId`
  (Welle 3 Gap-5) und **job-verknüpfte** Aktivitäten setzen es schon. **OFFEN bei Bau dieser Seite:**
  *company-getargetete* Tasks/Notes (Target = Company direkt, nicht über einen Job) erscheinen noch
  NICHT, weil die Event-Payloads `CrmTaskCreated`/`CrmTaskCompleted`/`CrmNoteCreated` kein
  `targetCompanyId` tragen. **TODO bei 2.20:** die 3 Payloads (+Schemas) additiv um optionales
  `targetCompanyId` erweitern, in den `crmTask`/`crmNote`-Action-Emittern setzen (wenn Target=Company),
  durch die Projektionen reichen. Siehe `docs/BACKLOG.md` §5 „CRM follow-ups".
- **Cross-Ref:** CRM (5.x), Data Enrichment (1.13), ActivityTimeline (Welle 3 Gap-5).

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

### 3.5 CV-Parsing
Extrahiert Informationen aus verschiedenen CV-Quellen. Erstellt basierend auf ESCO- und NACE-Codes eine Liste von Skills und Tags. Vorschläge für Skills die in Bewerbungsunterlagen hervorgehoben werden sollten.

**1. CV-Dokument Parsing (→ Document-Parsing Connector 1.18):**
- Nutzt den Document-Parsing Connector: `parse(file)` → `StructuredDocument`
- **Unterstützte Formate:** PDF UND DOCX (in DE häufig von Arbeitsagentur verlangt)
- **Pipeline:**
  1. Document-Parsing Connector (1.18): Textextraktion + Sektions-Erkennung
  2. (optional) AI Connector: Semantische Skill-Extraktion, ESCO/NACE Mapping
  3. User wählt in Settings ob LLM-Verarbeitung aktiviert ist (→ 0.5 LLM-Entkopplungs-Prinzip)

**2. LinkedIn-Profil-Import:**
- LinkedIn-Profildaten importieren als CV-Quelle
- **Methoden:**
  - LinkedIn Data Export (JSON/CSV Download) — zero Risk, kein API nötig (→ 5.8 Import/Export)
  - LinkedIn-Profil Scraping (→ 9.2 Machbarkeitsstudie, Risk Assessment pending)
- Importierte Daten werden auf Skillsets (→ 4.1) gemappt

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

### 3.11 Session Recovery & Stale-Session Guard

**Problem:** JWT enthält User-ID die nach DB-Reset/Migration nicht mehr existiert → alle Schreiboperationen schlagen mit kryptischem FK-Fehler fehl.

**Phase 1 — Stale-Session Guard:**
- `getCurrentUser()` prüft DB-Existenz der JWT-User-ID (mit In-Memory-Cache, 60s TTL)
- Bei Mismatch: Return `null` → alle Server Actions behandeln das als "Not authenticated"
- Dashboard Layout zeigt Banner: *"Deine Sitzung ist ungültig. Bitte melde dich erneut an."* + Abmelden-Button
- Kein kryptischer P2003-Fehler mehr — klarer Call-to-Action

**Phase 2 — Form State Persistence (`usePersistedForm`):**
- Custom Hook wrapping `react-hook-form`: auto-save Form-State in `localStorage` (debounced)
- Key-Schema: `jobsync-form-{formId}`, TTL 30 min, auto-clear bei erfolgreichem Submit
- Kandidaten: AddJob, AddAutomation, Profile-Sektionen, SMTP-Settings
- Bei Session Recovery: State wird nach Re-Login automatisch wiederhergestellt
- Cross-Ref: Ähnlich wie `useKanbanState` (localStorage-Persistenz) und `useStagingLayout`

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
- **Dateinamen:** Single Source of Truth ist die Dateinamens-Konvention in **4.3** (`{Nachname}_{Vorname}_{DocType}_{LANG}[_{Unternehmen}][_v{Version}]`, ASCII-sanitisiert, LANG immer dabei; Paperless-Datums-Prefix-Variante für Ablage). Jedes Bewerbungsdokument (CV, Anschreiben, …) trägt seinen `DocType`-Token; ein Bewerbungs-Bundle teilt Nachname/Vorname/Unternehmen und unterscheidet sich per DocType + LANG. Anzeige-Bezeichnungen lokalisierbar, Dateiname ASCII-safe.
- **Gender-Handling Anrede:**
  - Wenn CRM-Kontaktperson vorhanden (→ 5.7): Geschlecht aus Kontakt → "Sehr geehrte Frau Müller" / "Sehr geehrter Herr Müller"
  - Wenn kein Geschlecht bekannt: Gender-neutrale Default-Variante (DE: "Guten Tag, [Name]" / "Sehr geehrte Damen und Herren", EN: "Dear [Name]", FR: "Madame, Monsieur")
- **Adressformat:** `@fragaria/address-formatter` als Single Source of Truth (251 Länder, OpenCage-Daten)
- **Kulturelle Konventionen:** Foto auf CV (DE/FR: ja, UK: nein), Formalitätslevel, Briefformat-Standard pro Land — als UX/UI Settings pro Locale Profile konfigurierbar, separater Kontext von Textinhalten
- **Dokumentbezeichnungen:** Lokalisiert (DE: "Lebenslauf", EN: "CV", FR: "CV") — vom User anpassbar
- **Konsumenten:** Dokumenten-Generatoren (4.2), Automatisches Datum (4.5), E-Mail-Templates (4.9), Format-Lokalisierung, Output-Struktur (4.3)

### 4.1 Skillsets
- Verwaltung von Skill-Profilen basierend auf ESCO/NACE Taxonomien
- **Konsumenten:** CV-Parsing (→ 3.5) liefert Skills, Onboarding (→ 2.1 Schritt 4) bearbeitet Skills, CareerBERT (→ 9.1) matcht Skills semantisch, Dokumenten-Generatoren (→ 4.2) nutzen Skills für CV-Templates
- Kern-Skills vs. Neben-Skills Priorisierung

### 4.2 Dokumenten-Generatoren
**Allium-Spec (DRAFT 2026-06-14):** `specs/application-documents.allium` — ApplicationBundle (CV + generierte Dokumente + Anhänge pro Job) + GeneratedDocument (Anschreiben/Motivation/Exposé/Titelblatt, LLM-generiert aus CvDocument + Job, PII-gestrippt für Cloud, gender-aware Salutation als Black Box, format-lokalisiert DIN 5008), DocumentTemplate, Attachment; Lifecycle draft→generated→edited→final, Export via 4.2.1 mit 4.3-Naming, Teilen via shared-surface. `allium check` grün. **G1+G3 gelöst (2026-06-14):** G1 = kein neues `DocumentsAvailable`-Event; Vorbereitung **mode-gated** (AutomationMode/9.4) — manual = user-initiiert, semi_yolo/yolo = reaktiv auf bestehendes `VacancyPromoted` (`PrepareDocumentsOnPromotion`); Finalisierung/Versand via `OnlyYoloAutoFinalizesAndSends` (Semi-YOLO pausiert zum Review, YOLO sendet autonom innerhalb 9.4-Safeguards). G3 = eigenes `ApplicationFile`-Entity (Gsync-`File` bleibt 1:1-Resume, upstream-safe). Verbleibend: G2 AI-Generierungs-Route (Impl-Lücke), Template-Spec-Scope.
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
- **Discovery: Dynamisches CV-Modul — Manifest-driven Mini-Pagebuilder**
  - **Problem:** Aktuell sind CV-Abschnitte starr programmiert. User kann keine eigenen Felder/Abschnitte hinzufügen. Entwickler muss jede Erweiterung coden.
  - **Lösungsansatz: JSON Schema als Manifest-Format mit Übersetzungsschicht**
    - Industriestandard statt Custom-Format — LLMs kennen JSON Schema nativ, riesiges Tooling-Ökosystem
    - Basis: [JSON Resume](https://jsonresume.org) Schema adoptieren, erweitern mit `x-jobsync-*` Properties für Layout-Hints, Widget-IDs, AI-Hints
    - Zweischichtig: **System-Manifests** (vordefiniert: Work Experience, Education, Skills) + **User-Manifests** (selbst erstellt oder per Chatbot/LLM generiert)
  - **Übersetzungsschicht / Adapter (ACL-Pattern):**
    ```
    CvSectionManifest (JobSync Domain)
      ↕ Adapter
    JSON Schema (Industriestandard)
      ↕
      ├→ react-jsonschema-form (@rjsf/core)  — Editor UI gratis aus Schema
      ├→ Document Rendering Connector        — CV/Report PDF+DOCX Output (s.u., NICHT react-pdf — SVG-Charts)
      ├→ React Components                     — Landing Page (9.5)
      ├→ LLMs / Chatbot                       — Generiert Abschnitte als JSON Schema
      └→ Import/Export                         — LinkedIn JSON, Europass, JSON Resume
    ```
  - **Packages:** `@rjsf/core` (Form-Renderer), Document Rendering Connector (PDF/DOCX — s.u. 4.2.1), `zod-to-json-schema` (Konversion), `@tiptap/core` oder `plate` (Rich Text Felder), JSON Resume Themes (50+ auf npm)
  - **AI-Section-Creator:** User sagt "Füge Publikationen hinzu" → LLM generiert JSON Schema mit Feldern → RJSF rendert Editor sofort → gleiche Daten fließen in PDF + Landingpage + API
  - **Import-Pfade:** LinkedIn Data Export → JSON Resume → JobSync, Europass XML → JSON Resume → JobSync
  - **Vorteil:** Eine Datenstruktur, fünf Rendering-Kontexte (Editor, PDF, Landingpage 9.5, Public API 7.1, E-Mail Templates). Neue Abschnitte ohne Code-Änderungen.
  - **5. Rendering-Kontext: E-Mail Templates (→ D2 E-Mail Channel)**
    - Gleiche JSON Schema Manifests → `react-email` oder `MJML` als Renderer (transpiliert React-Komponenten in E-Mail-kompatibles HTML)
    - User kann lokalisierte E-Mail Templates erstellen/bearbeiten über denselben Pagebuilder wie CV-Abschnitte
    - Constraint: E-Mail hat härtere CSS-Limits (kein Grid, kein Flexbox, kein JS) — der Renderer abstrahiert das
    - S5b (D2) baut zuerst einfache System-Templates. Der Manifest-Pagebuilder ist die Erweiterung für User-eigene Templates.
  - **Migrationsstrategie: Strangler Fig (NICHT ersetzen)**
    - Das bestehende Prisma-Schema (Resume → ResumeSection → WorkExperience/Education/etc.) stammt vom Upstream-Maintainer Gsync und bleibt die **Datenschicht**
    - Die Manifest-Engine wird als **Präsentationsschicht** darüber gelegt (Adapter-Pattern / ACL)
    - System-Manifests mappen 1:1 auf bestehende Prisma-Models (WorkExperience, Education, ContactInfo, etc.)
    - User-Manifests (custom Sections) nutzen die bestehende `OtherSection`-Relation + `jsonData` Feld für dynamische Felder
    - Upstream-Kompatibilität bleibt erhalten — bei Gsync-Schema-Änderungen brechen nur die Adapter, nicht die Engine
  - **Weiterführende Discovery mit spezialisierten Agents/Skills:**
    - `/framework-migration:legacy-modernize` — Strangler Fig Migrationsstrategie für den Umbau des bestehenden CV-Editors
    - `/backend-development:architecture-patterns` — Clean Architecture / Hexagonal Architecture für die Adapter-Schicht
    - `/allium:elicit` — Formale Spec für das Manifest-Schema und die Rendering-Regeln
    - `/ui-design:create-component` + `/ui-design:interaction-design` — UX-Design des dynamischen Section-Editors
    - `/frontend-mobile-development:react-state-management` — State-Management für den Pagebuilder (Drag-and-Drop, Undo/Redo)
    - `/documentation-generation:openapi-spec-generation` — API-Spec für das Manifest-Format (Public API 7.1 Erweiterung)
  - **Cross-Ref:** Skillsets (4.1), Social Proof (4.10), Portfolio (4.11), Bewerber-Landingpage (9.5), Public API (7.1)

#### 4.2.1 Document Rendering Engine (PDF/DOCX) — Entscheidung (Web-Research 2026)
Gemeinsame Render-Schicht für ALLE `data → PDF/DOCX` Bedarfe: Bewerbungsbemühungen-Report (2.18.2), CV/Anschreiben (4.2), E-Mail-Bewerbungen (4.9), Landingpage-Export (4.7/9.5). **Eine Engine-Schicht, viele Consumer.**

**Anforderungen (projekt-spezifisch):** reflow-fähiges, mehrseitiges Layout (variable Tabellen) · **SVG-Charts** (Sankey 2.18.1) · CSS Paged Media (Seitenumbrüche, Kopf-/Fußzeile, A4/DIN 5008) · i18n-Fonts (EN/DE/FR/ES) · Wiederverwendung der React-Web-Ansicht (Share-Link IST der Report) · **self-hosted, kein Cloud-SaaS** (DSGVO) · ressourcenschonend für kleine VMs.

**Recherche-Ergebnis — Engine-Kandidaten evaluiert (Web + GitHub via `gh`):**
- **`pdfme` ✅ gewählt (Default)** — frühere „starr/Koordinaten"-Einschätzung **revidiert**: dynamische Tabellen + Auto-Pagination, `svg`/`image`-Schema, `@pdfme/jsx` (React-Authoring) + `md2pdf`, eigener gepflegter `pdf-lib`-Fork. In-process, kein Sidecar.
- **HTML-first Engines (Opt-in):** **Gotenberg** (Chromium, aktiv) bzw. **WeasyPrint** (leicht, kein JS). Für volles CSS-Reflow. Pagination-Technik dort: **[Paged.js](https://pagedjs.org/)** (CSS Paged Media Polyfill — Seitenumbrüche/Running-Header/Seitenzahlen aus HTML+CSS).
- **Verworfen:** `@react-pdf/renderer` (dynamische SVG/Recharts kaputt) · `pdf-lib` solo (Upstream 4+ Jahre stale, zu low-level — nur als pdfme-Fork für Post-Proc) · `Satori` (nur einseitige OG-Karten, CSS-Subset, keine Pagination) · `jsreport` (wrappt nur Chromium) · `LibPDF` (zu neu) · **`htmldocs`** (React+Tailwind+Paged.js, aber turnkey-PDF nur über deren **Cloud-SaaS** → DSGVO-No-Go; OSS-Pfad braucht trotzdem Chromium; Repo seit 2025-02 unbewegt) · **`wkhtmltopdf`** (seit 2023 archiviert, ungepatchte CVEs → **verboten**).
- **Kein TS-native Paket** macht mehrseitiges HTML+CSS+SVG→PDF mit CSS-**Reflow** ohne Browser-Engine — dafür Gotenberg/WeasyPrint. pdfme umgeht das via Schema/Stack-Flow (kein CSS nötig).

**Architektur — `DocumentRenderingConnector` (neuer ConnectorType `document_rendering`, Muster wie 1.18 Docling):** Interface `render(data|html, opts) → ConnectorResult<Bytes>`. Swappable Module, **In-Process-Default + optionale Sidecar-Module** (genau wie Docling: In-Process-Lib-Fallback + Docling-Sidecar). Reuse der 0.4-Maschinerie (Manifest, Health-Check, Circuit Breaker, `*_URL` Env-Fallback, docker-compose Profile wie Redis 0.9 Stufe 3).

| Modul / Engine | Ansatz | Footprint | Notiz |
|---|---|---|---|
| **`pdfme`** (npm, in-process) — **empfohlener Default** | Schema/JSON-Template → PDF (eigener gepflegter `pdf-lib`-Fork + fontkit) | **npm-Lib, KEIN Sidecar** | v6.0.0 (2026-04, aktiv, MIT). **Dynamische Tabellen mit Auto-Pagination** ✅ (= Report-Kernfall), `svg`- + `image`-Schema (`graphics/`) → Sankey einbettbar, `dynamicLayout`, `multiVariableText`. **Authoring-Pfade:** `@pdfme/jsx` (JSX/React-Primitive `<Document><Page><Stack>`) UND `@pdfme/converter` `md2pdf` (Markdown→Template) UND WYSIWYG-Designer ↔ deckt sich mit 4.2-Pagebuilder. Pure JS im Next.js-Runtime, kein Browser. Layout = Schema/Stack-Flow, NICHT volles CSS-Reflow. |
| **`gotenberg`** (Chromium+LibreOffice-Sidecar) — Opt-in High-Fidelity | HTML/CSS/JS → PDF, exakte Browser-Parität; zusätzlich Office→PDF/DOCX | 1.5–2 GB (chromium-only ~30% kleiner) | v8.32 (2026-04, aktiv). Wenn volles CSS-Reflow / pixelgenaue Web-Parität / Runtime-JS-Charts nötig (z.B. magazinartige Anschreiben). Fertige HTTP-API. `extraHttpHeaders` für Token-Routen, `waitForExpression` für SVG-Ready. |
| **`weasyprint`** (Python-Sidecar) — Alternative | HTML+CSS+statisches SVG → PDF | 200–400 MB | Leichter Chromium-Ersatz wenn HTML-first gewünscht, aber kein eigener Node-Client (Wrapper selbst bauen). Stärkste Paged-Media-Kontrolle. Kein JS. |
| **Browser „Print to PDF"** (Fallback) | User druckt die HTML-Share-Link-Seite | 0 | Zero-Dependency-Fallback für Minimal-Installs — der Report ist ohnehin eine HTML-Seite. |

**Empfehlung (revidiert nach pdfme-Evaluierung):** **pdfme als in-process Default** — eliminiert den Sidecar komplett (entscheidend für self-hosted Single-User, N4/N7), dynamische Tabellen+Pagination treffen den Report-Kernfall, WYSIWYG-Designer alignt mit der 4.2-Pagebuilder-Vision, reine npm-Dependency. **Gotenberg als opt-in Escape-Hatch** für Fälle die echtes CSS/HTML-Reflow, Web-Parität oder Office-Konvertierung brauchen. WeasyPrint nur falls explizit HTML-first ohne Chromium gewünscht. NICHT in-process Playwright/Puppeteer (crasht unter Memory-Druck im Next.js-Runtime). **Verbleibender Spike (klein):** pdfme-`svg`-Schema existiert — nur Sankey-Render-Fidelity am echten Output verifizieren; Fallback = echarts/satori→PNG ins `image`-Schema.

**npm-Pakete (Default-Engine + Glue):**
- **`pdfme`** (Default-PDF-Engine, in-process) — v6.0.0 (2026-04, MIT, aktiv, 4.4k★), baut auf `pdf-lib` + `fontkit`. Dynamische Tabellen + Auto-Pagination, WYSIWYG-Designer-Paket separat verfügbar.
- **`echarts`** (Sankey → statisches SVG serverseitig, SSR `renderToSVGString`, **kein DOM**, `sankey`-Series, TS-Typen) — falls pdfme-`svg`-Schema die Sankey nicht sauber rendert, via `satori`+`@resvg/resvg-js` → PNG → pdfme `image`-Schema. `d3-sankey`+`d3-node` als Pfad-Kontroll-Alternative.
- **DOCX (4.9), separater Pfad:** [`dolanmiu/docx`](https://github.com/dolanmiu/docx) (= npm `docx`, v9.7.1 2026-05, aktiv, 5.8k★, MIT) — **echte editierbare .docx** programmatisch (Tabellen, Bilder, Kopf-/Fußzeilen). Kein HTML-Input → deklarative API. `@turbodocx/html-to-docx` nur falls HTML-Reuse statt nativer Generierung gewünscht; `docxtemplater` zum Befüllen echter .docx/.xlsx-Formulare (Arbeitsagentur, 1.9).
- **`pdf-lib` Post-Processing** (Merge, Stempel, **Passwortschutz/Verschlüsselung** für Share-PDFs): den von pdfme gepflegten Fork **`@pdfme/pdf-lib`** nutzen (Upstream `pdf-lib` 4+ Jahre ohne Release) — bereits transitive Dependency via pdfme, keine zusätzliche tote Lib.
- **Gotenberg-Glue (nur falls Opt-in-Sidecar):** ⚠️ **NICHT `gotenberg-js-client`** (Snyk: vermutlich eingestellt; baut Gotenberg-6-URLs → bricht gegen v8.32). Stattdessen **eigener ~30-Zeilen `fetch`-Wrapper** über den `resilientFetch`/Cockatiel-Kernel (multipart-POST an `/forms/chromium/convert/html`).

**Doppelnutzung pdfme:** Dieselbe Default-Lib füllt via `basePdf` auch die **fixen Arbeitsagentur-PDF-Formulare** (1.9 Phase 4) — feste Koordinaten, kein Auto-Break. Eine Lib für freien Report-Flow UND Formular-Befüllung.

**Template-System (erfüllt 4.2 „Template-Management"-Anforderung direkt):** pdfme ist im Kern ein Template-System. `Template = { basePdf, schemas }` (reines JSON aus `@pdfme/common`): `basePdf` = fixer Hintergrund (leeres A4 ODER bestehendes PDF zum Überlagern), `schemas` = variable Elemente (text, table, svg, image, …) mit Position/Style. Dasselbe Template speist Editor UND Generator.
- **4 Erstellungs-Pfade:** (1) **`@pdfme/ui` `Designer`** — eingebetteter WYSIWYG-Drag-&-Drop-Editor (+ `Form` Ausfüll-UI + `Viewer` Vorschau, eigene Editor-i18n); (2) **JSON** hand-/programmatisch; (3) **`@pdfme/jsx`** `renderToTemplate` (JSX/React-Primitive); (4) **`@pdfme/converter` `md2pdf`** (Markdown→Template).
- **Generierung:** `@pdfme/generator` `generate({ template, inputs })` → PDF-Bytes, serverseitig, in-process (kein Sidecar).
- **JobSync-Integration:** Template-JSON in Prisma speichern → **per-User, versionierbar, teilbar** (dockt an `shared-surface`-Domäne 2.18.2 an). Designer = **Client-Component** (browser-only Drag-&-Drop), Generierung = **serverseitig** — saubere Trennung. Realisiert die 4.2 Manifest-Pagebuilder-Vision ohne Eigenbau-Editor.

**Klarstellung — Docling (1.18) ≠ PDF-Engine:** Docling **parst** Dokumente (PDF/DOCX → `StructuredDocument`, Verstehens-Richtung). Report-Generierung ist die **Gegenrichtung** (Daten → PDF). Null Überschneidung — Docling kann hier NICHT verwendet werden.

**Cross-Refs:** Bewerbungsbemühungen-Report (2.18.2), DOCX-Formate (4.9), Landingpages (4.7/9.5), Sidecar-Konvention (1.18 Docling, 0.9 Stufe 3 Redis), Module-Lifecycle/Manifest (0.4).

#### 4.2.2 CV-Manager-Ablösung (cv-manager-inspiriert)
Der bestehende CV-Manager (Profile-Aggregat: `Profile → Resume → ResumeSection`, Form-Card-Editor `ProfileContainer`/`ResumeTable`/`CreateResume`/`Add{Experience,Education,ContactInfo,Summary}` + AI Review/Match) ist ein **strukturierter Formular-Editor ohne Design-Templates, ohne Multi-Version-Theming, ohne ATS-Optimierung, ohne Live-Vorschau**. Ablösen durch ein template-getriebenes Erlebnis nach Vorbild [vincentmakes/cv-manager](https://github.com/vincentmakes/cv-manager) (MIT, aktiv).

**Referenz-Analyse (cv-manager, via `gh`):** Standalone Vanilla-Node/Express + better-sqlite3 + Vanilla-JS-Frontend; PDF = **Browser-Print eines HTML/CSS-Templates**. Features: Multi-CV (mehrere Versionen speichern/laden/vorschauen), editierbares Theme (eine „slicke" HTML/CSS-Vorlage), **ATS-Optimierung** (Schema.org-Markup, semantisches HTML, versteckte Keywords für Job-Site-Parser), JSON Import/Export (für LLM-Optimierung), Section-Visibility-Toggles. CV-Datenmodell (flach JSON): `profile`, `experiences[]`, `certifications[]`, `education[]`, `skills[]`, `projects[]`, `sectionVisibility{}`.

**Vorarbeit (Discovery — DONE 2026-06-14):** cv-manager nach `/projekte/cv-manager` geclont (latest `6e69dca`, v1.49.5+) und **`/understand-anything` darüber gelaufen** → Graph in `/projekte/cv-manager/.understand-anything/` (116 Nodes, 169 Edges, 9 Layer, 13-Schritt-Tour). Graph = Hypothese, gegen Code verifizieren.

**Graph-Befunde (Port-relevant):**
- **Architektur:** Express-Monolith `src/server.js` (4552 Z.) = **ZWEI Express-Apps** (admin + public), nur per Port/Listener getrennt — **KEINE echte Auth**. Frontend = Vanilla-JS-Globals (`admin.js` 6746 Z. / 263 Funktionen, `scripts.js`). → Port MUSS explizite Auth ergänzen (NextAuth + IDOR/ADR-015); Frontend komplett in React neu.
- **CV-Datenmodell** (`demo-cv-data.json`, kanonisch): `profile`, `experiences[]` (`highlights[]`, `country_code`, Datum `YYYY-MM`), `certifications[]` (`credential_id`, issue/expiry), `education[]` (Jahr), `skills[]` (Kategorien mit `icon` + nested `skills[]`), `projects[]` (`technologies[]`, `link`), `sectionVisibility`, Custom Sections; **jedes Leaf hat `visible`-Bool**. Reicher als JobSync-Resume-Schema → JSON-Resume-Mapping-Ziel.
- **13 SQLite-Tabellen; `saved_datasets`** = Multi-CV-Versionierung (UNIQUE `slug/version/language` + `version_group`) + **Diff-basiertes Copy-Section** (`diff`-Paket). = Kern-Feature, adoptieren.
- **PDF = `pdfkit`, getaggtes barrierefreies ATS-PDF** (StructTreeRoot-Accessibility-Tags) — NICHT Browser-Print. → wir ersetzen die Engine durch pdfme/Gotenberg (4.2.1), übernehmen aber die **ATS-Accessibility-Tagging-Idee**.
- **SSR** öffentliche CV-Seiten (`/v/:slug`) → mappt sauber auf Next.js Server Components. **Static-Site-ZIP-Export** (`archiver`) = CV als standalone statische Site (nice-to-have).
- **SVG-Branch-Curve-Timeline** (`computeTimelineBranches`/`renderBranchCurves`) = komplexestes Client-Subsystem, Signatur-Visual → als React-Komponente portieren.
- **8-Locale-i18n** (flat-key) → JobSync hat eigenes i18n (4 Locales), nur Keys übernehmen.

**Integrations-Strategie — NICHT als Sidecar, sondern nativ portieren (MIT erlaubt es):** cv-manager ist eine eigenständige Vanilla-Express-App mit eigener SQLite + eigenem Auth + Vanilla-Frontend. Als Container danebenstellen = zwei DBs, zwei Auth-Modelle, zwei Datenmodelle, i18n-/DSGVO-/IDOR-Bruch → verworfen. Stattdessen die **wertvollen Teile in JobSync (Next.js/Prisma/React/Shadcn) nachbauen**, als **Strangler Fig** über der bestehenden Prisma-Datenschicht (deckt sich mit der 4.2-Migrationsstrategie):
1. **Datenmodell:** cv-manager-JSON ↔ JSON Resume (4.2 adoptiert das ohnehin) ↔ bestehendes Prisma `Resume→ResumeSection`. Adapter-Schicht (ACL) mappt; Gsync-Upstream-Schema bleibt Datenschicht, `projects`/`certifications`/`sectionVisibility` via `OtherSection.jsonData`.
2. **Template + PDF (ENTSCHIEDEN: pdfme, in-process):** CV-PDF über **pdfme** (4.2.1 Default, kein Sidecar). Die „slicke" cv-manager-Vorlage wird in **pdfme nachgebaut** (Designer/`@pdfme/jsx`, NICHT 1:1-HTML-Port) — Live-Preview = pdfme `Viewer`. **Fidelity-Spike PFLICHT:** validieren, dass pdfme den gewünschten Look (Timeline-SVG, Spalten, Typo) trifft; Gotenberg/HTML-first nur Fallback, falls der Look in pdfme nicht erreichbar ist.
3. **Features übernehmen:** Multi-Version-CVs, Section-Visibility-Toggles, **ATS-Optimierung** (semantisches HTML + Keywords), JSON Import/Export, Versions-`diff` (cv-manager nutzt `diff`).
4. **UI-Ablösung:** Form-Card-Editor → template-getriebener Editor mit **Live-Vorschau** (WYSIWYG); via Strangler Fig schrittweise, bestehende Tests/Spec (`specs/profile-resume.allium`) mitziehen.
5. **Bestehendes behalten:** AI Resume Review + Job-Match bleiben; neu andocken: CV-Tailoring pro Bewerbung (Job-Aggregat), Daten fließen in Bewerber-Landingpage (9.5, gleiche CV-Daten) + Public API (7.1).
6. **AI-Matching + PII-Stripping (PFLICHT, reuse bestehende Infra):** Die AI-Matching-Möglichkeiten (Resume↔Job-Match, Review) bleiben für portierte CVs erhalten. **Vor jedem Cloud-AI-Transfer** werden Personendaten über das bestehende `src/lib/pii` redaktiert (`redactContact`/`scrubFreeText`, `@invariant CloudTransferDataMinimization` in `specs/ai-provider.allium`) — Name/Email/Telefon/Adresse → Platzhalter. Volle Fidelity nur lokal (Ollama); Cloud (OpenAI/DeepSeek) immer gestrippt (fail-safe). Gilt auch für neue Match-Pfade auf CV-Versionen.
7. **Profil-Auto-Fill mit Override:** Eine neue CV/Version übernimmt die Personendaten **automatisch aus dem Profile-Aggregat** (`ContactInfo`: firstName/lastName/headline/email/phone/address), **pro CV editierbar/überschreibbar** (Override-Layer auf CV-Ebene — ändert NICHT das zentrale Profil). Default = Profildaten, User kann pro CV abweichen (z.B. andere Telefonnummer/Headline je Bewerbung).

**Engine-Wahl pro Dokumenttyp (Konsequenz 4.2.1):**

| Dokumenttyp | Engine | Grund |
|---|---|---|
| Design-reiches CV / Anschreiben | **pdfme (in-process)** — ENTSCHIEDEN | kein Sidecar; Template in pdfme nachgebaut (Fidelity-Spike). Gotenberg nur Fallback falls Look nicht erreichbar. |
| Bewerbungsbemühungen-Report, Formulare | **pdfme (in-process)** | Tabellen/Pagination, kein Sidecar |
| DOCX-Varianten | `dolanmiu/docx` | echte .docx |

**Entschieden:** ATS-„hidden keywords" werden **übernommen** (kein DSGVO-/Ehrlichkeits-Blocker) — ATS/AI-Systeme verarbeiten versteckte/strukturierte Keywords besser als Plain-Text; das ist gewollte ATS-Optimierung, kein Cloaking gegen den Leser.

**Offene Fragen:** (a) Multi-Template (mehrere Designs) oder zunächst eine portierte Vorlage? (b) Lizenz-Attribution für portierten cv-manager-Code (MIT-Notice beilegen).

**Port-Mapping (cv-manager → JobSync, via JobSync `/understand-anything`-Graph + Prisma-Ground-Truth):**

| cv-manager-Teil | JobSync-Ziel | Reuse / Neu |
|---|---|---|
| CV-Datenmodell (flach, `visible`, skills+icon, projects, versioning) | `Profile→Resume→ResumeSection→{ContactInfo,Summary,WorkExperience[],Education[],LicenseOrCertification[],OtherSection[]}` (`prisma/schema.prisma`) | **Mismatch** — JobSync ist **entity-normalisiert** (WorkExperience→`Company`/`JobTitle`/`Location` FKs, geteilt mit Job-Aggregat); cv-manager ist flach/self-contained. Strangler Fig: Datenschicht behalten, **fehlende Felder ergänzen** (`visible`, skills+icon, projects) via Schema-Erweiterung bzw. `OtherSection.jsonData`. |
| Multi-CV-Versionierung (`saved_datasets`) + Section-Diff (`diff`) | — (existiert NICHT) | **Neu:** Prisma-Modell(e) für CV-Versionen + Version-Group + Diff. Andockbar an `shared-surface` (2.18.2). |
| PDF (`pdfkit`, ATS-getaggt) | `DocumentRenderingConnector` (4.2.1) — `src/lib/connector/{manifest,registry,register-all,resilience}.ts` | Engine ersetzt durch **pdfme** (in-process, entschieden; Gotenberg nur Fallback), ATS-Accessibility-Tagging-Idee übernehmen. |
| Keine Auth (dual Express, Port-Trennung) | `src/auth.ts`, `src/lib/auth/*`, `with-api-auth.ts`, ADR-015 IDOR | **Reuse** — JobSync löst das bereits; Port erbt Auth/IDOR automatisch. |
| SSR öffentliche CV-Seite (`/v/:slug`) | `shared-surface` (2.18.2) Renderer `applicant-landingpage` (= 9.5) + Next.js Server Component | **Neu, aber konvergent** mit 9.5 — eine CV-Datenquelle → PDF + öffentliche Seite + Landingpage. |
| Static-Site-ZIP-Export (`archiver`) | `src/lib/export/*` (nutzt bereits archiver-Muster, `collect-user-data.ts`, `export-rate-limit.ts`) | **Reuse** Export-Infra. |
| Vanilla-JS-Editor (`admin.js` 263 fns) + SVG-Timeline | `src/components/profile/*` (React/Shadcn), neue Timeline-Komponente | **Neu** — komplett React-Rebuild; Timeline als eigene Komponente. |
| 8-Locale flat-key i18n | `src/i18n/*` (4 Locales, adapter pattern) | Keys übernehmen, JobSync-i18n-System nutzen. |

**Entschieden (2026-06-14):**
- **CV-PDF-Engine:** **pdfme (in-process)** — kein Sidecar; cv-manager-Look in pdfme nachgebaut (Fidelity-Spike). Gotenberg nur Fallback. (Q4)
- **Öffentliche CV-Seite = 9.5:** **konvergieren** — EINE Implementierung. Gleiche CV-Datenquelle → PDF + öffentliche CV-Seite + Reverse-Funnel-Landingpage (9.5), alles über den `shared-surface`-Renderer (2.18.2). Keine Doppellösung. (Q5)
- **Datenmodell (Spike A DONE 2026-06-14, `docs/design/cv-port-spike-a-datamodel.md`):** **Document-first** — kanonisches CV-Modell = **JSON Resume** (+ `x-jobsync-*` Extensions für `visible`/icon/layout/custom-sections), NICHT das normalisierte Gsync-Schema (dem fehlt ~die Hälfte: skills, projects, visibility, versioning, highlights[], zentrale Identität). **Entity-Links optional**: Experience trägt denormalisiert `company_name`/`location`/`highlights[]` PLUS optionale nullable `companyId`/`locationId` als Post-hoc-Annotation (Job↔CV-Traceability + Dedup), nicht als Speichermodell. (Q1 + Q3 gelöst)

**Spike-Backlog:**
- **Spike A — Datenmodell-Mapping — ✅ DONE.** Ergebnis: document-first JSON Resume + optionale Entity-Links + JSON-Snapshot-Versionierung. 2 Kern-Befunde: (F1) cv-managers Versionierung = **Full-CV-JSON-Snapshot** (`saved_datasets.data`) → umgeht das „geteilte mutable Entity"-Snapshot-Problem; (F2) JobSync hat **keine zentrale Identität** (Name/Email/Telefon liegen per-Resume in `ContactInfo`, nicht in `Profile`) → Auto-Fill (Schritt 7) braucht zuerst kanonische Identität auf `Profile`. Details: `docs/design/cv-port-spike-a-datamodel.md`.
- **Spike B — pdfme-Template-Fidelity — ✅ DONE (GO).** Lauffähiger Prototyp (`@pdfme/generator` v6) rendert CV-Template (text + multiVariableText + **SVG-Branch-Curve-Timeline** + mehrseitige Tabelle) **in-process** zu validem 2-seitigem A4-PDF. Befunde: (1) **Object-`basePdf`** `{width,height,padding}` PFLICHT für Pagination (BLANK/custom-PDF deaktiviert Page-Breaks); (2) Templates über **`@pdfme/ui` Designer** authoren (Style-Defaults — Roh-JSON crasht); (3) Timeline = **SVG-Embed** (wir generieren das SVG serverseitig, wie Sankey) → Fidelity = unser SVG, kein pdfme-Limit; (4) **Inter-Font registrieren** (fontkit) für Typo; (5) Layout = Koordinaten/Stack, NICHT CSS-Flow → **Rebuild** statt 1:1-HTML-Port. Verdict GO, Gotenberg bleibt Fallback. Details: `docs/design/cv-port-spike-b-pdfme-fidelity.md`.

**Resultierendes Zielmodell (aus Spike A):**
- Neues Prisma-Modell **`CvDocument { id, userId, data Json (JSON Resume), versionGroup, languageGroup, slug?, isPublic, isDefault, createdAt }`** — Full-Snapshot pro Version/Sprache (Versionierung = tiefe JSON-Kopie, F1).
- **`Profile` um kanonische Identität erweitern** (name, email, phone, headline, photo, languages) als Auto-Fill-Quelle (F2); jedes `CvDocument` snapshottet sie nach `data.basics` mit Per-CV-Override (Schritt 7), ohne `Profile` zu mutieren.
- **Gsync `Resume/ResumeSection/*` Tabellen behalten** (Backward-Compat + Migrations-Import); neuer Builder arbeitet auf `CvDocument`; Adapter importiert Legacy-Resume → JSON Resume beim ersten Edit. AI-Match/Review (PII-gestrippt) läuft auf `CvDocument.data`.

**Offene Port-Fragen (Rest):**
1. **`x-jobsync-*` Extension-Schema** exakt definieren (visible/icon/layout/custom-sections); Legacy-Import-Adapter-Detail; Diff-Granularität (Document vs. Section).
2. **Migrations-Scope:** Strangler Fig — welche Sektion zuerst (Vorschlag: Identität/`Profile` + ContactInfo→basics), Big-Bang vermeiden. `specs/profile-resume.allium` mitziehen.
3. **Skills/Projects auch in 4.1 Skillsets** surfacen (geteiltes Skill-Modell) oder CV-lokal?
4. **AI/ATS:** cv-managers „JSON-Export für LLM-Optimierung" + ATS-Optimierung als neue AI-Enrichment-Dimension auf der bestehenden Resume-AI (Review/Match)?

**Allium-Spec (DRAFT 2026-06-14):** `specs/cv-document.allium` — CvDocument-Aggregat via `allium:elicit` erstellt (0 Errors, `allium check` grün; gleiches Maturity-Profil wie `profile-resume.allium`). Entschieden in der Session: **Lifecycle = mutable Working-Doc + explizite Save-Version-Snapshots** (cv-manager-Stil, niedrige Edit-Friktion); **Public CV = beide Modi** (`shared_link` über shared-surface + `public_slug`), wobei `public_slug` **über die Website-/Bewerber-Landingpage-Surface (9.5) gerendert** wird (Invariante `PublicCvRendersViaWebsiteSurface`) — eine CV-Datenquelle → PDF + Share-Link + öffentliche Website-Seite. Versionen immutable (`SavedVersionsImmutable`), Cloud-AI immer PII-gestrippt (`CloudAiAlwaysRedacted`), Exposure stets widerrufbar (`ExposureAlwaysReversible`). **6 Open Questions gelöst (2026-06-14):** Diff = Section-Copy + Item-Diff-View (cherry-pick deferred); `x-jobsync-*` = published JSON Schema, am Edit/Import-Boundary validiert (`ExtensionDataValidated`); Legacy-Import = lazy + one-way, danach frozen (`ImportLegacyResume`, `LegacyImportIsOneWay`); Skills/Projects = CV-local in `data`, 4.1-Import optional/future (`SkillsAndProjectsAreCvLocal`); Slug = global-unique `/cv/{slug}`, Link-Modus via unguessable Token (`SlugGloballyUnique`); Retention = First-Party, kein Auto-Expiry, nur explizites Delete (`DeleteCvDocument`, `FirstPartyRetentionNoAutoExpiry`). Verbleibend (Implementierung): x-jobsync-Schema-Authoring-Quelle, `from_legacy`-Mapping-Fidelity.

**Cross-Refs:** Document Rendering Engine (4.2.1), Dokumenten-Generatoren/JSON-Resume-Pagebuilder (4.2), Skillsets (4.1), Bewerber-Landingpage (9.5), Public API (7.1), AI Review/Match (bestehende Resume-AI), PII-Egress-Redaktion (`src/lib/pii`, `CloudTransferDataMinimization`), Profile-Auto-Fill (`ContactInfo`), Profile-Spec (`specs/profile-resume.allium`), CvDocument-Spec (`specs/cv-document.allium`), shared-surface (2.18.2).

### 4.3 Output-Struktur (Paperless-ngx Style) & Dateinamens-Konvention
Dynamische Dateipfade und Dateinamen für generierte/exportierte Dokumente (CV, Anschreiben, Report, …).

**Ordnerstruktur (Paperless-ngx Style):** `<Unternehmen>/<LANG>/<Jobtitel>/`

**Dateinamens-Konvention:**
- **Schema:** `{Nachname}_{Vorname}_{DocType}_{LANG}[_{Unternehmen}][_v{Version}].{ext}`
  - Beispiel: `Chen_Marcus_CV_EN_SwissBank_v3.pdf`, `Chen_Marcus_CoverLetter_DE_SwissBank.pdf`
- **`DocType`-Token (sprach-UNABHÄNGIG, stabil):** `CV` | `CoverLetter` | `Motivation` | `Portfolio` | `Report` | `TitlePage` — fester ASCII-Token, **NICHT lokalisiert** (sonst bekäme dasselbe Dokument je UI-Sprache einen anderen Dateinamen → Sync/Dedup bricht). Der Anzeige-Label in der UI darf lokalisiert sein (DE „Anschreiben", EN „Cover Letter"). Mappt 1:1 auf `cv-document.allium` enum `DocType` (`cv`→`CV`, `cover_letter`→`CoverLetter`, …).
- **`LANG`:** ISO 639-1 Großbuchstaben (`EN`/`DE`/`FR`/`ES`) = **Inhaltssprache** des Dokuments (≠ UI-Sprache); **immer im Dateinamen** (Multi-Language-Bewerbung, 4.2 / cv-document.allium `language`).
- **Bewerbungs-Bundle:** CV + Anschreiben + Anhänge einer Bewerbung teilen `{Nachname}_{Vorname}` (+ `{Unternehmen}`) und unterscheiden sich nur per `DocType` + `LANG` — gemeinsamer Paperless-Ordner `<Unternehmen>/<LANG>/<Jobtitel>/`.
- **`{Unternehmen}` / `{Version}` optional:** Unternehmen wenn job-/firmenspezifisch getailort; `v{n}` wenn aus einer benannten CvDocument-Version (≠ Default-Arbeitsdokument).
- **Paperless-Datums-Variante** (Ablage/Sync, 1.6): Prefix `YYYY-MM-DD ` → `2026-06-14 Chen_Marcus_CV_EN_SwissBank.pdf`.
- **Sanitisierung (PFLICHT):** ASCII-transliteriert (ä→ae, é→e), Leerzeichen→`_`, Sonderzeichen entfernt, Längen-Cap — cross-OS-/Netzwerk-Mount-sicher (Ordner-Sync 1.6, File Explorer). **Dateiname = ASCII-safe; Anzeigename darf lokalisiert sein.**
- **Öffentliche CV-URL** (kein Dateiname): `/cv/{slug}` — slug über die Sprachen einer language_group geteilt, Sprachumschalter (`?lang=` o.ä.), siehe `cv-document.allium` `SlugScopedToLanguageGroup`.
- **Konfigurierbar:** Schema-Template in Settings überschreibbar (Platzhalter-Tokens), Default wie oben.

**Cross-Ref:** Dokumenten-Generatoren (4.2), CvDocument (4.2.2 / `cv-document.allium`), Dokumentenworkflow/Paperless (1.6), Multi-Language (4.2).

### 4.4 Unterschrift
- Upload einer bestehenden Unterschrift (Bild/SVG)
- Zeicheneingabe direkt in der App (Canvas/Touch)
- Automatische Platzierung in Bewerbungsunterlagen (Anschreiben, CV)
- Automatisierte Unterschriftenerstellung (Name → Schrift-Rendering)

### 4.5 Automatisches Datum
- Aktuelles Datum wird automatisch in Bewerbungsunterlagen eingefügt
- Lokalisiertes Format je nach Zielland (z.B. "23. März 2026" für DE, "March 23, 2026" für EN)

### 4.6 Video-Vorstellung
- Bewerber können ein kurzes Vorstellungsvideo aufnehmen (WebRTC/MediaRecorder) oder hochladen
- Einbettbar in Bewerbungsunterlagen als QR-Code/Link
- Optional: KI-gestützte Transkription und Zusammenfassung (→ AI Provider Connector: Whisper/Speech-to-Text als neues AI-Modul)
- **Abhängigkeiten (4.6 braucht):**
  - Datei-Management (→ 2.8) für Video-Upload, Organisation, Löschung
  - Public API (→ 7.1) für öffentliche Video-URLs / Streaming-Endpoint
  - DSGVO (→ 6.1) — Video enthält biometrische Daten (Gesicht, Stimme) → stärkere Consent-Anforderungen als Text. Passwortschutz + Expiring Links erforderlich.
- **Consumer (4.6 fließt in):**
  - Bewerber-Landingpage (→ 9.5) — Video als Hook-Element ("Hallo, ich bin {Name}" + Video)
  - Landingpage für Unternehmen (→ 4.7) — Video eingebettet (bereits referenziert)
  - Social Proof (→ 4.10) — Video-Testimonials, Empfehlungen als Video-Format
  - Portfolio / Arbeitsproben (→ 4.11) — Video als Portfolio-Item-Typ (Design-Walkthroughs, Code-Demos, Präsentationen)
  - Manifest-Engine (→ 4.2) — `type: "video"` als Feld-Typ im JSON Schema → QR-Code/Link in generierten CVs und E-Mails (5. Rendering-Kontext)
  - Communication Connector (→ 1.12) — Video-Link in Bewerbungs-E-Mails auto-attached
  - Onboarding (→ 2.1) — Video-Aufnahme als Onboarding-Schritt ("Nimm dein Vorstellungsvideo auf")
- **Video-Storage (3 Strategien, User wählt in Settings):**
  - **Strategie A: Embed/Externer Anbieter (einfachste, empfohlen als Default):** User hostet Video extern (YouTube No-Cookie `youtube-nocookie.com/embed/`, Vimeo Private, Loom) und fügt URL ein. JobSync speichert nur die Embed-URL. Kein eigener Storage nötig, kein Encoding, kein Streaming. DSGVO: YouTube No-Cookie setzt keine Tracking-Cookies vor Play — aber Datenschutzerklärung muss YouTube/Google als Drittanbieter listen (→ 6.1 automatische DSE-Aktualisierung bei Modul-Aktivierung).
  - **Strategie B: Object Storage (Self-Hosted):** S3-kompatibel / MinIO für Self-Hosted. Videos (50-500MB) als Blobs. Range-Request-Streaming über Public API (→ 7.1). Braucht FFmpeg für WebM→MP4 Encoding.
  - **Strategie C: Hybrid:** Embed für große Videos, lokaler Upload für kurze Clips (<30s, <10MB). Lokale Clips via Datei-Management (→ 2.8).
  - **Empfehlung (Nachhaltigkeitsprinzip):** Strategie A als Default (zero Infrastruktur). Strategie B als optionale Erweiterung für Self-Hosted-User die keine externen Dienste nutzen wollen. Strategie C als Kompromiss.

### 4.7 Landingpage für Unternehmen
- Personalisierte Bewerber-Landingpage pro Bewerbung
- Enthält: Video-Vorstellung, CV, Portfolio, Skills, Kontaktdaten
- Teilbar per Link oder QR-Code
- Tracking: Aufrufe, Verweildauer (optional, erfordert Public API → 7.1)
- **DSGVO:** Öffentliche Seite mit personenbezogenen Daten → Datenschutzhinweis erforderlich, Passwortschutz/Expiring Links (→ 6.1)
- **Shared Surface:** Link/Passwort/Ablauf/Widerruf/Audit über die gemeinsame `shared-surface`-Domäne (→ 2.18.2) — Renderer-Typ `company-landingpage`. Keine eigene Insellösung.

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

### 4.10 Social Proof & Empfehlungen
- **LinkedIn-Empfehlungen:** Import von Recommendations/Endorsements (via LinkedIn Data Export → 3.5 / 9.2)
- **Testimonials:** Manuelle Eingabe von Referenzen (Name, Position, Firma, Zitat, Beziehung)
- **Zertifikate & Badges:** Upload + Verlinkung (Coursera, AWS, Google, etc.)
- **GitHub/GitLab Stats:** Automatischer Import von Contributions, Top-Repos, Sprachen (via Public API)
- **Anzeige:** Im Profil, in generierten CVs (→ 4.2), auf der Bewerber-Landingpage (→ 9.5)
- **Cross-Ref:** Data Enrichment (1.13) für automatischen Import, LinkedIn-Machbarkeit (9.2)

### 4.11 Portfolio / Arbeitsproben-Mappe
- Sammlung von Arbeitsbeispielen, Projekten und Designarbeiten
- **Typen:** Designmappe, Code-Projekte, Studienarbeiten, Publikationen, Case Studies
- **Pro Eintrag:** Titel, Beschreibung, Zeitraum, Tags/Skills, Medien (Bilder, PDFs, Links)
- **Kategorisierung:** Nach Typ (Design, Development, Research, etc.) und nach Skill-Tags (→ 4.1)
- **Verknüpfung:** Arbeitsproben können mit Jobs verknüpft werden ("Dieses Projekt ist relevant für Stelle X")
- **LLM-Integration:** Automatische Zusammenfassung und Relevanz-Scoring pro Stellenanzeige
- **Export:** Als PDF-Mappe, als Sektion im generierten CV (→ 4.2), auf Bewerber-Landingpage (→ 9.5)
- **Cross-Ref:** Dateiexplorer (2.8) für Medien-Management, Skillsets (4.1) für Tag-Verknüpfung

---

## 5. CRM

### 5.1 Kommunikation (→ Communication Connector 1.12)
- Nutzt den Communication Connector mit Modulen E-Mail und PBX
- CRM-spezifische Features: Kontakt-Zuordnung, Gesprächsnotizen, Follow-Up-Tracking

### 5.2 Kalender (→ Kalender Connector 1.7)
- Nutzt den Kalender Connector mit Modulen CalDAV, Google Kalender, Outlook
- Interviews, Follow-Ups automatisch eintragen
- **Feiertags-Integration:** Holiday Reference Module (→ 1.22) liefert länderspezifische Feiertage für Kalender-View
- **CRM Availability Composition:** Kombiniert Holiday-Daten mit Company Closures + Personal Absences für "Ist der Kontakt heute erreichbar?"-Abfragen

### 5.3 Job Status Workflow -- DONE (Sprint C5)
**Implementiert (2026-04-02):**
- Allium Spec: `specs/crm-workflow.allium` (643 Zeilen, 9 Regeln, 7 Invarianten)
- State Machine: 7 Status (bookmarked, applied, interview, offer, accepted, rejected, archived) mit validierten Transitions
- JobStatusHistory: Append-Only Audit-Log für Status-Änderungen mit optionalen Notizen
- Domain Event: `JobStatusChanged` für Notification- und Timeline-Consumer
- Side Effects: applied-Flag + appliedDate automatisch bei Transition zu "applied"/"interview"
- 5 Server Actions: changeJobStatus, getKanbanBoard, updateKanbanOrder, getJobStatusHistory, getStatusDistribution
- Cross-Dependencies vorbereitet: Hooks für 5.4 (Reminders), 5.9 (Timeline), 2.20 (Spotlight), 9.5 (Landingpage)

- **Abgrenzung zu Vacancy Pipeline (→ 0.5):** Pipeline endet bei Promotion (StagedVacancy → Job). Der Job Status Workflow beginnt dort — er ist der **Tracking-Lifecycle** nach der Inbox. CRM erweitert diesen Workflow um Kontakt-Zuordnung, Follow-Up-Automatisierung und Kalender-Events.

### 5.4 Automatisierung & Reminders (→ Notification-Rules in 0.6) -- DONE (S3 CRM Core)
**Implementiert (2026-05-10):**
- CRM Task entity mit Status-Machine (pending/in_progress/done/cancelled)
- Polymorphic TaskTarget (Job/Person/Company) mit ExactlyOneTarget-Invariant
- 4 Server Actions: createCrmTask, startCrmTask, completeCrmTask, cancelCrmTask
- TaskBoard UI (/dashboard/crm-tasks) mit Status-Gruppierung + Overdue-Badges
- Domain Events: CrmTaskCreated, CrmTaskCompleted
- Notification Types vorbereitet: follow_up_due
- CRM Cron (`src/lib/scheduler/crm-cron.ts`): 3 Temporal-Rules implementiert (ExpireAutoCreatedPersons, InterviewReminder, TaskOverdueReminder) — idempotent via Activity-Log-Check, 15-Min-Intervall, gestartet in `instrumentation.ts`

### 5.4 Automatisierung & Reminders — ORIGINAL
- CRM-Reminders werden als Notification-Rules im Unified Notification System (→ 0.6) implementiert
- Automatisierte Follow-Ups (Erinnerungen, Nachfass-E-Mails)
- Automatisierte Terminvereinbarungen
- **Reminder/Notification-System:** Allgemeine Erinnerungen für Deadlines, Interview-Termine, Nachfass-Fristen
  - In-App Notifications (Bell-Icon, Dashboard-Widget)
  - Optional: Push (Browser), E-Mail (→ Communication Connector 1.12)
  - Cross-Ref: Job-Alerts (→ 1.5) für Job-Discovery-Notifications

### 5.5 Kontaktmanagement -- DONE (S3 CRM Core)
**Implementiert (2026-05-10):**
- Allium Spec: `specs/crm.allium` (1074 Zeilen, 9 Entities, 18 Rules, 4 Invariants, 6 Surfaces)
- Person Entity: Neues Aggregate (unabhängig von Job), FullName, TypedEmail[], TypedPhone[], Address
- GDPR-Felder: data_source, processing_basis, retention_expires_at (Art. 6/17 DSGVO)
- 7 Person Server Actions: Create, Read, Update, Archive, Reactivate, Anonymize, Merge
- PersonDirectory UI (/dashboard/contacts) mit Suche, Filter, Paginierung
- PersonDetail UI (/dashboard/contacts/[id]) mit 5 Tabs (Übersicht, Interviews, Aufgaben, Notizen, Timeline)
- CRM Note Entity mit polymorphem NoteTarget (Job/Person/Company)
- CRM Blocklist Entity (Email/Phone/Domain Suppression)
- ActivityTimeline: Materialisiertes Read-Model aus Domain Events, 15 Activity-Types
- 9 Domain Events, 4 Notification Types, CRM Activity Logger Consumer
- i18n: crm.ts Namespace (~160 Keys × 4 Locales)
- Navigation: 3 CRM-Links im Sidebar (Contacts, Interviews, CRM Tasks)

**Offen:**
- **Rollen-Badges auf Person:** Visuelles Badge/Color-Coding für Kontaktperson-Rollen (Recruiter, HR, Hiring Manager, Referral, etc.). Darstellung als farbiges Badge auf dem Profilbild (LinkedIn-Stil). Datenmodell: `role` Feld auf `JobContact` existiert bereits — Badge wird aus der primären Rolle der Person abgeleitet. UI: Avatar-Overlay mit Rollenfarbe + Tooltip. Braucht: Design-Entscheidung für Farbpalette + Badge-Platzierung.

### 5.5 Dateiexplorer-Integration
- CRM ist direkt mit dem Dateiexplorer (Sektion 2.8) verbunden
- Bewerbungsunterlagen, E-Mails, Notizen und Anhänge pro Kontakt/Job sichtbar
- Drag & Drop von Dateien in CRM-Einträge
- Automatische Zuordnung von generierten Dokumenten (CV, Anschreiben) zum jeweiligen Job/Kontakt
- Cross-Ref: Dokumentenworkflow Connector (→ 1.6) für Paperless-ngx Synchronisation

### 5.6 Backlog (Visualisierung) -- DONE (Sprint C5)
**Implementiert (2026-04-02):**
- Kanban Board mit @dnd-kit Drag-and-Drop (Spalten: Bookmarked, Applied, Interview, Offer, Accepted, Rejected, Archived)
- Mobile Tab-View unter 768px
- Column Collapse (Rejected + Archived standardmäßig eingeklappt)
- Float-basiertes sortOrder für Spalten-Reihenfolge
- ViewModeToggle: Kanban ↔ Table View, Präferenz in localStorage
- Status-Transition-Dialog mit optionaler Notiz
- Undo-Toast (5s) für Status-Änderungen
- Loading/Empty/Error States, Keyboard Navigation, Dark Mode, motion-reduce
- 7 React-Komponenten: KanbanBoard, KanbanColumn, KanbanCard, StatusTransitionDialog, KanbanEmptyState, KanbanViewModeToggle, index barrel

- Kanban-Board als **UI-View** über den Job Status Workflow (→ 5.3) — keine eigene Entität
- Priorisierung und Sortierung nach Deadline, Match-Score
- Verknüpfung mit Kalender (Deadlines) und Automatisierung (Follow-Ups) — offen für 5.2/5.4

### 5.7 Kontakt- & Unternehmens-Extraktion (→ Data Enrichment Connector 1.13)
- Nutzt das NLP-Extraktor Modul des Data Enrichment Connectors
- Automatische Extraktion von Unternehmen, Kontaktpersonen und Ansprechpartnern aus:
  - Jobbeschreibungen (NLP/Regex: "Ansprechpartner: ...", "Kontakt: ...")
  - E-Mails (Signaturen parsen)
  - Websites (Impressum, Team-Seiten)
- Automatische Zuordnung zum CRM-Datensatz (Job → Unternehmen → Kontakt)
- Dublettenprüfung: gleicher Kontakt bei verschiedenen Jobs erkennen
- Anreicherung: LinkedIn-Profil, XING, Unternehmenswebsite verknüpfen
- **Profil-URL Auto-Fill:** Im "Add Contact"-Modal eine Profil-URL (LinkedIn, XING, etc.) einfügen → Kontaktdaten automatisch ausfüllen (Name, Position, Unternehmen, Profilbild). Nutzt Web-Scraping/Meta-Parser oder Platform-APIs. UX: URL-Feld oben im Formular, "Auto-Fill" Button, progressive Enhancement (Felder manuell editierbar nach Auto-Fill).
- **Multi-Social-Network auf Person:** Person-Entity um `socialProfiles: List<SocialProfile>` erweitern (value object: `{ platform: linkedin | xing | github | twitter | other, url: String }`). Aktuell nur `linkedinUrl: String?` — zu eng. PersonForm bekommt eine dynamische Social-Links-Liste (Platform-Dropdown + URL-Input, beliebig viele). Erlaubt auch späteres Matching: "Ist dieser LinkedIn-Kontakt derselbe wie der XING-Kontakt?"

### 5.8 Interview Tracking -- DONE (S3 CRM Core)
**Implementiert (2026-05-10):**
- CrmInterview Entity mit Status-Machine (scheduled/completed/cancelled/rescheduled)
- Outcome Tracking (pending/passed/rejected/waitlisted)
- Job + Person Verknüpfung
- 5 Server Actions: scheduleInterview, completeInterview, cancelInterview, rescheduleInterview, getInterviews
- InterviewCalendar UI (/dashboard/interviews) mit Upcoming/Past Gruppierung
- Domain Events: InterviewScheduled, InterviewCompleted
- Notification Types: interview_scheduled, interview_reminder
- ActivityLog Einträge für scheduled/completed

### 5.8 Import/Export
- **Import:** Kontakte aus LinkedIn, XING, vCard, CSV importieren — kritisch für CRM-Bootstrapping
- **Export:** Jobs, Kontakte, Bewerbungsdaten als CSV/JSON für Reporting und Backup
- Cross-Ref: DSGVO Datenportabilität Art. 20 (→ 6.1)

### 5.9 Timeline / Activity Log -- PARTIAL (S3 CRM Core)
**Backend implementiert (2026-05-10):**
- CrmActivityLog: Immutable, append-only Read-Model (materialisierte Projektion aus Domain Events)
- CRM Activity Logger Consumer (`src/lib/events/consumers/crm-activity-logger.ts`): abonniert JobStatusChanged, ContactCreated, ContactUpdated
- 15 Activity-Types, filterbar nach Typ und Datum
- CRM Cron Temporal-Rules projizieren ebenfalls in Activity Log (Retention-Expiry, Interview-Reminder, Task-Overdue)
- Architektur-Entscheidung: Audit-Log statt Event Sourcing (kein Event Store, Prisma-Entities bleiben Source of Truth)

**PersonTimeline UI implementiert:**
- PersonDetail Tab "Timeline" (`/dashboard/contacts/[id]`) — zeigt alle Activities für eine Person

**Offen:**
- CompanyTimeline UI — Timeline-Surface pro Unternehmen (analog zu PersonTimeline)
- JobTimeline UI — Timeline-Surface pro Job (analog zu PersonTimeline)

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
- **GDPR Self-Service für Kontaktpersonen (→ 9.5 Landingpage, → 5.5 CRM):**
  - Vorbereitend auf personalisierte Bewerber-Landingpage (9.5): Kontaktpersonen (Recruiter, HR, Hiring Manager) deren Daten im CRM verarbeitet werden, bekommen einen sicheren Self-Service-Zugang
  - **Datenauskunft (Art. 15):** Kontaktperson kann über einen authentifizierten Link einsehen, welche Daten über sie gespeichert sind (Name, Email, Rolle, Timeline-Einträge)
  - **Löschung (Art. 17):** Kontaktperson kann Löschung ihrer Daten anfordern → löst `anonymizePerson()` Cascade aus
  - **Absicherung:** Token-basierter Zugang (kein Account nötig), Rate-Limited, zeitlich begrenzt, Audit-geloggt
  - **Voraussetzung:** Communication Connector (1.12) für E-Mail-Versand des Self-Service-Links
  - **Cross-Ref:** crm-gdpr.allium DataSubjectRequest Entity (bereits spezifiziert, nicht implementiert)
- **Consent-by-Referral für Drittdaten-Verarbeitung (→ 9.5 Landingpage):**
  - Wenn der Bewerber aktiv auf HRler/Recruiter zugeht und deren Daten (Name, Position, Firma) für personalisierte Ansprache verarbeiten will, ist je nach Land eine Einwilligung nötig (DSGVO Art. 6(1)(a))
  - **Mechanismus: Consent-Referral-Link**
    - Bewerber sendet einen personalisierten Ref-Link an den HR-Kontakt (z.B. via LinkedIn-Nachricht, E-Mail)
    - Der Link enthält einen kurzen Hinweis: "Wenn du den Link klickst, erklärst du dich einverstanden mit der Verarbeitung deines Namens für die persönliche Anrede. [Link zur Datenschutzerklärung]"
    - Klick auf den Ref-Link = Consent (Art. 7 DSGVO: eindeutige bestätigende Handlung)
    - Ref-Link triggert eine Automation: Daten werden geladen (Name, Position aus UTM-Params oder LinkedIn-Profil), Landingpage wird personalisiert
    - Consent wird protokolliert (Zeitstempel, IP, Scope) für Nachweispflicht (Art. 7(1))
  - **Datenminimierung:** Nur die im Consent genannten Datenpunkte verarbeiten — nicht mehr
  - **Widerruf:** Jederzeit möglich über Link in der Datenschutzerklärung → Daten werden gelöscht, Landingpage depersonalisiert
  - **Länderspezifisch:** Consent-Text muss lokalisiert und an landesspezifische Anforderungen angepasst sein (DE: DSGVO strikt, US: weniger Consent nötig, UK: UK-GDPR)
  - **Cross-Ref:** Bewerber-Landingpage (9.5), Data Enrichment (1.13), Communication Connector (1.12)
- **Legal Review:** DSGVO-Konformität der gesamten Pipeline (0.5) + Dedup-Hashing + Module-Datenschutz + Consent-Referral-Mechanismus mit Legal-Agent überprüfen

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
- **JobDeck (→ 2.7):** Swipe-UI ist inhärent visuell. Screen-Reader brauchen List-View Alternative mit expliziten Buttons. Toggle: "Card View" vs. "List View".
- **Bestehende Basis:** Shadcn UI / Radix bietet gute a11y-Foundation. `specs/ui-combobox-keyboard.allium` hat bereits `@guarantee AccessibleKeyboardNavigation` — dieses Pattern auf alle Surfaces anwenden.

---

## 7. API & Dokumentation

### 7.1 Public API (REST — Open Host Service) -- Phase 1 DONE (Sprint C)
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

### 8.0 Teststrategie-Redesign (PRIORITÄT)
Vollständiges Redesign der Teststrategie nach ISTQB-Foundation-Prinzipien. Ziel: Weniger E2E Tests, mehr Property-Based und Integrationstests, schnelleres Feedback, bessere Defekt-Lokalisierung.

**Ist-Zustand:**
- 2606+ Unit/Component Tests (Jest + Testing Library)
- 79+ E2E Tests (Playwright + Chromium)
- 8 axe-core Accessibility Tests
- E2E Tests sind langsam (~3-5 Min), flaky (ECONNRESET-History), resource-intensiv (Chromium)
- Keine Property-Based Tests, keine Integrationstests mit echtem DB-Layer

**Neue Test-Pyramide (ISTQB-orientiert):**

| Ebene | Tool | Was | Ziel-Anteil |
|-------|------|-----|-------------|
| **Property-Based** | `fast-check` | Äquivalenzklassen, Grenzwertanalyse, Invarianten (z.B. State Machine Transitions, ActionResult Contracts, i18n Key-Completeness) | ~15% |
| **Unit** | Jest + Testing Library | Reine Funktionen, Hooks, Utilities, Formatters — bestehende Tests bleiben | ~40% |
| **Integration** | Jest + `testcontainers` | Server Actions gegen echte SQLite-DB (nicht gemockt), Prisma Queries, IDOR-Ownership, Cascade Deletes | ~25% |
| **Schnittstelle (Contract)** | Jest + Supertest/MSW | API v1 Endpoints, Webhook HMAC-Verification, SSE Contracts, Server Action Request/Response Shapes | ~10% |
| **E2E (Smoke)** | Playwright | NUR kritische User Flows (~15-20 Tests): Login, Job CRUD, Automation Wizard, Kanban DnD, Staging Promotion | ~10% |

**Property-Based Testing mit fast-check:**
- **Äquivalenzklassen:** State Machine (alle validen Transitions), ActionResult (success/error Shapes), NotificationType (alle Enum-Werte dispatchen)
- **Grenzwertanalyse:** Pagination (0, 1, MAX_INT), String-Lengths (0, 500 Limit, 501), Dates (past, now, future)
- **Invarianten:** "Jeder Job hat genau einen Status", "Jede Prisma Query enthält userId", "Jedes i18n Key existiert in allen 4 Locales"
- **Shrinking:** fast-check findet das minimale Gegenbeispiel automatisch

**Integrationstests mit testcontainers:**
- SQLite-Container pro Test-Suite (isolated, reproducible)
- Prisma Migrations laufen im Container
- Testen gegen echte DB statt Prisma Mocks → fängt Migration-Bugs, Query-Fehler, IDOR-Violations
- Seed-Data per Fixture (bestehende `testFixtures.ts` adaptieren)

**Schnittstellentests (Contract Tests):**
- API v1: Request/Response Shape Validation gegen Zod Schemas
- Webhook: HMAC-Signature Verification, Retry-Behavior, Event-Filtering
- SSE: Event-Format, Connection-Lifecycle
- Server Actions: ActionResult<T> Contract (success hat data, error hat message)

**E2E Reduktion:**
- Aktuelle 79+ E2E → ~15-20 kritische Smoke Tests
- Kriterium: Nur Tests die MEHRERE Schichten durchqueren UND nicht durch niedrigere Ebenen abdeckbar sind
- Kandidaten: Login Flow, Job Create→Edit→Delete, Automation Wizard→Run→Status, Kanban DnD→Status Change, Staging→Promote→Job

**Discovery: Self-Contained Module E2E Coverage (offen):**
- Frage: Sollen Module automatisch E2E-Coverage bekommen, oder reicht Property-Based + Component-Level?
- E2E hat in der Vergangenheit echte Bugs gefunden die Unit/Component Tests nicht abdeckten
- Option A: Manifest-driven E2E Test — iteriert alle registrierten Module, prüft Sichtbarkeit in Settings UI + Wizard (1 Testdatei, automatisch für neue Module)
- Option B: Property-Based + Component Tests decken Modul-Sichtbarkeit ab, E2E nur für kritische User Flows
- Option C: Hybrid — 1 generischer E2E Smoke Test für "alle Module sichtbar", Rest in niedrigeren Ebenen
- Entscheidung: Während 8.0 Migration Phase 1-2 evaluieren, basierend auf Erfahrung welche Bugs die neuen Test-Ebenen tatsächlich fangen

**Migration (Strangler Fig):**
- Phase 1: fast-check + testcontainers Setup, erste Property-Tests für State Machine + ActionResult
- Phase 2: Integrationstests für Server Actions (ersetzen gemockte Prisma-Tests)
- Phase 3: Contract Tests für API v1 + Webhook
- Phase 4: E2E Reduktion — Tests die durch Integration/Contract abgedeckt sind entfernen
- Bestehende Tests bleiben bis Ersatz nachweislich funktioniert (kein "erst löschen, dann neu schreiben")

**Dokumentation + GitHub-Kommunikation:**
- `docs/testing-strategy.md` — vollständige Teststrategie mit ISTQB-Referenzen
- ADR für die Entscheidung (warum Property-Based, warum testcontainers, warum E2E-Reduktion)
- `CONTRIBUTING.md` Update — welche Test-Ebene für welchen Code-Typ
- GitHub Issue/Discussion — Kommunikation an Entwickler mit Rationale und Migrationsplan

**Discovery mit spezialisierten Skills:**
- `/tdd-workflows:tdd-cycle` für die Migrations-Strategie
- `/backend-development:test-automator` für Integrationstests
- `/developer-essentials:e2e-testing-patterns` für E2E-Reduktions-Kriterien
- `/allium:propagate` für Generierung von Property-Tests aus Allium Specs (21 Specs → Test-Obligations)
- `/documentation-generation:architecture-decision-records` für Test-ADR

**Cross-Ref:** Allium Specs (→ propagate für Test-Generierung), CLAUDE.md Testing Requirements, e2e/CONVENTIONS.md, CI/CD Pipeline

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
4. JobDeck Swipe UI — Queue-Modus + Inbox-Modus (wenn implementiert)
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

### 8.5 E2E Test Repair & Self-Healing -- Phase 1+2 DONE (2026-04-01)

**68/68 E2E-Tests bestehen** (1 Worker, 17 min). Playwright Workers: 3 (CI: 1).

**Phase 1 — DONE:**
- ✅ Stale Data Cleanup: `e2e/cleanup-stale-data.ts` in globalSetup
- ✅ `networkidle` → `domcontentloaded` (SSE blockierte networkidle)
- ✅ Server Warm-up in globalSetup (Turbopack Cold-Start)

**Phase 2 — DONE:**
- ✅ Automation CRUD: EURES → Arbeitsagentur (keine externe API-Abhängigkeit)
- ✅ Job CRUD: App-Fix `resumeId: "" → null` (P2003 FK), Resume-Wait-Timing, 120s Timeout
- ✅ Profile CRUD: `ensureEnglishLocale()`, Toast-Regex Case-Fix
- ✅ Question CRUD: Toast-Dismiss-Wait vor Edit-Click
- ✅ Company CRUD: useEffect reset() Race-Wait
- ✅ Keyboard UX: ESCO-Debounce-Timing, startTransition-Wait, `toPass()` Polling
- ✅ Module Settings: Card-Selector-Fix, Switch-Loading-Wait
- ✅ Wizard Modules: Async-Module-Loading-Wait

**Root Cause Analyse:** Security-IDOR-Fixes brachen 0 Tests. Alle 60 Failures waren: Server-Überlastung (ECONNRESET bei >3 Workern), fehlende Locale-Cookies, externe API-Abhängigkeiten, async State-Timing, und ein App-Bug (resumeId FK).

**Phase 3 — TODO (Self-Healing Infrastruktur):**
- Dev Server Lifecycle: Auto-Restart bei Crash
- `retries: 1` für transiente Failures
- CI-Integration: E2E als Gate vor Merge
- Production Build (`next start`) statt Dev Server für stabilere parallele Runs

### 8.10 Test Data Generator / Fake Input Data
- Fake-Responses pro Connector-Modul für Automation-Tests ohne echte API-Calls
- **Pro Modul:** Realistische Fake-DiscoveredVacancy-Arrays (EURES-Format, Arbeitsagentur-Format, JSearch-Format)
- **Pro AI-Modul:** Fake Match-Scores und Match-Responses
- **Seeding:** CLI-Command oder Settings-UI zum Befüllen der DB mit Test-Automations, Test-Jobs, Test-StagedVacancies
- **Vorhandene Basis:** `src/lib/data/testFixtures.ts`, `mockActivities.ts`, `mockProfileData.ts` — erweitern um Connector-spezifische Fixtures
- **Integration mit E2E:** Playwright-Tests nutzen Fake-Module statt echte API-Calls (→ `e2e/CONVENTIONS.md`)
- **Demo-Modus:** Optional — neue Instanz startet mit Beispieldaten (für 2.13 Setup UX)

### 8.11 Fork-README & Projekt-Branding
Eigenständige README für den Fork (@rorar/jobsync) — das Projekt als eigenständiges Produkt präsentieren, nicht als Upstream-Erweiterung.

**Badges:**
- CI Status (GitHub Actions)
- License (MIT)
- Version / Release
- Node.js / Next.js Version
- Docker Image Size
- Locales (EN/DE/FR/ES)
- PRs Welcome / Contributions

**Inhalt (Struktur):**
- Hero-Screenshot (Dashboard) + Tagline
- Key Features (mit Fork-spezifischen Highlights):
  - Connector-Architektur (6 Module: EURES, Arbeitsagentur, JSearch, Ollama, OpenAI, DeepSeek)
  - Module Lifecycle Manager mit Health Monitoring
  - Vacancy Pipeline (Staging → Promotion)
  - 4 Sprachen (EN/DE/FR/ES)
  - EURES/ESCO EU-Integration
  - Resilience (Circuit Breaker, Retry, Rate Limiting)
- Quick Start (Docker + Dev Setup)
- Unterschied zum Upstream (Gsync/jobsync):
  - Feature-Vergleichstabelle (Upstream vs Fork)
  - Architektur-Entscheidungen (ACL Pattern, DDD, Allium Specs)
  - Eigene Module und Integrationen
- Configuration Guide
- Screenshots / GIFs der wichtigsten Flows (→ 8.1)
- Contributing + License

**SEO-Optimierung:**
- Beschreibende `<title>` und Meta-Description im README-Header
- Keywords: "self-hosted job tracker", "job application manager", "EURES integration", "privacy-first", "open source"
- GitHub Topics auf dem Repository setzen
- Social Preview Image (og:image) für GitHub/Social Media Sharing

**Abhängigkeiten:** Synergien mit 8.1 (automatische Screenshots für README-Medien)

### 8.5 DB-Migrationstool (Gsync → rorar)
- Migrationsskript für Datenbankumzug von Gsync-Fork zu eigenem Repository (rorar)
- Schema-Mapping, Daten-Export/Import, Validierung
- Einmalige Migration mit Rollback-Möglichkeit

**Divergenz-Analyse (Stand 2026-06-02, Fork-`main` `60a8856` vs `upstream/main`):**
- Fork **920 commits ahead, 72 behind** upstream; **56 vs 19** Prisma-Migrationen.
  Gemeinsame Basis-Migrationen sind **byte-identisch** (kein Checksum-Drift auf den
  geteilten Karten) — saubere gemeinsame Abstammung.
- **Einziger harter Blocker** für „bestehende Upstream-DB → Fork": Upstream hat eine
  Migration, die der Fork NICHT hat — `20260326034736_add_cover_letter` (legt Tabelle
  `CoverLetter` an + redefiniert `Job`/`Resume`). Der Fork kennt kein coverLetter.
  Folge: `prisma migrate deploy` auf einer Upstream-DB meldet **Drift** (eine in der DB
  eingetragene Migration fehlt im Fork-Ordner) und verweigert; die 22 Tabellen-Rebuild-
  Migrationen des Forks kollidieren mit dem cover-letter-geformten Schema; `CoverLetter`-
  Daten wären verwaist.
- **Offene Entscheidung (8.x Feature-Vergleichstabelle, NICHT blind mergen):** Cover-Letter
  portieren vs. weglassen — bewusst pro Feature wählen, kein `git merge upstream`.
- **Datenform sonst vorwärtskompatibel:** Fork-Additionen sind fast nur neue Tabellen +
  nullable Spalten; bestehende User/Job/Profile/Resume-Zeilen passen. `Job.salaryRange`
  bleibt (deprecated, computed) → Alt-Gehälter überleben, Backfill füllt die strukturierten
  Felder. Neue Pflicht-Config: `AUTH_SECRET` (ADR-018), `ADMIN_USER_IDS` (Multi-User).
- **Fazit:** Fresh-Install → Fork ist **heute schon sicher** (alle 56 Migrationen from
  scratch). Bestehende Upstream-DB → braucht diese 8.5-Brücke (Backup + Schema-Mapping +
  Rollback) + die Cover-Letter-Entscheidung. **Reihenfolge:** erst offene Tracks
  (Welle 3/4, Tech-Debt) abschließen, dann 8.5 angehen.

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

**Phase 0 — Self-Contained Modules (Manifest v2, intern):**
Vorstufe für externe Module: Interne Module müssen zuerst selbstbeschreibend sein, bevor ein externes SDK darauf aufbauen kann. Alles was ein Modul definiert, lebt in seinem Verzeichnis. Hinzufügen = Verzeichnis erstellen + 1 Import-Zeile. Entfernen = Verzeichnis löschen + 1 Import-Zeile.

- **Motivation:** Beim Clearbit→Logo.dev-Austausch (2026-04-08) waren 15+ Dateien über das Projekt betroffen weil i18n-Keys und UI-Maps außerhalb des Modul-Verzeichnisses leben. Größte Fehlerquelle: vergessene/verwaiste i18n-Keys, inkonsistente `NAME_KEYS`/`DESCRIPTION_KEYS`-Maps in UI-Komponenten. Bereits als offener Punkt in `project_module_lifecycle_deferred.md` gelistet: "DESCRIPTION_KEYS map in ApiKeySettings.tsx — last hardcoded registry remnant (i18n keys not yet in manifest)".

- **Phase 0a — i18n im Modul-Manifest: ✅ DONE (2026-04-08)**
  - Jedes Modul exportiert eine `i18n.ts` mit Translations pro Locale (name, description)
  - `ModuleManifest` bekommt ein `i18n`-Feld: `i18n: Record<string, { name: string, description: string }>`
  - UI-Komponenten lesen `manifest.i18n[locale].name` statt globaler `NAME_KEYS`/`DESCRIPTION_KEYS`-Maps
  - `EnrichmentModuleSettings.tsx` und `ApiStatusOverview.tsx` entfernen hardcoded Maps
  - Globale `enrichment.ts` Dictionary behält nur Feature-Level Keys (Dimensionen, Health-Status, etc.) — keine Modul-spezifischen Keys mehr
  - Allium Spec: `ModuleManifest` Contract um `i18n`-Feld erweitern

- **Phase 0b — Self-Registration (import = register): ✅ DONE (2026-04-08)**
  - Jedes Modul registriert sich selbst beim Import statt in einem externen Barrel:
    ```typescript
    // modules/logo-dev/index.ts — Self-Registration
    import { moduleRegistry } from "@/lib/connector/registry";
    import { logoDevManifest } from "./manifest";
    moduleRegistry.register(logoDevManifest, () => new LogoDevConnector());
    ```
  - Der `connectorType` auf dem Manifest bestimmt die Zugehörigkeit — der Entwickler muss nicht wissen welches Barrel zu welchem Connector gehört
  - **4 per-Connector Barrels** (`data-enrichment/connectors.ts`, `job-discovery/connectors.ts`, `ai-provider/connectors.ts`, `reference-data/connectors.ts`) werden durch **1 zentrales** `connector/register-all.ts` ersetzt:
    ```typescript
    // connector/register-all.ts — nur Side-Effect-Imports
    import "./job-discovery/modules/eures";
    import "./job-discovery/modules/arbeitsagentur";
    import "./data-enrichment/modules/logo-dev";
    import "./reference-data/modules/esco-classification";
    // ...
    ```
  - Verzeichnisstruktur (gruppiert nach Connector) bleibt als Konvention für menschliche Navigation — ist aber nicht mehr technisch erzwungen
  - **Allium-Validierung:** Die Spec-Regel `ModuleRegistration` sagt "Registration happens at application startup" — Self-Registration on import erfüllt das. Die Spec schreibt nicht vor WER die Registration auslöst (Domain-Event, nicht Implementation).

- **Phase 0c — Co-located Tests: ✅ DONE (2026-04-08)**
  - Modul-Tests im Modul-Verzeichnis: `modules/logo-dev/__tests__/`
  - Jest-Config: Glob-Pattern erweitern für `modules/**/__tests__/**`
  - Pragmatische Alternative: `/new-module` Scaffolding-Skill der Tests automatisch generiert

- **Bewusst nicht umgesetzt — vollständige Auto-Discovery:**
  - Ideal wäre `glob("modules/*/manifest.ts")` beim Start → gar kein `register-all.ts` mehr
  - In Next.js wegen Tree-Shaking zur Build-Zeit nicht praktikabel — Side-Effect-Imports müssen explizit gelistet sein
  - `register-all.ts` als explizite Import-Liste ist der pragmatische Mittelweg

- **Architektur-Analyse: Was sich NICHT ändert (Allium-Diskurs 2026-04-08):**
  Der Shared Kernel auf Connector-Ebene ist von Self-Registration nicht betroffen:
  - `resilience.ts` (Cockatiel Shared Kernel) — baut Policies aus `manifest.resilience`, connector-agnostisch. Jedes Modul hat bereits eine eigene `resilience.ts` im Modul-Verzeichnis die den Shared Kernel importiert. Pattern bleibt identisch.
  - `health-monitor.ts` — nutzt `moduleRegistry.get()`, egal wo registriert
  - `credential-resolver.ts` — liest `manifest.credential`, egal wo registriert
  - `degradation.ts` — nutzt `moduleRegistry` + Prisma, egal wo registriert
  - `rate-limiter.ts` (TokenBucket) — modul-agnostisch
  - **Facade-Registries** (`data-enrichment/registry.ts`, `job-discovery/registry.ts` etc.) — bleiben als typisierte Query-Layer. Sie registrieren nichts (`.register()` ist bereits No-Op), sie filtern nur per `moduleRegistry.getByType()`. Unverändert.

- **⚠ Aufmerksamkeitspunkt: Import-Reihenfolge bei Facade-Abfragen:**
  Die Facade-Registries (`enrichmentConnectorRegistry.create()`, `getEnrichmentModuleByDimension()`) und der `EnrichmentOrchestrator` rufen `moduleRegistry.getByType()` / `moduleRegistry.create()` auf. Module MÜSSEN registriert sein bevor die erste Facade-Abfrage erfolgt. Garantie: `register-all.ts` wird in `module.actions.ts` und in den Runner-Startup-Paths importiert — bevor jede Facade aufgerufen wird. Bei Self-Registration muss sichergestellt werden, dass `register-all.ts` NICHT lazy-loaded wird (kein `dynamic import()`), sondern als synchroner Top-Level-Import eingebunden bleibt.

- **Voraussetzung:** Module Lifecycle Manager (→ 0.4) implementiert
- **Konsumenten:** Marketplace (→ 2.11), Phase 1 Module SDK (unten), alle zukünftigen Module
- **Abgrenzung:**
  - ≠ Marketplace (2.11): Marketplace ist die UI-Surface. Self-Contained Modules sind die Architektur dahinter.
  - ≠ Phase 1 Module SDK (unten): SDK ist für externe Entwickler. Phase 0 ist interne Modul-Struktur.
- **DDD-Einordnung:** Module werden zu echten Self-Contained Systems im Bounded-Context-Sinne — ein Modul-Verzeichnis ist die physische Manifestation des Bounded Context. Die `connectorType`-Deklaration auf dem Manifest ist die Published Language: Das Modul sagt selbst zu welchem Connector es gehört, statt dass ein Barrel es von außen zuordnet.
- **Allium Spec:** `ModuleManifest` Contract um `i18n`-Feld erweitern. Registration-Regel `@guidance` aktualisieren (Self-Registration als empfohlenes Pattern).

**Phase 1 — Externe Module (SDK):**
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

> **Teil-erledigt (2026-06-02):** Fork-Deploy-Pfad steht — `docker-compose.yml` baut jetzt
> die Fork-Quelle (statt Upstream-Image), `docker-compose.ghcr.yml` zieht alternativ das
> publizierte Image; `.github/workflows/docker-publish.yml` baut multi-arch
> (amd64+arm64) + pusht nach `ghcr.io/rorar/jobsync` (latest/branch/sha/semver) via
> `GITHUB_TOKEN`. Runbook: `docs/deploy-runbook.md`. **Offen:** Health-Check auf
> `/api/health` (→ 8.8), Watchtower-Update-Mechanismus, Compose-Profile, Trivy-Scan,
> README-Badges.

- **Docker Compose:** Fertige `docker-compose.yml` für One-Command Setup
- **Multi-Arch Builds:** ARM64 Support (Raspberry Pi, Synology NAS, Apple Silicon)
- **Dockerfile Health Check:** `HEALTHCHECK` Directive nutzt `/api/health` Endpoint (→ 8.8)
- **Update-Mechanismus:** Watchtower-kompatibel, Versionscheck im Admin UI ("Update verfügbar")
- **Environment-Konfiguration:** `.env.example` mit allen Variablen dokumentiert, Setup-Wizard (→ 2.13) generiert `.env`
- Cross-Ref: Projekt Setup UX (2.13) — Docker ist der primäre Deployment-Pfad für Non-Dev User

**CI/CD Docker Builds (GitHub Actions):**
- Automatische Docker Image Builds bei Push auf `main` / Tag
- Multi-Arch Builds: `linux/amd64` + `linux/arm64` (Raspberry Pi, Synology, Apple Silicon)
- Push zu GitHub Container Registry (GHCR): `ghcr.io/rorar/jobsync:latest`, `:vX.Y.Z`
- Build-Cache via GitHub Actions Cache (Layer Caching für schnelle Builds)
- Semantic Versioning Tags: `:latest`, `:X.Y.Z`, `:X.Y`, `:X`
- Security Scanning: Trivy/Grype im Build-Pipeline (Vulnerability-Check vor Push)
- Badge in README: Docker Image Size + Pull Count

**Docker-Compose Profile (Sidecar-Services):**
- `docker compose --profile full up` — App + alle optionalen Services
- Profile-Definition:
  - `default`: Nur JobSync App (wie aktuell)
  - `ai`: + Ollama Container (GPU-Passthrough wenn verfügbar)
  - `parsing`: + Docling Container (→ 1.18 Document-Parsing)
  - `cache`: + Redis Container (→ 0.9 Stufe 3)
  - `geo`: + libpostal Container (→ 1.10 Address Parsing)
  - `full`: Alle Services
- Jedes Profil inkl. Health Check, Volume-Mounts, Netzwerk-Konfiguration
- `.env.example` Erweiterung für Sidecar-spezifische Variablen
- Cross-Ref: Projekt Setup UX (2.13), Caching (0.9 Stufe 3)

### 8.12 Upstream Issues bearbeiten
Issues aus dem Upstream-Repository [Gsync/jobsync](https://github.com/Gsync/jobsync/issues) sichten und im eigenen Fork beheben.

- **Ziel:** Bugfixes und Verbesserungen aus dem Upstream übernehmen, ohne PRs gegen Upstream zu erstellen (→ eigene Policy)
- **Workflow:**
  1. Issues aus `Gsync/jobsync/issues` regelmäßig sichten
  2. Relevante Issues im eigenen Fork reproduzieren und fixen
  3. Fixes auf eigenem `main` Branch committen
  4. Issue-Referenz im Commit: `fix: upstream#42 — Description`
- **Priorisierung:** Security-Bugs > Breaking Bugs > UX-Issues > Feature-Requests
- **Abgrenzung:** Keine PRs gegen Upstream (→ `feedback_no_upstream_prs.md`). Fixes leben ausschließlich im eigenen Fork.

### 8.13 Upstream Dev-Branch Sync
Änderungen aus dem `dev`-Branch von [Gsync/jobsync](https://github.com/Gsync/jobsync/tree/dev) regelmäßig in den eigenen Fork integrieren.

- **Ziel:** Neue Features, Fixes und Schema-Änderungen aus Upstream übernehmen
- **Workflow:**
  1. `git fetch upstream` — Upstream-Remote aktualisieren
  2. `git diff main..upstream/dev` — Änderungen sichten
  3. Cherry-Pick oder Merge relevanter Commits auf eigenen `main`
  4. Prisma-Migrationen bei Schema-Änderungen prüfen und ggf. anpassen
  5. Tests laufen lassen, Konflikte mit eigenen Features (0.x) auflösen
- **Upstream-Remote:** `git remote add upstream https://github.com/Gsync/jobsync.git` (falls nicht vorhanden)
- **Konfliktstrategie:** Eigene Features (Connector, Module Lifecycle, Vacancy Pipeline, etc.) haben Vorrang. Upstream-Änderungen werden angepasst, nicht umgekehrt.
- **Frequenz:** Vor größeren eigenen Feature-Starts sichten — nicht automatisch mergen
- Cross-Ref: DB-Migrationstool (8.5), Upstream Issues (8.12)

---

## 9. Experimentell

### 9.1 CareerBERT
- Integration und Optimierung von [CareerBERT](https://github.com/julianrosenberger/careerbert)
- Spezialisiertes NLP-Modell für Karriere- und Jobtexte (basierend auf BERT)
- **Paper:** Rosenberger (2025) — "CareerBERT: Matching Resumes to ESCO Jobs in a Shared Embedding Space for Generic Job Recommendations", Expert Systems With Applications. SBERT Bi-Encoder (jobGBERT-Basis), fine-tuned mit MNR-Loss auf ~131K ESCO Sentence-Pairs. Erreicht MRR@100 von 0.328 — übertrifft OpenAI text-embedding-ada-002 (0.302), ESCOXLM-R (0.312) und ist kompetitiv mit text-embedding-3-small (0.323). 3.008 ESCO-Job-Centroids aus EURES-Anzeigen + ESCO-Beschreibungen.
- **Anwendungsfälle:**
  - Semantisches Matching zwischen CV-Skills und Job-Anforderungen (besser als Keyword-Match)
  - Automatische Skill-Extraktion aus Jobbeschreibungen und Lebensläufen
  - Ähnlichkeitssuche: "Jobs ähnlich zu diesem" basierend auf Beschreibungstext
  - Klassifikation von Jobs nach ESCO/ISCO Taxonomie
  - Ranking von Bewerbungen nach semantischer Relevanz
- **Technisch:**
  - Self-hosted Inference via [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) (nutzt ONNX Runtime, läuft direkt in Node.js/Next.js)
  - Alternative: [fastembed-js](https://github.com/Anush008/fastembed-js) (npm, Qdrant, ONNX-basiert)
  - Fallback: Python Sidecar (FastAPI) für Modelle die nur in Python verfügbar sind
  - INT8-Quantisierung: 2-4.5x Speedup, < 1% Genauigkeitsverlust, 26-75% kleiner
  - Singleton-Pattern für Modell-Instanz in Next.js (HuggingFace-Empfehlung)
  - Vektor-Suche via [sqlite-vec](https://github.com/asg017/sqlite-vec) (`npm install sqlite-vec`) — passt in bestehenden SQLite/Prisma-Stack
  - Optional: Finetuning auf eigene Jobdaten für bessere Ergebnisse
  - API-Endpunkt für Embedding-Generierung und Similarity-Search
  - Integration mit dem bestehenden AI Match-Score System
- **Hardware-Anforderungen (Self-Hosted):** → Details: `docs/research/careerbert-hardware-research.md`
  - **Minimum (Phase 1):** 2 GB RAM, jede CPU (x86_64/ARM64). all-MiniLM-L6-v2 INT8 = 63 MB, ~12ms/Embedding
  - **Empfohlen (Phase 2):** 4 GB RAM, 4-Core CPU. ModernBERT-embed-base INT8 = ~150 MB, MTEB 62.6
  - **Multilingual (Phase 3):** 4-8 GB RAM. multilingual-e5-small = ~120 MB INT8, 100+ Sprachen
  - Läuft auf: Raspberry Pi 4, alter Laptop, Mini-PC, Standard-VPS (2 GB+)
- **Implementierungsphasen:**
  - **Phase 1 — Quick Win:** all-MiniLM-L6-v2 (22.7M Params, 14 MB Q4) + Brute-Force in-memory. Sofort einsetzbar
  - **Phase 2 — Optimiert:** ModernBERT-embed-base / nomic-embed-text-v1.5 (Matryoshka 768→256→64) + sqlite-vec
  - **Phase 3 — Multilingual:** multilingual-e5-small oder BGE-M3 für Cross-Language Matching (DE CV → FR Jobs)
  - **Phase 4 — Domain Fine-Tuning:** MNR-Loss auf ESCO-Daten, kein TSDAE (verschlechtert laut Paper), Two-Stage Retrieval
- **Verbesserungen gegenüber Original-Paper:**
  - **Modernere Base-Models evaluieren:** BGE-M3, GTE, E5-Mistral, Nomic-Embed — deutlich bessere Embedding-Qualität als GBERT/jobGBERT. Multilingual-fähig → passt zu JobSync's EU-Fokus (DE, FR, ES, EN)
  - **Two-Stage Retrieval:** Phase 1: Bi-Encoder (schnell, Top-50 Candidates) → Phase 2: Cross-Encoder Re-Ranking (präzise). Stand der Technik für Semantic Search
  - **Matryoshka Embeddings:** Variable Dimensionalität (768 → 256 → 64). Grobe Suche bei 64 dims, Verfeinerung bei voller Auflösung. Spart RAM/CPU für Self-Hosted-Betrieb
  - **LLM-gestützte Resume-Anreicherung:** Paper-Schwäche: kurze CVs → schlechte Ergebnisse (Resume 2: MAP@20 nur 0.310). Lösung: Bestehende AI-Module (Ollama, OpenAI, DeepSeek) zur CV-Vervollständigung VOR dem Encoding nutzen
  - **Multilingual-Support:** CareerBERT ist nur Deutsch. ESCO existiert in 27 Sprachen — multilinguales Modell ermöglicht Cross-Language Matching
- **Skalierung (bei Bedarf):**
  - Bei 3.008 ESCO-Centroids × 768 dims (~9 MB) reicht Brute-Force Cosine-Search (< 1ms)
  - Ab ~10K Embeddings: FAISS oder Qdrant mit HNSW-Index
  - Ab ~1M Embeddings: Vektor-Quantisierung relevant:
    - [RaBitQ](https://arxiv.org/abs/2405.12497) (SIGMOD 2024) — Randomized Quantization, D-dim Vektoren → D-bit Strings, 3× schneller als Product Quantization bei gleicher Accuracy, theoretische Error Bounds
    - [Extended-RaBitQ](https://github.com/VectorDB-NTU/Extended-RaBitQ) (SIGMOD 2025) — asymptotisch optimale Erweiterung
    - [TurboQuant](https://arxiv.org/abs/2504.19874) (Google, ICLR 2026) — Random Rotation + per-Coordinate Scalar Quantization, nahezu optimale Distortion Rate. Outperformt PQ in Recall bei Near-Zero Indexing-Overhead. **Achtung:** [Kontroverse um Darstellung von RaBitQ](https://x.com/gaoj0017/status/2037532673812443214)
  - KV-Cache-Optimierung (TurboQuant) ist für Bi-Encoder NICHT relevant — nur für autoregressive Decoder-Modelle
- **Bekannte Paper-Limitierungen (zu adressieren):**
  - Nur deutsche Sprache/Arbeitsmarkt
  - Kurze CVs → disproportionaler Keyword-Einfluss
  - Proxy-Evaluation (Job-Ads als Resume-Ersatz statt echte CVs)
  - Black-Box-Natur → Explainability-Layer nötig (Attention-Visualisierung, regelbasierte Erklärungen)
  - Bias-Risiko aus historischen Daten → Fairness-Monitoring einplanen
- **Offene Risiken & Architektur-Entscheidungen:**
  - **DSGVO / Embedding-Datenschutz:** CV-Embeddings sind personenbezogene Daten. Embedding Inversion Attacks ermöglichen teilweise Rekonstruktion des Originaltexts. Embeddings müssen verschlüsselt gespeichert und bei Kontolöschung gelöscht werden (Art. 17 DSGVO). Einwilligung des Users erforderlich. Self-Hosted mildert, löst aber nicht.
  - **Embedding-Versionierung:** Modellwechsel → alle Embeddings inkompatibel. Braucht `embedding_model_version` in DB. Migrations-Strategie: alte + neue Embeddings parallel, dann umschalten. Ohne Versionierung wird jeder Modellwechsel zum Datenverlust.
  - **Tokenizer für Deutsch:** Englische Modelle (ModernBERT, BGE-small) zerstückeln deutsche Compound-Words ("Softwareentwicklungsingenieur" → sinnlose Sub-Tokens). Nur CareerBERT (jobGBERT), multilingual-e5, BGE-M3 haben geeignete Tokenizer. Einschränkt die Modellauswahl für DE erheblich.
  - **Feedback-Loop:** Ohne User-Feedback (Thumbs-up/down auf Matches) wird Matching nie besser als Tag 1. Braucht UI-Element + Datensatz-Aufbau für Re-Training. Konsumenten: Onboarding (→ 2.1), Vacancy Pipeline.
  - **ESCO-Taxonomie-Updates:** ESCO wird von der EU regelmäßig aktualisiert. Centroids müssen bei Änderungen neu berechnet werden. Trigger: ESCO-Version-Check (z.B. monatlicher Cron), nicht TTL-basiert.
  - **Latenz-Budget:** Embedding (~12-25ms) + Search (<1ms) = ~30ms real-time. ABER: LLM-Anreicherung für kurze CVs → Sekunden. Entscheidung: Batch (bei CV-Upload, Background-Job) vs. Real-Time (bei Suche)?
  - **Hybrid-Modell-Strategie:** CareerBERT (DE, ESCO-Spezialist) + multilingual-e5 (FR/ES/EN) parallel statt Entweder-Oder. Gewichtetes Ensemble der Scores.
  - **Explainability:** Nicht nur "Job X passt zu 87%" — sondern "weil Skills A, B, C matchen und D fehlt". Ansatz: Cross-Encoder Attention-Weights oder Post-Hoc Skill-Overlap-Analyse.
  - **Offline / Erster Start:** Modell muss ohne Internet verfügbar sein. Bündeln im Docker-Image oder Download + Cache beim ersten Start. HuggingFace-Hub als Dependency.
  - **A/B-Testing:** Kein Evaluierungsplan für Modellvergleich in Produktion. Braucht: Gleiche CVs durch verschiedene Modelle, HR-Expert-Review oder automatische Metriken aus Feedback-Loop.
- **DDD-Einordnung:** Bei Implementierung als neues AI-Modul im AI Connector registrieren (wie Ollama, OpenAI, DeepSeek). Implementiert `AIProviderConnector` Interface mit `createModel()` für Embedding-Generierung.
- **Konsumenten:** Skillsets (→ 4.1), Duplikat-Erkennung (→ 3.2 Fuzzy Matching)
- **Ressourcen:**
  - **Research:** `docs/research/careerbert-hardware-research.md` — Ausgiebiges Hardware-Research mit Benchmarks, Modellvergleichen, Integrations-Patterns
  - **Paper:** https://arxiv.org/abs/2503.02056 | [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0957417425006657)
  - **Code:** https://github.com/julianrosenberger/careerbert
  - **Models:** [careerbert-jg](https://huggingface.co/lwolfrum2/careerbert-jg) | [careerbert-g](https://huggingface.co/lwolfrum2/careerbert-g) (HuggingFace)
  - **Empfohlene Base-Models:** [ModernBERT-embed-base](https://huggingface.co/nomic-ai/modernbert-embed-base) | [nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) | [BGE-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) | [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)
  - **Integration:** [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) | [fastembed-js](https://github.com/Anush008/fastembed-js) | [sqlite-vec](https://github.com/asg017/sqlite-vec) | [ONNX Runtime Next.js Template](https://github.com/microsoft/onnxruntime-nextjs-template)
  - **Benchmarks:** [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) | [Matryoshka Guide](https://huggingface.co/blog/matryoshka) | [Intel CPU-Optimized Embeddings](https://huggingface.co/blog/intel-fast-embedding)
  - **Vektor-Quantisierung:** [TurboQuant](https://arxiv.org/abs/2504.19874) | [RaBitQ](https://arxiv.org/abs/2405.12497) | [KV-Caching erklärt](https://huggingface.co/blog/not-lain/kv-caching)
  - **Literature Review:** https://www.themoonlight.io/en/review/careerbert-matching-resumes-to-esco-jobs-in-a-shared-embedding-space-for-generic-job-recommendations

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
**Allium-Spec (DRAFT 2026-06-14):** `specs/automation-modes.allium` (via `allium:elicit`, `allium check` grün) — `AutomationMode` (kanonisch: manual/semi_yolo/yolo), `AutopilotPolicy` (per-User: global_mode + Safeguards), `AutomationModeOverride` (per-Automation), `AutopilotAction` (Review-Queue / Kill-Switch-Target). **Mode-Präzedenz gelöst** (`EffectiveModePrecedence`): Per-Automation-Override schlägt globalen Default (manual) — löst die dangling Referenz `EffectiveAutomationMode.of` aus application-documents.allium. **Safeguards als Invarianten:** `OnlyYoloAutoSends`, `KillSwitchHaltsAllSends`, `DailyLimitCapsSends`, `DryRunNeverSends`, `BlacklistedCompaniesNeverAutoSent`. Pipeline-Stufen werden gegated, nicht re-owned (Cross-Refs). **Pipeline-Weave-in (2026-06-15):** Multi-Channel-Outreach (`OutreachChannel`, 1.12 Communication Connector — Email/Portal 1.9/Webhook/Brief 1.17, NICHT email-only); erfolgreicher autonomer Send → `TransitionJobStatus(...applied)` (crm-workflow.allium) → Kaskade CRM-Timeline (crm.allium) + Follow-Up (5.4) (`AutonomousSendAppliesAndCascadesCrm`); Dry-Run sendet/applied/CRM NICHT; **Auto-Generierung** des Anschreibens via AI in semi/yolo (application-documents `PrepareDocumentsOnPromotion` → `GenerateDocument`); **Batch-Review** (Semi-YOLO One-Click-Sammelfreigabe, `BatchApproveAndSend`). **Outreach-BC-Split (2026-06-15, /allium-fundiert):** channel-agnostische `OutreachMessage` (Body+Anhänge, Review-Artefakt) lebt auf der ApplicationBundle (`application-documents.allium`); **Channel/Recipient/Delivery = Communication Connector 1.12** (separater Bounded Context, future spec) — `automation-modes` referenziert `OutreachChannel`/`Outreach.deliver` als EXTERN + gated nur. **Kein-Recipient-Dead-End:** `HoldForMissingRecipient` → Action `held` (Review-Queue), nie still verworfen/blind gesendet (`NeverSendWithoutResolvedChannel`). **Pipeline = DAG** (Event-Fan-out + `requires`-Guards + `becomes`-Trigger), nicht linear. **Graph-verifiziert (2026-06-15, /understand-anything + Prisma-Ground-Truth):** `Job.matchScore Int?` existiert (Send-Gate korrekt), `TransitionJobStatus` = echter crm-workflow-Trigger (Code-Fn `changeJobStatus`), `crm-activity-logger` konsumiert `JobStatusChanged` (Kaskade real), 1.12-Code existiert NICHT (extern/future korrekt), Domain-Flows „Run Automation Pipeline / Promote Vacancy / Change Job Status / Match Resume to Job" bestätigen die Stufen. **Prerequisite-Korrektur:** `Job.companyId` ist PFLICHT (Company immer am Promotion aufgelöst → KEIN fehlender-Company-Branch); optionaler Branch = `JobContact`/Person-Addressee (personalisierte vs. neutrale Salutation) + **Recipient-Adresse** = echter Send-Branch (→ `HoldForMissingRecipient`). Offene Fragen: OutreachMessage↔cover_letter-Overlap, Reply-Handling-Loop, Daily-Limit Sends vs. Drafts, Kill-Switch-Scope, Dry-Run-Reuse.

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

### 9.5 Bewerber-Landingpage / Reverse-Funnel
Generierte persönliche Landingpage die den Bewerbungs-Funnel invertiert: Statt "Ich bewerbe mich bei euch" → "Ihr habt mich gefunden, hier ist warum ich matche."

**Konzept:** Der Bewerber erstellt die Seite, HRler/Recruiter lesen sie.

- **Hook:** Personalisierte Begrüßung mit Pitch ("Hallo, ich bin [Name]. Ich baue [X].")
- **Dynamic Match:** Visitor kommt von Stellenanzeige/LinkedIn → Seite parsed Referrer/UTM-Params und zeigt relevante Skills/Projekte passend zur Stelle
- **Skill-Tags:** Visueller Match zwischen angeforderten Fähigkeiten und Profil (aus JobSync-Daten: 4.1 Skillsets, Profil)
- **Social Proof:** Projekte, Testimonials, GitHub-Stats, Portfolio
- **CTA:** "Jetzt Gespräch vereinbaren" — Cal.com/Calendly Embed für direkte Terminbuchung
- **Zwei Modi — Graceful Degradation:**
  - **Personalisiert (Consent-Referral-Link geklickt, → 6.1):** "Hallo Frau Müller, Sie suchen einen Senior Developer mit React bei Siemens — hier ist warum ich matche." Ref-Link triggert Automation, lädt HR-Daten, personalisiert Ansprache + Skill-Matching.
  - **Generisch (Default, kein Consent nötig):** "Hallo, ich bin {Name}. Hier ist mein Profil und meine Projekte." Gleiche Seite, gleiche Inhalte — nur ohne Personalisierung. Zero Drittdaten-Verarbeitung, DSGVO-sauber by Default.
- **Social Proof:** Testimonials (→ 4.10), Portfolio/Arbeitsproben (→ 4.11), GitHub-Stats
- **Datenquelle:** JobSync-Profil, Skillsets (→ 4.1), generierte Dokumente (→ 4.2), Match-Scores, Portfolio (→ 4.11)
- **Shared Surface:** öffentlicher read-only Zugang (Link/Passwort/Ablauf/Widerruf/Audit) über die gemeinsame `shared-surface`-Domäne (→ 2.18.2) — Renderer-Typ `applicant-landingpage`. Personalisierter Modus = scoped Token mit Consent-Referral-Daten.
- **Cross-Ref:** Public API (7.1) als Daten-Backend, Data Enrichment (1.13) für Logo/Company-Context, DSGVO Consent-by-Referral (6.1), Shared Surface ↔ Report/4.7 (2.18.2)

---

## 10. Sprint E: UI-Lücken schließen (Backend→Frontend Alignment) -- DONE (S5a)

**Rationale:** Sprint C5+C6 haben Backend-Capabilities gebaut die nie an die UI angeschlossen wurden. 8 Server Actions sind ohne Consumer, 1 Page ist nicht navigierbar. Dieser Sprint schließt die Lücken.

**Implementiert (2026-04-04, Session S5a):**
- E1: 4 kritische UI-Lücken geschlossen (Enrichment Panel, Status Timeline, Kanban Reorder, Sidebar Link)
- E2: 4 Backend-Capabilities exponiert (Funnel Widget, Health Check, Global Undo, Retention Cleanup)
- 8 orphaned Server Actions haben jetzt UI-Consumer
- 74 neue Tests (10+12+18+13+4+10+7), 150 Suites total

### Sprint E1: Kritische UI-Lücken (Feature komplett ohne UI) -- DONE

| # | Feature | Backend vorhanden | UI zu bauen | Komplexität |
|---|---------|-------------------|-------------|-------------|
| E1.1 | **Enrichment Control Panel** | `triggerEnrichment`, `getEnrichmentStatus`, `getEnrichmentResult`, `refreshEnrichment` | Company-Detail: Enrichment-Status-Panel mit "Refresh" Button, Logo-Preview, Modul-Info ("Enriched by: Clearbit") | M |
| E1.2 | **Status History Timeline** | `getJobStatusHistory` | Job-Detail: Chronologische Timeline der Status-Transitions mit Notizen, Timestamps, User. Vorbereitung für 5.9 Timeline. | M |
| E1.3 | **Kanban Within-Column Reorder** | `updateKanbanOrder` + `sortOrder` Feld | `KanbanBoard.tsx:156` — early-return entfernen, `updateKanbanOrder` aufrufen bei same-column Drag | S |
| E1.4 | **Staging Queue Sidebar-Link** | `src/app/dashboard/staging/page.tsx` existiert | `SIDEBAR_LINKS` in `src/lib/constants.ts` erweitern | XS |

### Sprint E2: Backend-Capabilities exponieren

| # | Feature | Backend vorhanden | UI zu bauen | Komplexität |
|---|---------|-------------------|-------------|-------------|
| E2.1 | **Dashboard Status Funnel** | `getStatusDistribution` | Dashboard-Widget: Conversion Funnel (Bookmarked → Applied → Interview → Offer). Nutze `/business-analytics:data-storytelling`. | M |
| E2.2 | **Health Check Button** | `runHealthCheck` | EnrichmentModuleSettings + ApiKeySettings: "Check Now" Button pro Modul | S |
| E2.3 | **Ctrl+Z Global Undo** | `undoLastAction` | `useEffect` Keyboard-Listener in Layout, Toast-Feedback | S |
| E2.4 | **Retention Cleanup Admin UI** | `runRetentionCleanup` | Developer Settings: "Run Cleanup" Button + letzte Execution-Info | S |

### Sprint E — Cross-Cutting

- Jede neue UI-Komponente folgt UX-Pflicht: Loading/Empty/Error States, Mobile, Keyboard, Dark Mode, i18n
- `/ui-design:create-component` + `/ui-design:interaction-design` für neue Panels
- `/accessibility-compliance:wcag-audit-patterns` nach Implementation
- E2E Tests für jede neue UI-Fläche
- Dreistufige Analyse (Blind Spot + DAU/BDU + Edge Cases) nach Abschluss

---

## Implementierte Features (Stand: 2026-04-04)

| Feature | Status |
|---|---|
| Roadmap 0.1: Connector Architecture Unification (ADR-010) | ✅ Implementiert |
| ADR-012: Provider→Module Terminology Harmonization | ✅ Implementiert |
| EURES Modul (EU Jobs) | ✅ Implementiert |
| JSearch Modul (Google Jobs) | ✅ Upstream |
| Arbeitsagentur Modul (DE Jobs) | ✅ Implementiert |
| EURES Location Combobox (NUTS + Flags) | ✅ Implementiert |
| ESCO Occupation Combobox (Multi-Select + Details) | ✅ Implementiert |
| i18n (EN, DE, FR, ES) — 496+ Keys | ✅ Implementiert |
| Locale-aware Date/Number Formatting | ✅ Implementiert |
| EU API Language Integration | ✅ Implementiert |
| User Language Settings | ✅ Implementiert |
| Roadmap 0.2: ActionResult<T> Typisierung | ✅ Implementiert |
| Roadmap 0.3: Domain-Model Alignment | ✅ Implementiert (Follow-Ups geschlossen) |
| Roadmap 0.4: Module Lifecycle Manager | ✅ Implementiert (6 Phasen, 114 Tests) |
| Roadmap 0.9: Response Caching Stufe 1 | ✅ Implementiert (LRU + HTTP Headers) |
| Roadmap 0.10: Scheduler Transparency | ✅ Implementiert (RunCoordinator, SSE, Watchdog) |
| Roadmap 2.7: JobDeck Swipe UI | ✅ Implementiert (DeckCard, DeckView, ViewModeToggle) |
| Roadmap 2.10 Phase 1: Manifest-Driven AutomationWizard | ✅ Implementiert |
| Roadmap 2.15: Company Blacklist | ✅ Implementiert (CRUD + Pipeline-Filter) |
| Roadmap 5.3: Job Status Workflow | ✅ Implementiert (State Machine, History, Domain Events) |
| Roadmap 5.6: Kanban Board | ✅ Implementiert (@dnd-kit, cross-column DnD) |
| Roadmap 7.1 Phase 1: Public API v1 | ✅ Implementiert (Jobs CRUD + Notes, API Keys, Rate Limiting) |
| Roadmap 1.13 Phase 1: Data Enrichment | ✅ Implementiert (Clearbit, Google Favicon, Meta/OG Parser, Fallback-Chain) |
| Roadmap 8.2: Client-Side Error Reporting Dashboard | ✅ Implementiert |
| Roadmap 0.5: Vacancy Pipeline (Kern-Pipeline) | ⏳ Teilweise (Archive/Trash, Undo, Bulk ausstehend) |
| Sprint A: Architecture Debt (10 Items) | ✅ Verifiziert |
| Sprint B: UX/UI Gaps (10 Items) | ✅ Verifiziert |
| Sprint E: UI-Lücken schließen (8 Items) | ✅ Implementiert (S5a, 74 Tests) |
| Roadmap 0.6 Phase 2: Webhook Channel | ✅ Implementiert (HMAC, Retry, SSRF, ChannelRouter, Settings UI) |
| Roadmap 0.6 Phase 3: Email Channel | ✅ Implementiert (nodemailer SMTP, TLS, Rate Limit, Templates, Settings UI) |
| Roadmap 0.6 Phase 4: Push Channel | ✅ Implementiert (web-push VAPID, Service Worker, Settings UI) |
| Security Audit: 25+ Vulnerabilities | ✅ Gefixt (ADR-015 bis ADR-025) |
| Allium Specs (21 Specs, ~10345 Lines) | ✅ Spezifiziert + Aligned |
| Test Suite: 157 Suites, 2918 Tests, 79 E2E | ✅ Grün |
| Bug Tracker: 288 Bugs | ✅ Alle gefixt (2 accepted risk) |
