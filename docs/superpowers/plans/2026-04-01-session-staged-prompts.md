# Session-Staged Sprint Verification & Completion — Prompt Set

> **For agentic workers:** Each task below IS a self-contained session prompt. Copy-paste one prompt per Claude Code session. Execute sessions in order (S1a → S1b → S2 → S3 → S4).

**Goal:** Produce 5 copy-paste-ready session prompts that verify Sprint A+B+C, polish UX, and implement C5 (CRM Core) + C6 (Data Enrichment).

**Architecture:** Each prompt follows the template: Context-Load → Quick-Verify → Context → Assignment → Cross-Cutting Rules → Exit Checklist. Prompts are self-contained — no dependency on prior session history, only on handoff artifacts (files in the repo).

**Spec:** `docs/superpowers/specs/2026-04-01-session-staged-sprint-verification-design.md`

---

### Task 1: Session S1a Prompt — Allium Weed + Gap Analysis + Performance Fixes

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-01-session-staged-sprint-verification-design.md
Lies docs/BUGS.md

## Kontext

Sprint A (Architecture Debt, 10 Items) und Sprint B (UX/UI Gaps, 10 Items) wurden automatisch per Shell-Script ausgeführt und als DONE gemeldet — aber nie unabhängig verifiziert. Sprint C Tracks 1-3 (Public API, Blacklist, Caching, JobDeck) sind auf main mit Security Review (25+ Vulns fixed, ADR-015 bis ADR-019). C5 (CRM Core) und C6 (Data Enrichment) stehen noch aus. 19 Allium Specs existieren (~8400 Zeilen). 3 HIGH Performance-Findings sind offen.

