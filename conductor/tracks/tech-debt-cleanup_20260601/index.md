# Track: Tech-Debt Cleanup (Restposten + GDPR-LOW)

**ID:** tech-debt-cleanup_20260601
**Status:** Pending

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)

## Progress

- Phases: 4/5 complete (Clusters 1–4 done 2026-06-14)
- Tasks: 10/12 complete (C1: IF-12 + D1/D2; C2: IF-10 + D5; C3: D3 + D4; C4: GDPR-Consent + G25 + G26b; plus G28 pre-done; **2 remain**)

## Scope (BACKLOG §4 / §1b / §5 tail)

Parallel-einstreubar (Kette D — no rewrite risk). Five clusters: (1) type-safety casts
IF-12 + D1/D2; (2) event semantics IF-10 + bounded-context D5; (3) Allium spec-drift
D3 + D4; (4) GDPR-LOW GDPR-Consent + G25 + G26b; (5) i18n/test gaps F6 + CRM-Cron tests
+ G28. Each item test-backed, own commit. All file:line code-verified at HEAD `b4b20e9`.

## Quick Links

- [Back to Tracks](../../tracks.md)
- [Product Context](../../product.md)
