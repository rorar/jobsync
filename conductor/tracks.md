# Tracks Registry — JobSync

All Conductor tracks. These are PLANS for future implementation sessions — no application
code has been written yet. Distilled from the BACKLOG (`docs/BACKLOG.md`, verified against
HEAD `663ff21`); all file:line facts re-verified against code at HEAD `b4b20e9`.

## Ready to start

| Done | Track ID | Title | Type | Created | Updated |
| ---- | -------- | ----- | ---- | ------- | ------- |
| [x] | [welle1-foundation-gdpr_20260601](./tracks/welle1-foundation-gdpr_20260601/index.md) | Welle 1 — Foundation-Types + GDPR | feature | 2026-06-01 | 2026-06-01 |
| [~] | [welle2-salary-profile_20260601](./tracks/welle2-salary-profile_20260601/index.md) | Welle 2 — Salary + Profil (Kette B) | feature | 2026-06-01 | 2026-06-01 |
| [ ] | [welle3-crm-connection_20260601](./tracks/welle3-crm-connection_20260601/index.md) | Welle 3 — CRM-Verbindung (Kette C) | feature | 2026-06-01 | 2026-06-01 |
| [ ] | [welle4-custom-jobstatus_20260601](./tracks/welle4-custom-jobstatus_20260601/index.md) | Welle 4 — Custom JobStatus XL (Kette A) | feature | 2026-06-01 | 2026-06-01 |
| [ ] | [tech-debt-cleanup_20260601](./tracks/tech-debt-cleanup_20260601/index.md) | Tech-Debt Cleanup (Restposten + GDPR-LOW) | chore | 2026-06-01 | 2026-06-01 |

## Deferred / Entry-Criteria-gated ⛔

These five tracks are **NOT ready to start** — each is blocked on an explicit entry
criterion (a design decision, a perf trigger, or product scheduling). Do not begin a
track until its criterion is met. They are registered so they are visible and ready to
pick up when unblocked.

| Done | Track ID | Title | Effort | Entry Criterion |
| ---- | -------- | ----- | ------ | --------------- |
| [ ] | [observability_20260601](./tracks/observability_20260601/index.md) | Observability Infrastructure (H-P-09) | 2–3 weeks | Stack-decision ADR (OTel+Tempo+Prometheus+Grafana OR off-the-shelf APM) |
| [ ] | [pii-at-rest_20260601](./tracks/pii-at-rest_20260601/index.md) | PII-at-Rest — Person field encryption (Art. 32) | multi-day | Design phase resolves 5 questions (fields/search/key/migration/anonymize-merge) + ADR |
| [ ] | [undostore-pipethrough_20260601](./tracks/undostore-pipethrough_20260601/index.md) | undoStore split-brain pipe-through (M-A-09) | 2–3 days | ADR-030 amendment (onAction `undoTokenId` pipe-through) + migration plan |
| [ ] | [cursor-pagination_20260601](./tracks/cursor-pagination_20260601/index.md) | getStagedVacancies cursor pagination | 2–3 days | User-scale/perf trigger (pre-emptive — no report yet) |
| [ ] | [session-recovery_20260601](./tracks/session-recovery_20260601/index.md) | Session Recovery & Stale-Session Guard (3.11) | M | ROADMAP 3.11 prioritised for a sprint |

## Suggested Execution Order

The four Wellen are independent tracks but share a sensible order:

1. **Welle 1** — stabilises shared foundation types (`ActionResult.message`,
   `NotificationType`), authors the Allium audit-contract, then ships GDPR audit trails.
2. **Welle 2** — adds the currency reference module + structured salary.
3. **Welle 3** — wires the existing CRM backend into the Job UI.
4. **Welle 4** — Allium-first custom JobStatus (largest; touches Kanban + form + API).

**tech-debt-cleanup** is parallel-einstreubar (BACKLOG Kette D — no rewrite risk): pick up
its clusters opportunistically between Wellen. The five **gated** tracks start only once
their entry criterion is met.

Run `/conductor:implement {trackId}` to begin a track.

## ROADMAP-forward features (NOT Conductor tracks)

The following are planned forward work, tracked in **`docs/ROADMAP.md`** — they are
deliberately **NOT** created as Conductor tracks (too large / design-gated / a moving
roadmap, not a discrete BACKLOG item). Listed here as a pointer only (BACKLOG §7):

- **Connectors 1.x:** Job-Discovery modules (StepStone / Indeed), 1.2 Workflow (n8n /
  Zapier), 1.7 Calendar (blocks 5.2), 1.12 Communication / Gmail-Sync (blocks 5.1)
- **UX 2.x:** Map, File-Explorer, Marketplace (each partial), CompanyDetail page
- **QoL 3.x:** Job-grouping, Dedup-fuzzy, Tiptap-Ausbau, CV-parsing, Link-autofill, Offline-CRUD
- **Docs 7.x:** API v1 Phase 2+, OpenAPI spec

→ Detail + status live in `docs/ROADMAP.md` (not duplicated here).

> **Not listed:** items in `docs/NOT-PLANNED.md` (BACKLOG §8) are deliberately rejected
> with documented reasoning — do NOT create tracks for them or re-propose them as new.
