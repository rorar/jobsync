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
