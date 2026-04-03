# Sprint S5: UI-Lücken + Notification Channels — Session Prompts

> **For agentic workers:** Each task below IS a self-contained session prompt. Copy-paste one prompt per Claude Code session. Execute in order: S5a → S5b.

**Goal:** Close 8 Backend→Frontend gaps (Sprint E) and implement 3 notification channels (Sprint D: Webhook, E-Mail, Browser Push).

**Architecture:** S5a closes UI gaps then builds Webhook channel on existing notification-dispatcher. S5b adds E-Mail and Push channels on the abstraction D1 establishes. Foundation-then-Fan-Out for Prisma schema changes. All 15 learnings from S1a-S4 integrated.

**Spec:** `docs/superpowers/specs/2026-04-03-sprint-e-d-ui-gaps-notifications-design.md`

---

### Task 1: Session S5a Prompt — Sprint E (UI-Lücken) + Webhook Channel (D1)

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-03-sprint-e-d-ui-gaps-notifications-design.md
Lies docs/BUGS.md
Lies specs/notification-dispatch.allium und specs/event-bus.allium

## Quick-Verify (S4 Handoff prüfen)

Führe aus:
```bash
git log --oneline -10
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE"
```

Prüfe: Build grün? Tests grün? BUGS.md offene Issues?
Wenn rot: Erst fixen (max 15 Min), dann weiter.

## Kontext

Sprint C5 (CRM Core) und C6 (Data Enrichment) haben Backend-Capabilities gebaut die nie an die UI angeschlossen wurden. Eine Action→Component-Analyse fand 7 Server Actions ohne UI-Consumer und 1 Page ohne Navigation. Zusätzlich ist Sprint D (Notification Channels) der nächste Infrastruktur-Schritt.

