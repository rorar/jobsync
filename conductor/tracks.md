# Tracks Registry — JobSync

All Conductor tracks. These four were distilled from the BACKLOG-Wellen; they are
PLANS for future implementation sessions — no application code has been written yet.

| Done | Track ID | Title | Created | Updated |
| ---- | -------- | ----- | ------- | ------- |
| [ ] | [welle1-foundation-gdpr_20260601](./tracks/welle1-foundation-gdpr_20260601/index.md) | Welle 1 — Foundation-Types + GDPR | 2026-06-01 | 2026-06-01 |
| [ ] | [welle2-salary-profile_20260601](./tracks/welle2-salary-profile_20260601/index.md) | Welle 2 — Salary + Profil (Kette B) | 2026-06-01 | 2026-06-01 |
| [ ] | [welle3-crm-connection_20260601](./tracks/welle3-crm-connection_20260601/index.md) | Welle 3 — CRM-Verbindung (Kette C) | 2026-06-01 | 2026-06-01 |
| [ ] | [welle4-custom-jobstatus_20260601](./tracks/welle4-custom-jobstatus_20260601/index.md) | Welle 4 — Custom JobStatus XL (Kette A) | 2026-06-01 | 2026-06-01 |

## Suggested Execution Order

The Wellen are independent tracks but share a sensible order:

1. **Welle 1** — stabilises shared foundation types (`ActionResult.message`,
   `NotificationType`) that later Wellen build on; ships GDPR audit trails.
2. **Welle 2** — adds the currency reference module + structured salary.
3. **Welle 3** — wires the existing CRM backend into the Job UI.
4. **Welle 4** — Allium-first custom JobStatus (largest; touches Kanban + form + API).

Run `/conductor:implement {trackId}` to begin a track.
