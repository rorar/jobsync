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

- [x] Task 1.1: Write a type-level test (or `tsc` expect-error fixture) asserting
      `message` rejects an arbitrary non-key string. → `src/models/actionResult.type-test.ts`
      (`@ts-expect-error` fixture, build-enforced; fails loud if message reverts to `string`).
- [x] Task 1.2: Define the i18n-key union in `src/models/actionResult.ts`. → Real `keyof`
      union `TranslationKeyStrict` derived from the 23 `as const` namespace dicts (stronger
      than template-literal; also catches typo'd keys). Kept `TranslationKey = string` so
      global `t()` is untouched (BACKLOG follow-up: type `t()` against the strict union).
      Added `messageParams?` field for late-bound interpolation (replaces the
      `performanceWarning:<count>` message-overload hack).
- [x] Task 1.3: Fixed ALL producers + consumers. ~265 compile errors resolved: producers
      → i18n keys (authn cluster → `errors.notAuthenticated`; CRUD fallbacks → generic
      `errors.{create,update,delete}Failed` / existing `errors.fetchFailed`; dynamics →
      static keys + `messageParams`). `handleError` 2nd param typed. 31 new keys × 4 locales
      (2 i18n agents). ~50 consumer toast sites `t()`-wrapped (4 agents) + 2 perf-warning
      parsers → `messageParams`. NOTE: plan's IF-7 "13 definitions" premise was inaccurate
      (verified: 1 type def + importers) — see Phase 2.
- [x] Task 1.4: `tsc --noEmit` 0 errors; full jest 258 suites / 5062 pass; build (pending).
      Caught + fixed 2 self-introduced regressions (smtp/webhook/url validators return
      specific i18n keys — typed their `error` as `TranslationKeyStrict` instead of dropping;
      `getCompanyById` refactored to return proper keys not throw-and-catch).

### Verification

- [x] Build passes zero-error (pending build confirm); arbitrary string in `message` is a
      compile error (enforced by `actionResult.type-test.ts`).

## Phase 2: IF-7 — Single-source `NotificationType` (foundation, sequential)

Consolidate the 13 scattered `NotificationType` definitions into one leaf module.

### Tasks

- [x] Task 2.1: Inventory done — plan premise CORRECTED. There were NOT 13 definitions:
      exactly ONE `type NotificationType` def (`notification.model.ts:1`, zero-import leaf)
      + importers + exhaustive consumer switches (`never`-guarded). Added
      `__tests__/notification-type-source.spec.ts` (literal⇄union assignability + integrity).
- [x] Task 2.2: Canonical union already in a leaf (notification.model.ts has 0 imports) —
      spec's circular-import concern moot; no move needed.
- [x] Task 2.3: The one real duplicate literal set was `CONFIGURABLE_NOTIFICATION_TYPES`
      (hand-listed 16 literals). Now DERIVED from `Record<NotificationType, boolean>` —
      compiler forces completeness, set can't drift. Added a `never` guard to
      `buildNotificationActions` default (consumer exhaustiveness).
- [x] Task 2.4: tsc 0 errors; targeted jest 8 suites/186 pass. (knip `--changed` flag
      unsupported by installed knip; change adds no new exports → no orphan risk.)

### Verification

- [x] Exactly one `NotificationType` literal set remains (the array is now derived, not a
      duplicate); the union drift-proofs the array at compile time; build + tests pass.

## Phase 3: Allium audit-contract spec (FIRST — before any audit code)

The GDPR audit items (S6a/S6b) are domain-rule-heavy and span two aggregates, so the
BACKLOG marks `/allium` PFLICHT here — author the audit-trail contract BEFORE writing
the writers, exactly as Welle 4 specs JobStatus before its code. The spec defines the
audit-row shape (actor id, action, target type+id, timestamp, before/after snapshot)
and the `AdminAuditLog` extension that S6a/S6b will implement.

### Tasks

- [x] Task 3.1: Author/extend the Allium audit-trail spec via `allium:elicit` /
      `allium:tend`. Capture: the `AuditEntry` value object (actor id, action verb, target
      type + target id, timestamp, optional before/after diff), the Job-CRUD write rule
      (S6a) and the Person-PII read-access rule (S6b), and the `AdminAuditLog` model
      extension (it exists at `schema.prisma:905`; writer `writeAdminAuditLog()` at
      `src/lib/auth/admin.ts:182`, emitting `kind: "admin_audit"` on stderr today —
      code-verified at HEAD). Decide host: extend `specs/gdpr-data-rights.allium` /
      `specs/security-rules.allium`, or a new `specs/audit-trail.allium`.
- [x] Task 3.2: Validate with `allium:check` (clean parse); refine with `allium:tend`.
- [x] Task 3.3: Review the contract against Art. 5(2) accountability + Art. 5(1)(c)
      minimisation (no PII over-collection into the audit payload); freeze as the single
      source of truth before S6a/S6b code.

### Verification

- [x] `allium:check` passes (0 errors); the spec covers the audit-row shape, the Job-CRUD write rule,
      the Person-PII read-access rule, and the `AdminAuditLog` extension. Host: new `specs/audit-trail.allium`.

## Phase 4: S6a — Job-CRUD GDPR audit trail (implements the spec; fan-out)

### Tasks

- [x] Task 4.1: Regression/unit tests: each Job mutation produces one audit row with the
      spec-defined actor/action/target shape.
- [x] Task 4.2: Extend the `AdminAuditLog` pattern (or a Job-scoped sibling) with a
      `server-only` audit writer per the Phase 3 contract; respect ADR-019 (no raw-userId
      `"use server"` export).
- [x] Task 4.3: Wire the writer into `job.actions.ts` create/update/delete/status/note paths
      (ADR-015 userId in every query).
- [x] Task 4.4: i18n any new labels (en/de/fr/es); build + tests.

### Verification

- [x] Every Job mutation path covered (addJob/updateJob/delete/status/kanban-cross-column/addNote); job-audit.spec green.

## Phase 5: S6b — CRM read-access audit trail (implements the spec; fan-out)

### Tasks

- [x] Task 5.1: Tests: viewing/exporting `Person` PII writes a read-access audit row.
- [x] Task 5.2: Add a read-access audit writer (server-only leaf) keyed to Person detail /
      list-with-PII / export entry points in `person.actions.ts`.
- [x] Task 5.3: Ensure no PII is duplicated into the audit payload beyond target id + actor
      (per the Phase 3 minimisation rule).
- [x] Task 5.4: Build + tests.

### Verification

- [x] getPerson + getPersons emit person.pii_read (one per person); person-audit.spec asserts no PII/snapshot leak.

## Phase 6: GDPR-JWT — minimise the NextAuth token (fan-out)

### Tasks

- [x] Task 6.1: Test decoding the `jwt` callback output asserts no `email`/`name` claim.
- [x] Task 6.2: Trim the `jwt`/`session` NextAuth callbacks to carry only `id`; resolve
      display fields (email/name) from DB where a surface needs them.
- [x] Task 6.3: Smoke the auth flow (sign-in still works; session.user.id present).
- [x] Task 6.4: Build + tests + E2E signin smoke.

### Verification

- [x] JWT id-only (name/email/picture stripped); session repopulates display fields from DB; auth-jwt-minimization.spec green.

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

## Phase 7: Wrap-Up (finale Phase — vor Merge/Push)

Per `conductor/workflow.md` § Wrap-Up-Phase. Run only after all prior phases pass.

### Tasks
- [x] Task 7.1: Blind-Spot-Analyse — projektweit `grep` nach den Pattern-Fixes dieses Tracks; adjacent Lücken schließen.
- [x] Task 7.2: `/comprehensive-review:full-review` (Architecture+Security+Performance+Testing+Best-Practices) — alle realen Findings autonom fixen; Agent-Claims gegen `git diff`/Code verifizieren (kein Fabrizieren).
- [~] Task 7.3: `/understand` inkrementell-Refresh + Graph-Commit (1× am Welle-Ende, NICHT per-Commit; `autoUpdate` OFF).
- [ ] Task 7.4: Honesty-Gate voll ausführen (2 Fragen: Shortcuts/fehlende Skills/Gaps? Docs/Handoff?).
- [ ] Task 7.5: Push eigenständig — nach Gate, Fork `main`, NIE upstream.
- [x] Task 7.6: Doku-Update (README/User-Guide/API/ADR wo nötig) + `docs/BACKLOG.md` + `docs/BUGS.md` + Memory-Handoff aktualisieren.

### Verification
- [ ] full-review: keine offenen Critical/High. Honesty-Gate sauber. Auf Fork `main` gepusht. BACKLOG/BUGS/Docs synchron.
