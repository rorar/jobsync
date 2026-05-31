# Sprint Verification & Planning — Startprompt für neue Session

## Paste this as the first message in a new Claude Code session:

```
Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal/memory/MEMORY.md + ~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies danach docs/ROADMAP.md, docs/documentation-agents.md und den Masterplan: ~/.claude/plans/open-architecture-masterplan.md
Lies den Prompt-Draft: ~/.claude/plans/swift-knitting-stonebraker.md

## Kontext

Sprint C Tracks 1-3 sind DONE auf main (Public API, Blacklist, Caching, JobDeck). E2E: 68/68 grün. Security: 96 Bugs fixed. C5 (CRM Core) und C6 (Data Enrichment) stehen noch aus.

Sprint A (10 Items) und Sprint B (10 Items) wurden automatisch per Shell-Script ausgeführt und als DONE gemeldet — aber NIE unabhängig verifiziert.

Der Prompt-Draft in swift-knitting-stonebraker.md enthält einen 4-Stufen-Plan (Verification → User Journeys → CRM → Enrichment) mit offenen Punkten am Ende.

## Dein Auftrag

Starte /brainstorming gefolgt von /plan um folgendes zu klären:

1. **Session-Staging:** Der 4-Stufen-Plan ist zu groß für eine Session. Wie splitten wir sinnvoll auf mehrere Sessions? Optionen:
   - Nach Stufen (1+2 = Session A, 3 = Session B, 4 = Session C)?
   - Nach Dimensionen (Review → Fix → Feature)?
   - Hybrid?
   - Was ist die Handoff-Strategie zwischen Sessions?

2. **Allium Spec-Alignment als Standard:** 10 Allium Specs existieren. Der Security-Agent hat 47 Files geändert. `allium:weed` muss in den PDCA-Zyklus eingebaut werden — nicht nur einmalig sondern als wiederkehrender Check.

3. **Performance-Fixes als Standard:** 3 HIGH Performance-Findings sind offen (lastUsedAt Throttling, unbounded Job-URL Query, Rate Limiter Memory). Performance-Fixes müssen als Standard-Schritt in jeden Zyklus.

4. **User Journeys + Edge Cases:** Methode und Scope definieren. Welche Features brauchen Journeys? Wie tief gehen die Edge Cases? Was ist das Verhältnis zu E2E-Tests?

5. **UX-Vollständigkeitsprüfung:** 10-Punkte-Checkliste (Loading, Empty, Error States, Mobile, Keyboard, Dark Mode, i18n, Confirmation, Feedback, Consistency) — wie systematisch prüfen wir das? Pro Komponente oder pro Feature?

Ergebnis: Ein finalisierter, session-gestagter Prompt-Satz (ein Prompt pro Session) den ich direkt in neue Claude Code Sessions einfügen kann. Jeder Prompt ist self-contained mit vollem Kontext.

Arbeite autonom. Maximale kognitive Anstrengung.
```
