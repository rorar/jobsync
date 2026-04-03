Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-03-sprint-e-d-ui-gaps-notifications-design.md
Lies docs/BUGS.md und docs/documentation-agents.md
Lies specs/notification-dispatch.allium und specs/event-bus.allium

## Quick-Verify (S4 Handoff prüfen)

Führe aus:
```bash
git log --oneline -10
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
```

Prüfe: Build grün? Tests grün? BUGS.md offene Issues? ROADMAP.md: 1.13 Phase 1 als DONE?

```bash
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE"
```

Wenn rot: Erst fixen (max 15 Min), dann weiter.

## Kontext

Sprint A+B+C ist verifiziert. CRM Core (5.3+5.6) und Data Enrichment (1.13 Phase 1) sind implementiert. Eine Action→Component-Analyse fand 7 Server Actions ohne UI-Consumer und 1 Page ohne Navigation. Notification-Infrastruktur existiert: `notification-dispatcher.ts` (242 LOC), `notification-dispatch.allium` (465 LOC), `Notification` Prisma Model (in-app only).

Dies ist **Session S5a** — die erste von 2 Sessions. Ziel: 8 UI-Lücken schließen (Sprint E) + Webhook-Channel als ersten Notification-Channel implementieren (Sprint D1).

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s5a-ui-gaps-webhook
```

### Schritt 0: Deferred Items prüfen

Lies `project_s4_deferred_items.md` falls vorhanden. Prüfe docs/BUGS.md auf offene Items von S4.

### PHASE 1: Sprint E1 — Kritische UI-Lücken (4 Items)

**E1.1 (M): Enrichment Control Panel**
- Neues Component: `src/components/enrichment/EnrichmentStatusPanel.tsx`
- Integration in Job-Detail (`JobDetails.tsx`) und Company-Detail Views
- Zeigt pro Company: Logo-Preview, Enrichment-Status (pending/done/failed), Modul-Info ("Enriched by: Clearbit"), "Refresh" Button
- Consumers: `getEnrichmentStatus`, `getEnrichmentResult`, `refreshEnrichment`, `triggerEnrichment`
- Online-Recherche: Prüfe wie die Enrichment-Actions implementiert sind BEVOR du die UI baust

**E1.2 (M): Status History Timeline**
- Neues Component: `src/components/crm/StatusHistoryTimeline.tsx`
- Integration in Job-Detail View
- Chronologische Timeline der Status-Transitions mit Notizen, Timestamps, User-Info
- Consumer: `getJobStatusHistory`
- Vorbereitung für ROADMAP 5.9 Timeline

**E1.3 (S): Kanban Within-Column Reorder**
- Modify: `src/components/kanban/KanbanBoard.tsx` — early-return entfernen
- Modify: `src/hooks/useKanbanState.ts` — Sort by `sortOrder` statt `createdAt`
- Consumer: `updateKanbanOrder`

**E1.4 (XS): Staging Queue Sidebar-Link**
- Modify: `src/lib/constants.ts` — `SIDEBAR_LINKS` um Staging-Entry erweitern
- i18n: Key für Navigation-Label in allen 4 Locales

**UX-Enrichment:** Verwende `/ui-design:interaction-design` für Enrichment Panel Loading-Transitions, Timeline Scroll-Verhalten, Kanban Reorder Animation.
**Accessibility:** Verwende `/accessibility-compliance:wcag-audit-patterns` für WCAG 2.2 Compliance aller neuen Komponenten.
**Data Storytelling:** Verwende `/business-analytics:data-storytelling` für Timeline-Visualisierung und Enrichment-Coverage.

### PHASE 2: Sprint E2 — Backend exponieren (4 Items)

**E2.1 (M): Dashboard Status Funnel**
- Neues Component: `src/components/dashboard/StatusFunnelWidget.tsx`
- Conversion-Chart: Bookmarked → Applied → Interview → Offer (mit Counts und Prozent)
- Consumer: `getStatusDistribution`

**E2.2 (S): Health Check Button**
- Modify: `src/components/settings/EnrichmentModuleSettings.tsx` — "Check Now" Button pro Modul
- Modify: `src/components/settings/ApiKeySettings.tsx` — gleicher Button
- Consumer: `runHealthCheck`

**E2.3 (S): Ctrl+Z Global Undo**
- Modify: Layout-Component — `useEffect` mit `Cmd+Z`/`Ctrl+Z` Keyboard-Listener
- Consumer: `undoLastAction` (NICHT `undoAction` — das ist token-basiert für BulkActionBar, separater Undo-Stack)
- Toast-Feedback bei Undo-Ausführung

**E2.4 (S): Retention Cleanup Admin UI**
- Modify: `src/components/developer/DeveloperSettings.tsx` — "Run Cleanup" Button + letzte Execution-Info
- Consumer: `runRetentionCleanup`

**UX-Pflicht für JEDE neue Komponente:**
- Loading State, Empty State, Error State
- Mobile Responsiveness (375px+)
- Keyboard Navigation + Focus Management
- Dark Mode Kompatibilität
- i18n (alle 4 Locales: EN, DE, FR, ES)
- Confirmation Dialogs für destruktive Aktionen
- Visuelles Feedback für jede User-Aktion

### PHASE 3: Sprint D1 — Webhook Channel

**Implementierungs-Reihenfolge:**
1. `WebhookEndpoint` Prisma Model (id, userId, url, secret, events, active, timestamps)
2. `validateWebhookUrl()` SSRF-Validator in `src/lib/url-validation.ts` — SUPERSET der bestehenden Validators (blockt: IMDS 169.254.169.254, RFC 1918 10.x/172.16-31.x/192.168.x, localhost 127.x/::1, non-http(s), URLs mit Credentials). Validate on create AND on dispatch.
3. Types: `WebhookChannel` Interface, `WebhookDeliveryResult`
4. HMAC Signing: `crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')` → `X-Webhook-Signature` Header
5. Retry-Logik: 3 Attempts, Backoff 1s/5s/30s, 10s Timeout
6. Retry-Exhaustion: Nach 3 failed Attempts → in-app Notification. Nach 5 consecutive Failures → auto-deactivate Endpoint mit Notification.
7. Secret Storage: AES-verschlüsselt via `src/lib/encryption.ts`, Decrypt bei HMAC-Signing
8. Settings UI: CRUD für Webhook-Endpoints (URL + SSRF-Validation, Secret auto-generated, Event-Selection, Active-Toggle, Delivery-Log letzte 10 Attempts)
9. Channel-Integration: `notification-dispatcher.ts` → `WebhookChannel` Adapter neben bestehendem in-app Channel
10. Allium Spec: `specs/notification-dispatch.allium` um Webhook-Channel-Regeln erweitern

