# JobSync Development Flow

> Verbindlicher Entwicklungs-Flow für alle Feature-Sessions.
> Referenz: `docs/superpowers/templates/sprint-session-prompt.md` für das zugehörige Prompt-Template.
> Regeln referenzieren Memories als Single Source of Truth — keine Duplikation.

## Phasen-Übersicht

```
1. DISCOVER  →  2. SPECIFY  →  3. PLAN  →  4. IMPLEMENT  →  5. VERIFY  →  6. DOCUMENT
     ↑                                                              |
     └──────────────── Findings? ←──────────────────────────────────┘
```

Jede Phase hat Eingangs- und Ausgangsbedingungen. Keine Phase darf übersprungen werden.

---

## Phase 1: DISCOVER

**Ziel:** Verstehen was gebaut werden soll und ob externe Abhängigkeiten sich geändert haben.

**Schritte:**
1. Handoff lesen (`.remember/remember.md`)
2. Relevante Memories lesen (`MEMORY.md` Index)
3. ROADMAP.md prüfen (→ `feedback_sustainability_principle.md`)
4. Bestehenden Code explorieren
5. Externe APIs verifizieren — alle Endpoints per `curl` testen. Bei SPAs: Playwright für Network-Capture.

**Agents + Skills:**

| Agent | Skills | Wann |
|---|---|---|
| `feature-dev:code-explorer` (official) | — | Codebase-Exploration, Execution-Paths tracen |
| `feature-dev:code-architect` (official) | — | Architektur-Analyse bestehender Patterns |
| `Explore` (built-in) | — | Quick-Search für Dateien/Patterns |

**Regeln:** → `feedback_sustainability_principle.md` (HARD CONSTRAINT bei jeder Entscheidung)

**Ausgangsbedingung:** Klares Bild was existiert, was sich geändert hat, was gebaut werden soll.

---

## Phase 2: SPECIFY

**Ziel:** Domain-Regeln in Allium festhalten BEVOR Code geschrieben wird.

**Schritte:**
1. Bestehende Spec lesen (`specs/*.allium`)
2. Neue Konzepte: `allium:elicit` — strukturierte Discovery-Session
3. Bestehende Spec erweitern: `allium:tend` — gezielt patchen
4. Spec-Code Alignment prüfen: `allium:weed` — Divergenzen finden
5. **Tests aus Spec generieren: `allium:propagate`** — erzeugt ausführbare Tests die als TDD Red-Phase dienen

**Agents + Skills:**

| Agent/Skill | Skills dahinter | Wann |
|---|---|---|
| `allium:elicit` (juxt) | — | Neue Specs durch Konversation aufbauen |
| `allium:tend` (juxt) | — | Bestehende Specs erweitern/patchen |
| `allium:weed` (juxt) | — | Spec-Code Alignment prüfen |
| `allium:propagate` (juxt) | — | Tests aus Spec generieren (TDD Red Phase) |
| `allium:distill` (juxt) | — | Spec aus bestehendem Code extrahieren (Reverse) |
| `backend-development:backend-architect` (wshobson) | `architecture-patterns`, `api-design-principles`, `microservices-patterns`, `cqrs-implementation`, `event-store-design`, `saga-orchestration` | DDD Bounded Context Entscheidungen, API-Design |

**Spec-Weitergabe an Implementer:**
```
allium:elicit/tend  →  Spec steht
        ↓
allium:propagate    →  Tests aus Spec generiert (TDD Red Phase!)
        ↓
Implementer         →  Implementiert gegen die generierten Tests (TDD Green Phase)
        ↓
allium:weed         →  Spec-Code Alignment Verify
```

**Reihenfolge:** Spec → Tests → Code. Nie umgekehrt.

**Ausgangsbedingung:** Allium Spec ist Single Source of Truth. Propagierte Tests sind die ausführbare Spec.

---

## Phase 3: PLAN

**Ziel:** Implementierungsplan mit exakten Dateien, Code und Befehlen.

