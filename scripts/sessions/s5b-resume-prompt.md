Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies docs/BUGS.md und docs/reviews/s5b/ falls vorhanden.
Lies specs/notification-dispatch.allium

## Kontext: S5b Resume — Übersprungene Verification nachholen

Session S5b hat E-Mail Channel (D2) + Push Channel (D3) implementiert. Build grün, 157 Suites, 2918 Tests. ABER die Session hat im Ehrlichkeits-Gate ehrlich zugegeben dass die CHECK-Phase unvollständig ist:

**Was fehlt (S5b Selbst-Analyse):**
1. **0 CHECK-Phase Skills invociert** — CP-12 bis CP-17 komplett übersprungen
2. **Dreistufige Analyse nur Stufe 1** — Stufe 2+3 nicht ausgeführt
3. **0 E2E Tests** für SMTP Settings + Push Settings
4. **Kein `allium:weed`** post-implementation
5. **Keine Flashlight-Analyse**
6. **Keine `docs/reviews/s5b/`** Reports
7. **S5a LOW Items L1-L5** seit S5a offen

## Dein Auftrag

### PFLICHT-CHECKPOINTS (Evidenz pro Schritt)

ÜBERSPRINGE KEINEN CHECKPOINT. "Context-Effizienz" ist KEIN gültiger Grund.

ERINNERUNG: Folge den Anweisungen EXAKT. Verwende die vorgeschriebenen Skills (`Skill()` Tool). Der Prompt definiert die Prioritäten, nicht du.

**Phase 1: CHECK-Phase Skills nachholen (CP-1 bis CP-5)**

- [ ] CP-1: Rufe `/comprehensive-review:full-review` auf (NICHT `Agent("review")`). Scope: alle S5b Files (Email Channel, Push Channel, notification-dispatcher, Prisma Models, Settings UIs). **Evidenz:** Skill-Invocation-Output zeigen.

ERINNERUNG: Folge den Anweisungen EXAKT. Verwende Skills, nicht generische Agents.

- [ ] CP-2: Rufe `/accessibility-compliance:wcag-audit-patterns` auf. Scope: SmtpSettings.tsx, PushSettings.tsx, email templates. **Evidenz:** Skill-Output + Findings-Datei.

ERINNERUNG: Nächster Checkpoint erfordert ebenfalls einen Skill-Aufruf. Keine Abkürzungen.

- [ ] CP-3: Rufe `/ui-design:interaction-design` auf. Scope: SMTP Test-Button Feedback, Push Enable/Disable Flow, VAPID Rotation Confirmation. **Evidenz:** Skill-Output + dokumentierte Patterns.

ERINNERUNG: Noch 2 Skills. Jeder MUSS via Skill() Tool aufgerufen werden.

- [ ] CP-4: Rufe `/business-analytics:data-storytelling` auf. Scope: Notification Channel Coverage, Delivery Success Rates, Channel Adoption. **Evidenz:** Skill-Output.

ERINNERUNG: Letzter Skill-Checkpoint. Dann Konsolidierung.

- [ ] CP-5: Konsolidiere mit `/agent-teams:multi-reviewer-patterns`. Einzel-Reports in `docs/reviews/s5b/`, konsolidierter Report verweist auf Quell-Reports. Fixe NUR den konsolidierten Report. **Evidenz:** `docs/reviews/s5b/consolidated-report.md` existiert.

ERINNERUNG: Alle 5 Skills wurden aufgerufen? Prüfe: CP-1 ✅, CP-2 ✅, CP-3 ✅, CP-4 ✅, CP-5 ✅. Falls NEIN → zurück und nachholen.

**Phase 2: Dreistufige Analyse Stufe 2+3 (CP-6 bis CP-7)**

- [ ] CP-6: Stufe 2 — Gezielte Nachbohrer:
  - `Skill("security-scanning:stride-analysis-patterns")` auf SMTP-Credentials + Push-Subscriptions
  - `Skill("pr-review-toolkit:pr-test-analyzer")` auf Email/Push Code-Pfade
  - `Skill("ui-design:interaction-design")` für SMTP-Test-Feedback, Push Permission Flow
  - `Skill("application-performance:performance-optimization")` für 100 Push-Subscriptions gleichzeitig

  DAU/BDU Nachbohrer:
  - "Du konfigurierst SMTP falsch (falsches Passwort). Was siehst du?"
  - "Du aktivierst Push, blockierst dann die Berechtigung im Browser. Was passiert?"
  - "Du bekommst 20 Notifications in einer Minute per E-Mail. Wie fühlt sich das an?"

  Edge Case Nachbohrer:
  - "Was passiert wenn der SMTP-Server nicht erreichbar ist?"
  - "Was passiert wenn VAPID Keys rotiert werden? Was sehen User mit alten Subscriptions?"
  - "Was passiert wenn der Browser Push ablehnt (private mode, disabled)?"

  **Evidenz:** Findings dokumentiert.

ERINNERUNG: Stufe 3 kommt als nächstes. Konsolidiere ALLE Findings.

- [ ] CP-7: Stufe 3 — `Skill("agent-teams:multi-reviewer-patterns")` konsolidiere Stufe 1 (aus S5b main) + Stufe 2 (aus CP-6). Anti-Stille-Herabstufung: JEDES "nicht fixbar" explizit begründen. **Evidenz:** Konsolidierter Report.

