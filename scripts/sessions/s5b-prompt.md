Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies die Design-Spec: docs/superpowers/specs/2026-04-03-sprint-e-d-ui-gaps-notifications-design.md
Lies docs/BUGS.md und docs/documentation-agents.md
Lies specs/notification-dispatch.allium und specs/event-bus.allium

## Quick-Verify (S5a Handoff prüfen)

Führe aus:
```bash
git log --oneline -15
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
```

Prüfe: Build grün? Tests grün? BUGS.md offene Issues? Webhook Channel funktional?

```bash
grep -r "WebhookChannel" src/ | head -5
E2E_BASELINE=$(npx playwright test --list 2>/dev/null | grep -c "test")
echo "E2E baseline: $E2E_BASELINE"
```

Wenn rot: Erst fixen (max 15 Min), dann weiter.

## Kontext

Session S5a hat 8 UI-Lücken geschlossen (Sprint E) und den Webhook-Channel als ersten Notification-Channel implementiert. Die Channel-Abstraktion in `notification-dispatcher.ts` ist etabliert. `notification-dispatch.allium` enthält Webhook-Channel-Regeln.

Dies ist **Session S5b** — die zweite von 2 Sessions. Ziel: E-Mail Channel (D2) und Browser Push Channel (D3) implementieren.

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/s5b-email-push
```

### Schritt 0: S5a Deferred Items

Lies `project_s5a_deferred_items.md` falls vorhanden. Prüfe docs/BUGS.md auf offene Items von S5a.

### PHASE 1: Foundation — Neue NotificationType Values (SEQUENZIELL)

**BEVOR E-Mail/Push gebaut werden — Foundation-then-Fan-Out (Learning aus S3/S4):**
Das bestehende `NotificationType` Enum hat keine `job_status_changed`. Der `notification-dispatcher.ts` ist NICHT auf `JobStatusChanged` Domain Event subscribed. Beides muss zuerst existieren.

**Schritt 1 (SEQUENZIELL — ein Agent, Main-Agent wartet):**
- `NotificationType` Enum erweitern: `job_status_changed` hinzufügen in `notification.model.ts`
- `notification-dispatcher.ts`: Subscribe auf `JobStatusChanged` Event aus `event-types.ts`
- `NotificationPreferences` Interface erweitern: `channels: { inApp: boolean, webhook: boolean, email: boolean, push: boolean }` (aktuell nur `inApp`). `DEFAULT_NOTIFICATION_PREFERENCES` updaten.
- `shouldNotify()` channel-aware machen: aktuell prüft es nur `channels.inApp` als Single Gate. Muss pro Channel separat prüfen ob der spezifische Channel enabled ist.
- `notification-dispatch.allium` updaten: neuer Typ + Dispatch-Regel + Channel-Enum erweitern
- `event-bus.allium` updaten: fehlende Events hinzufügen (JobStatusChanged, CompanyCreated, EnrichmentCompleted, EnrichmentFailed — Spec-Code-Divergenz)
- i18n: Notification-Text für `job_status_changed` in allen 4 Locales
- Main-Agent verifiziert: `tsc --noEmit` = 0, bestehende Notification-Tests grün
- Commit: "feat(notifications): add job_status_changed type + multi-channel preferences + dispatcher wiring"

### PHASE 2: Sprint D2 — E-Mail Channel

**Online-Recherche PFLICHT:** Agent MUSS `nodemailer` API via WebSearch/Context7 recherchieren BEVOR er Code schreibt. Auch: React-Email oder Handlebars für Templates.

Starte `Skill("full-stack-orchestration:full-stack-feature")` für die E-Mail Channel Umsetzung.

**Feature-Beschreibung für den Skill:**
E-Mail Notification Channel via nodemailer SMTP. SmtpConfig Prisma Model (eigene Tabelle: id, userId, host, port, username, password AES encrypted, fromAddress, tlsRequired default true, active, `@@index([userId])`). EmailChannel Adapter für ChannelRouter (von S5a etabliert). TLS-Enforcement (reject plaintext). Rate-Limiting (10/min pro User). E-Mail Templates pro NotificationType in 4 Locales (EN, DE, FR, ES). Settings UI (SMTP-Konfiguration, Test-Button rate-limited 1/60s, Per-Type Enable/Disable).

**Online-Recherche:** Der Skill MUSS `nodemailer` API via WebSearch/Context7 recherchieren. Auch: React-Email oder Handlebars für Templates.

**Zusätzliche Anforderungen (nicht im Skill abgedeckt):**
- SSRF: SMTP Host-Validierung (keine internen IPs)
- Credential-Sicherheit: Password encrypted at rest, `import "server-only"` für Decrypt
- Test-Pflicht: Mock `nodemailer.createTransport()`, Snapshot-Tests für Templates × 4 Locales

### PHASE 3: Sprint D3 — Browser Push Channel

Starte `Skill("full-stack-orchestration:full-stack-feature")` für die Browser Push Umsetzung.

**Feature-Beschreibung für den Skill:**
Browser Push Notification Channel via web-push (VAPID). WebPushSubscription Prisma Model (NICHT `PushSubscription` — kollidiert mit Browser Web API Type). Felder: endpoint, p256dh, auth (encrypted at rest via AES), userId + User Relation + `@@index([userId])`. VapidConfig Prisma Tabelle (publicKey, privateKey encrypted via AES). Service Worker Discovery BEVOR Erstellung (`grep -r "serviceWorker" src/ public/` und `ls public/sw*.js`). `public/sw-push.js` minimaler Service Worker (push-only, NOT full PWA). PushChannel Adapter für ChannelRouter. Settings UI (Enable/Disable Push, VAPID Rotation Warning + Confirmation Dialog, Unsubscribe). Stale Subscription Handling (410 Gone → delete).

**Online-Recherche:** Der Skill MUSS `web-push` + VAPID Protokoll via WebSearch/Context7 recherchieren.

**Zusätzliche Anforderungen (nicht im Skill abgedeckt):**
- Service Worker Scope: Prüfe ob Next.js 15 Custom Headers braucht (`Service-Worker-Allowed` in `next.config.mjs`)
- VAPID Key Rotation: Confirmation Dialog BEVOR Rotation (alle Subscriptions werden ungültig)
- Credential-Sicherheit: VAPID privateKey + Subscription auth encrypted at rest

**UX-Pflicht für JEDE neue Komponente:**
- Loading State, Empty State, Error State
- Mobile Responsiveness (375px+)
- Keyboard Navigation + Focus Management
- Dark Mode Kompatibilität
- i18n (alle 4 Locales: EN, DE, FR, ES)
- Confirmation Dialogs für destruktive Aktionen
- Visuelles Feedback für jede User-Aktion

Committe nach jedem logischen Schritt. Build + Tests VOR jedem Commit.

**Prisma-Workflow bei Schema-Änderungen:**
```bash
bash scripts/prisma-migrate.sh   # Migration erstellen
bash scripts/prisma-generate.sh  # Client regenerieren
source scripts/env.sh && bun run build  # Build prüfen
```
**KRITISCH:** Der Agent der das Prisma-Schema ändert MUSS `prisma-generate.sh` als letzten Schritt ausführen.

### CHECK-Phase

1. `allium:weed` — Stimmt Implementation mit Spec überein? Über `notification-dispatch.allium` (muss jetzt ALLE 4 Channels enthalten: in-app + webhook + email + push).
2. `/comprehensive-review:full-review` mit `/agent-teams:multi-reviewer-patterns` — koordiniere parallele Reviews über alle 5 Dimensionen. Einzel-Reports in `docs/reviews/s5b/`. Konsolidierter Report verweist pro Finding auf Quell-Report.
3. User Journey: SMTP konfigurieren → Notification triggert E-Mail → zugestellt. Push aktivieren → Notification → Browser-Notification sichtbar.
4. **Dreistufige Analyse (Learning aus S3: Blind Spot allein findet nur ~43% der Findings):**

   **Stufe 1 — Offen (Agent denkt eigenständig):**
   Dispatche 3 parallele Analyse-Agents mit je einer breiten Frage und dem passenden spezialisierten Skill:
   - Agent A — `Skill("pr-review-toolkit:silent-failure-hunter")`: "Blind Spot: Woran haben wir nicht gedacht? Finde silent failures, fehlende Error-Handler, falsche Fallbacks."
   - Agent B — `Skill("ui-design:design-review")` + `Skill("accessibility-compliance:screen-reader-testing")`: "DAU/BDU (Brain Dead User): Was macht ein User der nicht nachdenkt, keine Anleitung liest und alles falsch bedient? Kommt ein blinder User durch?"
   - Agent C — `Skill("developer-essentials:error-handling-patterns")`: "Edge Cases: Was passiert bei Extremen, Grenzfällen und unerwarteten Zuständen? Analysiere Graceful Degradation."

   **Stufe 2 — Gezielt (Sicherheitsnetz, fängt ab was Stufe 1 übersieht):**
   Nach Stufe 1, dispatche Nachbohrer-Agents mit spezifischen Fragen und spezialisierten Skills:

   Blind Spot Nachbohrer — `Skill("security-scanning:stride-analysis-patterns")` + `Skill("pr-review-toolkit:pr-test-analyzer")`:
   - "STRIDE-Analyse auf SMTP-Credentials und Push-Subscriptions"
   - "Welche E-Mail/Push Code-Pfade haben keinen Test?"
   - "Kann ein User die Rate-Limits umgehen?"

   DAU/BDU Nachbohrer — `Skill("ui-design:interaction-design")`:
   - "Du konfigurierst SMTP falsch (falsches Passwort). Was siehst du?"
   - "Du aktivierst Push, blockierst dann die Berechtigung im Browser. Was passiert?"
   - "Du bekommst 20 Notifications in einer Minute per E-Mail. Wie fühlt sich das an?"
   - "Du nutzt die App nur auf dem Handy. Wie konfigurierst du SMTP?"

   Edge Case Nachbohrer — `Skill("application-performance:performance-optimization")`:
   - "Was passiert wenn der SMTP-Server nicht erreichbar ist?"
   - "Was passiert wenn VAPID Keys rotiert werden? Was sehen User mit alten Subscriptions?"
   - "Was passiert wenn der Browser Push ablehnt (private mode, disabled)?"
   - "Was passiert bei 100 Push-Subscriptions gleichzeitig?"

   **Stufe 3 — Konsolidierung + Anti-Stille-Herabstufung:**
   - `Skill("agent-teams:multi-reviewer-patterns")` — konsolidiere ALLE Findings aus Stufe 1 + 2 (dedupliziert, severity-kalibriert)
   - Bei unklaren Root Causes: `Skill("superpowers:systematic-debugging")` für Hypothesen-Testing
   - Bei widersprüchlichen Findings: `Skill("agent-teams:parallel-debugging")` für konkurrierende Untersuchungen
   - Wenn ein Finding als "nicht fixbar" oder "accepted debt" eingestuft wird, MUSS das explizit kommuniziert werden mit Begründung. Stillschweigendes Weglassen ist VERBOTEN.

5. **Flashlight-Analyse (Learning aus S2):** Nach jedem scoped Fix, frage: "Dieses Problem wurde in Scope X gefixt — existiert es auch in Y, Z?" Verwende `grep` project-wide (z.B. fehlende TLS-Enforcement in anderen HTTP-Clients, fehlende Rate-Limits in anderen Server Actions, fehlende Encryption für andere Credentials).
6. UX 10-Punkte-Checkliste für alle neuen Komponenten
7. Cross-Dependency Check: Sind 1.5 (Job Alerts) und 5.4 (CRM Reminders) vorbereitet?

### ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance
2. Re-Review nach Fixes
3. Aktualisiere ROADMAP.md (D2, D3 als DONE)
4. Aktualisiere CLAUDE.md (Notification Channels Architektur-Sektion — alle 4 Channels: in-app, webhook, email, push)
5. Aktualisiere CHANGELOG.md
6. Dokumentation: `/documentation-generation:docs-architect` für Notification Architecture Overview

## Übergreifende Regeln

### Git
- Branch: `session/s5b-email-push`
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --no-coverage`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.**

