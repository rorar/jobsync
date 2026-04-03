Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-01-session-staged-sprint-verification-design.md
Lies docs/BUGS.md und docs/documentation-agents.md

## Quick-Verify (S3 Handoff prüfen)

Führe aus:
```bash
git log --oneline -10
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
```

Prüfe: Build grün? Tests grün? BUGS.md offene Issues? ROADMAP.md: 5.3 + 5.6 als DONE?

```bash
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE"
```

Wenn rot: Erst fixen (max 15 Min), dann weiter.

## Kontext

Sprint A+B+C ist verifiziert und hardened. UX-Qualität systematisch geprüft. CRM Core (5.3 Job Status Workflow + 5.6 Kanban Board) ist in S3 implementiert mit Allium Spec, Comprehensive Review und E2E Tests.

Dies ist **Session S4** — die fünfte und letzte Session. Ziel: ROADMAP 1.13 Phase 1 implementieren — Data Enrichment Connector mit Logo-Modulen und Link-Parsing als neuer Connector-Typ.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s4-data-enrichment
```

### Schritt 0: S3 + S3-Resume Deferred Items übernehmen

Lies die Memory `project_s3_deferred_items.md` — sie enthält die aktualisierten Items nach S3-Resume.

**S3-Resume hat erledigt:**
- ~~S3-D2: updateJob bypasses state machine~~ → ✅ `isEditTransitionValid` implementiert
- ~~S3-D4: Within-column reorder no-op~~ → ✅ `useSortable` → `useDraggable` (DnD disabled statt silent no-op)
- Compare-and-swap: `changeJobStatus` akzeptiert optionales `expectedFromStatusId` (STALE_STATE error)
- 20+ Security/a11y/Performance Fixes (siehe CHANGELOG.md S3-Resume)

**SECURITY-CRITICAL (sofort fixen, VOR der PLAN-Phase):**

1. **S3-D1 (HIGH): Public API PATCH bypassed State Machine** — `/api/v1/jobs/:id` kann `statusId` direkt ändern ohne `changeJobStatus`. Fix: Status aus PATCH-Blacklist, neuer Endpoint `POST /api/v1/jobs/:id/status`.

**S3-Resume Deferred — HIGH (in Step 0 oder PLAN-Phase):**

2. **DAU-7 (HIGH): Kanban nutzt paginiertes getJobsList statt getKanbanBoard** — Zeigt max 25-100 Jobs, Tags fehlen. Architektur fertig designed (Adapter-Shim), nicht implementiert. Siehe `.full-stack-feature/03-architecture.md`.
   **How to apply:** `loadKanbanBoard()` in JobsContainer, Normalizer `kanbanBoardToJobResponses()`.

3. **S3-D3 (HIGH): Optimistic Locking** — Compare-and-swap auf Action-Ebene existiert jetzt, aber Schema-Level `version` Field fehlt noch. Fix: `version Int @default(0)` auf Job.

**S3-Resume Deferred — MEDIUM (in die DO-Phase integrieren):**

4. **F7: handleError English Prefixes** — ~48 Callsites mit hardcoded English. Fix: i18n Keys ersetzen.
5. **F6: Toast Dismiss hardcoded English** — `label` Prop auf ToastClose, `useTranslations()` in Toaster.
6. **EDGE-3: Empty Kanban Board ohne CTA** — `onAddJob` Prop durch KanbanBoard zu KanbanEmptyState durchreichen.
7. **S3-D5 bis D10 (MEDIUM/LOW):** Siehe `project_s3_deferred_items.md` für Details.

**Key Context aus S3-Resume:**
- State Machine: `src/lib/crm/status-machine.ts` + `src/lib/crm/validate-edit-transition.ts`
- Domain Event: `JobStatusChanged` in `event-types.ts`
- Kanban: @dnd-kit/core (useDraggable, NICHT mehr @dnd-kit/sortable) in `src/components/kanban/`
- Shared Utility: `src/lib/crm/status-labels.ts` (getStatusLabel)
- ActionErrorCode: enthält jetzt `STALE_STATE`
- Tests: 2419 passing (129 suites), incl. TDD-Tests für state machine enforcement + compare-and-swap

### PLAN-Phase

#### 1. Allium Spec erstellen
Starte `/allium:elicit` für die Data Enrichment Domain:
- **Enrichment-Dimensionen:** Logo, Deep-Link (Meta/OpenGraph), (zukünftig: Reviews, Contact)
- **Fallback-Chains:** Pro Dimension eine Chain von Modulen (Clearbit → Google Favicon → Placeholder)
- **Cache-TTL:** Wie lange sind Enrichment-Daten gültig? (Logos: lang, Reviews: kurz)
- **Module-Interface:** `DataEnrichmentConnector` mit `enrich(companyDomain: string): EnrichmentResult`
- **Trigger:** Wann wird Enrichment ausgelöst? (Company-Create, Job-Import, Manual, Scheduled)
- **Fehler-Verhalten:** Was passiert wenn ALLE Module in der Chain fehlschlagen? Graceful degradation.

#### 2. ROADMAP Deep-Dive
Cross-Dependencies:
- 2.4 (Auto-Fetch Firmenlogos) — Consumer des Logo-Enrichments
- 2.2 (Kununu/Glassdoor in Jobdetails) — Zukünftiges Review-Modul
- 3.6 (Link-Parsing und Auto-Fill) — Consumer des Deep-Link-Enrichments
- 9.5 (Bewerber-Landingpage) — Logos + Company-Context auf der Landingpage, Deep-Links für Social Proof
- 4.2 (Dynamic CV) — Enriched Company-Daten (Logo, Website) in generierten CVs
- 4.10 (Social Proof) — GitHub-Stats als potenzielle zukünftige Enrichment-Dimension
- Shared-Client-Pattern: Google Maps Client (falls Places-Modul später kommt)

**Frage:** Was muss Phase 1 vorbereiten damit Phase 2 (Reviews, Contact-Extraction) draufbauen kann?

#### 2.5. Schema-Design
Verwende `/database-design:postgresql` für das Schema-Design der Enrichment-Tabellen:
- `EnrichmentResult` — Cache-Tabelle mit TTL, Modul-Referenz, Domain-Key
- `EnrichmentLog` — welches Modul hat wann was resolved (für Effektivitäts-Dashboard)
- Indexing für Fallback-Chain Lookups (domain + dimension + freshness)
- **WICHTIG:** Das Projekt nutzt **Prisma + SQLite**, nicht raw PostgreSQL. Übertrage die Design-Prinzipien (Normalisierung, Indexing, Constraints) auf Prisma-Schema-Syntax. Keine PostgreSQL-spezifischen Features verwenden.

#### 3. Architektur
Folge dem bestehenden Module Lifecycle Pattern:
```
src/lib/connector/data-enrichment/
  types.ts                   ← DataEnrichmentConnector Interface, EnrichmentResult
  registry.ts                ← Facade über moduleRegistry
  orchestrator.ts            ← Fallback-Chain-Orchestrierung
  modules/
    clearbit/                ← Logo via Domain (kostenlos, kein API-Key)
      index.ts, manifest.ts
    google-favicon/          ← Favicon via Google S2 (kostenlos)
      index.ts, manifest.ts
    meta-parser/             ← URL → OpenGraph/Meta-Tags
      index.ts, manifest.ts
