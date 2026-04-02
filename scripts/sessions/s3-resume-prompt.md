Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies docs/BUGS.md und docs/ROADMAP.md.
Lies docs/reviews/s3/ falls vorhanden.

## Kontext: S3 Resume — Übersprungene Skills nachholen

Session S3 hat CRM Core (5.3 Job Status Workflow + 5.6 Kanban Board) implementiert: Allium Spec, Prisma Schema, Server Actions, Kanban UI mit @dnd-kit, 98+ Tests, S2 Deferred Items. ABER die CHECK-Phase hat spezialisierte Skills umgangen und stattdessen generische Agents dispatcht.

Übersprungen:
1. `/comprehensive-review:full-review` — stattdessen generischer `Agent("review")` verwendet
2. `/agent-teams:multi-reviewer-patterns` — keine Konsolidierung der Review-Ergebnisse
3. `/accessibility-compliance:wcag-audit-patterns` — kein WCAG 2.2 Audit
4. `/ui-design:interaction-design` — kein Interaction-Design Review für Kanban DnD
5. `/business-analytics:data-storytelling` — kein Dashboard-Visualisierung (Conversion Funnel, Trends)
6. `allium:weed` in CHECK-Phase — möglicherweise übersprungen

Diese Resume-Session holt EXAKT diese fehlenden Skills nach.

## Dein Auftrag

### PFLICHT-CHECKPOINTS (Evidenz vor jedem nächsten Schritt)

ÜBERSPRINGE KEINEN CHECKPOINT. "Aus Zeitgründen" ist KEINE gültige Begründung.
Du MUSST die Skills EXAKT aufrufen — NICHT durch generische `Agent("...")` Aufrufe ersetzen.

### Phase 1: Exakte Skill-Aufrufe (CP-1 bis CP-5)

**CP-1: `/comprehensive-review:full-review` aufrufen**
- Rufe den Skill EXAKT auf: `/comprehensive-review:full-review`
- Scope: Alle CRM-Files die S3 erstellt/geändert hat (prüfe `git log` für die S3-Commits)
- 5 Dimensionen: Architecture, Security, Performance, Testing, Best Practices
- Einzel-Reports in `docs/reviews/s3-resume/`
- **Evidenz:** Skill-Invocation-Output zeigen

**CP-2: `/agent-teams:multi-reviewer-patterns` aufrufen**
- Konsolidiere die 5 Einzel-Reports aus CP-1
- Finding-Deduplizierung, Severity-Kalibrierung
- Konsolidierter Report verweist pro Finding auf Quell-Report
- **Evidenz:** Konsolidierter Report in `docs/reviews/s3-resume/consolidated-report.md`

**CP-3: `/accessibility-compliance:wcag-audit-patterns` aufrufen**
- Scope: Alle neuen CRM/Kanban UI-Komponenten
- Besonders: Kanban Board Drag-and-Drop Accessibility (ARIA Drag-Roles, Keyboard-DnD, Screen Reader Announcements)
- **Evidenz:** Skill-Output + Findings dokumentiert

**CP-4: `/ui-design:interaction-design` aufrufen**
- Scope: Kanban Drag-and-Drop Interactions, Status-Transition Feedback, Column-Drop Animations
- Prüfe: Drag-Preview, Drop-Indicator, Transition-Animationen, Haptic Feedback Patterns
- **Evidenz:** Skill-Output + dokumentierte Interaction-Patterns

**CP-5: `/business-analytics:data-storytelling` aufrufen**
- Scope: CRM Dashboard-Visualisierungen
- Job-Status Conversion Funnel (Backlog → Submitted → Interview → Offer)
- Bottleneck-Analyse (avg. Zeit pro Status)
- Trend-Charts (Bewerbungsaktivität/Woche)
- Vergleich nach Quelle (EURES vs Arbeitsagentur vs manuell)
- **Evidenz:** Skill-Output + Visualisierung dokumentiert

### Phase 2: Allium Verification (CP-6)

**CP-6: `allium:weed` aufrufen**
- Scope: `specs/crm-workflow.allium` (neu von S3) + `specs/job-aggregate.allium` (erweitert)
- **Evidenz:** Weed-Output = zero Divergenzen

### Phase 3: Fix Findings (CP-7 bis CP-8)

**CP-7: Konsolidierten Report fixen**
- Fixe ALLE Findings aus dem konsolidierten Report (CP-2)
- Fixe ALLE WCAG-Findings aus CP-3
- Fixe ALLE Interaction-Design-Findings aus CP-4
- Dispatche Fix-Agents — NICHT selbst fixen (VERBOTEN für Main-Agent)
- **Evidenz:** `git diff` zeigt Fixes

**CP-8: Agent-Claims verifizieren**
- 67% Fabrication-Rate bei Review-Agents (Learning aus S2-Resume)
- Prüfe `git diff` für jeden "fixed" Claim
- Für CRITICAL/HIGH: Datei + Zeilennummer öffnen und Fix bestätigen
- **Evidenz:** Verification-Log

### Phase 4: Verification + Docs (CP-9 bis CP-10)

**CP-9: Build + Tests**
- `source scripts/env.sh && bun run build` → Exit Code 0
- `bash scripts/test.sh --no-coverage` → alle Tests grün
- **Evidenz:** Command-Output zeigen

**CP-10: Docs aktualisieren**
- BUGS.md: S3-Resume Findings als fixed markieren
- CHANGELOG.md: `## [YYYY-MM-DD] Session S3-Resume — Skills + Review + a11y`
- **Evidenz:** `git diff` zeigt Updates

## Übergreifende Regeln

### VERBOTEN für den Main-Agent
- ❌ Code lesen/schreiben mit Read/Edit/Write (außer BUGS.md, CHANGELOG.md, docs/)
- ❌ Tests schreiben oder ausführen
- ❌ Review-Findings selbst fixen
- ❌ Skills durch generische `Agent("...")` Aufrufe ersetzen

Der Main-Agent darf NUR:
- ✅ Skills und Agents dispatchen und koordinieren
- ✅ Skill-Outputs prüfen und Claims verifizieren
- ✅ Koordinations-Files aktualisieren
- ✅ Git-Operationen + Build/Test Verification

### ANTI-FAULHEIT
- ❌ "Aus Zeitgründen übersprungen" — UNGÜLTIG
- ❌ "Good enough" / "sufficient" — UNGÜLTIG
- ❌ "Already covered by S3" — UNGÜLTIG (S3 hat generische Agents benutzt, nicht Skills)

### Consolidation-Agent IMMER zuletzt
NACHDEM alle Review/Fix-Agents fertig sind. NIEMALS gleichzeitig.

### Build-Serialisierung
Agents: kein `bun run build`. Nur `tsc --noEmit`. Main-Agent baut nach Agent-Completion.

### Git
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.).