### Team-Orchestrierung — PFLICHT, nicht optional

**KRITISCH:** Du MUSST Subagenten und Team-Agents für parallele Arbeit verwenden. Mache NICHT alles sequenziell im Main-Agent. Der Main-Agent orchestriert und delegiert.

**Für Phase 1 (Foundation): SEQUENZIELL** — ein Agent, Main-Agent wartet und verifiziert.

**Für Phase 2 (E-Mail) — SEQUENZIELL dann PARALLEL:**
- Schritt 1: Types + Settings Schema (ein Agent)
- Schritt 2: 4 parallele Agents (nodemailer, Templates, Settings UI, Channel-Integration)

**Für Phase 3 (Push) — SEQUENZIELL dann PARALLEL:**
- Schritt 1: Schema + Service Worker (ein Agent)
- Schritt 2: 3 parallele Agents (web-push, Settings UI, SW Registration)

**Build-Serialisierung (Learning aus S3):**
- Agents dürfen NICHT parallel `bun run build` ausführen — das korruptiert `.next/`
- NUR der Main-Agent führt Build-Verification aus, NACHDEM alle Agents fertig sind
- Agents dürfen `tsc --noEmit` für Type-Checking nutzen (kein `.next/` Konflikt)

**Für Fixes — nach FILES aufteilen, NICHT nach Finding-Typ (Learning aus S3-Resume):**
Gruppiere ALLE Findings (egal ob Security, WCAG, Performance) nach betroffenen Files. Ein Agent bekommt ALLE Findings für seine File-Gruppe.

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
Dispatche den Consolidation-Agent ERST wenn ALLE Review/Fix-Agents fertig sind. NIEMALS gleichzeitig — sonst liest er stale Reports.

