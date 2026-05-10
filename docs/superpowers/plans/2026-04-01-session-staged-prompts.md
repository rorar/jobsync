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

### Task 4: Session S3 Prompt — CRM Core (Contact Management + Timeline + Tasks)

**Status:** UPDATED 2026-05-10. Original scope (5.3 + 5.6) already implemented. New scope: Person/Interview/Task/Note/Timeline/Blocklist from `specs/crm.allium`.

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
Hey Claude, sei mein Full-Stack Senior Software Engineer und unterstütze mich bei der Planung, Architektur und Implementierung von neuen Features, Bugfixes und Verbesserungen für JobSync, einer SaaS-Plattform für die Automatisierung von Job-Discovery und Bewerbungsprozessen. Die Plattform ist in TypeScript mit Shadcn/Tailwind, Next.js und Prisma gebaut.

[ ] @projekte/jobsync Lies zuerst CLAUDE.md, reminders und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md) ein.
[ ] Bei Entscheidungen wählst du nicht den einfacheren Weg; Du wählst den Weg des Nachhaltigkeitsprinzip: Was ist die nachhaltigste, fundierteste und basierend auf DDD und auf der ROADMAP die beste Lösung? Macht es bei der Entscheidung Sinn /allium zu befragen?
[ ] Beachte **Kritische Regeln**

## Quick-Verify (Handoff prüfen)

Führe aus:
```bash
git log --oneline -15
source scripts/env.sh && bun run build
bash scripts/test.sh --workers=1
```

Prüfe: Build grün? Tests grün (220 Suites, 4215+ Tests)?

## Kontext

**Was BEREITS fertig ist (NICHT nochmal machen):**
- 5.3 Job Status Workflow — implementiert (crm-workflow.allium + Code, seit 2026-04-02)
- 5.6 Kanban Board — implementiert (crm-workflow.allium + Code, seit 2026-04-02)
- Allium CRM Spec — `specs/crm.allium` (1074 Zeilen, 0 Errors, 9 Entities, 18 Rules, 6 Surfaces)
- Reference Specs — 3 Reference Specs distilliert (Atomic CRM, Twenty CRM, Kommo UI Kit)
- GDPR Spec — `specs/crm-gdpr.allium` (Data Subject Rights, Retention, Erasure)
- PERF-2 (async PBKDF2) + PERF-3 (DispatchContext) — implementiert
- Notification System — alle 4 Channels (InApp, Webhook, Email, Push)
- 220 Test Suites, 4215 Tests, Build clean

**Was diese Session S3 implementiert (aus specs/crm.allium):**

| Feature | Spec-Entities | ROADMAP |
|---------|--------------|---------|
| Contact Management | Person, FullName, TypedEmail, TypedPhone, Address | 5.5 |
| Interview Tracking | Interview (scheduling, outcomes, reminders) | 5.8 |
| Tasks & Reminders | Task, TaskTarget (polymorphic: Job/Person/Company) | 5.4 |
| Notes | Note, NoteTarget (polymorphic: Job/Person/Company) | 5.5 |
| Activity Timeline | ActivityLog (immutable, 15 activity types) | 5.9 |
| Blocklist | Blocklist (email/phone/domain suppression) | 5.5 |
| CRM Domain Events | 9 neue Events (ContactCreated, InterviewScheduled, ...) | 0.6 |
| CRM Notifications | 4 neue Types (interview_scheduled, follow_up_due, ...) | 0.6 |

## Dein Auftrag

### PLAN-Phase

#### 1. Allium Spec lesen (NICHT neu erstellen — existiert bereits)
Lies `specs/crm.allium` KOMPLETT. Dies ist die authoritative Spezifikation:
- 9 Entities: Person, Interview, Task, TaskTarget, Note, NoteTarget, ActivityLog, Blocklist, ConnectedAccount
- 18 Rules: Person lifecycle (7), Interview (5), Task (4), Note (1), Timeline (1), Blocklist (2)
- 4 Invariants: ExactlyOneTaskTarget, ExactlyOneNoteTarget, BlocklistSuppressesAutoCreation, PersonOwnedByUser
- 6 Surfaces: PersonDirectory, PersonDetail, InterviewCalendar, TaskBoard, ActivityTimeline, BlocklistSettings
- 6 Open Questions: Lies sie und triff Entscheidungen basierend auf dem Nachhaltigkeitsprinzip

Lies auch `specs/crm-workflow.allium` (Job Status + Kanban — bereits implementiert, hier nur integrieren).
Lies auch `specs/crm-gdpr.allium` (GDPR Data Subject Rights — GDPR-Felder auf Person implementieren).

#### 2. Event Bus + Notification Types erweitern
Vor der Feature-Implementierung:
- Erweitere `src/lib/events/event-types.ts` um 9 CRM-Events:
  ContactCreated, ContactUpdated, ContactDeleted, InterviewScheduled, InterviewCompleted,
  ReminderTriggered, FollowUpSent, MessageReceived, DocumentAttached
- Erweitere NotificationType in `src/models/notification.model.ts` um 4 CRM-Types:
  interview_scheduled, interview_reminder, follow_up_due, contact_from_job
- Aktualisiere `specs/event-bus.allium` und `specs/notification-dispatch.allium` mit `/allium:tend`

#### 3. UI Wireframes ZUERST
Bevor du UI-Code schreibst:
- `/ui-design:create-component` für PersonDirectory, PersonDetail, InterviewCalendar, TaskBoard, ActivityTimeline
- `/ui-design:design-review` für die Wireframes
- `/ui-design:responsive-design` für Mobile (375px+)
- Warte auf Findings, dann implementiere

