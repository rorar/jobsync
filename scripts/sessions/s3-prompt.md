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

### PLAN-Phase

#### 1. Allium Spec erstellen
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

#### 2. ROADMAP Deep-Dive
Lies die Cross-Dependencies in docs/ROADMAP.md:
- 5.1 (Communication) — wird CRM-spezifische Features brauchen
- 5.4 (Reminders) — CRM-Reminders als Notification-Rules (→ 0.6)
- 5.9 (Timeline) — Chronologische Timeline pro Job, automatisch befüllt
- 0.6 (Notifications) — Event Bus als Infrastruktur

**Frage:** Was muss C5 vorbereiten damit diese Features später draufbauen können? Definiere die Hooks/Events/Interfaces die C5 exponieren muss.

#### 3. UI Wireframes ZUERST
Bevor du Code schreibst:
- Spawne `/ui-design:create-component` für das Kanban Board
- Spawne `/ui-design:design-review` für die Wireframes
- Spawne `/ui-design:interaction-design` für Drag-and-Drop Interactions, Status-Transition Feedback, Kanban Microinteractions
- Spawne `/accessibility-compliance:wcag-audit-patterns` für WCAG 2.2 Compliance der neuen Kanban/CRM Komponenten
- Spawne `/business-analytics:data-storytelling` für Dashboard-Visualisierungen: Job-Status Conversion Funnel, Bottleneck-Analyse (avg. Zeit pro Status), Trend-Charts (Bewerbungsaktivität/Woche), Vergleich nach Quelle (EURES vs Arbeitsagentur vs manuell)
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

### CHECK-Phase

1. `allium:weed` — Stimmt Implementation mit Spec überein?
2. `/comprehensive-review:full-review` (alle 5 Dimensionen: Architecture, Security, Performance, Testing, Best Practices)
3. User Journey + Edge Cases für CRM Features (7 Dimensionen)
4. UX 10-Punkte-Checkliste für alle neuen Komponenten
5. Blind Spot Check: "Woran haben wir nicht gedacht?"
6. Cross-Dependency Check: Hat C5 die Hooks/Events für 5.1, 5.4, 5.9 vorbereitet?

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

### DDD-Prinzipien
- Aggregate Boundaries respektieren: Job Aggregate erweitern, nicht neue Root erstellen
- Ubiquitous Language: Verwende die Terms aus CLAUDE.md
- Domain Events: `JobStatusChanged` Event für spätere Consumer (Notifications, Timeline)
- ACL: Keine externen Abhängigkeiten im CRM Core

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings. Keine Ausnahmen.

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
- [ ] Cross-Dependencies: Hooks für 5.1, 5.4, 5.9 vorbereitet
- [ ] E2E Tests für CRM Features hinzugefügt
- [ ] docs/BUGS.md aktualisiert
- [ ] CLAUDE.md aktualisiert (CRM Architektur)
- [ ] ROADMAP.md: 5.3 + 5.6 als DONE markiert
- [ ] CHANGELOG.md Einträge: `## [YYYY-MM-DD] Session S3 — CRM Core`
- [ ] Dokumentation generiert (User Guide, Workflow-Diagramme)
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s3-crm-core` nach main mergen