**Test-Pflicht:**
- SSRF-Validator: Unit Tests für alle blockierten Patterns (IMDS, private IPs, localhost)
- HMAC: Unit Test dass Signatur korrekt berechnet wird
- Retry: Unit Test dass Backoff-Intervalle korrekt sind
- Retry-Exhaustion: Unit Test dass auto-deactivation nach 5 Failures greift
- Integration: Test dass notification-dispatcher Webhook-Channel korrekt routet

Committe nach jedem logischen Schritt. Build + Tests VOR jedem Commit.

**Prisma-Workflow bei Schema-Änderungen:**
```bash
bash scripts/prisma-migrate.sh   # Migration erstellen
bash scripts/prisma-generate.sh  # Client regenerieren
source scripts/env.sh && bun run build  # Build prüfen
```
**KRITISCH (Learning aus S3):** Der Agent der das Prisma-Schema ändert MUSS `prisma-generate.sh` als letzten Schritt ausführen. Sonst haben alle anderen Agents Prisma-Type-Errors. Schreibe diese Anforderung explizit in jeden Agent-Prompt der Schema-Files berührt.

### CHECK-Phase

1. `allium:weed` — Stimmt Implementation mit Spec überein? Über `notification-dispatch.allium`, `event-bus.allium` und alle betroffenen Specs.
2. `/comprehensive-review:full-review` mit `/agent-teams:multi-reviewer-patterns` — koordiniere parallele Reviews über alle 5 Dimensionen mit Finding-Deduplizierung, Severity-Kalibrierung und konsolidiertem Report. Einzel-Reports in `docs/reviews/s5a/` ablegen. Konsolidierter Report verweist pro Finding auf den Quell-Report. Fixe nach dem konsolidierten Report — bei Bedarf Einzel-Report für Detail-Kontext nachlesen.
3. User Journey: Enrichment Panel → Refresh Logo → Status Update sichtbar. Webhook → Event → POST empfangen.
4. **Dreistufige Analyse (Learning aus S3: Blind Spot allein findet nur ~43% der Findings):**

   **Stufe 1 — Offen (Agent denkt eigenständig):**
   Dispatche 3 parallele Analyse-Agents mit je einer breiten Frage und dem passenden spezialisierten Skill:
   - Agent A — `Skill("pr-review-toolkit:silent-failure-hunter")`: "Blind Spot: Woran haben wir nicht gedacht? Finde silent failures, fehlende Error-Handler, falsche Fallbacks."
   - Agent B — `Skill("ui-design:design-review")` + `Skill("accessibility-compliance:screen-reader-testing")`: "DAU/BDU (Brain Dead User): Was macht ein User der nicht nachdenkt, keine Anleitung liest und alles falsch bedient? Kommt ein blinder User durch?"
   - Agent C — `Skill("developer-essentials:error-handling-patterns")`: "Edge Cases: Was passiert bei Extremen, Grenzfällen und unerwarteten Zuständen? Analysiere Graceful Degradation."

   **Stufe 2 — Gezielt (Sicherheitsnetz, fängt ab was Stufe 1 übersieht):**
   Nach Stufe 1, dispatche Nachbohrer-Agents mit spezifischen Fragen und spezialisierten Skills:

   Blind Spot Nachbohrer — `Skill("security-scanning:stride-analysis-patterns")` + `Skill("pr-review-toolkit:pr-test-analyzer")`:
   - "STRIDE-Analyse auf Webhook-Endpoints und Enrichment-Panel"
   - "Welche Code-Pfade haben keinen Test?"
   - "Welche Server Actions akzeptieren Input der nicht validiert wird?"
   - "Welche Prisma Queries haben kein `userId` in der WHERE-Clause?"

   DAU/BDU Nachbohrer — `Skill("ui-design:interaction-design")`:
   - "Du klickst 'Refresh Logo' und das Logo ändert sich nicht. Was erwartest du?"
   - "Du erstellst einen Webhook aber tippst dich bei der URL. Was passiert?"
   - "Du hast 500 Jobs im Kanban und ziehst eine Karte innerhalb der Spalte. Was passiert?"
   - "Du nutzt die App nur auf dem Handy (375px). Was geht nicht?"

   Edge Case Nachbohrer — `Skill("application-performance:performance-optimization")`:
   - "Was passiert wenn der Webhook-Server 30 Sekunden braucht?"
   - "Was passiert wenn alle Webhook-Endpoints deaktiviert werden?"
   - "Was passiert wenn die Timeline 200 Transitions hat?"
   - "Was passiert wenn 100 Webhook-Endpoints gleichzeitig beliefert werden?"

   **Stufe 3 — Konsolidierung + Anti-Stille-Herabstufung:**
   - `Skill("agent-teams:multi-reviewer-patterns")` — konsolidiere ALLE Findings aus Stufe 1 + 2 (dedupliziert, severity-kalibriert)
   - Bei unklaren Root Causes: `Skill("superpowers:systematic-debugging")` für Hypothesen-Testing
   - Bei widersprüchlichen Findings: `Skill("agent-teams:parallel-debugging")` für konkurrierende Untersuchungen
   - Wenn ein Finding als "nicht fixbar" oder "accepted debt" eingestuft wird, MUSS das explizit kommuniziert werden mit Begründung. Stillschweigendes Weglassen ist VERBOTEN.

