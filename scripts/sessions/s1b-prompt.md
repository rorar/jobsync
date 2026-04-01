Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-01-session-staged-sprint-verification-design.md
Lies docs/BUGS.md und docs/gap-analysis-sprint-abc.md

## Quick-Verify (S1a Handoff prüfen)

Führe aus:
```bash
git log --oneline -10
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
```

Prüfe:
- Build grün?
- Tests grün?
- `docs/gap-analysis-sprint-abc.md` vorhanden und alle Items DONE?
- `docs/BUGS.md` — offene Issues von S1a?

Wenn rot: Erst fixen (max 15 Min), dann weiter. Wenn unfixbar: In BUGS.md dokumentieren und mit eigenem Scope weitermachen.

## Kontext

Session S1a hat alle 19 Allium Specs gegen den Code aligned (allium:weed), eine Gap-Analyse für Sprint A+B+C durchgeführt, und 3 Performance-Findings gefixt (lastUsedAt Throttling, unbounded Job-URL Query, Rate Limiter Memory). Der Code ist jetzt spec-aligned und performance-sound.

Dies ist **Session S1b** — die zweite von 5 Sessions. Ziel: 5-Dimensionen Comprehensive Review über den gesamten Sprint A+B+C Code, mit Zero-Tolerance-Fix-Policy.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s1b-comprehensive-review
```

### Schritt 0.5: S1a Allium-Weed Verifikation (Quick-Check, max 5 Min)

S1a hat alle 19 Allium Specs ge-weeded, aber ohne Team-Agents — alles lief sequenziell im Main-Agent. Verifiziere die Qualität:

1. Wähle 3 der komplexesten Specs: `scheduler-coordination.allium`, `security-rules.allium`, `vacancy-pipeline.allium`
2. Führe `allium:weed` über diese 3 Specs aus
3. Wenn zero Divergenzen → S1a Weed war sauber, weiter
4. Wenn Divergenzen gefunden → Dispatche einen Agent der `allium:weed` über ALLE 19 Specs laufen lässt und Divergenzen fixt

### Schritt 1: Comprehensive Review

Starte `/comprehensive-review:full-review` über den gesamten Code der in Sprint A+B+C geändert wurde. Verwende ALLE 5 Dimensionen:

1. **Architecture Review** — Aggregate Boundaries, DDD Patterns, ACL Compliance, Event-Struktur
2. **Security Audit** — IDOR Ownership (ADR-015), "use server" Exports (ADR-019), Rate Limiting (ADR-019), Credential Handling (ADR-016/017)
3. **Performance Review** — Unbounded Queries, N+1, Caching-Effektivität, Memory Leaks
4. **Testing Coverage** — Fehlende Tests, nicht getestete Edge Cases, Test-Qualität
5. **Best Practices** — TypeScript Strictness, Error Handling, Code Quality, Naming

**Scope — Dateien die in Sprint A, B und C Tracks 1-3 geändert wurden:**

Sprint A Files:
- `src/app/dashboard/automations/[id]/page.tsx`
- `src/components/automations/RunStatusBadge.tsx`
- `src/i18n/dictionaries/automations.ts`
- `src/lib/connector/degradation.ts`
- `src/lib/constants.ts`
- `src/lib/events/consumers/degradation-coordinator.ts`
- `src/lib/events/consumers/index.ts`
- `src/lib/events/event-types.ts`
- `src/lib/scheduler/run-coordinator.ts`
- `src/lib/scheduler/types.ts`

Sprint B Files:
- `src/components/scheduler/SchedulerStatusBar.tsx`
- `src/components/scheduler/RunProgressPanel.tsx`
- `src/components/staging/StagingContainer.tsx`
- `src/components/automations/AutomationList.tsx`
- `src/components/automations/ModuleBusyBanner.tsx`
- `src/components/automations/RunHistoryList.tsx`
- `src/app/api/scheduler/status/route.ts`
- `src/hooks/use-scheduler-status.ts`

Sprint C Track 1 (Blacklist + Caching):
- `src/actions/companyBlacklist.actions.ts`
- `src/components/settings/CompanyBlacklistSettings.tsx`
- `src/lib/connector/cache.ts`

Sprint C Track 2 (JobDeck):
- `src/components/staging/DeckCard.tsx`
- `src/components/staging/DeckView.tsx`
- `src/components/staging/ViewModeToggle.tsx`

Sprint C Track 3 (Public API):
- `src/lib/api/auth.ts`, `rate-limit.ts`, `response.ts`, `with-api-auth.ts`, `schemas.ts`
- `src/app/api/v1/jobs/route.ts`, `[id]/route.ts`, `[id]/notes/route.ts`
- `src/actions/publicApiKey.actions.ts`
- `src/components/settings/PublicApiKeySettings.tsx`

**Review-Grenze:** Diese Session fokussiert auf Architecture, Security, Performance, Testing und Code Quality. UX/UI-Dimensionen werden in S2 behandelt.

### Schritt 2: Fix ALL Findings

Fixe ALLE Findings — Critical, High, Medium UND Low. Zero Tolerance.
- Committe nach jedem logischen Fix-Block
- Nach allen Fixes: Erneutes Review zur Bestätigung dass keine Regressionen entstanden sind

## Übergreifende Regeln

### Git
- Branch: `session/s1b-comprehensive-review`
- Committe häufig (nach jedem logischen Schritt)
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings — Critical, High, Medium UND Low. Keine Ausnahmen, kein "accepted risk".

### Team-Orchestrierung — PFLICHT, nicht optional

**KRITISCH:** Du MUSST Subagenten und Team-Agents für parallele Arbeit verwenden. Mache NICHT alles sequenziell im Main-Agent. Der Main-Agent orchestriert und delegiert — er implementiert nicht alles selbst.

**Für den Comprehensive Review (Schritt 1) MUSST du:**
- Starte `/comprehensive-review:full-review` ODER `/agent-teams:team-review` mit 5 Dimensionen
- Das dispatcht automatisch spezialisierte Review-Agents (Architecture, Security, Performance, Testing, Best Practices)
- Warte auf ALLE Review-Ergebnisse bevor du mit Fixes beginnst

**Für die Fixes (Schritt 2) MUSST du:**
- Gruppiere Findings nach betroffenen Files
- Dispatche Fix-Agents parallel via `/agent-teams:team-spawn` (z.B. 1 Agent für Scheduler-Files, 1 für API-Files, 1 für UI-Files)
- Max 2-3 Agents auf denselben Files (Merge-Konflikte vermeiden)

**Für den Blind Spot Check:**
- Dispatche als eigenen Agent — nicht im Main-Agent sequenziell abarbeiten

**Anti-Pattern:** NICHT alles im Main-Agent mit Read/Edit machen. Das verschwendet Context und ist langsamer.

### Resilienz bei API-Fehlern
Bei HTTP 500 oder Timeout-Fehlern von der Anthropic API:
- Warte 30 Sekunden, dann versuche es erneut
- Wenn ein Sub-Agent mit 500 abbricht: Prüfe was er committed hat, dann dispatche einen neuen Agent für die verbleibende Arbeit
- Ignoriere "Task not found" Fehler — das ist ein harmloses Bookkeeping-Problem bei parallelen Agents

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items als offene Issues
3. Schreibe eine Handoff-Notiz in die letzte Commit-Message: was ist fertig, was fehlt
4. Starte KEINE neuen Fix-Zyklen oder Reviews — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen an den User. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.) um Daten anzureichern — z.B. Library-Docs, API-Referenzen, Best Practices, aktuelle Framework-Versionen.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] Comprehensive Review: Zero offene Findings nach Fix-Runde
- [ ] Re-Review bestätigt: Keine Regressionen durch Fixes
- [ ] Blind Spot Check: "Woran haben wir nicht gedacht?"
- [ ] Security: IDOR, "use server", Rate Limiting geprüft
- [ ] Performance: Keine unbounded Queries, keine unthrottled Writes
- [ ] Cross-Dependency Check: Haben die Fixes Auswirkungen auf C5/C6 oder Sprint D?
- [ ] docs/BUGS.md aktualisiert
- [ ] ROADMAP.md aktualisiert
- [ ] CHANGELOG.md Einträge: `## [YYYY-MM-DD] Session S1b — Comprehensive Review + Fix All`
- [ ] Test Suite erweitert wo Findings Tests erfordern
- [ ] Build grün: `source scripts/env.sh && bun run build` → Exit Code 0
- [ ] Tests grün: `bash scripts/test.sh --no-coverage` → Exit Code 0
- [ ] E2E grün: `nice -n 10 npx playwright test --project=chromium --workers=1` → alle Tests bestanden
- [ ] E2E Baseline dokumentiert (Anzahl Tests)
- [ ] Branch `session/s1b-comprehensive-review` nach main mergen
