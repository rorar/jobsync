Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-01-session-staged-sprint-verification-design.md
Lies docs/BUGS.md

## Quick-Verify (S1b Handoff prüfen)

Führe aus:
```bash
git log --oneline -10
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE"
```

Prüfe:
- Build grün? Tests grün?
- `docs/BUGS.md` — offene Issues von S1b?
- E2E Baseline notiert?

Wenn rot: Erst fixen (max 15 Min), dann weiter.

## Kontext

Session S1a hat alle 19 Allium Specs aligned und 3 Performance-Fixes implementiert. Session S1b hat einen 5-Dimensionen Comprehensive Review durchgeführt und alle Findings gefixt (Architecture, Security, Performance, Testing, Code Quality). Der Code ist jetzt foundation-solid.

Dies ist **Session S2** — die dritte von 5 Sessions. Ziel: Systematische UX/UI-Qualitätsprüfung über alle Sprint A+B+C Features. S1b hat Arch/Sec/Perf/Test/Code geprüft — diese Session fokussiert AUSSCHLIESSLICH auf UX/UI.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s2-ux-journeys
```

### Schritt 1: User Journeys für 8 Features

Erstelle für JEDES Feature User Journeys mit Edge Cases. Dokumentiere in `docs/user-journey-audit.md`.

**Methode pro Feature:**
1. Happy Path definieren (primärer Usecase als Schritt-für-Schritt)
2. Edge Cases aus 7 Dimensionen ableiten:
   - Leere Eingaben / Keine Daten (Empty State)
   - Netzwerk-Fehler / API nicht erreichbar
   - Gleichzeitiger Zugriff (concurrent mutations)
   - Extreme Datenmengen (Pagination, Performance)
   - Mobile vs Desktop (375px Breite)
   - Verschiedene Locales (DE/EN/FR/ES)
   - Externe API-Ausfälle (EURES, ESCO, AI Provider down)
3. Implementierung prüfen — ist der Edge Case im Code behandelt?
4. Test prüfen — ist der Edge Case getestet (Unit oder E2E)?
5. Fehlende Implementierung + Tests SOFORT fixen

**Feature-Liste:**

| # | Feature | Tiefe | Schlüssel-Files |
|---|---------|-------|-----------------|
| 1 | SchedulerStatusBar (B1) | Medium | `SchedulerStatusBar.tsx`, `use-scheduler-status.ts` |
| 2 | RunProgressPanel (B3) | Hoch | `RunProgressPanel.tsx`, SSE Route, `run-coordinator.ts` |
| 3 | ConflictWarning (B2) | Niedrig | `[id]/page.tsx` |
| 4 | Company Blacklist (C3) | Medium | `companyBlacklist.actions.ts`, `CompanyBlacklistSettings.tsx`, `runner.ts` |
| 5 | Response Caching (C4) | Niedrig | `cache.ts`, ESCO/EURES Proxy Routes |
| 6 | JobDeck (C1) | Hoch | `DeckCard.tsx`, `DeckView.tsx`, `useDeckStack.ts` |
| 7 | Public API (C2) | Hoch | `src/lib/api/*`, `src/app/api/v1/*` |
| 8 | API Key Management | Medium | `publicApiKey.actions.ts`, `PublicApiKeySettings.tsx` |

### Schritt 2: UX 10-Punkte-Checkliste pro Komponente

Prüfe JEDE Komponente die in Sprint A+B+C neu erstellt oder signifikant geändert wurde:

**Komponenten-Liste:**
- SchedulerStatusBar, RunProgressPanel, ConflictWarningDialog
- DeckCard, DeckView, ViewModeToggle, StagingContainer
- PublicApiKeySettings, CompanyBlacklistSettings
- RunStatusBadge, AutomationList, ModuleBusyBanner, RunHistoryList

**10-Punkte-Checkliste pro Komponente:**

| # | Kriterium | Wie prüfen |
|---|-----------|-----------|
| 1 | **Loading State** | Skeleton/Spinner für async Daten? Kein leerer Screen. |
| 2 | **Empty State** | Hilfreiche Nachricht + Call-to-Action wenn keine Daten? |
| 3 | **Error State** | Toast + Retry-Möglichkeit bei Fehlern? |
| 4 | **Mobile (375px)** | Kein Overflow, kein abgeschnittener Text, Touch-Targets 44px+ |
| 5 | **Keyboard Navigation** | Alle interaktiven Elemente per Tab erreichbar, Focus-Indicator sichtbar |
| 6 | **Dark Mode** | Theme korrekt? Kontrast ausreichend? Kein hardcoded white/black |
| 7 | **i18n** | Alle Strings übersetzt? Keine hardcoded English strings? Alle 4 Locales |
| 8 | **Confirmation Dialogs** | Destruktive Aktionen (Delete, Revoke) haben Bestätigungsdialog? |
| 9 | **Feedback** | Jede User-Aktion hat visuelles Feedback (Toast, Animation, State Change)? |
| 10 | **Design System** | Folgt Shadcn/Tailwind Pattern? Konsistent mit anderen Komponenten? |

Fehlende Implementierungen SOFORT fixen. Committe nach jedem Fix-Block.

### Schritt 3: Spezialisierte UI-Reviews

- Starte `/ui-design:design-review` für alle Sprint B+C UI-Komponenten
- Starte `/ui-design:accessibility-audit` für WCAG-Compliance
- Fixe ALLE Findings

### Schritt 4: Output dokumentieren

Schreibe alles in `docs/user-journey-audit.md` mit dieser Struktur:

```markdown
# User Journey & UX Audit — Sprint A+B+C

## Feature: [Feature Name]
### Happy Path
1. Step 1...
2. Step 2...

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix |
|-----------|-----------|-------------|---------|-----|
| Empty data | ... | Yes/No | Unit/E2E/No | Was wurde gefixt |

## UX Checklist: [Component Name]
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | OK/Missing | Was wurde gefixt |
```

## Übergreifende Regeln

### Git
- Branch: `session/s2-ux-journeys`
- Committe häufig, konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### i18n-Pflicht
Wenn du UI-Strings hinzufügst oder änderst, aktualisiere ALLE 4 Locales (EN, DE, FR, ES). Verwende `@/i18n` bzw. `@/i18n/server`.

### Allium-Check
Wenn du Code änderst für den ein Allium Spec existiert (prüfe `specs/`), führe nach den Änderungen `allium:weed` über die betroffenen Specs aus.

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings — auch kosmetische. UX-Qualität ist nicht optional.

### Team-Orchestrierung
- Verwende `/agent-teams:team-spawn` für parallele Arbeit wo sinnvoll
- `/agent-teams:team-review` für UI/UX Multi-Dimensionen-Reviews
- Nicht mehr als 2-3 Agents auf denselben Files

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items als offene Issues
3. Schreibe eine Handoff-Notiz in die letzte Commit-Message
4. Starte KEINE neuen Fix-Zyklen — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen an den User. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.) um Daten anzureichern — z.B. Library-Docs, API-Referenzen, Best Practices, aktuelle Framework-Versionen.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] User Journeys dokumentiert in `docs/user-journey-audit.md` für alle 8 Features
- [ ] UX 10-Punkte-Checkliste bestanden für alle ~14 Komponenten
- [ ] Alle fehlenden Edge-Case-Implementierungen gefixt
- [ ] Alle fehlenden Tests hinzugefügt
- [ ] `/ui-design:design-review` durchgeführt, Findings gefixt
- [ ] `/ui-design:accessibility-audit` durchgeführt, Findings gefixt
- [ ] Blind Spot Check: "Woran haben wir bei UX nicht gedacht?"
- [ ] i18n: Keine hardcoded Strings, alle 4 Locales komplett
- [ ] docs/BUGS.md aktualisiert
- [ ] CHANGELOG.md Einträge: `## [YYYY-MM-DD] Session S2 — User Journeys & UX Polish`
- [ ] E2E Count erhöht von Baseline ($E2E_BASELINE → neuer Count)
- [ ] Build grün: `source scripts/env.sh && bun run build` → Exit Code 0
- [ ] Tests grün: `bash scripts/test.sh --no-coverage` → Exit Code 0
- [ ] Branch `session/s2-ux-journeys` nach main mergen