Dies ist **Session S1a** — die erste von 5 Sessions. Ziel: Spec-Code-Alignment sicherstellen und Foundation-Performance fixen BEVOR die Comprehensive Review in S1b läuft.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s1a-allium-gap-perf
```

### Schritt 1: Allium Weed — Alle 19 Specs (ZUERST)

Führe `allium:weed` über JEDE `.allium`-Datei in `specs/` aus:
- action-result.allium, ai-provider.allium, api-key-management.allium
- auth-session.allium, automation-wizard.allium, base-combobox.allium
- e2e-test-infrastructure.allium, event-bus.allium, i18n-system.allium
- job-aggregate.allium, module-lifecycle.allium, notification-dispatch.allium
- profile-resume.allium, public-api-v1.allium, scheduler-coordination.allium
- security-rules.allium, shared-entities.allium, ui-combobox-keyboard.allium
- vacancy-pipeline.allium

Fixe ALLE Spec-Code-Divergenzen. Committe nach jedem logischen Fix-Block.

**Warum zuerst:** Allium Weed reduziert Noise für die Comprehensive Review (S1b). Viele "Findings" sind bereits spezifizierte Verhaltensweisen — wenn Spec und Code aligned sind, muss der Reviewer in S1b nicht raten.

### Schritt 2: Gap-Analyse (A1-A10, B1-B10, C1-C4)

Vergleiche JEDEN einzelnen Item gegen den Masterplan (`~/.claude/plans/open-architecture-masterplan.md`):

**Sprint A (Architecture Debt):**
| # | Item | Prüfe |
|---|------|-------|
| A1 | HMR globalThis für RunCoordinator + EventBus | `event-bus.ts`, `run-coordinator.ts` — globalThis Pattern vorhanden? |
| A2 | Rate limit Map leak fix | `run/route.ts` — leere Entries nach Expiry bereinigt? |
| A3 | Degradation: blocked/rate_limited als failures | `degradation.ts` — beide Status gezählt? |
| A4 | Delete automation guard | `automation.actions.ts` — Guard gegen Running-Deletion? |
| A5 | Remove unused `polling` aus SchedulerPhase | `types.ts` — kein `polling` mehr? |
| A6 | Remove unused `rate_limited` aus RunRequestStatus | `types.ts` — kein `rate_limited` mehr? |
| A7 | Watchdog timer für stale locks | `run-coordinator.ts` — Timer implementiert? |
| A8 | Degradation ↔ RunCoordinator event bridge | `degradation-coordinator.ts` — Consumer existiert? |
| A9 | Hardcoded English → i18n | `[id]/page.tsx` — alle Strings übersetzt? |
| A10 | RunStatusBadge aria-live + reduced motion | `RunStatusBadge.tsx` — aria-live + prefers-reduced-motion? |

**Sprint B (UX/UI Gaps):**
| # | Item | Prüfe |
|---|------|-------|
| B1 | SchedulerStatusBar | `SchedulerStatusBar.tsx` — Header-Integration, Popover, alle States? |
| B2 | ConflictWarning Dialog | `[id]/page.tsx` oder eigene Datei — preventive check vor Run Now? |
| B3 | RunProgressPanel | `RunProgressPanel.tsx` — Stepper, SSE, alle Phasen? |
| B4 | Running card visual differentiation | `AutomationList.tsx` — Border accent für running? |
| B5 | Elapsed time in RunStatusBadge | `RunStatusBadge.tsx` — Live-Timer? |
| B6 | Disabled button tooltip für Run Now | `[id]/page.tsx` — Tooltip erklärt warum disabled? |
| B7 | ModuleBusyBanner link | `ModuleBusyBanner.tsx` — Link zur conflicting Automation? |
| B8 | RunHistoryList responsive | `RunHistoryList.tsx` — overflow-x-auto? |
| B9 | SSE diff optimization | SSE Route — nur bei State-Change senden? |
| B10 | Staging Queue "New items" banner | `StagingContainer.tsx` — Banner implementiert? |

**Sprint C Tracks 1-3:**
| # | Item | Prüfe |
|---|------|-------|
| C1 | JobDeck Swipe UI | `DeckCard.tsx`, `DeckView.tsx`, `ViewModeToggle.tsx` — Swipe, Dismiss, Promote, Undo? |
| C2 | Public API v1 | `src/lib/api/*`, `src/app/api/v1/*` — CRUD, Auth, Rate Limit? |
| C3 | Company Blacklist | `companyBlacklist.actions.ts`, `CompanyBlacklistSettings.tsx` — CRUD + Pipeline-Filter? |
| C4 | Response Caching | `src/lib/connector/cache.ts` — LRU, HTTP Headers, Invalidierung? |

**Nicht nur "File exists" prüfen — Verhalten verifizieren.** Lies den Code, prüfe ob die Logik dem Masterplan entspricht.

Produziere einen Gap-Report: `docs/gap-analysis-sprint-abc.md` mit Status pro Item (DONE/PARTIAL/MISSING) und was fehlt.

Fixe ALLE PARTIAL oder MISSING Items sofort. Committe nach jedem Fix.

### Schritt 3: Performance-Fixes (3 offene HIGH Findings)

**3a: lastUsedAt DB-Write Throttling**
- Dateien: `src/lib/api/auth.ts`, `src/lib/connector/credential-resolver.ts`, `src/lib/api-key-resolver.ts`
- Problem: Jeder API-Call/Credential-Resolve schreibt `lastUsedAt` in die DB — bei hoher Last ein Bottleneck
- Fix: In-memory Timestamp-Map, max 1 Write pro 5 Minuten pro Key-ID
- Test: Unit Test der Throttle-Logik

**3b: Unbounded Job-URL Query für Dedup**
- Datei: `src/lib/connector/job-discovery/runner.ts`
- Problem: Dedup lädt ALLE Job-URLs aus der DB — bei 10k+ Jobs problematisch
- Fix: Query limitieren auf aktive Automations oder Zeitfenster (z.B. letzte 90 Tage)
- Test: Unit Test mit großem Dataset

**3c: Rate Limiter Memory-Effizienz**
- Datei: `src/lib/api/rate-limit.ts`
- Problem: In-memory Map wächst unbegrenzt (A2 hat nur leere Entries bereinigt)
- Fix: LRU/TTL-basierte Bereinigung für ALLE Entries, Max-Size Cap
- Test: Unit Test der Cleanup-Logik

Committe nach jedem Fix mit Test.

## Übergreifende Regeln

### Git
- Branch: `session/s1a-allium-gap-perf`
- Committe häufig (nach jedem logischen Schritt)
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.** Nur in eigene Branches/main mergen.

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings — Critical, High, Medium UND Low. Keine Ausnahmen.

### Team-Orchestrierung
- Verwende `/agent-teams:team-spawn` für parallele Arbeit wo sinnvoll
- `/agent-teams:team-review` für Multi-Dimensionen-Reviews
- `/agent-teams:team-debug` bei Problemen
- Nicht mehr als 2-3 Agents auf denselben Files
- Verwende orchestrated team execution, nicht plan-approval Zyklen

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

- [ ] Alle 19 Allium Specs: `allium:weed` = zero Divergenzen
- [ ] Gap-Report: `docs/gap-analysis-sprint-abc.md` geschrieben, alle Items DONE
- [ ] 3 Performance-Fixes committed + getestet
- [ ] Blind Spot Check: "Woran haben wir nicht gedacht?"
- [ ] Performance: Keine unbounded Queries, keine unthrottled Writes
- [ ] docs/BUGS.md aktualisiert (neue Issues + gefixte Issues)
- [ ] CHANGELOG.md Einträge im Format: `## [YYYY-MM-DD] Session S1a — Allium Weed + Gap Analysis + Performance Fixes`
- [ ] Build grün: `source scripts/env.sh && bun run build` → Exit Code 0
- [ ] Tests grün: `bash scripts/test.sh --no-coverage` → Exit Code 0
- [ ] Branch `session/s1a-allium-gap-perf` nach main mergen
````

---

### Task 2: Session S1b Prompt — Comprehensive Review + Fix All Findings

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
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

### Team-Orchestrierung
- Verwende `/agent-teams:team-spawn` für parallele Arbeit wo sinnvoll
- `/agent-teams:team-review` für Multi-Dimensionen-Reviews
- `/agent-teams:team-debug` bei Problemen
- Nicht mehr als 2-3 Agents auf denselben Files
- Verwende orchestrated team execution, nicht plan-approval Zyklen

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
````

---

### Task 3: Session S2 Prompt — User Journeys & UX Polish

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
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
````

---

### Task 4: Session S3 Prompt — CRM Core (C5)

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
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

### Team-Orchestrierung
- Verwende `/agent-teams:team-spawn` und `/agent-teams:team-feature` für parallele Arbeit
- `/agent-teams:team-review` für Multi-Dimensionen-Reviews
- `/agent-teams:team-debug` bei Problemen
- Nicht mehr als 2-3 Agents auf denselben Files
- Verwende orchestrated team execution, nicht plan-approval Zyklen

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
````

---

### Task 5: Session S4 Prompt — Data Enrichment (C6)

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
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
- Shared-Client-Pattern: Google Maps Client (falls Places-Modul später kommt)

**Frage:** Was muss Phase 1 vorbereiten damit Phase 2 (Reviews, Contact-Extraction) draufbauen kann?

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

**UX-Pflicht für JEDE neue Komponente:**
- Loading State (Logo wird geladen → Skeleton)
- Empty State (kein Logo gefunden → Placeholder-Icon)
- Error State (Enrichment fehlgeschlagen → Graceful degradation, kein Fehler für User)
- i18n (alle 4 Locales)

Committe nach jedem logischen Schritt. Build + Tests VOR jedem Commit.

### CHECK-Phase

1. `allium:weed` — Stimmt Implementation mit Spec überein?
2. `/comprehensive-review:full-review` (alle 5 Dimensionen)
3. User Journey: Company erstellen → Logo automatisch enriched → in Job-Details sichtbar
4. Edge Cases: Alle Module down, Domain nicht auflösbar, Rate Limit, Cache-Hit
5. UX 10-Punkte-Checkliste für neue Komponenten
6. Blind Spot Check
7. Cross-Dependency Check: Sind 2.4, 3.6 vorbereitet?

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

### Team-Orchestrierung
- Verwende `/agent-teams:team-spawn` und `/agent-teams:team-feature` für parallele Arbeit
- `/agent-teams:team-review` für Multi-Dimensionen-Reviews
- `/agent-teams:team-debug` bei Problemen
- Nicht mehr als 2-3 Agents auf denselben Files
- Verwende orchestrated team execution, nicht plan-approval Zyklen

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
- [ ] Cross-Dependencies: 2.4, 3.6 vorbereitet
- [ ] E2E Tests hinzugefügt
- [ ] docs/BUGS.md aktualisiert
- [ ] CLAUDE.md aktualisiert (Data Enrichment Architektur)
- [ ] ROADMAP.md: 1.13 Phase 1 als DONE markiert
- [ ] CHANGELOG.md Einträge: `## [YYYY-MM-DD] Session S4 — Data Enrichment`
- [ ] Dokumentation generiert (Architecture Overview)
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s4-data-enrichment` nach main mergen
````
