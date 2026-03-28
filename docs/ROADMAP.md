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

### 0.2 ActionResult<T> Typisierung vervollständigen
- **Pattern A** (70/72 Funktionen): `ActionResult<unknown>` ✓ — fast abgeschlossen
  - 68 mit `ActionResult<unknown>` — bereit für spezifische Typ-Migration
  - 2 mit `ActionResult<Activity>` — Vorbild für die restlichen
  - **Verbleibend:** `unknown` → spezifische Domain-Typen (Job, Company, Activity[], etc.)
- **Pattern B** (6 Funktionen): `getAllX()` gibt raw Arrays zurück (throw-on-error)
  - Caller-Refactoring damit auch `getAllX` ActionResult nutzt
- **Pattern C** (24 Funktionen): Custom Return-Types
  - Automation (12): eigenes `{ success, data?, message? }` Shape — funktioniert, ggf. beibehalten
  - Dashboard (7): domänenspezifische Returns — bleiben custom
  - ApiKey (3): sollte auf ActionResult migriert werden
  - Auth (2): untypisiert — Auth-Refactoring separat
- Endziel: `ActionResult<DomainType>` mit spezifischen Prisma-aligned Domain-Models
- Reihenfolge: **0.2 vor 0.3** — erst ActionResult-Typen konkretisieren, dann Domain-Models alignen
- Siehe `specs/action-result.allium` für die vollständige Klassifikation

### 0.3 Domain-Model Alignment
- Prisma-generierte Typen und Domain-Model Interfaces (`src/models/`) synchronisieren
- Ermöglicht `ActionResult<Job>` statt `ActionResult<unknown>`
- **Bekannte Gaps:**
  - Models sind monolithisch (Prisma ≡ Domain) — kein DTO/Mapper-Layer
  - DateTime-Inkonsistenz: `profile.model.ts` nutzt `string` statt `Date`
  - Optional-Field-Mismatch: Models vs. Prisma non-nullability
  - Computed Fields (`_count`, `_total`) nicht formalisiert
- **Reihenfolge:** Nach 0.2, da 0.2 die konkreten Typen liefert, die 0.3 aligned
- Voraussetzung für automatische API-Dokumentation (Roadmap 7.1)

### 0.4 Module Lifecycle Manager
Module registrieren sich mit einem **Manifest** beim Connector und deklarieren ihre Settings-Anforderungen. Der Lifecycle Manager propagiert Settings, verwaltet Aktivierung/Deaktivierung und überwacht Health.

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

- Voraussetzung für: Marketplace UI (→ 2.7), Unified Automation Wizard (→ 2.7), Onboarding Modul-Aktivierung (→ 2.1)
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

**Open Questions:**
- Undo-Implementierung: Command Pattern (Action-Stack) oder einfacher Timer-basierter Soft-Revert?

- **Reihenfolge:** Nach 0.4 (Module Lifecycle), da Inbox-Events die Connector-Infrastruktur nutzen
- **Voraussetzung für:** Job-Tinder Dual-Use (2.7), CRM (5), Bewerbungsunterlagen (4)
- Allium Spec: `specs/vacancy-pipeline.allium` (zu erstellen)

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

### 1.4 Connector → JOB_SOURCES Sync
- Aktivierte Module aktualisieren automatisch die JOB_SOURCES für die Job-Tabelle und Job-Details/Metadaten

### 1.5 Job-Alerts
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
- Integration mit Kartenansicht (→ 2.4)

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
- **Modul: E-Mail (SMTP/IMAP)** — Bewerbungs-E-Mails senden/empfangen
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
- Kann als Enrichment-Modul (Weiterbildungsempfehlungen) oder als eigenständiger Connector fungieren

### 1.16 Weitere Bundes-APIs (Discovery)
- Weitere nützliche APIs der Bundesregierung evaluieren und discovern:
  - https://bund.dev/apis/
  - https://andreasfischer1985.github.io/arbeitsagentur-apis/

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
- **Vorbedingung:** Modul-Evaluation abgeschlossen (→ 1.8), verfügbare Module bestimmen den UI-Scope
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

### 2.7 Job-Tinder
- Swipe/Icon Click/Pfeiltasten Navigation
- Aktionen: Kein Match (Archiv) / Match / Favorit / Mehr Details
- Kartenbasierte Darstellung der entdeckten Jobs

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

### 2.10 Unified Add Automation Workflow
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
- Output: Persönliches Profil-Statement für Bewerbungsunterlagen, Landingpage (→ 4.7), LinkedIn/XING

