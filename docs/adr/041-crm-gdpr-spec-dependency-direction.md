# ADR-041: `crm-gdpr.allium` depends on `crm.allium` — stubs are not a compatibility layer

**Status:** Accepted
**Date:** 2026-08-26
**Context:** W-H1 (`spec/w-h1-crm-gdpr-dependency-flip`), plus the independent
review in `docs/wh1-independent-assessment.md`
**Supersedes evidence in:** `docs/w-h1-crm-gdpr-drift-inventory.md` (preserved as a
dated snapshot, not deleted — see §7)

## Context

`specs/crm-gdpr.allium` was written before `specs/crm.allium` existed. To talk about
CRM entities it declared its own copies — twelve `external entity` stubs (`Person`,
`Note`, `Task`, `NoteTarget`, `TaskTarget`, `JobContact`, `Interview`, `Blocklist`,
`TimelineActivity`, plus three genuine externals), its own `enum DataSource` /
`ProcessingBasis` / `BlocklistType`, its own `config auto_created_contact_retention`,
and an `entity PersonGdprExtension` that existed solely because `Person` was a stub.
Its own header carried the migration instruction: *"Once crm.allium exists, replace
external entities with `use "./crm.allium" as crm`."*

`crm.allium` landed in Welle 3 (2026-06-11). The instruction sat unexecuted until
2026-08-25. In that window the copies drifted, in four distinct classes:

| class | worst instance |
|---|---|
| **Contradiction** | `ExpireAutoCreatedContacts` said retention expiry raises an erasure request ending in `anonymized` (terminal, irreversible). `crm.allium`'s `ExpireAutoCreatedPersons` and `src/lib/scheduler/crm-cron.ts` both say `archived` (reversible). A reader consulting the GDPR spec — the natural place to look — was told the opposite of what ships. |
| **Stale shape** | The Art. 15 export was specified from `person.job_title` and `person.city`. Welle 3 Kette B replaced them with `headline` and a structured `address`. The spec described an export that could not be produced. |
| **Duplication** | Six properties specified twice, currently agreeing — e.g. `AutoCreatedContactHasRetention` vs `Person.AutoCreatedHasRetention`. |
| **Dead declaration** | `PersonGdprExtension.erasure_requested_at`: no rule, no invariant, no Prisma column, no code. |

The mechanism had already been patched twice without being removed — W-E6
(2026-08-16, timeline-retention ownership) and W-F1 (2026-08-17, a duplicated
`BlocklistSuppressesAutoCreation` that had diverged into *opposite* enforcement
models). Patching instances while leaving the mechanism in place is what let the
retention contradiction survive two Wellen.

## Decision

**Flip the dependency: `crm-gdpr.allium` imports `crm.allium` and references its
entities by qualified name. Do not re-introduce a local copy of any `crm.allium`
entity, enum, config value or invariant.**

Concretely:

1. `use "./crm.allium" as crm`. Nine stubs became `crm/...` references.
2. `crm.allium:21` (`use "./crm-gdpr.allium" as gdpr`) was dropped — it had **zero**
   qualified references in the file and would otherwise have closed an import
   cycle. All five of `crm.allium`'s `use` lines were decorative at the time; this
   one had to go.
3. `entity PersonGdprExtension` dissolved. Its fields moved to `crm/Person`, where
   the Prisma model always had them; `is_anonymized` folded into the modelled
   `status = anonymized` terminal state; `erasure_requested_at` deleted as dead.
4. Duplicated enums, config and invariants deleted in favour of the `crm/...` originals.
5. `FulfillErasureRequest` rewritten to **delegate** the person-and-CRM-links half to
   `crm/AnonymizePerson` and own only the DSR wrapper plus the three external-entity
   cascades `crm.allium` genuinely cannot model.
6. `surface ConsentManagement` added (see §3).

### Three stubs deliberately kept

`MessageParticipant`, `CalendarEventParticipant` and `Attachment` remain
`external entity`. They are not copies of anything JobSync models — they describe an
integration that does not exist yet, which is what `external entity` is for.
`Attachment` in particular is a **name collision**, not a missing import:
`application-documents.allium:229` declares a different `Attachment` that hangs off
an `ApplicationBundle` and has no `target_person`. Linking them would be a bug.

## Alternatives considered

**A. Leave the stubs, fix the drifted values.** Rejected. This is what W-E6 and W-F1
did. Both times the instance was corrected and the mechanism survived, and both times
new drift appeared. Every one of the four drift classes above originates in a
hand-maintained copy, not in a wrong value; correcting the value leaves the generator
running.

**B. Flip the other way — `crm.allium` imports `crm-gdpr.allium`.** Rejected. It
inverts the real dependency (GDPR handling is a layer *over* the CRM domain model, not
under it), and `crm.allium` already imported `crm-gdpr.allium` decoratively, so this
direction is the one that produced the cycle.

**C. Do nothing, on the grounds that qualified cross-spec references might be
unsupported.** Rejected on evidence: `inside-track.allium` has used
`use "./crm.allium" as crm` in production since Welle 5, referencing `crm/Person`
(`:92,105,106,137,213,219`), `crm/ActorType` (`:155`), `crm/CompanyAssociation`
(`:700`), and even in trigger position
(`when: person: crm/Person.status transitions_to anonymized`, `:565`). The pattern was
already proven in this repo, on this toolchain, against this very entity.

## Consequences

### Positive