Dies ist **Session S5a** — die erste von 2 Sessions. Ziel: 8 UI-Lücken schließen + Webhook-Channel als ersten Notification-Channel implementieren.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s5a-ui-gaps-webhook
```

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
- Modify: `src/components/kanban/KanbanBoard.tsx` — early-return auf Zeile ~156 entfernen
- Modify: `src/hooks/useKanbanState.ts` — Sort by `sortOrder` statt `createdAt`
- Consumer: `updateKanbanOrder`

**E1.4 (XS): Staging Queue Sidebar-Link**
- Modify: `src/lib/constants.ts` — `SIDEBAR_LINKS` um Staging-Entry erweitern
- i18n: Key für Navigation-Label in allen 4 Locales

### PHASE 2: Sprint E2 — Backend exponieren (4 Items)

**E2.1 (M): Dashboard Status Funnel**
- Neues Component: `src/components/dashboard/StatusFunnelWidget.tsx`
- Conversion-Chart: Bookmarked → Applied → Interview → Offer (mit Counts und Prozent)
- Consumer: `getStatusDistribution`
- Verwende `Skill("business-analytics:data-storytelling")` für Visualisierungsdesign

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

### PHASE 3: Sprint D1 — Webhook Channel

**Schritt 1 (SEQUENZIELL — Foundation):**
- Prisma Schema: `WebhookEndpoint` Model (id, userId, url, secret, events, active, timestamps)
- `bash scripts/prisma-migrate.sh && bash scripts/prisma-generate.sh`
- Neuer SSRF-Validator: `validateWebhookUrl()` in `src/lib/url-validation.ts` — SUPERSET der bestehenden Validators. Blockt: IMDS (169.254.169.254), RFC 1918 (10.x, 172.16-31.x, 192.168.x), localhost (127.x, ::1), non-http(s), URLs mit Credentials. Validate on create AND on dispatch.
- Types: `WebhookChannel` Interface, `WebhookDeliveryResult`
- Main-Agent verifiziert: `tsc --noEmit` = zero Errors
- Commit Foundation

**Schritt 2 (PARALLEL — nach Foundation):**
- Agent 1: HMAC Signing + Retry-Logik (3 Attempts, Backoff 1s/5s/30s, 10s Timeout, Retry-Exhaustion → in-app Notification, 5 consecutive Failures → auto-deactivate Endpoint)
- Agent 2: Settings UI — CRUD für Webhook-Endpoints (URL + SSRF-Validation, Secret auto-generated, Event-Selection Checkboxen, Active-Toggle, Delivery-Log letzte 10 Attempts)
- Agent 3: Channel-Integration in `notification-dispatcher.ts` — `WebhookChannel` Adapter neben bestehendem in-app Channel
- Secret Storage: AES-verschlüsselt via `src/lib/encryption.ts`, Decrypt bei HMAC-Signing
- Allium Spec: `specs/notification-dispatch.allium` um Webhook-Channel-Regeln erweitern

### CHECK-Phase

**Dreistufige Analyse:**

**Stufe 1 — Offen (3 parallele Agents):**
- `Skill("pr-review-toolkit:silent-failure-hunter")`: "Blind Spot: Woran haben wir nicht gedacht?"
- `Skill("ui-design:design-review")` + `Skill("accessibility-compliance:screen-reader-testing")`: "DAU/BDU: Was macht ein User der nicht nachdenkt?"
- `Skill("developer-essentials:error-handling-patterns")`: "Edge Cases: Was passiert bei Extremen?"

**Stufe 2 — Gezielt (Nachbohrer):**
- `Skill("security-scanning:stride-analysis-patterns")` + `Skill("pr-review-toolkit:pr-test-analyzer")`: "STRIDE auf Webhook-Endpoint. Welche Code-Pfade haben keinen Test?"
- `Skill("ui-design:interaction-design")`: "Enrichment Panel Loading-Transition, Timeline Scroll-Verhalten, Funnel Animation"
- `Skill("application-performance:performance-optimization")`: "Was passiert bei 100 Webhook-Endpoints? Bei 1000 Status-Transitions in der Timeline?"

DAU/BDU Nachbohrer:
- "Du klickst 'Refresh Logo' und das Logo ändert sich nicht. Was erwartest du?"
- "Du erstellst einen Webhook aber tippst dich bei der URL. Was passiert?"
- "Du hast 500 Jobs im Kanban. Was passiert beim Reorder?"

Edge Case Nachbohrer:
- "Was passiert wenn der Webhook-Server 30 Sekunden braucht?"
- "Was passiert wenn alle Webhook-Endpoints deaktiviert werden?"
- "Was passiert wenn die Timeline 200 Transitions hat?"

**Stufe 3 — Konsolidierung:**
- `Skill("agent-teams:multi-reviewer-patterns")` — konsolidiere ALLE Findings
- Einzel-Reports in `docs/reviews/s5a/`, konsolidierter Report verweist auf Quell-Reports
- Fixe NUR den konsolidierten Report
- Anti-Stille-Herabstufung: Findings als "nicht fixbar" MÜSSEN explizit kommuniziert werden

Zusätzlich:
- `allium:weed` über `notification-dispatch.allium`, `event-bus.allium` und betroffene Specs
- `Skill("comprehensive-review:full-review")` — Verwende `Skill()` Tool, NICHT `Agent()` Tool
- Claim-Verification: `git diff` für jeden "fixed" Claim (67% Fabrication-Rate)

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. ROADMAP.md: Sprint E1+E2 als DONE, D1 als DONE
4. CLAUDE.md: Webhook-Channel Architektur-Sektion
5. CHANGELOG.md aktualisieren
6. BUGS.md aktualisieren
7. docs/reviews/s5a/ mit Reports

## Übergreifende Regeln

### PFLICHT-CHECKPOINTS (Evidenz vor jedem nächsten Schritt)

**Vor Phase 2:**
- [ ] CP-1: E1.1 Enrichment Panel hat UI-Consumer für alle 4 Actions → `git diff` zeigen
- [ ] CP-2: E1.2 Timeline rendert History-Entries → Screenshot oder Test-Output
- [ ] CP-3: E1.3 Kanban within-column Drag funktioniert → `git diff` zeigt `updateKanbanOrder` Call
- [ ] CP-4: E1.4 Staging in Sidebar → `git diff` zeigt `SIDEBAR_LINKS` Entry

**Vor Phase 3:**
- [ ] CP-5: E2.1 Funnel-Widget rendert Daten → `git diff` zeigt `getStatusDistribution` Call
- [ ] CP-6: E2.2 Health Check Button funktioniert → `git diff`
- [ ] CP-7: E2.3 Ctrl+Z löst Undo aus → `git diff` zeigt Keyboard-Listener
- [ ] CP-8: E2.4 Retention Button in Developer Settings → `git diff`

**Vor CHECK-Phase:**
- [ ] CP-9: Webhook Foundation committed (Schema + Types + SSRF-Validator) → `tsc --noEmit` = 0
- [ ] CP-10: Webhook HMAC + Retry + Settings UI + Channel-Integration committed
- [ ] CP-11: `notification-dispatch.allium` updated mit Webhook-Regeln

**Vor ACT-Phase (EXAKTE Skill-Aufrufe via `Skill()` Tool):**
- [ ] CP-12: `Skill("comprehensive-review:full-review")` invoked → Output zeigen
- [ ] CP-13: Dreistufige Analyse (Stufe 1 + 2 + 3) durchgeführt → konsolidierter Report
- [ ] CP-14: `allium:weed` = zero Divergenzen
- [ ] CP-15: Claim-Verification per `git diff` durchgeführt

**Vor Merge:**
- [ ] CP-16: ALLE Findings gefixt
- [ ] CP-17: Build grün + Tests grün + E2E grün
- [ ] CP-18: Exit-Checkliste vollständig

### ANTI-FAULHEIT — Verbotene Begründungen für Skips
- ❌ "Aus Zeitgründen übersprungen" / "Good enough" / "Moving on" / "Deferred" ohne fachlichen Grund / "Conservative scope" / "Not critical"
- ✅ Technische Unmöglichkeit mit Erklärung / Explizite fachliche Entscheidung / Blocker durch externen Fehler (→ BUGS.md)

### VERBOTEN für den Main-Agent
- ❌ Code Read/Edit/Write (außer BUGS.md, CHANGELOG.md, ROADMAP.md, CLAUDE.md, docs/)
- ❌ Tests schreiben oder ausführen
- ❌ Review-Findings selbst fixen
- ❌ Skills durch generische `Agent("...")` Aufrufe ersetzen
- ✅ `Skill()` Tool und Agents dispatchen + koordinieren
- ✅ Koordinations-Files aktualisieren, Git-Operationen, Build/Test Verification

Wenn ein Agent abbricht: Dispatche einen NEUEN Agent. Mache es NICHT selbst.

### Foundation-then-Fan-Out
1. SEQUENZIELL: Prisma Schema + migrate + generate + types
2. Main-Agent verifiziert: `tsc --noEmit` = 0
3. DANN parallel: Agents coden gegen stabile Interfaces

### Fix-Agents nach FILES (nicht Finding-Typ)
Gruppiere ALLE Findings (Security, WCAG, Performance) nach betroffenen Files. Ein Agent = alle Findings seiner File-Gruppe.

### Build-Serialisierung
Agents: kein `bun run build`. Nur `tsc --noEmit`. Main-Agent baut nach Agent-Completion.

### Resilienz
- API 500: Warte 30s, retry. Sub-Agent abbricht: Prüfe Commits, neuer Agent für Rest.
- "Task not found" Fehler: harmlos, ignorieren.
- Keine `sleep`-Loops. Direkte Agent-Completion-Abfragen.
- Consolidation-Agent IMMER zuletzt (NACHDEM alle anderen fertig).

### Agent-Claims verifizieren (67% Fabrication-Rate)
- Nach jedem "fixed" Claim: `git diff` prüfen
- Für CRITICAL/HIGH: Datei + Zeilennummer öffnen und Fix bestätigen
- Stichproben-Verification an konsolidierten Reports

### Git
- Branch: `session/s5a-ui-gaps-webhook`
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**
- Lies `e2e/CONVENTIONS.md` BEVOR du E2E Tests schreibst

### Prisma-Workflow bei Schema-Änderungen
```bash
bash scripts/prisma-migrate.sh   # Migration erstellen
bash scripts/prisma-generate.sh  # Client regenerieren
source scripts/env.sh && bun run build  # Build prüfen
```
Agent der Schema ändert MUSS `prisma-generate.sh` als letzten Schritt ausführen.

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.) um Daten anzureichern.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] Alle 7 orphaned Server Actions haben UI-Consumer (Action→Component Trace verifiziert)
- [ ] `/dashboard/staging` in Sidebar
- [ ] Webhook Channel funktional: Endpoint erstellen → Event triggern → POST mit HMAC empfangen
- [ ] SSRF-Schutz: `validateWebhookUrl()` blockt IMDS, Private IPs, localhost
- [ ] Webhook Retry-Exhaustion: auto-deactivate nach 5 consecutive Failures
- [ ] E2E Tests für: Enrichment Panel, Status Timeline, Webhook Settings
- [ ] Dreistufige Analyse durchgeführt (Blind Spot + DAU/BDU + Edge Cases)
- [ ] Comprehensive Review bestanden (zero Findings nach Fix-Runde)
- [ ] `allium:weed` = zero Divergenzen
- [ ] docs/reviews/s5a/ mit Einzel- und konsolidiertem Report
- [ ] BUGS.md, CHANGELOG.md, ROADMAP.md aktualisiert
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s5a-ui-gaps-webhook` nach main mergen
````

