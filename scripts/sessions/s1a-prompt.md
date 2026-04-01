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
