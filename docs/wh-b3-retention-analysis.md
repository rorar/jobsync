# WH-B3 — Retention-Expiry of Auto-Created Persons: Compliance Analysis & Recommendation

**Status:** IN PROGRESS (living document — written incrementally as evidence is verified)
**Author:** analysis agent, session 2026-08-26
**Branch:** `spec/gdpr-data-rights-person-stub` (read-only; no spec/source edits made by this analysis)
**Question posed by @rorar:** *"What's the most flexible and long-lasting solution for this project BUT completely GDPR compliant?"*

Both halves are binding. Not "pragmatic given the codebase" — **completely compliant**, and among the
compliant options, the most flexible and durable one.

---

## 0. Verification log (running)

Every factual claim below carries a `file:line`. Claims not yet verified are marked `[UNVERIFIED]`.

### V1 — The defect, as stated, is real. Verified.

| Claim | Verdict | Evidence |
|---|---|---|
| Spec rule `ExpireAutoCreatedPersons` exists and only sets `archived` | ✅ TRUE | `specs/crm.allium:813-832`. Its entire post-state is `person.status = archived`, `person.updated_at = now`, plus a `ReminderTriggered` event. No erasure, no scrub, no follow-on obligation. |
| The rule guards on `status = active` | ✅ TRUE | `specs/crm.allium:817` `requires: person.status = active` |
| `crm-cron.ts` performs that one transition | ✅ TRUE | `src/lib/scheduler/crm-cron.ts:52-98`; the query filter is `status:"active", dataSource:"auto_created", retentionExpiresAt:{lte:now}` (`:55-57`), the write is `data: { status: "archived" }` (`:71`) |
| `retention-cron.ts` never touches `Person` | ✅ TRUE | `grep -n "[Pp]erson" src/lib/scheduler/retention-cron.ts` → **zero matches** across all 366 lines. Its seven rules operate on `notification`, `enrichmentResult`, `enrichmentLog`, `stagedVacancy`, `adminAuditLog`, `crmActivityLog`, and orphaned logo files (`retention-cron.ts:69,82,95,108,150,201,214`). |
| Therefore an archived, retention-expired Person keeps its identifiers indefinitely | ✅ TRUE | Nothing else transitions `archived → anonymized`. The only `anonymized` writer is the user-initiated `anonymizePerson` action (verified below). |

### V1b — An aggravating fact the bug report did not mention

The expiry rule does not merely *fail to erase* — **it manufactures a fresh copy of the
identifier while doing so.** `crm-cron.ts:80` writes

```ts
linkedRecordName: [person.firstName, person.lastName].filter(Boolean).join(" ") || null,
```

into the `CrmActivityLog` row that records the archival. So the moment retention expires,
the person's full name is *duplicated* into the immutable timeline. That copy is governed
by `retention-cron.ts:201 purgeOldCrmActivityLogs` on an unrelated clock, and it is
**refreshed to `now`** by the very event that was supposed to end the retention period —
i.e. expiry currently *extends* the practical lifetime of the name. This matters for the
options below: any fix that does not also address the log copy is incomplete.