### 2.15 Company Blacklist
- User kann Unternehmen auf eine Blacklist setzen
- **Usecases:** Alter Arbeitgeber, ethisch/persönlich unpassende Unternehmen, bekannte Fake-Inserate
- Blacklisted Companies werden automatisch aus Staging gefiltert (→ 0.5 StagedVacancy → dismissed)
- Konfigurierbar: per Firmenname, Domain, oder Handelsregisternummer
- Blacklist-Grund optional dokumentierbar (nur für User sichtbar)

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
  - Domain Event: `JobExpired` → Consumer können reagieren (CRM, Notifications)
- Konfigurierbar: Check-Frequenz, Batch-Größe, automatische Aktion bei Ablauf

### 3.9 LLM-gestützter Vertrags- und Angebotscheck
- Arbeitsverträge und Angebote durch LLM analysieren lassen
- Prüfpunkte: Gehalt vs. Markt (→ Entgeltatlas 1.13), Kündigungsfristen, Wettbewerbsklauseln, Probezeit, ungewöhnliche Klauseln
- **Weiterleitungsfunktion:** Vertrag per E-Mail/Kommunikationsweg an Gewerkschaft, Anwalt, Beratungsstelle weiterleiten (→ Communication Connector 1.12)
- LLM-Entkopplung: Ohne LLM nur Checkliste/Hinweise, mit LLM semantische Analyse

---

## 4. Bewerbungsunterlagen

### 4.1 Skillsets
- Verwaltung von Skill-Profilen basierend auf ESCO/NACE Taxonomien

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
- Tracking: Aufrufe, Verweildauer (optional)
- **DSGVO:** Öffentliche Seite mit personenbezogenen Daten → Datenschutzhinweis erforderlich, Passwortschutz/Expiring Links (→ 6.1)

### 4.8 Städte: Verdienst-Index
- Gehaltsvergleich nach Stadt/Region
- **Datenquellen:** Data Enrichment Connector (→ 1.13) — Modul: Glassdoor/Kununu Gehaltsdaten, Entgeltatlas der Arbeitsagentur, Destatis Verdiensterhebung

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

### 5.4 Automatisierung & Reminders
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

### 6.2 API Security (Best Practices)
- **Authentifizierung:** Alle API-Routes erfordern Session-Auth (bereits implementiert für ESCO/EURES)
- **Rate Limiting:** Request-Limits pro User/IP (bereits für manuelle Automation-Runs)
  - Erweiterung: globales Rate Limiting via Redis/Memory für alle Endpunkte
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

---

## 7. API & Dokumentation

### 7.1 Automatische API-Dokumentation
- OpenAPI/Swagger Dokumentation für alle API-Endpunkte
- Auto-generiert aus den Next.js API Routes

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

**Zu automatisierende Flows (Top 5-10):**
1. Dashboard-Übersicht (Hero-Screenshot für README)
2. Automation Wizard (Schritt-für-Schritt Flow als GIF)
3. Job-Tinder Swipe UI (wenn implementiert)
4. Settings / Connector-Aktivierung
5. Profil + CV-Verwaltung

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
- Nicht zu verwechseln mit der Vacancy Staging Area (→ 0.5) — dies ist eine System-Queue, keine User-Queue

### 8.5 DB-Migrationstool (Gsync → rorar)
- Migrationsskript für Datenbankumzug von Gsync-Fork zu eigenem Repository (rorar)
- Schema-Mapping, Daten-Export/Import, Validierung
- Einmalige Migration mit Rollback-Möglichkeit

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
- **Ressourcen:**
  - https://github.com/julianrosenberger/careerbert

---

## Implementierte Features (Stand: 2026-03-26)

| Feature | Status |
|---|---|
| Roadmap 0.1: Connector Architecture Unification (ADR-010) | ✅ Implementiert |
| EURES Modul (EU Jobs) | ✅ Implementiert |
| JSearch Modul (Google Jobs) | ✅ Upstream |
| EURES Location Combobox (NUTS + Flags) | ✅ Implementiert |
| ESCO Occupation Combobox (Multi-Select + Details) | ✅ Implementiert |
| i18n (EN, DE, FR, ES) — 496 Keys | ✅ Implementiert |
| Locale-aware Date/Number Formatting | ✅ Implementiert |
| EU API Language Integration | ✅ Implementiert |
| User Language Settings | ✅ Implementiert |
