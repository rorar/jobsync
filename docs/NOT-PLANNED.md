# NOT-PLANNED — Bewusst abgelehnte Verbesserungen

Punkte, die evaluiert und begründet abgelehnt wurden. Kein Backlog — diese Items sollen NICHT in zukünftigen Reviews als "neue Findings" auftauchen.

| # | Vorschlag | Begründung gegen Umsetzung | Wann es doch sinnvoll wäre |
|---|-----------|---------------------------|---------------------------|
| NP-1 | Projekt-weiter AbortController als shared Utility | Kein Boilerplate (Einzeiler `AbortSignal.timeout(ms)`), keine Duplikation, drei verschiedene Kontexte (Fetch-Timeout, Cockatiel-Policy, Promise.race). Shared Utility wäre Indirection ohne Gewinn. | Wenn 3+ Komponenten Cancel-Buttons mit identischem Abort+Cleanup-Pattern bekommen (z.B. langlebige Uploads mit Progress-Bar und "Abbrechen"-Button). |
| ~~NP-2~~ | ~~pruneLevels=2 ableiten oder in Config zentralisieren~~ | **RESOLVED** — `LOGO_PRUNE_LEVELS` Konstante in `logo-asset-service.ts` extrahiert. orphan-finder Default entfernt (generisch). 3 Call-Sites + 1 Default → benannte Konstante. | — |
| NP-3 | Unused `metadata` param in `validateJob()` entfernen (CQ-7) | Dead Code, aber bewusst beibehalten. API-Symmetrie mit `validateResume(text, metadata)`. Param als `_metadata` markiert. Guard (z.B. `MAX_JOB_WORDS`) derzeit unnötig: Connectors strippen HTML beim Import, `TEXT_LIMITS` (S3) capped Text vor LLM. | Wenn ein neuer Connector Roh-HTML liefert ohne Import-Stripping, oder wenn LLM-Token-Budget-Kontrolle in die Validierung verlagert wird. |
