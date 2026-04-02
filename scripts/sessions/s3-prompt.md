Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-01-session-staged-sprint-verification-design.md
Lies docs/BUGS.md und docs/documentation-agents.md
Falls vorhanden: Lies docs/user-journey-audit.md

## Quick-Verify (Handoff prüfen)

Führe aus:
```bash
git log --oneline -10
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
```

Prüfe: Build grün? Tests grün? BUGS.md offene Issues?

```bash
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE"
```

Wenn rot: Erst fixen (max 15 Min), dann weiter.

## Kontext

Sprint A+B+C Tracks 1-3 sind verifiziert und hardened (S1a: Allium Weed + Gap Analysis + Perf Fixes; S1b: 5-Dimensionen Review + Zero-Tolerance Fixes). UX-Qualität wurde in S2 systematisch geprüft (User Journeys + 10-Punkte-Checkliste für alle Komponenten). Die Codebase ist production-ready für existierende Features.

Dies ist **Session S3** — die vierte von 5 Sessions. Ziel: ROADMAP 5.3 (Job Status Workflow) + 5.6 (Kanban Board) implementieren im vollen PDCA-Zyklus.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s3-crm-core
```

### Schritt 0: S2 Deferred Items übernehmen

Lies die Memory `project_s2_deferred_items.md` — sie enthält 27 Items die S2/S2-Resume korrekt zu S3 deferred hat. Folgende gehören in den S3-Scope:

1. **DUP-4: RunCoordinator lock release** — 3 Stellen mit duplizierter Lock-Release-Logik in `run-coordinator.ts`. S3 berührt RunCoordinator für Domain Events → consolidiere dann. Extrahiere `releaseLockWithCleanup(reason)`.
2. **handleError Prisma-Message Leak (ADR-022)** — `handleError()` forwards raw Prisma error.message. Definiere Error-Code-Taxonomie in `action-result.allium`, dann implementiere `errorCode` auf ActionResult.
3. **S2R-BS1: RunHistoryList error/retry Props sind Dead Code** — Parent `AutomationDetailPage` übergibt sie nie. Error-UI rendert nie in Production. Fixe in `[id]/page.tsx`.
4. **S2R-BS2: 19 `animate-spin` ohne `motion-reduce`** in Settings/Admin-Komponenten. Ergänze `motion-reduce:animate-none`.
5. **S2R-BS4: Translation-Map Duplikation** — STATUS_DISPLAY_KEYS + MODULE_DISPLAY_KEYS identisch in AutomationList + AutomationMetadataGrid. Extrahiere nach `src/lib/automation-display-keys.ts`.

Vollständige Liste + Details: `docs/reviews/s2-resume/consolidated-report.md` und `docs/BUGS.md`.

Diese Items sind ZUSÄTZLICH zur CRM-Implementation. Integriere sie in die relevanten Phasen (z.B. DUP-4 in die DO-Phase wenn RunCoordinator berührt wird).

### PLAN-Phase

#### 1. Allium Spec erstellen
**WICHTIG:** Lies zuerst `specs/job-aggregate.allium` — das Job-Aggregate ist bereits spezifiziert. JobStatusHistory ERWEITERT dieses Aggregate. Die neue CRM-Spec muss konsistent mit der bestehenden Job-Spec sein (gleiche Entity-Namen, gleiche Invarianten, gleiche Aggregate-Boundary).

Starte `/allium:elicit` für die CRM Domain-Regeln:
- **Job Status Workflow:**
  - Erlaubte Status: Backlog, In Progress, Submitted, Interview, Offer, Rejected, Accepted, Archived
  - Erlaubte Transitions (State Machine): Welche Übergänge sind valide?
  - Side Effects pro Transition: Was passiert automatisch? (z.B. Timestamp, Notification-Event)
  - Notizen pro Status-Übergang: Pflicht oder optional?
  - Abgrenzung zu Vacancy Pipeline (0.5): Pipeline endet bei Promotion (StagedVacancy → Job). CRM beginnt dort.
- **Kanban Board (5.6):**
  - Column-Mapping zu JobStatus (welche Spalten?)
  - Sortierung innerhalb Spalten (Deadline? Match-Score? Manual?)
  - Drag-and-Drop-Regeln: Welche Transitions per DnD erlaubt?
  - Mobile: Wie funktioniert Kanban auf 375px? (Horizontal scroll? Tabs?)

#### 1.5. Schema-Design
Verwende `/database-design:postgresql` für das Schema-Design der CRM-Tabellen:
- `JobStatusHistory` (Transitions, Timestamps, Notizen, vorheriger/neuer Status)
- Indexing-Strategie für Kanban-Queries (Status + userId + sortOrder)
- Constraint-Design für valide Status-Transitions
- **WICHTIG:** Das Projekt nutzt **Prisma + SQLite**, nicht raw PostgreSQL. Übertrage die Design-Prinzipien (Normalisierung, Indexing, Constraints) auf Prisma-Schema-Syntax. Keine PostgreSQL-spezifischen Features (JSONB, Partial Indexes) verwenden.

#### 2. ROADMAP Deep-Dive
Lies die Cross-Dependencies in docs/ROADMAP.md:
- 5.1 (Communication) — wird CRM-spezifische Features brauchen
- 5.4 (Reminders) — CRM-Reminders als Notification-Rules (→ 0.6)
- 5.9 (Timeline) — Chronologische Timeline pro Job, automatisch befüllt. Discovery: Event Sourcing vs. Audit-Log (→ `/event-store-design`)
- 0.6 (Notifications) — Event Bus als Infrastruktur
- 2.20 (Spotlight / Cmd+K) — CRM-Entities müssen durchsuchbar sein (Job-Status, Kanban-Spalten)
- 9.5 (Bewerber-Landingpage) — Job-Status-Daten als Conversion-Funnel auf der Landingpage
- 4.2 (Dynamic CV) — CRM Job-Status-Daten als Input für CV-Generierung (aktueller Stand pro Bewerbung)

**Frage:** Was muss C5 vorbereiten damit diese Features später draufbauen können? Definiere die Hooks/Events/Interfaces die C5 exponieren muss.

#### 3. UI Wireframes ZUERST
Bevor du Code schreibst:
- Spawne `/ui-design:create-component` für das Kanban Board
- Spawne `/ui-design:design-review` für die Wireframes
- Spawne `/ui-design:interaction-design` für Drag-and-Drop Interactions, Status-Transition Feedback, Kanban Microinteractions
- Spawne `/accessibility-compliance:wcag-audit-patterns` für WCAG 2.2 Compliance der neuen Kanban/CRM Komponenten
- Mobile Responsiveness prüfen mit `/ui-design:responsive-design`
- Warte auf Findings, dann implementiere

#### 4. Architektur-Entscheidungen
- Wähle den NACHHALTIGSTEN Weg basierend auf DDD, ROADMAP und Allium Specs
- Nicht den einfachsten Weg — den Weg der spätere Features (5.1, 5.4, 5.9) ermöglicht
- Wenn eine Entscheidung unklar ist, konsultiere die Allium Spec

### DO-Phase

Starte `/full-stack-orchestration:full-stack-feature` für die Umsetzung.

**UX-Pflicht für JEDE neue Komponente:**
- Loading State, Empty State, Error State
- Mobile Responsiveness (375px+)
- Keyboard Navigation + Focus Management
- Dark Mode Kompatibilität
- i18n (alle 4 Locales: EN, DE, FR, ES)
- Confirmation Dialogs für destruktive Aktionen
- Visuelles Feedback für jede User-Aktion

Committe nach jedem logischen Schritt. Build + Tests VOR jedem Commit.

**Prisma-Workflow bei Schema-Änderungen:**
```bash
bash scripts/prisma-migrate.sh   # Migration erstellen
bash scripts/prisma-generate.sh  # Client regenerieren
source scripts/env.sh && bun run build  # Build prüfen
```

### CHECK-Phase

1. `allium:weed` — Stimmt Implementation mit Spec überein?
2. `/comprehensive-review:full-review` mit `/agent-teams:multi-reviewer-patterns` — koordiniere parallele Reviews über alle 5 Dimensionen (Architecture, Security, Performance, Testing, Best Practices) mit Finding-Deduplizierung, Severity-Kalibrierung und konsolidiertem Report. Einzel-Reports in `docs/reviews/s3/` ablegen. Konsolidierter Report verweist pro Finding auf den Quell-Report. Fixe nach dem konsolidierten Report — bei Bedarf Einzel-Report für Detail-Kontext nachlesen.
3. User Journey + Edge Cases für CRM Features (7 Dimensionen)
4. UX 10-Punkte-Checkliste für alle neuen Komponenten
5. Blind Spot Check: "Woran haben wir nicht gedacht?"
6. Cross-Dependency Check: Hat C5 die Hooks/Events für 5.1, 5.4, 5.9, 2.20, 9.5 vorbereitet?

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. Aktualisiere ROADMAP.md (5.3, 5.6 als DONE markieren)
4. Aktualisiere CLAUDE.md (CRM Core Architektur-Sektion hinzufügen)
5. Aktualisiere CHANGELOG.md
6. Prüfe docs/documentation-agents.md — starte relevante Doku-Agents:
   - `/documentation-generation:tutorial-engineer` für User Guide
   - `/documentation-generation:mermaid-expert` für Workflow-Diagramme

## Übergreifende Regeln

### Git
- Branch: `session/s3-crm-core`
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### Team-Orchestrierung — PFLICHT, nicht optional

**KRITISCH:** Du MUSST Subagenten und Team-Agents für parallele Arbeit verwenden. Mache NICHT alles sequenziell im Main-Agent. Der Main-Agent orchestriert und delegiert.

**Für die PLAN-Phase:**
- Dispatche `/allium:elicit` als eigenen Agent für die CRM Spec
- Dispatche `/ui-design:create-component` parallel für Kanban-Wireframes
- Main-Agent macht den ROADMAP Deep-Dive während Agents arbeiten

**Für die DO-Phase MUSST du:**
- Verwende `/full-stack-orchestration:full-stack-feature` ODER `/agent-teams:team-feature`
- Mindestens 2 parallele Implementierungs-Agents:
  - Agent 1: Backend (Prisma Schema, Server Actions, Status-Machine)
  - Agent 2: Frontend (Kanban Board UI, Status-Transitions UI, i18n)
- File-Ownership strikt trennen — kein Agent ändert Files eines anderen

**Für die CHECK-Phase MUSST du:**
- Starte `/comprehensive-review:full-review` ODER `/agent-teams:team-review` (5 Dimensionen)
- Dispatche Blind Spot Check als eigenen Agent
- Dispatche User Journey Analyse als eigenen Agent

**Für Fixes:** Parallele Fix-Agents nach File-Gruppen dispatchen.

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

### Learnings aus S1a+S1b+S2 (BEACHTEN)

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
- Blind-Spot-Analysen: Die höchst-konfidenten Claims der vorherigen Session re-checken — die werden am häufigsten fabriziert

### DDD-Prinzipien
- Aggregate Boundaries respektieren: Job Aggregate erweitern, nicht neue Root erstellen
- Ubiquitous Language: Verwende die Terms aus CLAUDE.md
- Domain Events: `JobStatusChanged` Event für spätere Consumer (Notifications, Timeline)
- ACL: Keine externen Abhängigkeiten im CRM Core

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
- ✅ Explizite fachliche Entscheidung mit Begründung (z.B. "DDD Aggregate Boundary verhindert X")
- ✅ Blocker durch externen Fehler (API down, Build broken) — dokumentiere in BUGS.md

### PFLICHT-CHECKPOINTS (Evidenz vor jedem nächsten Schritt)

Du MUSST jeden Checkpoint mit Evidenz bestätigen bevor du zum nächsten Schritt gehst.
ÜBERSPRINGE KEINEN CHECKPOINT.

**Vor der DO-Phase:**
- [ ] CP-1: `/allium:elicit` dispatcht → Spec-Datei existiert in `specs/`
- [ ] CP-2: `/database-design:postgresql` dispatcht → Schema-Design dokumentiert
- [ ] CP-3: `/ui-design:create-component` dispatcht → Wireframes vorhanden
- [ ] CP-4: `/ui-design:interaction-design` dispatcht → Interaction-Patterns dokumentiert
- [ ] CP-5: ROADMAP Deep-Dive abgeschlossen → Cross-Dependencies identifiziert

**Vor der CHECK-Phase:**
- [ ] CP-6: Implementation committed → `git log` zeigen
- [ ] CP-7: Alle neuen Komponenten haben Loading/Empty/Error/Mobile/Keyboard/Dark/i18n/Confirmation/Feedback

**Vor der ACT-Phase:**
- [ ] CP-8: `/comprehensive-review:full-review` mit `/agent-teams:multi-reviewer-patterns` dispatcht → konsolidierter Report in `docs/reviews/s3/`
- [ ] CP-9: `/accessibility-compliance:wcag-audit-patterns` dispatcht → Findings dokumentiert
- [ ] CP-10: `/business-analytics:data-storytelling` dispatcht → Dashboard-Visualisierung dokumentiert
- [ ] CP-11: `allium:weed` ausgeführt → zero Divergenzen
- [ ] CP-12: Blind Spot Check als eigener Agent dispatcht → Findings dokumentiert

**Vor dem Merge:**
- [ ] CP-13: ALLE Findings aus konsolidiertem Report gefixt
- [ ] CP-14: Re-Review bestätigt zero Regressionen
- [ ] CP-15: Exit-Checkliste vollständig mit Evidenz

### Learnings aus S2 (BEACHTEN)

**1. Skills werden ignoriert wenn sie nur "erwähnt" werden:**
S2 hat `/data-storytelling`, `/interaction-design`, `/multi-reviewer-patterns`, `/wcag-audit-patterns` komplett übersprungen obwohl sie im Prompt standen. Deshalb sind sie jetzt als PFLICHT-CHECKPOINTS formuliert. Du KANNST sie nicht überspringen.

**2. Deferred Items werden übersprungen:**
S2 hat "Schritt 0: S1b Deferred Items" ignoriert. Deshalb haben wir Checkpoints die Evidenz VOR dem nächsten Schritt verlangen.

**3. Allium Weed wird vergessen:**
S2 hat allium:weed erst nach der Blind-Spot-Analyse nachgeholt. Deshalb ist es jetzt CP-11 in der CHECK-Phase — nicht optional.

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items als offene Issues
3. Schreibe eine Handoff-Notiz in die letzte Commit-Message
4. Starte KEINE neuen Feature-Implementierungen — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.) um Daten anzureichern — z.B. Library-Docs, API-Referenzen, Best Practices, aktuelle Framework-Versionen.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] Allium Spec für CRM Domain geschrieben und verifiziert (`specs/crm-workflow.allium`)
- [ ] `allium:weed` = zero Divergenzen
- [ ] Job Status Workflow funktional mit allen Transitions
- [ ] Kanban Board mit Drag-and-Drop, Mobile responsive
- [ ] Comprehensive Review bestanden (zero Findings)
- [ ] User Journeys + Edge Cases für CRM Features dokumentiert
- [ ] UX 10-Punkte-Checkliste für alle neuen Komponenten bestanden
- [ ] Blind Spot Check durchgeführt
- [ ] Cross-Dependencies: Hooks für 5.1, 5.4, 5.9, 2.20 (Spotlight), 9.5 (Landingpage) vorbereitet
- [ ] E2E Tests für CRM Features hinzugefügt — **CRITICAL: Lies `e2e/CONVENTIONS.md` BEVOR du E2E Tests schreibst** (Templates, Anti-Patterns, Umgebungseinschränkungen). Kanban Drag-and-Drop ist besonders anfällig für Flaky Tests.
- [ ] docs/BUGS.md aktualisiert
- [ ] CLAUDE.md aktualisiert (CRM Architektur)
- [ ] ROADMAP.md: 5.3 + 5.6 als DONE markiert
- [ ] CHANGELOG.md Einträge: `## [YYYY-MM-DD] Session S3 — CRM Core`
- [ ] Dokumentation generiert (User Guide, Workflow-Diagramme)
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s3-crm-core` nach main mergen