```

Jedes Modul deklariert ein `DataEnrichmentManifest` (wie `JobDiscoveryManifest` — ID, Credentials, Health, Resilience, Capabilities).

### DO-Phase

Starte `/full-stack-orchestration:full-stack-feature` für die Umsetzung.

**Implementierungs-Reihenfolge:**
1. `DataEnrichmentConnector` Interface + Types
2. `DataEnrichmentManifest` Type (extends base ModuleManifest)
3. Registry Facade
4. Fallback-Chain Orchestrator
5. Clearbit Logo Module (einfachstes Modul zuerst)
6. Google Favicon Module
7. Meta/OpenGraph Parser Module
8. Integration: Company-Create → Enrichment-Trigger
9. UI: Enrichment-Status in Company/Job-Details (Logo anzeigen, "Enriched by: Clearbit" Info)
10. Settings UI: Module Activation/Deactivation (folgt bestehendem Pattern)

**UX-Enrichment:** Verwende `/ui-design:interaction-design` für Loading-Transitions (Skeleton → Logo Fade-In), Enrichment-Status Feedback und Fallback-Visualisierung.
**Accessibility:** Verwende `/accessibility-compliance:wcag-audit-patterns` für WCAG 2.2 Compliance der neuen Enrichment-UI Komponenten.

**UX-Pflicht für JEDE neue Komponente:**
- Loading State (Logo wird geladen → Skeleton)
- Empty State (kein Logo gefunden → Placeholder-Icon)
- Error State (Enrichment fehlgeschlagen → Graceful degradation, kein Fehler für User)
- i18n (alle 4 Locales)

**Test-Pflicht für External APIs:**
- Clearbit, Google Favicon, Meta/OpenGraph Parser machen HTTP-Calls zu externen Services
- In Unit Tests: HTTP-Responses mocken (kein echtes Netzwerk)
- Teste alle Fallback-Pfade: Modul 1 down → Modul 2 → Modul 3 → Placeholder
- Teste Timeout, Rate-Limit, Malformed Response Szenarien

Committe nach jedem logischen Schritt. Build + Tests VOR jedem Commit.

**Prisma-Workflow bei Schema-Änderungen:**
```bash
bash scripts/prisma-migrate.sh   # Migration erstellen
bash scripts/prisma-generate.sh  # Client regenerieren
source scripts/env.sh && bun run build  # Build prüfen
```
**KRITISCH (Learning aus S3):** Der Agent der das Prisma-Schema ändert MUSS `prisma-generate.sh` als letzten Schritt ausführen. Sonst haben alle anderen Agents Prisma-Type-Errors. Schreibe diese Anforderung explizit in jeden Agent-Prompt der Schema-Files berührt.

### CHECK-Phase

1. `allium:weed` — Stimmt Implementation mit Spec überein?
2. `/comprehensive-review:full-review` mit `/agent-teams:multi-reviewer-patterns` — koordiniere parallele Reviews über alle 5 Dimensionen mit Finding-Deduplizierung, Severity-Kalibrierung und konsolidiertem Report. Einzel-Reports in `docs/reviews/s4/` ablegen. Konsolidierter Report verweist pro Finding auf den Quell-Report. Fixe nach dem konsolidierten Report — bei Bedarf Einzel-Report für Detail-Kontext nachlesen.
3. User Journey: Company erstellen → Logo automatisch enriched → in Job-Details sichtbar
4. **Dreistufige Analyse (Learning aus S3: Blind Spot allein findet nur ~43% der Findings):**

   **Stufe 1 — Offen (Agent denkt eigenständig):**
   Dispatche 3 parallele Analyse-Agents mit je einer breiten Frage:
   - Agent A: "Blind Spot: Woran haben wir nicht gedacht?"
   - Agent B: "DAU/BDU (Brain Dead User): Was macht ein User der nicht nachdenkt, keine Anleitung liest und alles falsch bedient?"
   - Agent C: "Edge Cases: Was passiert bei Extremen, Grenzfällen und unerwarteten Zuständen?"

   **Stufe 2 — Gezielt (Sicherheitsnetz, fängt ab was Stufe 1 übersieht):**
   Nach Stufe 1, dispatche Nachbohrer-Agents mit spezifischen Fragen:

   Blind Spot Nachbohrer:
   - "Welche Code-Pfade haben keinen Test?"
   - "Welche Server Actions akzeptieren Input der nicht validiert wird?"
   - "Welche Prisma Queries haben kein `userId` in der WHERE-Clause?"
   - "Welche Enrichment-Module haben keine Fallback-Logik wenn die API nicht erreichbar ist?"

   DAU/BDU Nachbohrer:
   - "Du bist ein User der zum ersten Mal eine Firma mit Logo sieht. Was ist verwirrend?"
   - "Du klickst 'Enrichment starten' und es passiert nichts sichtbares. Was erwartest du?"
   - "Du hast 200 Firmen ohne Logo. Was siehst du? Wie lange wartest du?"
   - "Du nutzt die App nur auf dem Handy (375px). Was geht nicht? Was ist zu klein?"

   Edge Case Nachbohrer:
   - "Was passiert wenn Clearbit UND Google Favicon UND Meta-Parser alle gleichzeitig down sind?"
   - "Was passiert bei einer Domain die nicht existiert? Bei einer Domain ohne Favicon?"
   - "Was passiert wenn der Enrichment-Cache voll ist? Wenn der TTL abläuft während ein Request läuft?"
   - "Was passiert wenn 50 Companies gleichzeitig enriched werden? Rate Limits?"
   - "Was passiert wenn die Company gelöscht wird während das Enrichment noch läuft?"

   **Stufe 3 — Anti-Stille-Herabstufung:**
   Wenn ein Finding als "nicht fixbar" oder "accepted debt" eingestuft wird, MUSS das explizit kommuniziert werden mit Begründung. Stillschweigendes Weglassen ist VERBOTEN.

5. UX 10-Punkte-Checkliste für neue Komponenten
6. Cross-Dependency Check: Sind 2.4, 3.6, 9.5 (Landingpage), 4.2 (Dynamic CV) vorbereitet?

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. Aktualisiere ROADMAP.md (1.13 Phase 1 als DONE/Teilweise markieren)
4. Aktualisiere CLAUDE.md (Data Enrichment Connector Architektur-Sektion)
5. Aktualisiere CHANGELOG.md
6. Dokumentation: `/documentation-generation:docs-architect` für Architecture Overview

## Übergreifende Regeln

### Git
- Branch: `session/s4-data-enrichment`
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### Team-Orchestrierung — PFLICHT, nicht optional

**KRITISCH:** Du MUSST Subagenten und Team-Agents für parallele Arbeit verwenden. Mache NICHT alles sequenziell im Main-Agent. Der Main-Agent orchestriert und delegiert.

**Für die PLAN-Phase:**
- Dispatche `/allium:elicit` als eigenen Agent für die Enrichment Spec
- Main-Agent macht den ROADMAP Deep-Dive parallel

**Für die DO-Phase — SEQUENZIELL dann PARALLEL (Learning aus S3):**

S3 hatte kaskadierte Build-Failures weil parallele Agents Code gegen noch-nicht-existierende Types geschrieben haben. Fix: Erst Foundation legen, dann parallelisieren.

**Schritt 1 (SEQUENZIELL — ein Agent, Main-Agent wartet):**
- Prisma Schema ändern (neue Models: EnrichmentResult, EnrichmentLog)
- `bash scripts/prisma-migrate.sh` + `bash scripts/prisma-generate.sh`
- Types/Interfaces definieren: `DataEnrichmentConnector`, `DataEnrichmentManifest`, `EnrichmentResult`, `ActionErrorCode` Erweiterungen
- Main-Agent verifiziert: `tsc --noEmit` = zero Errors
- Commit: "feat(enrichment): add schema + types foundation"

**Schritt 2 (PARALLEL — erst NACH Schritt 1):**
- Agent 1: Connector-Infrastruktur (registry.ts, orchestrator.ts) — nutzt Types aus Schritt 1
- Agent 2: Module (clearbit/, google-favicon/, meta-parser/) — nutzt Interfaces aus Schritt 1
- Agent 3: Frontend (Company-Integration, Logo-Anzeige, Settings UI, i18n) — nutzt Types aus Schritt 1
- File-Ownership strikt trennen — kein Agent ändert Files eines anderen

**Build-Serialisierung (Learning aus S3):**
- Agents dürfen NICHT parallel `bun run build` ausführen — das korruptiert `.next/`
- NUR der Main-Agent führt Build-Verification aus, NACHDEM alle Agents fertig sind
- Agents dürfen `tsc --noEmit` für Type-Checking nutzen (kein `.next/` Konflikt)

**Für die CHECK-Phase MUSST du:**
- Starte `/comprehensive-review:full-review` ODER `/agent-teams:team-review` (5 Dimensionen)
- Dispatche Blind Spot Check als eigenen Agent
- Dispatche User Journey Analyse als eigenen Agent

**Für Fixes — nach FILES aufteilen, NICHT nach Finding-Typ (Learning aus S3-Resume):**
S3-Resume hat Fix-Agents nach Typ aufgeteilt (Security-Agent, WCAG-Agent, Performance-Agent). Mehrere Agents haben dieselbe Datei (`KanbanColumn.tsx`) gleichzeitig editiert → Syntax-Errors durch concurrent Edits. Fix: Gruppiere ALLE Findings (egal ob Security, WCAG, Performance) nach betroffenen Files. Ein Agent bekommt ALLE Findings für seine File-Gruppe.

### VERBOTEN für den Main-Agent
Der Main-Agent darf KEINE der folgenden Aktionen selbst ausführen:
- ❌ Code lesen/schreiben mit Read/Edit/Write (außer Koordinations-Files wie BUGS.md, CHANGELOG.md, ROADMAP.md, CLAUDE.md)
- ❌ Tests schreiben oder ausführen
- ❌ Review-Findings selbst fixen ("I'll fix this quickly while waiting")
- ❌ UI-Komponenten ändern
- ❌ Allium Specs schreiben oder editieren

Der Main-Agent darf NUR:
- ✅ Agents dispatchen und koordinieren
- ✅ Agent-Ergebnisse prüfen und zusammenführen
- ✅ Koordinations-Files aktualisieren (BUGS.md, CHANGELOG.md, ROADMAP.md, CLAUDE.md, docs/)
- ✅ Git-Operationen (commit, merge, branch)
- ✅ Build/Test Verification Commands ausführen
- ✅ Architektur-Entscheidungen treffen und an Agents kommunizieren

Wenn ein Agent abbricht oder ein Finding übrig bleibt: Dispatche einen NEUEN Agent. Mache es NICHT selbst.

### Resilienz bei API-Fehlern
Bei HTTP 500 oder Timeout-Fehlern:
- Warte 30 Sekunden, dann erneut versuchen
- Wenn Sub-Agent abbricht: Prüfe Commits, dispatche neuen Agent für Rest
- Ignoriere "Task not found" Fehler — harmloses Bookkeeping bei parallelen Agents
- Keine `sleep`-Loops zum Agent-Polling. Agent-Results über TaskOutput/SendMessage abfragen.

### Learnings aus S1a+S1b (BEACHTEN)

**1. Consolidation-Agent IMMER zuletzt:**
Dispatche den Consolidation-Agent (der Einzel-Reports zusammenführt) ERST wenn ALLE Review/Fix-Agents fertig sind. NIEMALS gleichzeitig — sonst liest er stale Reports.

**2. Formatter/Linter beachten:**
Wenn Edits von einem Formatter/Linter revertiert werden: Root Cause identifizieren (`.eslintrc.json`, prettier, Post-Save-Hooks) und Konflikt lösen BEVOR erneuter Fix-Versuch.

**3. Keine sleep-Loops:**
Verwende direkte Agent-Completion-Abfragen statt `sleep 120` Bash-Loops.

**4. Agent-Claims verifizieren (67% Fabrication-Rate):**
S2-Resume hat entdeckt dass Review-Agents in 67% der Fälle Findings/Fixes fabrizieren. IMMER verifizieren:
- Nach jedem "Finding fixed" Claim: `git diff` prüfen ob die Änderung tatsächlich existiert
- Konsolidierte Reports die "all X findings fixed" behaupten: Stichproben-Verifikation an den Dateien
- Für CRITICAL/HIGH Findings: Die gemeldete Datei + Zeilennummer öffnen und Fix bestätigen

### DDD-Prinzipien
- **CRITICAL (aus JobSync Memory):** Externe Systeme sind MODULE hinter bestehenden Connectors, NIEMALS neue Connectors. Clearbit, Google Favicon, Meta-Parser sind Module hinter dem `DataEnrichmentConnector`.
- Manifest-Driven: Jedes Modul deklariert ein Manifest. Kein hardcoded Module-Wissen im Orchestrator.
- Shared-Client-Pattern: Falls ein externes System von mehreren Connectors genutzt wird (z.B. Google Maps), shared Client Utility erstellen.

### Module Lifecycle
Folge EXAKT dem bestehenden Pattern aus `src/lib/connector/`:
- `manifest.ts` → deklariert ModuleManifest
- `index.ts` → implementiert Connector Interface
- Registration in `connectors.ts` Barrel
- Credential Resolution via `credential-resolver.ts`
- Health Monitoring via `health-monitor.ts`
- Degradation via `degradation.ts`

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings. Keine Ausnahmen.

### ANTI-FAULHEIT — Verbotene Begründungen für Skips
Die folgenden Begründungen sind UNGÜLTIG um einen Schritt zu überspringen:
- ❌ "Aus Zeitgründen übersprungen"
- ❌ "Good enough" / "sufficient" / "acceptable"
- ❌ "Moving on" / "for now"
- ❌ "Deferred to next session" (ohne expliziten fachlichen Grund)
- ❌ "Conservative scope"
- ❌ "Not critical"

Gültige Skip-Begründungen (NUR diese):
- ✅ Technische Unmöglichkeit mit Erklärung
- ✅ Explizite fachliche Entscheidung mit Begründung
- ✅ Blocker durch externen Fehler — dokumentiere in BUGS.md

### PFLICHT-CHECKPOINTS (Evidenz vor jedem nächsten Schritt)

Du MUSST jeden Checkpoint mit Evidenz bestätigen bevor du zum nächsten Schritt gehst.
ÜBERSPRINGE KEINEN CHECKPOINT.

**Vor Schritt 0 (S3 Deferred Items):**
- [ ] CP-0a: `project_s3_deferred_items.md` gelesen → 10 Items bekannt
- [ ] CP-0b: S3-D1 + S3-D2 (Security) gefixt → `git diff` zeigt State-Machine-Enforcement in API + Edit Form
- [ ] CP-0c: `allium:weed` Stichprobe über `crm-workflow.allium` + `job-aggregate.allium` → zero Divergenzen

**Vor der DO-Phase:**
- [ ] CP-1: `/allium:elicit` dispatcht → Spec-Datei existiert in `specs/`
- [ ] CP-2: `/database-design:postgresql` dispatcht → Schema-Design dokumentiert (Prisma+SQLite!)
- [ ] CP-3: ROADMAP Deep-Dive abgeschlossen → Cross-Dependencies identifiziert

**Vor der CHECK-Phase:**
- [ ] CP-4: Alle 3 Module implementiert (Clearbit, Google Favicon, Meta-Parser)
- [ ] CP-5: Fallback-Chain-Orchestrator funktional
- [ ] CP-6: Integration Company-Create → Enrichment → Logo sichtbar
- [ ] CP-7: Alle neuen Komponenten haben Loading/Empty/Error/i18n States
- [ ] CP-8: External API Tests mit Mocks geschrieben

**Vor der ACT-Phase — EXAKTE Skill-Aufrufe (Learning aus S3):**

S3 hat generische `Agent("review")` Aufrufe statt der spezialisierten Skills verwendet. Skills laden spezialisierte Prompts und Checklisten — generische Agents improvisieren. Du MUSST die folgenden Skills EXAKT aufrufen.

**WICHTIG (Learning aus S3-Resume):** Verwende das **`Skill` Tool**, NICHT das `Agent` Tool. `Skill("comprehensive-review:full-review")` ist korrekt. `Agent(subagent_type="comprehensive-review:full-review")` schlägt fehl weil nicht alle Skills als Agent-Type registriert sind. Im Zweifel: immer `Skill` Tool verwenden.

- [ ] CP-9: Rufe `/comprehensive-review:full-review` auf (NICHT `Agent("comprehensive review")`). Dann `/agent-teams:multi-reviewer-patterns` zur Konsolidierung. Reports in `docs/reviews/s4/`. **Evidenz:** Skill-Invocation-Output zeigen.
- [ ] CP-10: Rufe `/accessibility-compliance:wcag-audit-patterns` auf (NICHT `Agent("a11y check")`). **Evidenz:** Skill-Output + Findings-Datei.
- [ ] CP-11: Rufe `/ui-design:interaction-design` auf (NICHT `Agent("interaction review")`). **Evidenz:** Skill-Output + dokumentierte Patterns.
- [ ] CP-12: Rufe `/business-analytics:data-storytelling` auf (NICHT `Agent("dashboard")`). **Evidenz:** Skill-Output + Visualisierung.
- [ ] CP-13: Rufe `allium:weed` auf über alle betroffenen Specs. **Evidenz:** Weed-Output = zero Divergenzen.
- [ ] CP-14: Dispatche Blind Spot Agent: "Woran haben wir nicht gedacht?" **Evidenz:** Findings dokumentiert.

**Vor dem Merge:**
- [ ] CP-15: ALLE Findings aus konsolidiertem Report gefixt
- [ ] CP-16: Re-Review bestätigt zero Regressionen
- [ ] CP-17: Exit-Checkliste vollständig mit Evidenz

### Learnings aus S1a+S1b+S2 (BEACHTEN)

**1. Skills werden ignoriert wenn sie nur "erwähnt" werden:**
Deshalb sind sie jetzt als PFLICHT-CHECKPOINTS formuliert. Du KANNST sie nicht überspringen.

**2. Consolidation-Agent IMMER zuletzt:**
ERST wenn ALLE Review/Fix-Agents fertig sind. NIEMALS gleichzeitig.

**3. Formatter/Linter beachten:**
Root Cause identifizieren BEVOR Fix-Versuch.

**4. Keine sleep-Loops:**
Direkte Agent-Completion-Abfragen statt `sleep 120`.

**5. Allium Weed wird vergessen:**
Deshalb CP-13 in der CHECK-Phase — nicht optional.

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items als offene Issues
3. Schreibe eine Handoff-Notiz in die letzte Commit-Message
4. Starte KEINE neuen Module — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.) um Daten anzureichern — z.B. Library-Docs, API-Referenzen, Best Practices, aktuelle Framework-Versionen.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] Allium Spec für Data Enrichment Domain geschrieben und verifiziert (`specs/data-enrichment.allium`)
- [ ] `allium:weed` = zero Divergenzen
- [ ] DataEnrichmentConnector Interface implementiert
- [ ] 3 Module: Clearbit Logo, Google Favicon, Meta/OpenGraph Parser
- [ ] Fallback-Chain-Orchestrator funktional
- [ ] Integration: Company-Create triggert Enrichment
- [ ] Logo in Job/Company-Details sichtbar
- [ ] Settings UI: Module Activation/Deactivation
- [ ] Comprehensive Review bestanden (zero Findings)
- [ ] User Journeys + Edge Cases dokumentiert
- [ ] UX 10-Punkte-Checkliste bestanden
- [ ] Blind Spot Check durchgeführt
- [ ] Cross-Dependencies: 2.4, 3.6, 9.5 (Landingpage), 4.2 (Dynamic CV) vorbereitet
- [ ] E2E Tests hinzugefügt
- [ ] docs/BUGS.md aktualisiert
- [ ] CLAUDE.md aktualisiert (Data Enrichment Architektur)
- [ ] ROADMAP.md: 1.13 Phase 1 als DONE markiert
- [ ] CHANGELOG.md Einträge: `## [YYYY-MM-DD] Session S4 — Data Enrichment`
- [ ] Dokumentation generiert (Architecture Overview)
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s4-data-enrichment` nach main mergen
