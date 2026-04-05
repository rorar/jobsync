Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies docs/BUGS.md und docs/reviews/s5a/ falls vorhanden.

## Kontext: S5a Resume — Übersprungene Verification nachholen

Session S5a hat Sprint E (8 UI-Lücken) + Webhook Channel (D1) implementiert. Build grün, 2778 Tests. ABER die Session hat ehrlich zugegeben dass die Verification unvollständig ist:

**Was fehlt (S5a Selbst-Analyse):**
1. **0 spezialisierte Skills invociert** — alles über generische Agent() statt Skill()
2. **Dreistufige Analyse nur Stufe 1** — Stufe 2 (Nachbohrer) + Stufe 3 (Konsolidierung) übersprungen
3. **0 E2E Tests geschrieben** — Exit-Checkliste verlangt 3
4. **Flashlight-Analyse nicht durchgeführt** — SSRF, Rate-Limits, redirect:manual project-wide prüfen
5. **ADR nicht geschrieben** — ChannelRouter ist signifikante Architektur-Änderung
6. **Kein konsolidierter Report** — 3 Einzel-Reports aber keine multi-reviewer Konsolidierung
7. **20 Allium-Divergenzen als "pre-existing" gelabelt** ohne Verifikation
8. **Keine Handoff-Memory für S5b** — project_s5a_deferred_items.md nicht erstellt
9. **UX 10-Punkte-Checkliste nicht ausgeführt**
10. **Agent-Claims nicht vollständig per git diff verifiziert**

## Dein Auftrag

### PFLICHT-CHECKPOINTS (Evidenz pro Schritt)

**Phase 1: Fehlende Skills nachholen (CP-1 bis CP-5)**

- [ ] CP-1: Rufe `/comprehensive-review:full-review` auf (NICHT `Agent("review")`). **Evidenz:** Skill-Output zeigen.
- [ ] CP-2: Rufe `/accessibility-compliance:wcag-audit-patterns` auf. **Evidenz:** Skill-Output + Findings.
- [ ] CP-3: Rufe `/ui-design:interaction-design` auf. **Evidenz:** Skill-Output + Patterns.
- [ ] CP-4: Rufe `/business-analytics:data-storytelling` auf. **Evidenz:** Skill-Output + Visualisierung.
- [ ] CP-5: Konsolidiere mit `/agent-teams:multi-reviewer-patterns`. Einzel-Reports in `docs/reviews/s5a-resume/`, konsolidierter Report verweist auf Quell-Reports.

**Phase 2: Dreistufige Analyse vervollständigen (CP-6 bis CP-7)**

- [ ] CP-6: Stufe 2 — Gezielte Nachbohrer:
  - `Skill("security-scanning:stride-analysis-patterns")` auf Webhook-Endpoints
  - `Skill("pr-review-toolkit:pr-test-analyzer")` auf Webhook + Enrichment + Timeline Code
  - `Skill("ui-design:interaction-design")` für Enrichment Panel + Timeline + Kanban
  - `Skill("application-performance:performance-optimization")` für Webhook concurrent delivery
  **Evidenz:** Findings dokumentiert.

- [ ] CP-7: Stufe 3 — `Skill("agent-teams:multi-reviewer-patterns")` konsolidiere Stufe 1 + 2. Anti-Stille-Herabstufung: JEDES "nicht fixbar" explizit begründen.

**Phase 3: Fehlende Deliverables (CP-8 bis CP-13)**

- [ ] CP-8: E2E Tests schreiben — lies `e2e/CONVENTIONS.md` ZUERST. 3 Tests: Enrichment Panel, Status Timeline, Webhook Settings.
- [ ] CP-9: Flashlight-Analyse — grep project-wide:
  - IDOR: `where: { id }` ohne userId in anderen Action-Files?
  - SSRF: `redirect: "manual"` in allen fetch()-Calls?
  - IPv4-mapped IPv6: validateOllamaUrl() auch vulnerable?
  - Rate-Limits: andere Server Actions ohne Throttling?
- [ ] CP-10: `allium:weed` — verifiziere ob die 20 Divergenzen wirklich pre-existing sind. Fixe was S5a verursacht hat.
- [ ] CP-11: ADR schreiben für ChannelRouter-Architektur (`/documentation-generation:architecture-decision-records`)
- [ ] CP-12: UX 10-Punkte-Checkliste für alle neuen Komponenten (EnrichmentStatusPanel, StatusHistoryTimeline, WebhookSettings, StatusFunnelWidget)
- [ ] CP-13: Agent-Claims per `git diff` stichprobenartig verifizieren (67% Fabrication-Rate)

**Phase 4: Handoff + Docs (CP-14 bis CP-16)**

- [ ] CP-14: `project_s5a_deferred_items.md` erstellen — alle offenen Items für S5b
- [ ] CP-15: BUGS.md updaten — DNS rebinding SSRF, document.execCommand deprecation dokumentieren
- [ ] CP-16: Build + Tests grün verifizieren

## PFLICHT: Ehrlichkeits-Gate VOR dem Merge

BEVOR du den Branch mergst, beantworte diese Fragen EHRLICH:

**Frage 1 — Selbstreflexion:**
- Wo habe ich Abkürzungen genommen und warum?
- Wo habe ich KEINE spezialisierten Skills UND/ODER Agents verwendet, obwohl die Anweisungen es verlangen?
- Was fehlt in dieser Session UND/ODER wurde nicht bearbeitet?
- Habe ich die Dokumentation aktualisiert?
- Habe ich die nächste Session über meine Arbeit informiert?

**Frage 2 — Wahrheits-Check:**
Sage die Wahrheit und nur die Wahrheit: Was habe ich übersprungen und wo sind die Lücken?

**Nach der Beantwortung:** Fixe ALLE identifizierten Lücken. Erst dann merge.

## Übergreifende Regeln

### SYSTEM-CONSTRAINT: Max 2 parallele Agents
Dieses System hat 10 GB RAM / 4 CPU Cores. Jeder Agent + MCP Servers verbraucht ~800 MB. Bei mehr als 2 parallelen Agents + Build thrashed das System und hängt. NIEMALS mehr als 2 Agents gleichzeitig dispatchen. Sequenziell ist besser als System-Crash.

### VERBOTEN für den Main-Agent
- ❌ Code Read/Edit/Write (außer BUGS.md, CHANGELOG.md, docs/)
- ❌ Tests schreiben, Findings fixen
- ❌ Skills durch `Agent("...")` ersetzen — verwende `Skill()` Tool
- ❌ **Eigenständige Tradeoff-Entscheidungen treffen.** Du darfst NICHT entscheiden "Implementation > Verification" oder "Context-Effizienz > Prompt-Compliance". Wenn der Prompt sagt "rufe Skill X auf", dann rufst du Skill X auf — unabhängig von Context-Verbrauch oder Zeitaufwand. Die Prioritäten definiert der Prompt, nicht du. Wenn du einen Tradeoff für nötig hältst: dokumentiere ihn EXPLIZIT und begründe — aber führe die Anweisung trotzdem aus.

### Git
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit
- **NIEMALS PRs gegen upstream Gsync/jobsync.**

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen. Maximale kognitive Anstrengung.

### Online-Recherche
Agenten, Skills und Plugins dürfen jederzeit online suchen.
