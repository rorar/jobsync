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

### 0.6 Unified Notification System — PHASE 1 DONE (3 Channel-Phasen offen)
Application Service für Dispatch + bestehende Connectors für Delivery. **Dispatch ≠ Delivery.**

**Implementiert (2026-03-29):**
- ✅ TypedEventBus (in-process pub/sub, error isolation, wildcard, async handlers)
- ✅ 11 Domain Event Types (typed discriminated union, VacancyPromoted/Dismissed/Staged/Archived/Trashed + Bulk/Module/Retention)
- ✅ NotificationDispatcher Consumer (Event→Notification mapping, staged vacancy batching)
- ✅ AuditLogger Consumer (wildcard subscriber für Debug-Logging)
- ✅ Consumer Registration at startup (`instrumentation.ts`, hot-reload guard)
- ✅ In-App Notification UI (NotificationBell + NotificationDropdown + NotificationItem)
- ✅ Notification Preferences (JSON on UserSettings, per-type enable/disable, quiet hours)
- ✅ NotificationSettings UI Komponente
- ✅ Allium Specs: `event-bus.allium`, `notification-dispatch.allium`
- ✅ emitEvent() → EventBus.publish() Migration (alle Callsites)

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
- CompanyLogo Komponente (Skeleton → Image → Initials Fallback)
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
- **Konsumenten:** CV-Parsing (→ 3.5) liefert Skills, Onboarding (→ 2.1 Schritt 4) bearbeitet Skills, CareerBERT (→ 9.1) matcht Skills semantisch, Dokumenten-Generatoren (→ 4.2) nutzen Skills für CV-Templates
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
      ├→ react-pdf / pdfmake                 — CV PDF Output
      ├→ React Components                     — Landing Page (9.5)
      ├→ LLMs / Chatbot                       — Generiert Abschnitte als JSON Schema
      └→ Import/Export                         — LinkedIn JSON, Europass, JSON Resume
    ```
  - **Packages:** `@rjsf/core` (Form-Renderer), `@react-pdf/renderer` oder `pdfmake` (PDF), `zod-to-json-schema` (Konversion), `@tiptap/core` oder `plate` (Rich Text Felder), JSON Resume Themes (50+ auf npm)
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
- Bewerber können ein kurzes Vorstellungsvideo aufnehmen (WebRTC/MediaRecorder) oder hochladen
- Einbettbar in Bewerbungsunterlagen als QR-Code/Link
- Optional: KI-gestützte Transkription und Zusammenfassung (→ AI Provider Connector: Whisper/Speech-to-Text als neues AI-Modul)
- **Abhängigkeiten (4.6 braucht):**
  - Datei-Management (→ 2.8) für Video-Upload, Organisation, Löschung
  - Public API (→ 7.1) für öffentliche Video-URLs / Streaming-Endpoint
  - DSGVO (→ 6.1) — Video enthält biometrische Daten (Gesicht, Stimme) → stärkere Consent-Anforderungen als Text. Passwortschutz + Expiring Links erforderlich.
- **Consumer (4.6 fließt in):**
  - Bewerber-Landingpage (→ 9.5) — Video als Hook-Element ("Hallo, ich bin Pascal" + Video)
  - Landingpage für Unternehmen (→ 4.7) — Video eingebettet (bereits referenziert)
  - Social Proof (→ 4.10) — Video-Testimonials, Empfehlungen als Video-Format
  - Portfolio / Arbeitsproben (→ 4.11) — Video als Portfolio-Item-Typ (Design-Walkthroughs, Code-Demos, Präsentationen)
  - Manifest-Engine (→ 4.2) — `type: "video"` als Feld-Typ im JSON Schema → QR-Code/Link in generierten CVs und E-Mails (5. Rendering-Kontext)
  - Communication Connector (→ 1.12) — Video-Link in Bewerbungs-E-Mails auto-attached
  - Onboarding (→ 2.1) — Video-Aufnahme als Onboarding-Schritt ("Nimm dein Vorstellungsvideo auf")
- **Infrastruktur-Anforderungen (Discovery nötig):**
  - **Video-Storage:** Videos sind groß (50-500MB). SQLite/lokaler Storage reicht nicht. Braucht Object Storage (S3-kompatibel / MinIO für Self-Hosted) oder Streaming-Lösung. Eigenständiger Infrastruktur-Punkt.
  - **Video-Encoding:** Browser-aufgenommene Videos (WebM) müssen für E-Mail/QR ggf. in MP4 konvertiert werden. FFmpeg als System-Dependency.
  - **Streaming:** Große Videos dürfen nicht als Blob geladen werden — braucht Range-Request/Streaming-Endpoint über Public API (→ 7.1).

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

### 5.8 Import/Export
- **Import:** Kontakte aus LinkedIn, XING, vCard, CSV importieren — kritisch für CRM-Bootstrapping
- **Export:** Jobs, Kontakte, Bewerbungsdaten als CSV/JSON für Reporting und Backup
- Cross-Ref: DSGVO Datenportabilität Art. 20 (→ 6.1)

### 5.9 Timeline / Activity Log
- Chronologische Timeline pro Kontakt und Unternehmen
- Zeigt alle Interaktionen: E-Mails, Anrufe, Interviews, Notizen, Statusänderungen, Dokumente
- Automatisch befüllt aus CRM-Aktionen und Domain Events
- Filterbar nach Typ, Datum, Kanal
- **Discovery: Event Sourcing vs. Audit-Log**
  - Aktuell: Domain Events (TypedEventBus) als Fire-and-Forget, Prisma-Entities sind Source of Truth
  - 5.3 erstellt `JobStatusHistory` als Append-Only Audit-Log — reicht das für die Timeline?
  - Event Sourcing ermöglicht temporale Queries ("Zustand am Tag X"), Replay, vollständige Audit-Trails — bringt aber erhebliche Komplexität (Event Store, Projections, Snapshots, Eventual Consistency)
  - **Empfehlung:** Discovery mit `/backend-development:event-store-design` durchführen bevor Architektur-Entscheidung. Audit-Log als Default, Event Sourcing nur wenn temporale Queries oder Replay tatsächlich gebraucht werden

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
  - **Generisch (Default, kein Consent nötig):** "Hallo, ich bin Pascal. Hier ist mein Profil und meine Projekte." Gleiche Seite, gleiche Inhalte — nur ohne Personalisierung. Zero Drittdaten-Verarbeitung, DSGVO-sauber by Default.
- **Social Proof:** Testimonials (→ 4.10), Portfolio/Arbeitsproben (→ 4.11), GitHub-Stats
- **Datenquelle:** JobSync-Profil, Skillsets (→ 4.1), generierte Dokumente (→ 4.2), Match-Scores, Portfolio (→ 4.11)
- **Cross-Ref:** Public API (7.1) als Daten-Backend, Data Enrichment (1.13) für Logo/Company-Context, DSGVO Consent-by-Referral (6.1)

---

## 10. Sprint E: UI-Lücken schließen (Backend→Frontend Alignment)

**Rationale:** Sprint C5+C6 haben Backend-Capabilities gebaut die nie an die UI angeschlossen wurden. 8 Server Actions sind ohne Consumer, 1 Page ist nicht navigierbar. Dieser Sprint schließt die Lücken.

### Sprint E1: Kritische UI-Lücken (Feature komplett ohne UI)

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

## Implementierte Features (Stand: 2026-04-03)

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
| Security Audit: 25+ Vulnerabilities | ✅ Gefixt (ADR-015 bis ADR-025) |
| Allium Specs (21 Specs, ~10345 Lines) | ✅ Spezifiziert + Aligned |
| Test Suite: 140 Suites, 2606 Tests, 79 E2E | ✅ Grün |
| Bug Tracker: 281 Bugs | ✅ Alle gefixt |
