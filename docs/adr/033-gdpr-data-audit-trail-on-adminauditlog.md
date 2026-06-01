# ADR-033: GDPR Data Audit Trail Reuses AdminAuditLog via a Shared `server-only` Writer

## Status

Accepted (2026-06-01)

## Context

GDPR Art. 5(2) (accountability) requires a record of who did what to personal data and when. Welle 1 introduced two audit obligations:

- **S6a** — every Job-CRUD mutation (create / update / delete / status-change / note-add) must leave an audit row.
- **S6b** — every read of Person PII (detail view, list-with-PII, full data export) must leave a read-access row.

An `AdminAuditLog` Prisma table + `writeAdminAuditLog()` (`src/lib/auth/admin.ts`) already existed for admin-action auditing (module activate/deactivate). It uses a hexagonal pattern: a fire-and-forget DB write (convenience adapter) plus an always-available structured stderr line (source of truth), and stores `actorId` as a bare String (NOT a FK) so rows survive actor deletion.

Question: introduce a separate audit table/writer for data events, or extend the existing one? And how to keep call sites from violating the GDPR minimisation rule (Art. 5(1)(c)) by copying PII into the audit payload?

The contract was specified first (Allium): `specs/audit-trail.allium` defines the `AuditLogEntry` shape, the S6a write rule, the S6b read rule, and the invariants `DataMinimisation` (a `person.pii_read` carries no snapshot), `SnapshotsAreFieldDiffsNotPii`, and `ActorAlwaysRecorded`.

## Decision

1. **Reuse the `AdminAuditLog` table**, extended with one nullable `targetType` discriminator (`"job" | "person" | "company" | "module" | "automation"`). Nullable keeps legacy admin rows valid; the before/after diff for Job mutations reuses the existing `extra` JSON-string column (SQLite has no jsonb).

2. **Add a dedicated `server-only` writer** `writeDataAuditLog()` (`src/lib/audit/data-audit.ts`) rather than overloading the admin writer (whose signature is admin-authorization-specific). It mirrors the admin writer's hexagonal fire-and-forget + stderr pattern.

3. **Enforce the minimisation invariants at the sink, not the call site.** The writer drops `beforeAfter` unless the action is `job.update` / `job.status_change`, and therefore ALWAYS drops it for `person.pii_read`. A call site cannot leak a content snapshot even if it passes one.

4. **ADR-019 compliance:** the writer lives in a `server-only` leaf (NOT a `"use server"` file), so its raw-`actorId` parameter is never exposed as a callable server action. Callers pass `user.id` from `getCurrentUser()` (server actions) or `userId` from `withApiAuth()` (public API) — never client-supplied.

## Consequences

### Positive

- One audit table + one query/retention path (retention already covered by `gdpr-data-rights.allium` S4 `admin_audit_log_retention`); the admin-audit review UI generalises to data events.
- The minimisation rule is structurally guaranteed, not convention — verified by `__tests__/data-audit.spec.ts` and the per-site audit tests (which recursively assert no PII string reaches the writer).
- `actorId`-not-a-FK + denormalised `actorEmail` preserved → forensic durability after user deletion.
- Coverage spans every Job-mutation entry point (server actions, staged-vacancy promotion, public API v1) and every Person-PII read (Person repository + GDPR export), found via a post-implementation blind-spot sweep.

### Negative / trade-offs

- The `extra` column is now polymorphic (admin context blob OR data before/after diff), disambiguated by `action`/`targetType`. Acceptable given the SQLite no-jsonb constraint.
- The list-with-PII read emits one row per person (≤100/page, the spec's DSAR-precise choice) via N individual creates; a `createMany` batch is a possible future optimisation.
- Public-API / promoter / export audit rows carry a null `actorEmail` (only `actorId` is cheaply available there); the email denormalisation is best-effort.

## Related

- Spec: `specs/audit-trail.allium` (single source of truth). Retention: `gdpr-data-rights.allium`.
- ADR-015 (IDOR), ADR-019 (server-only / use-server boundary). Pattern precedent: `writeAdminAuditLog()` (Sprint 1.5).