**2. Formatter/Linter beachten:**
Root Cause identifizieren BEVOR Fix-Versuch.

**3. Keine sleep-Loops:**
Verwende direkte Agent-Completion-Abfragen statt `sleep 120` Bash-Loops.

**4. Agent-Claims verifizieren (67% Fabrication-Rate):**
IMMER verifizieren:
- Nach jedem "Finding fixed" Claim: `git diff` prüfen ob die Änderung tatsächlich existiert
- Für CRITICAL/HIGH Findings: Die gemeldete Datei + Zeilennummer öffnen und Fix bestätigen

**5. Allium Weed wird vergessen:**
Deshalb CP-16 in der CHECK-Phase — nicht optional.

**6. Skills werden ignoriert wenn sie nur "erwähnt" werden:**
Deshalb sind sie jetzt als PFLICHT-CHECKPOINTS formuliert. Du KANNST sie nicht überspringen.

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings. Keine Ausnahmen.

### ANTI-FAULHEIT — Verbotene Begründungen für Skips
- ❌ "Aus Zeitgründen übersprungen" / "Good enough" / "Moving on" / "Deferred" ohne Grund / "Conservative scope" / "Not critical"
- ✅ Technische Unmöglichkeit / Explizite fachliche Entscheidung / Blocker durch externen Fehler → BUGS.md

