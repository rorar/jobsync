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
