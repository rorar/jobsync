# Implementation Plan: Welle 1 — Foundation-Types + GDPR

**Track ID:** welle1-foundation-gdpr_20260601
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-01
**Status:** [ ] Not Started

## Overview

Two sequential foundation phases stabilise shared types (IF-5 → IF-7), then an
Allium-first audit-contract phase precedes the GDPR fan-out (S6a, S6b, GDPR-JWT). TDD
throughout: write the failing test first, then the implementation. Build
(`source scripts/env.sh && bun run build`) must be zero-error after each type change;
stop the dev server before tsc/build. **Hard ordering:** IF-5 (Phase 1) → IF-7
(Phase 2) → audit-contract spec (Phase 3) → S6a/S6b implement that spec; GDPR-JWT is
independent and may run anytime after the foundation phases.

## Phase 1: IF-5 — Typed `ActionResult.message` (foundation, sequential)

Make `ActionResult.message` an i18n-key union instead of bare `string`.

### Tasks

- [ ] Task 1.1: Write a type-level test (or `tsc` expect-error fixture) asserting
      `message` rejects an arbitrary non-key string.
- [ ] Task 1.2: Define the i18n-key union in `src/models/actionResult.ts` (template-literal
      / branded type sourced from the dictionary namespaces).
- [ ] Task 1.3: Fix all producer call sites (server actions) and consumers (toasts) to
      satisfy the union; resolve every compile error.
- [ ] Task 1.4: Run `bash scripts/test.sh` + build — zero type errors.

### Verification

- [ ] Build passes zero-error; an arbitrary string in `message` is a compile error.

## Phase 2: IF-7 — Single-source `NotificationType` (foundation, sequential)

Consolidate the 13 scattered `NotificationType` definitions into one leaf module.

### Tasks

- [ ] Task 2.1: Inventory all 13 definition sites (grep `NotificationType`); write a test
      asserting a known type literal is assignable from the canonical union.
- [ ] Task 2.2: Create the canonical union in a zero-upstream-dep leaf module.
- [ ] Task 2.3: Replace the 13 local definitions with re-imports; delete duplicates.
- [ ] Task 2.4: Run Knip (`bun knip --changed`) to confirm no orphaned exports; build + tests.

### Verification

- [ ] Exactly one `NotificationType` literal set remains; build + tests pass.

## Phase 3: Allium audit-contract spec (FIRST — before any audit code)

The GDPR audit items (S6a/S6b) are domain-rule-heavy and span two aggregates, so the
BACKLOG marks `/allium` PFLICHT here — author the audit-trail contract BEFORE writing
the writers, exactly as Welle 4 specs JobStatus before its code. The spec defines the
audit-row shape (actor id, action, target type+id, timestamp, before/after snapshot)
and the `AdminAuditLog` extension that S6a/S6b will implement.

### Tasks

- [ ] Task 3.1: Author/extend the Allium audit-trail spec via `allium:elicit` /
      `allium:tend`. Capture: the `AuditEntry` value object (actor id, action verb, target
      type + target id, timestamp, optional before/after diff), the Job-CRUD write rule
      (S6a) and the Person-PII read-access rule (S6b), and the `AdminAuditLog` model
      extension (it exists at `schema.prisma:905`; writer `writeAdminAuditLog()` at
      `src/lib/auth/admin.ts:182`, emitting `kind: "admin_audit"` on stderr today —
      code-verified at HEAD). Decide host: extend `specs/gdpr-data-rights.allium` /
      `specs/security-rules.allium`, or a new `specs/audit-trail.allium`.
- [ ] Task 3.2: Validate with `allium:check` (clean parse); refine with `allium:tend`.
- [ ] Task 3.3: Review the contract against Art. 5(2) accountability + Art. 5(1)(c)
      minimisation (no PII over-collection into the audit payload); freeze as the single
      source of truth before S6a/S6b code.

### Verification

- [ ] `allium:check` passes; the spec covers the audit-row shape, the Job-CRUD write rule,
      the Person-PII read-access rule, and the `AdminAuditLog` extension.

## Phase 4: S6a — Job-CRUD GDPR audit trail (implements the spec; fan-out)

### Tasks

- [ ] Task 4.1: Regression/unit tests: each Job mutation produces one audit row with the
      spec-defined actor/action/target shape.
- [ ] Task 4.2: Extend the `AdminAuditLog` pattern (or a Job-scoped sibling) with a
      `server-only` audit writer per the Phase 3 contract; respect ADR-019 (no raw-userId
      `"use server"` export).
- [ ] Task 4.3: Wire the writer into `job.actions.ts` create/update/delete/status/note paths
      (ADR-015 userId in every query).
- [ ] Task 4.4: i18n any new labels (en/de/fr/es); build + tests.

### Verification

- [ ] Every Job mutation path is covered by a passing audit-row assertion matching the spec.

## Phase 5: S6b — CRM read-access audit trail (implements the spec; fan-out)

### Tasks

- [ ] Task 5.1: Tests: viewing/exporting `Person` PII writes a read-access audit row.
- [ ] Task 5.2: Add a read-access audit writer (server-only leaf) keyed to Person detail /
      list-with-PII / export entry points in `person.actions.ts`.
- [ ] Task 5.3: Ensure no PII is duplicated into the audit payload beyond target id + actor
      (per the Phase 3 minimisation rule).
- [ ] Task 5.4: Build + tests.

### Verification

- [ ] Person PII read paths each emit exactly one audit row; no over-collection.

## Phase 6: GDPR-JWT — minimise the NextAuth token (fan-out)

### Tasks

- [ ] Task 6.1: Test decoding the `jwt` callback output asserts no `email`/`name` claim.
- [ ] Task 6.2: Trim the `jwt`/`session` NextAuth callbacks to carry only `id`; resolve
      display fields (email/name) from DB where a surface needs them.
- [ ] Task 6.3: Smoke the auth flow (sign-in still works; session.user.id present).
- [ ] Task 6.4: Build + tests + E2E signin smoke.

### Verification

- [ ] JWT contains only `id`; sign-in + session resolution unaffected.

## Final Verification

- [ ] All acceptance criteria met (IF-5, IF-7, audit-contract spec, S6a, S6b, GDPR-JWT)
- [ ] `bash scripts/test.sh` green; `bun run build` zero type errors
- [ ] i18n dictionaries consistent across en/de/fr/es
- [ ] `allium:check` clean on the audit-trail spec; `allium:weed` reports zero
      audit-spec ↔ code drift after S6a/S6b land
- [ ] ADR written for the audit-trail model extension (architecture decision)
- [ ] Ready for review

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