---

### Task 2: Session S5b Prompt — E-Mail Channel (D2) + Browser Push (D3)

**Files:**
- Output: Copy-paste into a new Claude Code session in `/home/pascal/projekte/jobsync/`

- [ ] **Step 1: Copy the prompt below into a new Claude Code session**

````markdown
Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-03-sprint-e-d-ui-gaps-notifications-design.md
Lies docs/BUGS.md
Lies specs/notification-dispatch.allium und specs/event-bus.allium

## Quick-Verify (S5a Handoff prüfen)

Führe aus:
```bash
git log --oneline -15
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE"
```

Prüfe:
- Build grün? Tests grün?
- Webhook Channel funktional? (`grep -r "WebhookChannel" src/`)
- docs/BUGS.md — offene Issues von S5a?
- `notification-dispatch.allium` — enthält Webhook-Regeln?

Wenn rot: Erst fixen (max 15 Min), dann weiter.

## Kontext

Session S5a hat 8 UI-Lücken geschlossen (Sprint E) und den Webhook-Channel als ersten Notification-Channel implementiert. Die Channel-Abstraktion in `notification-dispatcher.ts` ist etabliert.

Dies ist **Session S5b** — die zweite von 2 Sessions. Ziel: E-Mail Channel (D2) und Browser Push Channel (D3) implementieren.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s5b-email-push
```

### Schritt 0: S5a Deferred Items

Lies die Memory `project_s5a_deferred_items.md` falls vorhanden. Prüfe docs/BUGS.md auf offene Items.

### PHASE 1: Foundation — Neue NotificationType Values (SEQUENZIELL)

**BEVOR E-Mail/Push gebaut werden:**
Das bestehende `NotificationType` Enum hat keine `job_status_changed`. Der `notification-dispatcher.ts` ist NICHT auf `JobStatusChanged` Domain Event subscribed. Beides muss zuerst existieren.

**Schritt 1 (SEQUENZIELL — ein Agent, Main-Agent wartet):**
- `NotificationType` Enum erweitern: `job_status_changed` hinzufügen
- `notification-dispatcher.ts`: Subscribe auf `JobStatusChanged` Event aus `event-types.ts`
- `notification-dispatch.allium` updaten: neuer Typ + Dispatch-Regel
- Main-Agent verifiziert: `tsc --noEmit` = 0, bestehende Notification-Tests grün
- Commit Foundation

### PHASE 2: E-Mail Channel (D2)

**Online-Recherche PFLICHT:** Agent MUSS `nodemailer` API via WebSearch/Context7 recherchieren BEVOR er Code schreibt. Auch: React-Email oder Handlebars für Templates.

**Schritt 1 (SEQUENZIELL — Types + Settings Schema):**
- Prisma: SMTP-Settings in `UserSettings` oder eigene Tabelle (Host, Port, User, Password encrypted via AES)
- Types: `EmailChannel` Interface, `EmailTemplate` Type
- `bash scripts/prisma-migrate.sh && bash scripts/prisma-generate.sh`
- Main-Agent verifiziert: `tsc --noEmit` = 0

**Schritt 2 (PARALLEL — nach Foundation):**
- Agent 1: `nodemailer` SMTP Integration + TLS-Enforcement (reject plaintext) + Rate-Limiting (10/min pro User)
- Agent 2: E-Mail Templates pro `NotificationType` (alle existierenden Typen + `job_status_changed`). Templates in allen 4 Locales (EN, DE, FR, ES). Verwende React-Email oder Handlebars.
- Agent 3: Settings UI — SMTP-Konfiguration (Host, Port, User, Password), Test-E-Mail Button (rate-limited: 1/60s), Per-Type Enable/Disable
- Agent 4: Channel-Integration in `notification-dispatcher.ts` — `EmailChannel` Adapter

### PHASE 3: Browser Push Channel (D3)

**Online-Recherche PFLICHT:** Agent MUSS `web-push` + VAPID Protokoll via WebSearch/Context7 recherchieren BEVOR er Code schreibt.

**Schritt 1 (SEQUENZIELL — Schema + Service Worker):**
- Prisma: `PushSubscription` Model (endpoint, p256dh, auth — encrypted at rest via AES, userId)
- VAPID Keys: Generated on first use, stored encrypted in DB (NICHT in env vars)
- `public/sw-push.js`: Minimaler Service Worker (push-only, NOT full PWA)
- `bash scripts/prisma-migrate.sh && bash scripts/prisma-generate.sh`

**Schritt 2 (PARALLEL):**
- Agent 1: `web-push` Integration + `PushChannel` Adapter in notification-dispatcher + Stale Subscription Handling (410 Gone → delete)
- Agent 2: Settings UI — "Enable Push" Button → Browser Permission Prompt → Subscription gespeichert. VAPID Key Rotation Warning.
- Agent 3: Service Worker Registration in Layout + Push-Event Handler (shows notification with title + body + click-action)

### CHECK-Phase

**Dreistufige Analyse:**

**Stufe 1 — Offen (3 parallele Agents):**
- `Skill("pr-review-toolkit:silent-failure-hunter")`: "Blind Spot: Woran haben wir nicht gedacht?"
- `Skill("ui-design:design-review")` + `Skill("accessibility-compliance:screen-reader-testing")`: "DAU/BDU: Was macht ein User der nicht nachdenkt?"
- `Skill("developer-essentials:error-handling-patterns")`: "Edge Cases: Was passiert bei Extremen?"

**Stufe 2 — Gezielt:**
- `Skill("security-scanning:stride-analysis-patterns")`: "STRIDE auf SMTP-Credentials und Push-Subscriptions"
- `Skill("pr-review-toolkit:pr-test-analyzer")`: "Welche E-Mail/Push Pfade haben keinen Test?"
- `Skill("application-performance:performance-optimization")`: "Was passiert bei 100 Push-Subscriptions? Bei 50 E-Mails gleichzeitig?"

DAU/BDU Nachbohrer:
- "Du konfigurierst SMTP falsch (falsches Passwort). Was siehst du?"
- "Du aktivierst Push, blockierst dann die Berechtigung im Browser. Was passiert?"
- "Du bekommst 20 Notifications in einer Minute per E-Mail. Wie fühlt sich das an?"

Edge Case Nachbohrer:
- "Was passiert wenn der SMTP-Server nicht erreichbar ist?"
- "Was passiert wenn VAPID Keys rotiert werden? Was sehen User mit alten Subscriptions?"
- "Was passiert wenn der Browser Push ablehnt (private mode, disabled)?"

**Stufe 3 — Konsolidierung:**
- `Skill("agent-teams:multi-reviewer-patterns")` — konsolidiere ALLE Findings
- Einzel-Reports in `docs/reviews/s5b/`
- Anti-Stille-Herabstufung

Zusätzlich:
- `Skill("comprehensive-review:full-review")`
- `allium:weed` über `notification-dispatch.allium`
- Claim-Verification per `git diff`

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. ROADMAP.md: D2, D3 als DONE
4. CLAUDE.md: Notification Channels Architektur-Sektion
5. CHANGELOG.md, BUGS.md aktualisieren
6. `notification-dispatch.allium` — alle 3 Channel-Regeln (Webhook + Email + Push)

## Übergreifende Regeln

### PFLICHT-CHECKPOINTS

**Vor Phase 2:**
- [ ] CP-1: `job_status_changed` in NotificationType Enum → `git diff`
- [ ] CP-2: `notification-dispatcher.ts` subscribed auf `JobStatusChanged` → `git diff`
- [ ] CP-3: `tsc --noEmit` = 0, bestehende Tests grün

**Vor Phase 3:**
- [ ] CP-4: nodemailer SMTP Integration funktional → Test-E-Mail gesendet
- [ ] CP-5: E-Mail Templates für alle NotificationType in 4 Locales → `git diff`
- [ ] CP-6: Settings UI für SMTP → `git diff`
- [ ] CP-7: `EmailChannel` in notification-dispatcher → `git diff`

**Vor CHECK-Phase:**
- [ ] CP-8: `PushSubscription` Model + VAPID Keys in DB → `tsc --noEmit` = 0
- [ ] CP-9: Service Worker registriert + Push-Notification angezeigt
- [ ] CP-10: `PushChannel` in notification-dispatcher → `git diff`
- [ ] CP-11: Settings UI für Push (Enable/Disable/VAPID Rotation Warning) → `git diff`

**Vor ACT-Phase (EXAKTE Skill-Aufrufe via `Skill()` Tool):**
- [ ] CP-12: `Skill("comprehensive-review:full-review")` invoked → Output zeigen
- [ ] CP-13: Dreistufige Analyse durchgeführt → konsolidierter Report in `docs/reviews/s5b/`
- [ ] CP-14: `allium:weed` = zero Divergenzen
- [ ] CP-15: Claim-Verification per `git diff`

**Vor Merge:**
- [ ] CP-16: ALLE Findings gefixt
- [ ] CP-17: Build grün + Tests grün + E2E grün
- [ ] CP-18: `notification-dispatch.allium` enthält Regeln für alle 3 Channels

### ANTI-FAULHEIT
- ❌ "Aus Zeitgründen" / "Good enough" / "Moving on" / "Deferred" ohne Grund — UNGÜLTIG
- ✅ Technische Unmöglichkeit / Fachliche Entscheidung / Externer Blocker → BUGS.md

### VERBOTEN für den Main-Agent
- ❌ Code Read/Edit/Write (außer Koordinations-Files)
- ❌ Tests schreiben, Findings fixen, UI ändern
- ❌ Skills durch `Agent("...")` ersetzen — verwende `Skill()` Tool
- ✅ Agents/Skills dispatchen, koordinieren, Ergebnisse prüfen, Docs updaten, Git, Build/Test

### Foundation-then-Fan-Out
SEQUENZIELL: Schema + Types → Main-Agent verifiziert → DANN parallel: Agents coden gegen stabile Interfaces.

### Fix-Agents nach FILES
Gruppiere ALLE Findings nach Files, nicht nach Typ. Ein Agent = alle Findings seiner File-Gruppe.

### Build-Serialisierung
Agents: nur `tsc --noEmit`. Main-Agent: `bun run build` nach Agent-Completion.

### Resilienz
- API 500: Warte 30s, retry. Ignoriere "Task not found".
- Keine sleep-Loops. Consolidation-Agent zuletzt.

### Agent-Claims verifizieren (67% Fabrication-Rate)
`git diff` für jeden "fixed" Claim. CRITICAL/HIGH: Datei + Zeile bestätigen.

### Git
- Branch: `session/s5b-email-push`
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit
- **NIEMALS PRs gegen upstream Gsync/jobsync.**
- Lies `e2e/CONVENTIONS.md` vor E2E Tests

### Prisma-Workflow
```bash
bash scripts/prisma-migrate.sh && bash scripts/prisma-generate.sh && source scripts/env.sh && bun run build
```
Agent der Schema ändert MUSS `prisma-generate.sh` ausführen.

### Online-Recherche
Agent MUSS `nodemailer` und `web-push` APIs online recherchieren BEVOR Implementation. WebSearch, Context7, DeepWiki erlaubt.

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

## Exit-Checkliste

- [ ] E-Mail Channel: SMTP konfiguriert → Notification triggert E-Mail → zugestellt
- [ ] Push Channel: VAPID konfiguriert → Subscription gespeichert → Notification triggert Push → Browser zeigt Notification
- [ ] `job_status_changed` NotificationType existiert und wird dispatched
- [ ] Alle 3 Channels in `notification-dispatch.allium` spezifiziert
- [ ] E2E Tests für E-Mail Settings + Push Settings
- [ ] Dreistufige Analyse durchgeführt
- [ ] Comprehensive Review bestanden
- [ ] `allium:weed` = zero Divergenzen
- [ ] docs/reviews/s5b/ mit Reports
- [ ] BUGS.md, CHANGELOG.md, ROADMAP.md aktualisiert
- [ ] CLAUDE.md: Notification Channels Architektur
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s5b-email-push` nach main mergen
````
