# Track: PII-at-Rest — Person field-level encryption (Art. 32)

**ID:** pii-at-rest_20260601
**Status:** ⛔ Pending — ENTRY-CRITERIA-GATED

## Entry Criteria

Design phase resolves the 5 questions (which fields / search strategy / key mgmt /
reversible migration / anonymize-merge interplay) + ADR. Multi-day risk-bearing
migration. Do NOT start code until the design is settled.

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- Folds: `docs/superpowers/plans/2026-05-30-next-sprint-pii-at-rest.md`

## Progress

- Phases: 0/5 complete
- Tasks: 0/11 complete

## Scope (BACKLOG §6)

`Person` PII (emails/phones/companies/socialProfiles JSON + name/address) stored
plaintext in SQLite. Encrypt at rest via existing `encryption.ts` (AES-256-GCM). SEPARATE
axis from the complete PII-egress redaction (ADR-032). (D)-item cleanups live in
**tech-debt-cleanup**, not here. Facts code-verified at HEAD `b4b20e9`.

## Quick Links

- [Back to Tracks](../../tracks.md)
- [Product Context](../../product.md)