### PFLICHT-CHECKPOINTS (Evidenz vor jedem nächsten Schritt)

Du MUSST jeden Checkpoint mit Evidenz bestätigen bevor du zum nächsten Schritt gehst.
ÜBERSPRINGE KEINEN CHECKPOINT.

**Vor Phase 1:**
- [ ] CP-0: Deferred Items gelesen, offene Issues bekannt

**Vor Phase 2 (E-Mail):**
- [ ] CP-1: `job_status_changed` in NotificationType Enum → `git diff`
- [ ] CP-2: `notification-dispatcher.ts` subscribed auf `JobStatusChanged` → `git diff`
- [ ] CP-3: `tsc --noEmit` = 0, bestehende Tests grün

**Vor Phase 3 (Push):**
- [ ] CP-4: nodemailer SMTP Integration funktional → Test-E-Mail gesendet
- [ ] CP-5: E-Mail Templates für alle NotificationType in 4 Locales → `git diff`
- [ ] CP-6: Settings UI für SMTP → `git diff`
- [ ] CP-7: `EmailChannel` in notification-dispatcher → `git diff`

**Vor CHECK-Phase:**
- [ ] CP-8: `PushSubscription` Model + VAPID Keys in DB → `tsc --noEmit` = 0
- [ ] CP-9: Service Worker registriert + Push-Notification angezeigt
- [ ] CP-10: `PushChannel` in notification-dispatcher → `git diff`
- [ ] CP-11: Settings UI für Push (Enable/Disable/VAPID Rotation Warning) → `git diff`

