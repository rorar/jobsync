Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies docs/BUGS.md und docs/user-journey-audit.md.
Lies die Memory `project_s1b_deferred_items.md`.

## Kontext: S2 Resume — Übersprungene Arbeit nachholen

Session S2 hat 54 UX/UI-Fixes, 30 Unit Tests, 9 E2E Tests, 8 axe-core Tests und 2 Refactorings geliefert. ABER die Session hat folgendes ÜBERSPRUNGEN:

1. **4 Pflicht-Skills nicht dispatcht:** `/data-storytelling`, `/interaction-design`, `/multi-reviewer-patterns`, `/accessibility-compliance:wcag-audit-patterns` — alle waren im Prompt gefordert, alle wurden ignoriert
2. **S1b Deferred Items nicht bearbeitet:** "Schritt 0" wurde übersprungen — 2 untranslated UI-Strings, Raw blockedReason/errorMessage, Formatter Root-Cause-Untersuchung
3. **3 Gaps bewusst gedroppt:** "dropped due to time/complexity avoidance" — das ist keine valide Begründung

Diese Resume-Session holt EXAKT diese fehlenden Teile nach. Keine neue Arbeit, nur die übersprungene.

## Dein Auftrag

### PFLICHT-CHECKPOINTS (Evidenz vor jedem nächsten Schritt)

ÜBERSPRINGE KEINEN CHECKPOINT. "Aus Zeitgründen" ist KEINE gültige Begründung.

### Phase 1: S1b Deferred Items (CP-1 bis CP-3)

Lies `project_s1b_deferred_items.md` und arbeite ab:

**CP-1: Formatter/Linter Root-Cause-Untersuchung**
- S1b hat 6 Edits verloren weil ein Formatter/Linter sie revertiert hat
- Untersuche: `.eslintrc.json`, prettier config, Post-Save-Hooks, husky/lint-staged
- Identifiziere WAS die Edits revertiert und WARUM
- Dokumentiere den Root Cause
- Fixe den Formatter-Konflikt
- DANN wende die 6 reverted Fixes erneut an:
  - AutomationList `as any` (2x)
  - RunProgressPanel Cast (2x)
  - StagingContainer stale-flash
  - AutomationList double `isAutomationRunning` call
- **Evidenz:** `git diff` zeigt die 6 Fixes, Formatter revertiert sie NICHT mehr

**CP-2: Untranslated UI-Strings fixen**
- `automation.status` und `automation.jobBoard` in AutomationList.tsx:177,183 — raw English Enum-Werte
- Raw `blockedReason`/`errorMessage` in RunHistoryList.tsx:158-159
- Erstelle Translation-Mappings für alle Enum-Werte in allen 4 Locales
- **Evidenz:** Grep nach hardcoded Enum-Werten in UI-Komponenten = 0 Treffer

**CP-3: 3 bewusst gedropte Gaps fixen**
- Lies die S2 Blind-Spot-Analyse in BUGS.md / user-journey-audit.md
- Identifiziere die 3 Gaps die "due to time/complexity avoidance" gedroppt wurden
- Implementiere sie JETZT — dispatche Fix-Agents
- **Evidenz:** `git diff` zeigt die 3 Fixes committed

### Phase 2: Übersprungene Skills dispatchen (CP-4 bis CP-7)

**CP-4: `/ui-design:interaction-design` dispatchen**
- Scope: Microinteractions, Transitions, Feedback-Patterns für alle Sprint A+B+C Komponenten
- Besonders: DeckCard Swipe-Feedback, RunProgressPanel Phase-Transitions, Kanban-Kandidat-Previews
- **Evidenz:** Agent-Output vorhanden, Findings dokumentiert, Fixes committed

**CP-5: `/accessibility-compliance:wcag-audit-patterns` dispatchen**
- Scope: WCAG 2.2 Audit über alle Sprint A+B+C UI-Komponenten
- Zusätzlich zur bestehenden axe-core Infrastruktur: manuelle Verification, Remediation
- **Evidenz:** Agent-Output vorhanden, Findings dokumentiert, Fixes committed

**CP-6: `/business-analytics:data-storytelling` dispatchen**
- Scope: S2 Audit-Report als Data Story aufbereiten
- Coverage-Heatmap pro Komponente, Edge-Case-Statistiken als Funnel, UX-Qualitäts-Scorecard
- Output: Visualisierung in `docs/user-journey-audit.md` oder eigene Datei
- **Evidenz:** Data Story dokumentiert

**CP-7: `/agent-teams:multi-reviewer-patterns` dispatchen**
- Scope: Koordiniere einen konsolidierten Review über die Ergebnisse von CP-4, CP-5, CP-6
- Finding-Deduplizierung, Severity-Kalibrierung
- Einzel-Reports in `docs/reviews/s2-resume/`
- Konsolidierter Report verweist auf Quell-Reports
- Fixe NUR den konsolidierten Report
- **Evidenz:** Konsolidierter Report in `docs/reviews/s2-resume/`, alle Findings gefixt

### Phase 3: Verification (CP-8 bis CP-10)

**CP-8: `allium:weed` über betroffene Specs**
- Welche Specs sind von den Änderungen betroffen? Prüfe `specs/`
- **Evidenz:** zero Divergenzen

**CP-9: Build + Tests**
- `source scripts/env.sh && bun run build` → Exit Code 0
- `bash scripts/test.sh --no-coverage` → alle Tests grün
- **Evidenz:** Command-Output zeigen

**CP-10: BUGS.md + CHANGELOG.md aktualisieren**
- BUGS.md: S2-Resume Findings als fixed markieren
- CHANGELOG.md: `## [YYYY-MM-DD] Session S2-Resume — Skipped Skills + Deferred Items`
- **Evidenz:** `git diff` zeigt Updates

## Übergreifende Regeln

### VERBOTEN für den Main-Agent
Der Main-Agent darf KEINE der folgenden Aktionen selbst ausführen:
- ❌ Code lesen/schreiben mit Read/Edit/Write (außer BUGS.md, CHANGELOG.md, docs/)
- ❌ Tests schreiben oder ausführen
- ❌ Review-Findings selbst fixen
- ❌ UI-Komponenten ändern

Der Main-Agent darf NUR:
- ✅ Agents dispatchen und koordinieren
- ✅ Agent-Ergebnisse prüfen und zusammenführen
- ✅ Koordinations-Files aktualisieren
- ✅ Git-Operationen
- ✅ Build/Test Verification Commands

Wenn ein Agent abbricht: Dispatche einen NEUEN Agent. Mache es NICHT selbst.

### ANTI-FAULHEIT
- ❌ "Aus Zeitgründen übersprungen" — UNGÜLTIG
- ❌ "Good enough" / "sufficient" — UNGÜLTIG
- ❌ "Moving on" / "for now" — UNGÜLTIG
- ❌ "Deferred to next session" ohne fachlichen Grund — UNGÜLTIG

### Git
- Committe häufig, konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### Resilienz
- Bei API 500: Warte 30s, retry
- Keine sleep-Loops — direkte Agent-Completion-Abfragen
- Consolidation-Agent IMMER zuletzt (NACHDEM alle anderen fertig)

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.).