5. UX 10-Punkte-Checkliste für alle neuen Komponenten
6. Cross-Dependency Check: Sind die Hooks für D2 (E-Mail) und D3 (Push) vorbereitet? Ist die Channel-Abstraktion erweiterbar?

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. Aktualisiere ROADMAP.md (Sprint E1+E2 als DONE, D1 als DONE)
4. Aktualisiere CLAUDE.md (Webhook-Channel Architektur-Sektion)
5. Aktualisiere CHANGELOG.md
6. Dokumentation: `/documentation-generation:docs-architect` für Architecture Overview

## Übergreifende Regeln

### Git
- Branch: `session/s5a-ui-gaps-webhook`
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### Team-Orchestrierung — PFLICHT, nicht optional

**KRITISCH:** Du MUSST Subagenten und Team-Agents für parallele Arbeit verwenden. Mache NICHT alles sequenziell im Main-Agent. Der Main-Agent orchestriert und delegiert.

**Für Phase 1 (Sprint E1) — Foundation-then-Fan-Out:**

Schritt 1 (SEQUENZIELL): E1.4 (Sidebar-Link, XS) sofort umsetzen — ein Agent, 2 Minuten.

Schritt 2 (PARALLEL — 3 Agents nach E1.4):
- Agent 1: E1.1 Enrichment Control Panel (neue Component + Integration in JobDetails)
- Agent 2: E1.2 Status History Timeline (neue Component + Integration in Job-Detail)
- Agent 3: E1.3 Kanban Reorder (KanbanBoard.tsx + useKanbanState.ts)
- File-Ownership: Kein Overlap — Agent 1 besitzt Enrichment-Files, Agent 2 besitzt CRM-Files, Agent 3 besitzt Kanban-Files.