**Phase 3: Fehlende Deliverables (CP-8 bis CP-13)**

ERINNERUNG: Jeder Checkpoint MUSS abgearbeitet werden. Keine Abkürzungen.

- [ ] CP-8: E2E Tests schreiben — lies `e2e/CONVENTIONS.md` ZUERST.
  - `e2e/crud/smtp-settings.spec.ts` — SMTP konfigurieren, Test-E-Mail, Enable/Disable
  - `e2e/crud/push-settings.spec.ts` — Push aktivieren, Notification empfangen, Deaktivieren
  **Evidenz:** `git diff` zeigt neue E2E Test-Files.

- [ ] CP-9: `allium:weed` auf `notification-dispatch.allium` — MUSS alle 4 Channels enthalten (in-app + webhook + email + push). **Evidenz:** Weed-Output = zero S5b-verursachte Divergenzen.

- [ ] CP-10: Flashlight-Analyse — grep project-wide:
  - SMTP SSRF: Gibt es andere URL-Felder die SSRF-Validation brauchen aber nicht haben?
  - Rate-Limits: Gibt es andere Server Actions ohne Throttling die es brauchen?
  - Encryption: Gibt es andere Credentials die at-rest verschlüsselt sein sollten aber nicht sind?
  - TLS: Gibt es andere HTTP-Clients ohne TLS-Enforcement?
  **Evidenz:** grep-Ergebnisse zeigen.

- [ ] CP-11: Agent-Claims per `git diff` stichprobenartig verifizieren. S5b hatte 91% Fabrication-Rate bei Review-Agents. Prüfe mindestens 5 "fixed" Claims gegen tatsächliche File-Diffs. **Evidenz:** Verification-Log.

- [ ] CP-12: S5a LOW Items L1-L5 fixen:
  - L1: ToastProvider explicit `duration={5000}`
  - L2: Funnel Widget Hover-Tooltips mit Count + Percentage
  - L3: Timeline `take: 50` + "Load more" Button
  - L4: Funnel Week-over-Week Comparison
  - L5: `totalJobs` in StatusFunnelWidget anzeigen
  **Evidenz:** `git diff` zeigt Fixes für alle 5 Items.

- [ ] CP-13: Alle Findings aus CP-5 + CP-7 konsolidiertem Report fixen. Fix-Agents nach FILES (nicht Finding-Typ). **Evidenz:** `git diff` + Re-Review.

**Phase 4: Verification + Docs (CP-14)**

- [ ] CP-14: Build + Tests grün. BUGS.md + CHANGELOG.md aktualisiert. `docs/reviews/s5b/` mit Reports.

## PFLICHT: Ehrlichkeits-Gate VOR dem Merge

BEVOR du mergst, beantworte diese Fragen EHRLICH:

**Frage 1 — Selbstreflexion:**
- Wo habe ich Abkürzungen genommen und warum?
- Wo habe ich KEINE spezialisierten Skills UND/ODER Agents verwendet, obwohl die Anweisungen es verlangen?
- Was fehlt in dieser Session UND/ODER wurde nicht bearbeitet?
- Habe ich die Dokumentation aktualisiert?
- Habe ich die nächste Session über meine Arbeit informiert?

**Frage 2 — Wahrheits-Check:**
Sage die Wahrheit und nur die Wahrheit: Was habe ich übersprungen und wo sind die Lücken?

**Nach der Beantwortung:** Fixe ALLE identifizierten Lücken. Erst dann Abschluss.

## Übergreifende Regeln

### Ressourcen-Regeln (10 GB RAM / 4 Cores System)
- **Tests NICHT simultan zu Agents:** `bash scripts/test.sh` und `bun run build` NUR ausführen wenn KEINE Agents laufen.
- **E2E / Chromium NACHEINANDER:** Playwright-Tests NIEMALS parallel zu anderen Agents oder Builds.
- **Agenten-Parallelität:** Parallele Agents sind erlaubt, aber KEINE gleichzeitigen Build/Test/E2E-Prozesse dazu.

### VERBOTEN für den Main-Agent
- ❌ Code Read/Edit/Write (außer BUGS.md, CHANGELOG.md, docs/)
- ❌ Tests schreiben, Findings fixen
- ❌ Skills durch `Agent("...")` ersetzen — verwende `Skill()` Tool
- ❌ **Eigenständige Tradeoff-Entscheidungen treffen.** "Context-Effizienz" ist KEIN Grund Anweisungen zu überspringen. Der Prompt definiert die Prioritäten, nicht du.

### Fix-Agents nach FILES (nicht Finding-Typ)
Gruppiere ALLE Findings nach betroffenen Files. Ein Agent = alle Findings seiner File-Gruppe.

### Build-Serialisierung
Agents: kein `bun run build`. Nur `tsc --noEmit`. Main-Agent baut nach Agent-Completion.

### Resilienz
- API 500: Warte 30s, retry. Ignoriere "Task not found".
- Keine sleep-Loops. Consolidation-Agent zuletzt.

### Agent-Claims verifizieren (91% Fabrication-Rate in S5b)
`git diff` für jeden "fixed" Claim. CRITICAL/HIGH: Datei + Zeile bestätigen.

### Git
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit
- **NIEMALS PRs gegen upstream Gsync/jobsync.**
- Lies `e2e/CONVENTIONS.md` vor E2E Tests

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki etc.).