- The retention contradiction is gone; there is one owner (`crm.allium`) for
  auto-created retention expiry, and it matches `crm-cron.ts`.
- The Art. 15 payload is derived from what the implementation actually reads.
- **A boundary became declarable.** `WithdrawConsent` / `ReinstateConsent` — two live,
  user-invoked Art. 7(3) actions (`PersonDetailClient.tsx:140,150`) — previously existed
  at **no declared surface in any spec**. That was not an oversight; it was mechanical.
  The stub `Person` had no `user_id`, so there was no ownership predicate, so no actor
  could be tied to it, so no surface could be declared. Importing `crm.allium` supplies
  both `crm/Person.user_id` and `crm/CrmUser`, and `surface ConsentManagement` follows.
  The flip *closed* W-H1's original open question as a by-product.
- Likewise `crm/UpdatePerson` gained `requires: not person.is_consent_blocked`. That
  guard was previously inexpressible: the predicate lived on the other module's stub,
  and importing it would have closed a cycle.
- Corpus warnings fell from 303 to 285.

### Negative, and how it is handled

**`allium check` does not resolve these references.** Verified empirically
(allium 3.2.3, `docs/wh1-independent-assessment.md` §2): injecting
`crm/TotallyBogusEntity.nonexistent_field` yields output byte-identical to a clean
run. The blind spot is in fact wider than qualified names — **no reference in
expression position is resolved, qualified or local**; only *type*-position local
references produce `allium.type.undefinedReference`, and a `use` path that resolves
to nothing is a warning, not an error.

This is **not** a regression introduced by the flip, and the ADR records that
explicitly because the opposite reading is tempting:

- Under stubs, the drift was not merely unchecked, it was **uncheckable**. There was
  no link at all between `external entity Person` here and `entity Person` there, and
  a name-matching heuristic would have been unsound — the retained `Attachment` stub
  proves it.
- Qualified references are explicit, unambiguous, machine-resolvable edges. All 33
  in `crm-gdpr.allium` were resolved mechanically during review; 27 appear in code
  positions and all 27 resolve.

The flip therefore traded **uncheckable** for **checkable-but-not-yet-checked**.
`scripts/check-spec-refs.mjs` closes the remainder in CI. Two caveats for that script,
found during review: it must index `external entity` (`crm/User` resolves to
`crm.allium:36`, an external), and it must not scan comment prose — three prose lines
(`crm-gdpr.allium:641`, `crm.allium:20`, `crm.allium:1864`) mention qualified names
that intentionally do not resolve, and flagging them would train people to ignore it.

## Scope of this decision

This ADR governs **`crm-gdpr.allium` ↔ `crm.allium`**. Three `external entity Person`
stubs remain elsewhere and the same reasoning applies to them, in priority order:

1. **`gdpr-data-rights.allium`** — `{ user: User, name: String?, emails: List<String> }`;
   all three fields diverge from `crm/Person`, undocumented. This is the module that
   owns `CrmActivityLog` retention (its own scope line S4) and the Art. 15 export, so
   it is the file in which two of `crm-gdpr.allium`'s parked open questions will be
   resolved. **Fix the stub before resolving them.**
2. **`application-documents.allium`** — `{ gender: String?, full_name: FullName? }`;
   `gender` exists nowhere in `crm.allium`, `prisma/schema.prisma` or
   `src/models/person.model.ts`, yet a salutation feature is specified on it. A
   different class — a requirement smuggled into a stub — and benign only while that
   spec is aspirational.
3. **`audit-trail.allium`** — `{ user: User }`, with an explicit comment on why no PII
   is mirrored. A *good* stub; needs only a `user` / `user_id` alignment.

## §7 — On the drift inventory and the in-spec tombstones

`docs/w-h1-crm-gdpr-drift-inventory.md` is **preserved, not folded in and deleted.**
The argument for deleting it — "two copies of a finding is the failure mode W-H1
exists to end" — misapplies the principle. That principle governs **live normative
statements that can independently drift**. The inventory is a **dated evidence
record**: a frozen snapshot of 2026-08-25, which is exactly what it is for. Deleting
the log to avoid duplicating the state removes the ability to audit a GDPR-module
decision after the fact. It should carry a supersession banner pointing here, because
its file:line citations address the pre-flip files.

`crm-gdpr.allium` carries six prose tombstones (`-- NOTE — X was DELETED by W-H1`),
which are the right construct — the W-F1 precedent shows a tombstone demonstrably
prevented a duplicate being re-added. But they need an expiry policy: the file is now
**58% comment lines (579/988)** against 27% for `crm.allium`, i.e. 2.1× its parent's
density.

**Policy adopted here:** a tombstone earns its place only until the reasoning has a
durable home. This ADR is that home. Each tombstone may now be compressed to one line
plus a reference — `-- X was DELETED by W-H1; see ADR-041. Do not re-add.` The ADR
holds the single durable copy; the tombstone becomes a pointer. This applies the
change set's own "one home per fact" discipline to its own commentary.

## Related

- ADR-037 — GDPR consent withdrawal & processing-restriction enforcement
- `docs/wh1-independent-assessment.md` — independent review; §2 (checker blind spot),
  §5 (`ConsentBlockedRecordIsProcessingRestricted` tautology), §6 (`deferred` is the
  wrong construct), §8 (the two parked GDPR decisions), §9 (remaining stubs)
- `docs/w-h1-crm-gdpr-drift-inventory.md` — dated evidence snapshot
- `docs/handoff-2026-08-24-orphan-prune.md` §11