#### 4. Prisma Schema Design
Neue Models basierend auf crm.allium Entities:
- Person (mit FullName, TypedEmail/Phone als JSON, GDPR-Felder)
- Interview (mit status transitions, outcome)
- Task + TaskTarget (polymorphic nullable FKs)
- Note + NoteTarget (polymorphic nullable FKs)
- ActivityLog (immutable, append-only)
- Blocklist (handle + type)
- Migration mit `npx prisma migrate dev`

### DO-Phase

Starte `/full-stack-orchestration:full-stack-feature` für die Umsetzung.

**Implementierungs-Reihenfolge (Foundation-then-Fan-Out):**
1. Prisma Schema + Migration (alle CRM Models)
2. Domain Events + Notification Types (Event Bus Erweiterung)
3. Person Server Actions + i18n namespace `crm` (4 Locales)
4. Interview Server Actions
5. Task + Note Server Actions (polymorphic targeting)
6. ActivityLog consumer (EventBus → materialized read model)
7. Blocklist Server Actions
8. UI Komponenten (nach Wireframe-Review):
   - PersonDirectory (Liste + Suche + Filter)
   - PersonDetail (Einzelansicht + Timeline + verknüpfte Interviews/Tasks/Notes)
   - InterviewCalendar (Upcoming + Schedule)
   - TaskBoard (Pending/Overdue/Done)
   - ActivityTimeline (per Job ODER per Person)
   - BlocklistSettings (in Settings-Seite)
9. Navigation: CRM-Sektion im Dashboard Sidebar
10. Notification Dispatcher: CRM-Event-Handler registrieren

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

1. `/allium:weed` über `specs/crm.allium` — Stimmt Implementation mit Spec überein?
2. `/comprehensive-review:full-review` (alle 5 Dimensionen: Architecture, Security, Performance, Testing, Best Practices)
3. User Journey + Edge Cases für CRM Features (7 Dimensionen: Empty, Error, Concurrent, Extreme Data, Mobile, Locales, External API)
4. UX 10-Punkte-Checkliste für alle neuen Komponenten
5. Blind Spot Check: "Woran haben wir nicht gedacht?"
6. Cross-Dependency Check: Sind Hooks/Events für 5.1 (Communication), 5.2 (Calendar), 5.7 (Contact Extraction) vorbereitet?
7. GDPR Check: data_source, processing_basis, retention_expires_at auf Person korrekt implementiert?

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. Aktualisiere ROADMAP.md (5.4, 5.5, 5.8, 5.9 Status markieren)
4. Aktualisiere CLAUDE.md (CRM Core Architektur-Sektion hinzufügen)
5. Aktualisiere CHANGELOG.md
6. Prüfe docs/documentation-agents.md — starte relevante Doku-Agents

## Übergreifende Regeln

### Git
- Committe häufig mit logischer Gruppierung
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --workers=1`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.** Nur in eigene Branches/main mergen.
- **NIEMALS tests+builds parallel** — VM Resource Limits, single worker

### Implementierung
- Verwende IMMER `/full-stack-orchestration:full-stack-feature` für alle Entwicklungsarbeit
- ui-design Agent VOR UI-Implementierung konsultieren
- Foundation-then-Fan-Out: Typen sequentiell definieren, dann parallel implementieren
- `import "server-only"` auf allen Server-Dateien
- Alle Prisma-Queries mit userId (ADR-015 IDOR)
- encrypt()/decrypt() sind async — immer awaiten

### DDD-Prinzipien
- **Person ist ein eigenständiges Aggregate** — nicht Teil des Job Aggregate
- Job Aggregate bleibt unverändert (nur neue Relationen: Interview, TaskTarget, NoteTarget)
- Ubiquitous Language: Verwende Terms aus CLAUDE.md + crm.allium
- Domain Events: Alle 9 CRM-Events über TypedEventBus publizieren
- ACL: Keine externen Abhängigkeiten im CRM Core
- Polymorphic Targeting: TaskTarget/NoteTarget mit nullable FKs (Twenty CRM Pattern)

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings. Keine Ausnahmen.

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items
3. Schreibe eine Handoff-Notiz in .remember/remember.md
4. Starte KEINE neuen Feature-Implementierungen — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen an den User. Maximale kognitive Anstrengung.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] `specs/crm.allium` Implementation aligned: `/allium:weed` = zero Divergenzen
- [ ] Prisma Migration erstellt und angewendet
- [ ] Person CRUD funktional (Create, Read, Update, Archive, Merge)
- [ ] Interview Scheduling funktional (Schedule, Complete, Cancel, Reschedule)
- [ ] Task Board funktional (Create, Complete, Overdue-Anzeige, polymorphic targets)
- [ ] Notes funktional (Create, polymorphic targets)
- [ ] ActivityTimeline funktional (per Job + per Person)
- [ ] Blocklist funktional (Add, Remove, suppresses auto-creation)
- [ ] 9 CRM Domain Events registriert und publiziert
- [ ] 4 CRM Notification Types mit Event-Handler-Mapping
- [ ] GDPR-Felder auf Person: data_source, processing_basis, retention_expires_at
- [ ] Comprehensive Review bestanden (zero Findings)
- [ ] UX 10-Punkte-Checkliste für alle ~6 neuen Komponenten bestanden
- [ ] Blind Spot Check durchgeführt
- [ ] Cross-Dependencies: Hooks für 5.1, 5.2, 5.7 vorbereitet
- [ ] E2E Tests für CRM Features hinzugefügt
- [ ] docs/BUGS.md aktualisiert
- [ ] CLAUDE.md aktualisiert (CRM Architektur)
- [ ] CHANGELOG.md Einträge
- [ ] Build grün + Tests grün + E2E grün
- [ ] Honesty Gate VOR Push durchgeführt
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
