# ADR-035: CRM update actor as a typed provenance, not a User FK

**Status:** Accepted
**Date:** 2026-06-02
**Context:** Welle 3 Phase 5 (Gap-7 — "updatedBy FK tracking")

## Context

Gap-7 asked for `updatedBy` tracking on the mutable CRM entities (`CrmInterview`,
`CrmTask`, `CrmNote`) — "who last changed this record". The obvious implementation
is a `updatedBy` foreign key to `User`.

Two facts make a plain User FK the wrong model:

1. **Non-user actors are coming.** ROADMAP 9.5 (reverse-funnel landingpage) lets an
   external **Person** (e.g. a recruiter) self-edit/correct their own record — they
   have **no `User` account**. ROADMAP 1.12 (Communication / Gmail sync) lets an
   **automation** update records — also not a `User`. A `User` FK cannot point at
   either.
2. **Forensic durability.** Like `CrmActivityLog.actorId` and `AdminAuditLog.actorId`,
   the "who" must survive deletion of the actor. A hard FK with `onDelete: SetNull`
   would erase the provenance; `onDelete: Cascade` would delete the record.

A naive `User` FK would also be **redundant today**: JobSync has no RBAC/teams, so
every record is single-owner and only its owning `userId` can edit it — `updatedBy`
would always equal `userId`. The redundancy disappears precisely *because* of the
non-user actors above.

## Decision

Model the update actor as a **typed provenance pair**, not a FK:

- `updatedByType: String?` — an `ActorType` ∈ `{ user, automation, self }`
  (`ACTOR_TYPES` in `person.model.ts`, runtime-validated at the action boundary per
  ADR-019).
- `updatedById: String?` — the actor's identifier, **nullable and not a foreign key**
  (a `userId`, an `automationId`/`moduleId`, or a `personId` for self-edits; null is
  permitted so it survives actor deletion).

Added to `CrmInterview`, `CrmTask`, `CrmNote` (migration
`20260602094522_add_crm_updated_by_actor`). The user-initiated action writers stamp
`{ type: "user", id: userId }` today; `automation` and `self` are wired when 9.5 / 1.12
land.

**`Person` is unchanged** — it already carries its own provenance via
`createdBySource`/`createdByName` + `updatedBySource`/`updatedByName` (see
the Welle 3 P5 Person decision: it stays name-string + source-tag, GDPR-anonymisable,
and represents the same `self`/`automation`/`user` actors).

## Consequences

- **Positive:** one provenance model spans user / automation / self; survives actor
  deletion; no premature/redundant FK; forward-compatible with 9.5 + 1.12; consistent
  with the existing `actorId` string pattern.
- **Negative:** `updatedById` is not referentially enforced (by design) — a stale id is
  possible if an actor is deleted, which is the intended forensic trade-off. Display
  surfaces must resolve the id by `type` (a future timeline/label concern).
- **Spec:** `specs/crm-workflow.allium` documents the actor provenance.
- **Not done:** no UI yet surfaces `updatedBy`; the `self`/`automation` writer paths
  are gated on ROADMAP 9.5 / 1.12.