**Für Phase 2 (Sprint E2) — 4 parallele Agents:**
- Agent 1: E2.1 Dashboard Funnel (neues Component `StatusFunnelWidget.tsx`)
- Agent 2: E2.2 Health Check Button (`EnrichmentModuleSettings.tsx` + `ApiKeySettings.tsx`)
- Agent 3: E2.3 Ctrl+Z Undo (Layout-Component + Keyboard-Listener)
- Agent 4: E2.4 Retention Cleanup (`DeveloperSettings.tsx`)
- File-Ownership: Kein Overlap — jeder Agent besitzt seine eigenen Files.

**Für Phase 3 (Webhook) — SEQUENZIELL dann PARALLEL (Learning aus S3):**

S3 hatte kaskadierte Build-Failures weil parallele Agents Code gegen noch-nicht-existierende Types geschrieben haben. Fix: Erst Foundation legen, dann parallelisieren.

**Schritt 1 (SEQUENZIELL — ein Agent, Main-Agent wartet):**
- Prisma Schema: `WebhookEndpoint` Model
- `bash scripts/prisma-migrate.sh` + `bash scripts/prisma-generate.sh`
- Types/Interfaces: `WebhookChannel`, `WebhookDeliveryResult`, `validateWebhookUrl()`
- Main-Agent verifiziert: `tsc --noEmit` = zero Errors
- Commit: "feat(webhook): add schema + types + SSRF validator foundation"

**Schritt 2 (PARALLEL — erst NACH Schritt 1):**
- Agent 1: HMAC Signing + Retry-Logik + Retry-Exhaustion + Auto-Deactivation
- Agent 2: Settings UI (CRUD, Event-Selection, Delivery-Log)
- Agent 3: Channel-Integration in `notification-dispatcher.ts` + Allium Spec Update
- File-Ownership strikt trennen — kein Agent ändert Files eines anderen

**Build-Serialisierung (Learning aus S3):**
- Agents dürfen NICHT parallel `bun run build` ausführen — das korruptiert `.next/`
- NUR der Main-Agent führt Build-Verification aus, NACHDEM alle Agents fertig sind
- Agents dürfen `tsc --noEmit` für Type-Checking nutzen (kein `.next/` Konflikt)

**Für die CHECK-Phase MUSST du:**
- Starte `/comprehensive-review:full-review` ODER `/agent-teams:team-review` (5 Dimensionen)
- Dispatche Blind Spot + DAU/BDU + Edge Case als 3 parallele Agents (Dreistufige Analyse)
- Dispatche User Journey Analyse als eigenen Agent

**Für Fixes — nach FILES aufteilen, NICHT nach Finding-Typ (Learning aus S3-Resume):**
S3-Resume hat Fix-Agents nach Typ aufgeteilt (Security-Agent, WCAG-Agent, Performance-Agent). Mehrere Agents haben dieselbe Datei gleichzeitig editiert → Syntax-Errors durch concurrent Edits. Fix: Gruppiere ALLE Findings (egal ob Security, WCAG, Performance) nach betroffenen Files. Ein Agent bekommt ALLE Findings für seine File-Gruppe.

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

### Learnings aus S1a+S1b+S2+S3+S4 (BEACHTEN)

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

**5. Allium Weed wird vergessen:**
Deshalb CP-13 in der CHECK-Phase — nicht optional.

**6. Skills werden ignoriert wenn sie nur "erwähnt" werden:**
Deshalb sind sie jetzt als PFLICHT-CHECKPOINTS formuliert. Du KANNST sie nicht überspringen.

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

**Vor Phase 1 (Sprint E1):**
- [ ] CP-0: Deferred Items gelesen, offene Issues bekannt

**Vor Phase 2 (Sprint E2):**
- [ ] CP-1: E1.1 Enrichment Panel hat UI-Consumer für alle 4 Actions → `git diff` zeigen
- [ ] CP-2: E1.2 Timeline rendert History-Entries → `git diff` zeigen
- [ ] CP-3: E1.3 Kanban within-column Drag funktioniert → `git diff` zeigt `updateKanbanOrder` Call
- [ ] CP-4: E1.4 Staging in Sidebar → `git diff` zeigt `SIDEBAR_LINKS` Entry

**Vor Phase 3 (Webhook):**
- [ ] CP-5: E2.1 Funnel-Widget rendert Daten → `git diff` zeigt `getStatusDistribution` Call
- [ ] CP-6: E2.2 Health Check Button funktioniert → `git diff`
- [ ] CP-7: E2.3 Ctrl+Z löst Undo aus → `git diff` zeigt Keyboard-Listener
- [ ] CP-8: E2.4 Retention Button in Developer Settings → `git diff`

