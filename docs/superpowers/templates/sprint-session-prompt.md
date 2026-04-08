# Sprint Session Prompt Template

> Wiederverwendbares Template für neue Sprint-Sessions.
> Platzhalter: `{{VARIABLE}}` — vor Nutzung ersetzen.
> Abschnitte mit `[OPTIONAL]` können bei einfachen Sessions entfallen.

---

````markdown
Lies .remember/remember.md für den Handoff.
Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal/memory/MEMORY.md).
{{#ALLIUM_SPECS}}
Lies {{SPEC_FILES}}
{{/ALLIUM_SPECS}}

## Quick-Verify (Handoff prüfen)

Führe aus:
```bash
git log --oneline -15
source scripts/env.sh && bun run build
bash scripts/test.sh --no-coverage
```

Prüfe:
- Build grün? Tests grün?
{{VERIFY_CHECKS}}
- docs/BUGS.md — offene Issues?

Wenn rot: Erst fixen (max 15 Min), dann weiter. Wenn unfixbar: In BUGS.md dokumentieren und mit eigenem Scope weitermachen.

## Kontext

{{SESSION_CONTEXT}}

## Dein Auftrag

### Branch erstellen
```bash
git checkout -b session/{{BRANCH_NAME}}
```

{{#HAS_PLAN}}
### Plan ausführen
Führe den Plan aus: `{{PLAN_PATH}}`
- {{PLAN_TASKS}} Tasks, `superpowers:subagent-driven-development`
- {{PLAN_SUMMARY}}
{{/HAS_PLAN}}

{{#NO_PLAN}}
### Aufgaben
{{TASK_LIST}}
{{/NO_PLAN}}

### Entscheidungsprinzip
Bei Entscheidungen wählst du nicht den einfacheren Weg; Du wählst den Weg des Nachhaltigkeitsprinzip: Was ist die nachhaltigste, fundierteste und basierend auf DDD und auf der ROADMAP die beste Lösung? Macht es bei der Entscheidung Sinn Allium zu befragen?

## PFLICHT-CHECKPOINTS

{{CHECKPOINTS}}

**Vor CHECK-Phase:**
- [ ] CP-N: Alle Tests grün (`bash scripts/test.sh --no-coverage`)
- [ ] CP-N+1: Claim-Verification per `git diff` — JEDER "fixed" Claim von Agents verifiziert

## CHECK-Phase (Dreistufige Analyse)

**Stufe 1 — Offen (3 parallele Skills):**
- `Skill("pr-review-toolkit:silent-failure-hunter")`: "Blind Spot: Woran haben wir nicht gedacht?"
- `Skill("ui-design:design-review")`: "DAU/BDU: Was macht ein User der nicht nachdenkt?"
- `Skill("developer-essentials:error-handling-patterns")`: "Edge Cases: Was passiert bei Extremen?"

DAU/BDU Nachbohrer:
{{DAU_QUESTIONS}}

Edge Case Nachbohrer:
{{EDGE_CASE_QUESTIONS}}

**Stufe 2 — Gezielt:**
{{#HAS_SECURITY_CONCERN}}
- `Skill("security-scanning:stride-analysis-patterns")`: "STRIDE auf {{SECURITY_TARGET}}"
{{/HAS_SECURITY_CONCERN}}
- `Skill("pr-review-toolkit:pr-test-analyzer")`: "Welche Pfade haben keinen Test?"
- `Skill("comprehensive-review:full-review")`: Architecture+Security+Performance+Testing+Best Practices
{{#HAS_ALLIUM_SPEC}}
- `Skill("allium:weed")` über `{{ALLIUM_SPEC_FILE}}`: Spec-Code Alignment
{{/HAS_ALLIUM_SPEC}}

**Stufe 3 — Konsolidierung:**
- Konsolidiere ALLE Findings
- Anti-Stille-Herabstufung: Ein Finding das "nur cosmetic" scheint könnte ein Pattern sein

## ACT-Phase

1. Fixe ALLE Findings — Zero Tolerance (Critical, High, Medium UND Low)
2. Re-Review nach Fixes
3. ROADMAP.md: {{ROADMAP_ITEMS}} als DONE markieren
4. CLAUDE.md: {{CLAUDE_MD_UPDATES}}
5. docs/BUGS.md aktualisieren
{{#HAS_ALLIUM_SPEC}}
6. {{ALLIUM_SPEC_FILE}} aktualisieren falls nötig
{{/HAS_ALLIUM_SPEC}}
7. Memories updaten (project_roadmap.md, project_current_sprint.md, project_module_lifecycle_deferred.md)

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

{{EXIT_CHECKLIST}}
- [ ] Allium Weed: Zero Divergenzen (falls Specs betroffen)
- [ ] Comprehensive Review: Zero offene Findings
- [ ] Blind Spot Check: Durchgeführt + Findings gefixt
- [ ] Build grün: `source scripts/env.sh && bun run build` → Exit Code 0
- [ ] Tests grün: `bash scripts/test.sh --no-coverage` → Exit Code 0
- [ ] `Skill("superpowers:verification-before-completion")` → Beweis gezeigt
- [ ] Branch `session/{{BRANCH_NAME}}` nach main mergen

## Übergreifende Regeln

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
Agents: nur `tsc --noEmit`. Main-Agent: `bash scripts/test.sh --no-coverage` nach Agent-Completion. NIE parallel.

### Agent-Claims verifizieren (67% Fabrication-Rate)
`git diff` für jeden "fixed" Claim. CRITICAL/HIGH: Datei + Zeile bestätigen.

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items
3. Schreibe Handoff-Notiz in .remember/remember.md: was ist fertig, was fehlt
4. Starte KEINE neuen Fix-Zyklen — schließe sauber ab

### Resilienz
- API 500: Warte 30s, retry. Ignoriere "Task not found".
- Keine sleep-Loops. Consolidation-Agent zuletzt.

### Online-Recherche
Agenten dürfen jederzeit online suchen (WebSearch, WebFetch, Context7, DeepWiki) — z.B. Library-Docs, API-Referenzen, Best Practices.

### Git
- Branch: `session/{{BRANCH_NAME}}`
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit
- **NIEMALS PRs gegen upstream Gsync/jobsync.**
- Nur auf `rorar/jobsync` pushen

### Kontext
- @rorar lernt DDD — Insight-Blöcke verwenden
- Tests + Builds nie parallel (VM-Limits)
- Allium spec ist single source of truth — immer spec before code
````

---

## Platzhalter-Referenz

| Platzhalter | Beschreibung | Beispiel |
|---|---|---|
| `{{SPEC_FILES}}` | Allium Specs die gelesen werden sollen | `specs/module-lifecycle.allium` |
| `{{VERIFY_CHECKS}}` | Session-spezifische Verify-Prüfungen | `- register-all.ts existiert NICHT (wird erstellt)?` |
| `{{SESSION_CONTEXT}}` | Was bisher passiert ist + was diese Session macht | Alle 11 Module auflisten, Problem beschreiben, Ziel definieren |
| `{{BRANCH_NAME}}` | Git-Branch-Name | `manifest-v2-self-contained` |
| `{{PLAN_PATH}}` | Pfad zum Plan (wenn vorhanden) | `docs/superpowers/plans/2026-04-08-manifest-v2.md` |
| `{{PLAN_TASKS}}` | Anzahl Tasks im Plan | `10` |
| `{{PLAN_SUMMARY}}` | Einzeiler was der Plan macht | `i18n co-located in Modulen, Self-Registration, register-all.ts` |
| `{{TASK_LIST}}` | Aufgabenliste (wenn kein Plan) | Nummerierte Schritte mit Agenten |
| `{{CHECKPOINTS}}` | PFLICHT-Checkpoints nach Phasen | CP-1 bis CP-N mit `git diff` / `grep` Befehlen |
| `{{DAU_QUESTIONS}}` | Session-spezifische DAU/BDU Fragen | `- "Ein Modul hat KEIN i18n-Feld. Was zeigt die UI?"` |
| `{{EDGE_CASE_QUESTIONS}}` | Session-spezifische Edge Case Fragen | `- "Was passiert bei zirkulären Imports?"` |
| `{{SECURITY_TARGET}}` | STRIDE-Analyse-Ziel (optional) | `SMTP-Credentials und Push-Subscriptions` |
| `{{ALLIUM_SPEC_FILE}}` | Haupt-Spec die geweeded wird | `specs/module-lifecycle.allium` |
| `{{ROADMAP_ITEMS}}` | Roadmap-Einträge die DONE werden | `8.7 Phase 0` |
| `{{CLAUDE_MD_UPDATES}}` | Was in CLAUDE.md aktualisiert wird | `"For new Modules" Anleitung updaten` |
| `{{EXIT_CHECKLIST}}` | Session-spezifische Exit-Checks | Feature-spezifische Verifikationen |

## Abschnitt-Entscheidung

| Session-Typ | Plan? | Allium? | Security? | DAU/BDU? |
|---|---|---|---|---|
| Feature-Implementation | Ja (writing-plans) | Ja (spec before code) | Wenn credentials/APIs | Ja |
| Bugfix-Sprint | Nein (Task-Liste) | Nur wenn Spec-Divergenz | Wenn security-relevant | Nein |
| Refactoring | Ja | Wenn Contracts ändern | Nein | Wenn UI betroffen |
| API-Integration | Ja | Ja (neues Modul) | Ja (SSRF, Auth) | Ja |

## Plugin-Zuordnung (verifiziert 2026-04-08)

| Quelle | Autor | Plugins |
|---|---|---|
| `superpowers` (official marketplace) | **Jesse Vincent** (obra) | Orchestrierung: subagent-driven-development, writing-plans, executing-plans, brainstorming, verification-before-completion, test-driven-development, finishing-a-development-branch |
| `claude-code-workflows` (wshobson marketplace) | **Seth Hobson** | 74 Domain-Plugins: comprehensive-review, agent-teams, conductor, ui-design, backend-development, tdd-workflows, application-performance, full-stack-orchestration, security-scanning, pr-review-toolkit (NICHT official!), ... |
| `allium` (juxt marketplace) | **Juxt** | Spec-Sprache: tend, weed, elicit, distill, propagate |
| `claude-plugins-official` (official marketplace) | **Diverse** | Infrastruktur: playwright, coderabbit, remember, code-review, feature-dev, commit-commands, skill-creator, claude-code-setup, ... |