**Vor der ACT-Phase — EXAKTE Skill-Aufrufe (Learning aus S3):**

S3 hat generische `Agent("review")` Aufrufe statt der spezialisierten Skills verwendet. Skills laden spezialisierte Prompts und Checklisten — generische Agents improvisieren. Du MUSST die folgenden Skills EXAKT aufrufen.

**WICHTIG (Learning aus S3-Resume):** Verwende das **`Skill` Tool**, NICHT das `Agent` Tool. `Skill("comprehensive-review:full-review")` ist korrekt. `Agent(subagent_type="comprehensive-review:full-review")` schlägt fehl weil nicht alle Skills als Agent-Type registriert sind. Im Zweifel: immer `Skill` Tool verwenden.

- [ ] CP-12: Rufe `/comprehensive-review:full-review` auf (NICHT `Agent("comprehensive review")`). Dann `/agent-teams:multi-reviewer-patterns` zur Konsolidierung. Reports in `docs/reviews/s5b/`. **Evidenz:** Skill-Invocation-Output zeigen.
- [ ] CP-13: Rufe `/accessibility-compliance:wcag-audit-patterns` auf (NICHT `Agent("a11y check")`). **Evidenz:** Skill-Output + Findings-Datei.
- [ ] CP-14: Rufe `/ui-design:interaction-design` auf (NICHT `Agent("interaction review")`). **Evidenz:** Skill-Output + dokumentierte Patterns.
- [ ] CP-15: Rufe `/business-analytics:data-storytelling` auf (NICHT `Agent("dashboard")`). **Evidenz:** Skill-Output + Visualisierung.
- [ ] CP-16: Rufe `allium:weed` auf über `notification-dispatch.allium` — MUSS alle 4 Channels enthalten (in-app + webhook + email + push). **Evidenz:** Weed-Output = zero Divergenzen.
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
4. Starte KEINE neuen Channel-Implementierungen — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.) um Daten anzureichern. Agent MUSS `nodemailer` und `web-push` APIs online recherchieren BEVOR Implementation.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] `job_status_changed` NotificationType existiert und wird dispatched
- [ ] E-Mail Channel: SMTP konfiguriert → Notification triggert E-Mail → zugestellt
- [ ] SMTP TLS enforced, Rate-Limited (10/min/user), Test-Button rate-limited (1/60s)
- [ ] E-Mail Templates für alle NotificationType in 4 Locales
- [ ] Push Channel: VAPID konfiguriert → Subscription gespeichert → Notification → Browser-Notification
- [ ] VAPID Keys in DB (encrypted), Rotation Warning implementiert
- [ ] Stale Subscription Handling (410 Gone → delete)
- [ ] Alle 4 Channels in `notification-dispatch.allium` spezifiziert (in-app + webhook + email + push)
- [ ] Comprehensive Review bestanden (zero Findings nach Fix-Runde)
- [ ] Dreistufige Analyse durchgeführt (Blind Spot + DAU/BDU + Edge Cases)
- [ ] `allium:weed` = zero Divergenzen
- [ ] docs/reviews/s5b/ mit Einzel- und konsolidiertem Report
- [ ] E2E Tests für E-Mail Settings + Push Settings
- [ ] Lies `e2e/CONVENTIONS.md` BEVOR du E2E Tests schreibst
- [ ] docs/BUGS.md, CHANGELOG.md, ROADMAP.md aktualisiert
- [ ] CLAUDE.md aktualisiert (Notification Channels Architektur — alle 4 Channels)
- [ ] Build grün + Tests grün + E2E grün
- [ ] Branch `session/s5b-email-push` nach main mergen