**Vor CHECK-Phase:**
- [ ] CP-9: Webhook Foundation committed (Schema + Types + SSRF-Validator) → `tsc --noEmit` = 0
- [ ] CP-10: Webhook HMAC + Retry + Settings UI + Channel-Integration committed
- [ ] CP-11: `notification-dispatch.allium` updated mit Webhook-Regeln

**Vor der ACT-Phase — EXAKTE Skill-Aufrufe (Learning aus S3):**

S3 hat generische `Agent("review")` Aufrufe statt der spezialisierten Skills verwendet. Skills laden spezialisierte Prompts und Checklisten — generische Agents improvisieren. Du MUSST die folgenden Skills EXAKT aufrufen.

**WICHTIG (Learning aus S3-Resume):** Verwende das **`Skill` Tool**, NICHT das `Agent` Tool. `Skill("comprehensive-review:full-review")` ist korrekt. `Agent(subagent_type="comprehensive-review:full-review")` schlägt fehl weil nicht alle Skills als Agent-Type registriert sind. Im Zweifel: immer `Skill` Tool verwenden.

- [ ] CP-12: Rufe `/comprehensive-review:full-review` auf (NICHT `Agent("comprehensive review")`). Dann `/agent-teams:multi-reviewer-patterns` zur Konsolidierung. Reports in `docs/reviews/s5a/`. **Evidenz:** Skill-Invocation-Output zeigen.
- [ ] CP-13: Rufe `/accessibility-compliance:wcag-audit-patterns` auf (NICHT `Agent("a11y check")`). **Evidenz:** Skill-Output + Findings-Datei.
- [ ] CP-14: Rufe `/ui-design:interaction-design` auf (NICHT `Agent("interaction review")`). **Evidenz:** Skill-Output + dokumentierte Patterns.
- [ ] CP-15: Rufe `/business-analytics:data-storytelling` auf (NICHT `Agent("dashboard")`). **Evidenz:** Skill-Output + Visualisierung.
- [ ] CP-16: Rufe `allium:weed` auf über alle betroffenen Specs. **Evidenz:** Weed-Output = zero Divergenzen.
- [ ] CP-17: Dispatche Blind Spot + DAU/BDU + Edge Case Agents (Dreistufige Analyse). **Evidenz:** Findings dokumentiert.

**Vor dem Merge:**
- [ ] CP-18: ALLE Findings aus konsolidiertem Report gefixt
- [ ] CP-19: Re-Review bestätigt zero Regressionen
- [ ] CP-20: Exit-Checkliste vollständig mit Evidenz

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items als offene Issues
3. Schreibe eine Handoff-Notiz in die letzte Commit-Message
4. Starte KEINE neuen Features — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.) um Daten anzureichern — z.B. Library-Docs, API-Referenzen, Best Practices, aktuelle Framework-Versionen.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] Alle 7 orphaned Server Actions haben UI-Consumer (Action→Component Trace verifiziert)
- [ ] `/dashboard/staging` in Sidebar
- [ ] Enrichment Control Panel: Logo-Preview, Status, "Refresh" Button, Modul-Info
- [ ] Status History Timeline: Chronologische Transitions mit Notizen
- [ ] Kanban within-column Reorder funktional
- [ ] Dashboard Funnel Widget rendert Conversion-Chart
- [ ] Health Check Button in Settings
- [ ] Ctrl+Z Undo funktional mit Toast-Feedback
- [ ] Retention Cleanup in Developer Settings
- [ ] Webhook Channel funktional: Endpoint erstellen → Event triggern → POST mit HMAC empfangen
- [ ] SSRF-Schutz: `validateWebhookUrl()` blockt IMDS, Private IPs, localhost
- [ ] Webhook Retry-Exhaustion: auto-deactivate nach 5 consecutive Failures
- [ ] Comprehensive Review bestanden (zero Findings nach Fix-Runde)
- [ ] Dreistufige Analyse durchgeführt (Blind Spot + DAU/BDU + Edge Cases)
- [ ] `allium:weed` = zero Divergenzen
- [ ] docs/reviews/s5a/ mit Einzel- und konsolidiertem Report
- [ ] E2E Tests für: Enrichment Panel, Status Timeline, Webhook Settings
- [ ] Lies `e2e/CONVENTIONS.md` BEVOR du E2E Tests schreibst
- [ ] docs/BUGS.md, CHANGELOG.md, ROADMAP.md aktualisiert
- [ ] CLAUDE.md aktualisiert (Webhook Architektur)
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s5a-ui-gaps-webhook` nach main mergen
