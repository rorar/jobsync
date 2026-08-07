# Track: Welle 5 — Inside Track (Tippgeber/Vitamin-B)

**ID:** welle5-inside-track_20260615
**Status:** Complete (2026-06-20)

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)

## Source of Truth (behaviour — do NOT re-specify)

- `specs/inside-track.allium` · `specs/crm.allium` · `specs/crm-gdpr.allium`
- Ordering input: `docs/inside-track-implementation-debt.md`

## Progress

- Phases: 7/7 complete
- Tasks: 27/27 complete

Verified against the code 2026-08-07, not merely against `metadata.json`: every phase's
deliverables exist (models + migration `20260615170122_welle5_inside_track`, `referral.actions.ts`,
`personConnection.actions.ts`, `findWarmPaths` with consent-block, 9 components in
`src/components/inside-track/`, the `/dashboard/referrals` route, the `insideTrack.*` dictionary,
the anonymize + DSAR-export cascades), 262 tests across 20 specs, and
`allium check specs/inside-track.allium` reports 0 findings.

## Scope

Phase 0 (CRM prereqs) + Phase 1 (foundation) of the debt doc. **Out:** IT-7 (cover-letter,
gated cv-document 4.2), IT-8 (outreach tone-gate, gated 1.12 Communication).

## Quick Links

- [Back to Tracks](../../tracks.md)
- [Product Context](../../product.md)