**Schritte:**
1. `superpowers:writing-plans` (obra) — Plan schreiben mit bite-sized Tasks
2. Plan speichern unter `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
3. PFLICHT-CHECKPOINTS definieren (mit `git diff` / `grep` Befehlen)
4. DAU/BDU + Edge Case Nachbohrer-Fragen formulieren
5. Agenten-Zuordnung pro Task festlegen

**Agents + Skills:**

| Agent/Skill | Skills dahinter | Wann |
|---|---|---|
| `superpowers:writing-plans` (obra) | — | Plan schreiben |
| `agent-teams:team-lead` (wshobson) | `task-coordination-strategies`, `team-composition-patterns`, `team-communication-protocols` | Task-Zerlegung, Agent-Zuordnung, Dependency-Graphen |

**Plan-Struktur:**
- Header (Goal, Architecture, Tech Stack)
- File Structure (neue, geänderte, gelöschte Dateien)
- Tasks mit TDD-Schritten (Test → Fail → Implement → Pass → Commit)
- Keine Platzhalter, kein "TBD", kein "similar to Task N"

**Ausgangsbedingung:** Plan ist vollständig, selbsterklärend, und von einem Agent ohne Session-Kontext ausführbar.

---

## Phase 4: IMPLEMENT

**Ziel:** Plan Task für Task umsetzen mit Quality Gates.

**Orchestrierung:** `superpowers:subagent-driven-development` (obra)
- Pro Task: Implementer → Spec Reviewer → Code Quality Reviewer
- Implementer nutzt `superpowers:test-driven-development` (obra)

**Regeln:**
- → `feedback_interface_segregation_agents.md` (Foundation-then-Fan-Out)
- → `feedback_test_build_resources.md` (NIE parallel)
- → `feedback_review_fix_loop.md` (nicht zu viele Agents auf gleichen Files)
- → `feedback_bypass_permissions.md` (keine Tool-Permission-Prompts)
- → `feedback_checkpoint_reinforcement.md` (nach JEDEM Checkpoint Instruktionen bekräftigen)
- Agent-Claims verifizieren per `git diff` (67% Fabrication-Rate)
- Fix-Agents nach FILES gruppieren, nicht nach Finding-Typ

**Agents + Skills — Backend:**

| Agent | Skills dahinter | Wann |
|---|---|---|
| `backend-development:backend-architect` (wshobson) | `architecture-patterns`, `api-design-principles`, `cqrs-implementation`, `event-store-design`, `saga-orchestration`, `workflow-orchestration-patterns` | Connector-Interfaces, Server Actions, Domain-Logic |
| `backend-development:test-automator` (wshobson) | — | Tests schreiben (Unit, Component, Integration) |
| `backend-development:security-auditor` (wshobson) | — | Security Review während Implementation |
| `backend-development:performance-engineer` (wshobson) | — | Performance-kritische Pfade |
| `javascript-typescript:typescript-pro` (wshobson) | `typescript-advanced-types`, `modern-javascript-patterns`, `nodejs-backend-patterns`, `javascript-testing-patterns` | Komplexe Type-System-Arbeit, Generics, Conditional Types |
| `tdd-workflows:tdd-orchestrator` (wshobson) | — | TDD Red-Green-Refactor Enforcement |

**Agents + Skills — Frontend:**

| Agent | Skills dahinter | Wann |
|---|---|---|
| `application-performance:frontend-developer` (wshobson) | — | React/Next.js UI-Komponenten, State Management, Performance |

**Agents + Skills — UX (vor, während, nach Implementation):**

| Phase | Agent/Skill | Wann |
|---|---|---|
| **VOR** Implementation | `ui-design:ui-designer` + Skills: `web-component-design`, `design-system-patterns`, `visual-design-foundations` | Layout, Komponentenhierarchie, Design Tokens |
| **WÄHREND** Implementation | `ui-design:responsive-design` | Mobile Breakpoints, Container Queries |
| | `ui-design:interaction-design` | Microinteractions, Loading States, Transitions, Hover/Focus |
| **NACH** Implementation | `ui-design:design-review` (Skill) | DAU/BDU Analyse |
| | `ui-design:accessibility-compliance` (Skill) | WCAG Prüfung |
| | `accessibility-compliance:wcag-audit-patterns` (wshobson Skill) | Formale WCAG 2.2 Prüfung |
| | `accessibility-compliance:screen-reader-testing` (wshobson Skill) | Screen Reader Kompatibilität |

**Agents + Skills — i18n:**

| Agent | Wann |
|---|---|
| `general-purpose` | Translations erstellen/aktualisieren (→ `feedback_i18n_agents.md`) |

**Agents + Skills — Infrastruktur:**

| Agent | Skills dahinter | Wann |
|---|---|---|
| `full-stack-orchestration:deployment-engineer` (wshobson) | — | CI/CD, Docker |
| `full-stack-orchestration:test-automator` (wshobson) | — | Test-Infrastruktur |
| `full-stack-orchestration:security-auditor` (wshobson) | — | Security während Implementation |

**PFLICHT-CHECKPOINTS** nach jeder Phase-Grenze:
- `git diff` zeigt erwartete Änderungen
- `tsc --noEmit` = 0 Errors
- `grep` bestätigt dass alte Patterns entfernt sind

**Ausgangsbedingung:** Alle Tasks done, alle Checkpoints bestanden, Build + Tests grün.

---

## Phase 5: VERIFY

**Ziel:** Dreistufige Analyse + Quality Gates. Zero Tolerance auf Findings.

### Stufe 1 — Offen (parallel)

| Agent/Skill | Fragestellung |
|---|---|
| `pr-review-toolkit:silent-failure-hunter` (official) | Blind Spot: Woran haben wir nicht gedacht? |
| `ui-design:design-review` (wshobson Skill) | DAU/BDU: Was macht ein User der nicht nachdenkt? |
| `ui-design:interaction-design` (wshobson Skill) | Microinteractions: Sind Loading/Error/Empty States sinnvoll? |
| `developer-essentials:error-handling-patterns` (wshobson Skill) | Edge Cases: Was passiert bei Extremen? |
| `accessibility-compliance:wcag-audit-patterns` (wshobson Skill) | WCAG 2.2 Compliance |
| `accessibility-compliance:screen-reader-testing` (wshobson Skill) | Screen Reader Kompatibilität |

Plus: Session-spezifische DAU/BDU und Edge Case Nachbohrer-Fragen.

### Stufe 2 — Gezielt

| Agent/Skill | Skills dahinter | Fragestellung |
|---|---|---|
| `security-scanning:stride-analysis-patterns` (wshobson Skill) | `threat-mitigation-mapping`, `security-requirement-extraction`, `attack-tree-construction` | STRIDE auf sicherheitsrelevante Komponenten |
| `pr-review-toolkit:pr-test-analyzer` (official) | — | Welche Pfade haben keinen Test? |
| `comprehensive-review:full-review` (wshobson Skill) | — | Architecture + Security + Performance + Testing + Best Practices |
| `allium:weed` (juxt) | — | Spec-Code Alignment — Zero Divergenzen |
| `superpowers:verification-before-completion` (obra) | — | Beweis vor "fertig" |

### Stufe 3 — Konsolidierung

| Agent/Skill | Wann |
|---|---|
| `agent-teams:multi-reviewer-patterns` (wshobson Skill) | Findings konsolidieren, deduplizieren, priorisieren |

- Anti-Stille-Herabstufung: "Nur cosmetic" könnte ein Pattern sein
- → `feedback_flashlight_effect.md` (scoped Reviews lassen Blind Spots — grep project-wide)

### ACT

1. ALLE Findings fixen — Zero Tolerance (→ `feedback_high_effort_autonomous.md`)
2. Re-Review nach Fixes
3. → `feedback_honesty_gate.md` (PFLICHT vor Merge: Shortcuts? Missing Skills? Gaps?)
4. → `feedback_blindspot_after_tasks.md` (Blind Spot Analyse nach jeder Phase)

**Ausgangsbedingung:** Zero offene Findings. Build grün. Tests grün. Spec aligned.

---

## Phase 6: DOCUMENT

**Ziel:** Alle Artefakte aktualisieren sodass die nächste Session ohne Kontext-Verlust starten kann.

**Agents + Skills:**

| Agent/Skill | Wann |
|---|---|
| `documentation-generation:architecture-decision-records` (wshobson Skill) | ADRs für Architektur-Entscheidungen |
| `documentation-generation:changelog-automation` (wshobson Skill) | Changelog generieren |
| `superpowers:finishing-a-development-branch` (obra) | Branch abschließen |
| `remember:remember` (official) | Handoff speichern |

**Checkliste:**
- [ ] ROADMAP.md — betroffene Items als DONE, neue Items hinzufügen
- [ ] CLAUDE.md — Architektur-Sektionen aktualisieren
- [ ] Allium Spec — finaler Stand nach allen Fixes
- [ ] docs/BUGS.md — neue + gefixte Issues
- [ ] Memories updaten (→ `feedback_post_run_checklist.md`)
- [ ] `.remember/remember.md` — Handoff (State, Next, Context)
- [ ] Git: Logische Commits, Branch nach main mergen (→ `feedback_no_upstream_prs.md`)

**Ausgangsbedingung:** Ein Agent der morgen `.remember/remember.md` + CLAUDE.md + Memories liest, kann sofort weiterarbeiten.

---

## Phase 7: FINAL CHECK

**Ziel:** Sicherstellen dass CLAUDE.md als Projekt-Idiom konsistent und vollständig ist.

**Schritte:**
1. Lies CLAUDE.md vollständig ein
2. Vergleiche gegen die Änderungen dieser Session:
   - Neue Architektur-Sektionen vorhanden?
   - Ubiquitous Language aktuell?
   - "For new Modules" Anleitung aktuell?
   - Connector Structure aktuell?
   - Security Rules vollständig?
3. Identifiziere offene Punkte: Fehlen Sektionen? Sind Beschreibungen veraltet? Stimmen Dateipfade?
4. Fixe alle Inkonsistenzen
5. **"Und nun? Was ist offen gelassen?"** — Beantworte ehrlich:
   - Was wurde nicht fertig?
   - Welche Entscheidungen wurden aufgeschoben?
   - Welche Findings wurden als BUGS.md-Eintrag deferred statt gefixt?
   - Welche Architektur-Fragen sind unbeantwortet?
   - Was muss die nächste Session als ERSTES tun?
6. Ergebnisse von Schritt 5 in `.remember/remember.md` unter "Next" dokumentieren

→ `feedback_honesty_gate.md` — dieser Schritt hat in der Vergangenheit mehr Gaps aufgedeckt als alle Checkpoints zusammen.

**Ausgangsbedingung:** CLAUDE.md spiegelt den aktuellen Stand wider. `.remember/remember.md` enthält eine ehrliche Auflistung aller offenen Punkte. Nichts ist versteckt oder beschönigt.

---

## Anti-Patterns

- ❌ Code vor Spec — Allium Spec ist IMMER zuerst. Spec → Tests (propagate) → Code.
- ❌ Externe APIs als funktionierend annehmen — DISCOVER-Phase: Alle Endpoints testen.
- ❌ Einfachsten Weg wählen — → `feedback_sustainability_principle.md`
- ❌ Prompt-Instruktionen für "Effizienz" überspringen — → `feedback_no_autonomous_tradeoffs.md`
- ❌ Hardcoded Maps statt Manifest-Driven — Manifest ist Single Source of Truth für Modul-Metadaten.
- ❌ Parallele Tests + Builds — → `feedback_test_build_resources.md`
- ❌ Agent-Claims ungeprüft übernehmen — `git diff` für JEDEN Claim. (67% Fabrication-Rate)
- ❌ "Good enough" bei Findings — → `feedback_high_effort_autonomous.md`
- ❌ Zu viele Agents auf gleichen Files — → `feedback_review_fix_loop.md`
- ❌ Scoped Reviews ohne project-wide grep — → `feedback_flashlight_effect.md`
- ❌ Session-Kontext in Memories speichern — Memories müssen kontextfrei verständlich sein.
- ❌ Skills durch Agent("...") ersetzen — → `feedback_checkpoint_reinforcement.md` — verwende `Skill()` Tool

---

## Plugin-Zuordnung (verifiziert 2026-04-08)

| Quelle | Autor | Repository | Rolle im Flow |
|---|---|---|---|
| **superpowers** (official marketplace) | Jesse Vincent (obra) | `github.com/obra/superpowers` | Orchestrierung: subagent-driven-development, writing-plans, executing-plans, verification, TDD, finishing-branch |
| **claude-code-workflows** (wshobson marketplace) | Seth Hobson | `github.com/wshobson/agents` | Domain-Expertise: 74 Plugins, 182 Agents, 147 Skills für Backend, Frontend, Security, UX, Reviews, Testing, Infra, etc. |
| **allium** (juxt marketplace) | Juxt | juxt-plugins | Spec-Sprache: tend, weed, elicit, distill, propagate |
| **claude-plugins-official** (official marketplace) | Diverse | anthropics | Infrastruktur: Playwright, CodeRabbit, Remember, Feature-Dev, Commit-Commands, PR-Review-Toolkit, etc. |
