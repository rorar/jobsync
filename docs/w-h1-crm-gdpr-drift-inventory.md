# W-H1 — drift inventory: `crm-gdpr.allium` against `crm.allium` and the code

**Date:** 2026-08-25 · **Branch:** `spec/w-h1-crm-gdpr-dependency-flip`
**Baseline before any change:** `allium check specs/` → **0 errors, 303 warnings**.

This is the inventory the handoff (`docs/handoff-2026-08-24-orphan-prune.md` §8.1) asked for
*before* rewriting anything. It exists because the recommended fix — flipping the dependency
direction — deletes twelve `external entity` stubs, and every rule written against a stale stub
shape has to be re-read against the real one. The inventory is the list of those re-reads.

Every claim below was checked against source; file:line is given so it can be re-checked.

---

## 0. Summary

`crm-gdpr.allium` (661 lines, 14 rules, 8 invariants, 12 stubs) declares its own copies of CRM
entities rather than importing them. Since `crm.allium` landed in Welle 3, the copies have drifted.
The drift is not one thing; it is four things with different severities:

| Class | Count | Worst instance |
|---|---|---|
| **Contradiction** — two specs prescribe opposite outcomes | 1 | `ExpireAutoCreatedContacts` erases; `ExpireAutoCreatedPersons` archives. Code archives. |
| **Duplication** — same property specified twice, currently agreeing | 6 | `AutoCreatedContactHasRetention` vs `Person.AutoCreatedHasRetention` |
| **Stale shape** — stub references fields that no longer exist | 3 | Art. 15 DSAR payload built from `person.job_title`, `person.city` |
| **Dead declaration** — declared, never referenced | 1 | `PersonGdprExtension.erasure_requested_at` |

**The mechanism is the stub, and it has already been patched twice without being removed:**

- **W-F1 (2026-08-17)** deduplicated `BlocklistSuppressesAutoCreation`. Its surviving comment
  (`crm-gdpr.allium:637-643`) records that the two copies *"diverged into opposite enforcement
  models (retroactive vs creation-time) before anyone noticed."*
- **W-E6** found `timeline_retention` declared in both specs and resolved it with a comment
  (`crm.allium:449` — *"kept here for reference only and is not consumed by a rule in this
  module"*) rather than a single owner.

Each patch fixed one copy. Neither removed the copying. The contradiction in §2 is the third
occurrence.

---

## 1. Is the flip even possible? — three blockers checked, none real

**1a. The import cycle is not real.** `crm.allium:21` has `use "./crm-gdpr.allium" as gdpr`. It
looks like it blocks `crm-gdpr` importing `crm`. It does not: that alias has **zero** qualified
references in the file. Nor do the other four:

```
$ for p in gdpr workflow events shared notifications; do grep -c "\b$p/" specs/crm.allium; done
0 0 0 0 0
```

Every cross-spec link in `crm.allium` is a prose comment. All five `use` lines are decorative.
Dropping line 21 costs nothing and clears the cycle.

**1b. Qualified cross-spec references work, and are already in production use.** This was the real
risk — a feature with zero uses repo-wide might be unsupported. It is not:
`inside-track.allium` (which already does `use "./crm.allium" as crm`) references `crm/Person`
(`:92,105,106,137,213,219`), `crm/ActorType` (`:155`), `crm/CompanyAssociation` (`:700`), and even
uses one in a trigger: `when: person: crm/Person.status transitions_to anonymized` (`:565`).
So the target pattern is proven in this repo, on this toolchain (allium 3.2.3), against this very
entity.

**1c. `crm-gdpr.allium`'s own header already prescribes the fix** (`:24-26`):

> *"Dependencies: CRM entities from future crm.allium (currently documented in
> reference-twenty-crm.allium). Once crm.allium exists, replace external entities with:
> `use "./crm.allium" as crm`"*

`crm.allium` has existed since Welle 3. This is not a new proposal; it is an unexecuted instruction.

---

## 2. The contradiction — retention expiry (**the only finding with runtime stakes**)

Same trigger, same subject, opposite outcome:

| | `crm-gdpr.allium:452` `ExpireAutoCreatedContacts` | `crm.allium:767` `ExpireAutoCreatedPersons` |
|---|---|---|
| Trigger | `RunRetentionCleanup()` | `person.retention_expires_at <= now` |
| Guard | `is_auto_created and is_retention_expired and not is_anonymized` | `status = active and is_auto_created` |
| Outcome | creates an **erasure** `DataSubjectRequest` → anonymized (**terminal, irreversible**) | `status = archived` (**reversible**) + `ReminderTriggered` |

**The code archives.** `src/lib/scheduler/crm-cron.ts:57` selects `retentionExpiresAt: { lte: now }`
and `:71` writes `data: { status: "archived" }`, `:79` a timeline entry with
`reason: "retention_expired"`, `:89` the reminder. It matches `crm.allium` exactly and contradicts
`crm-gdpr.allium` exactly.

This is the finding that justifies the work. A reader who consults the GDPR spec — the natural place
to look for a retention answer — is told that expiry irreversibly erases contacts. It does not.
`allium check` cannot see it: one spec talks about `Person`, the other about `PersonGdprExtension`.

**Resolution:** `crm.allium` is sole owner. Delete `ExpireAutoCreatedContacts`; leave a pointer.

---

## 3. Duplications — same property, two homes

| # | `crm-gdpr.allium` | `crm.allium` | Agree today? | Owner |
|---|---|---|---|---|
| 3.1 | `rule FulfillErasureRequest` `:283` | `rule AnonymizePerson` `:623` | yes, but crm's is richer (`created_by`/`updated_by` scrub, blocklist cleanup, `ContactDeleted` event) | **crm** |
| 3.2 | `rule AutoCreatedContactMinimization` `:516` | `rule AutoCreatePersonFromEmail` `:544` | yes | **crm** |
| 3.3 | `rule ManuallyCreatedContactMetadata` `:531` | `rule CreatePerson` `:473` | yes | **crm** |
| 3.4 | `invariant AutoCreatedContactHasRetention` `:591` | `Person.AutoCreatedHasRetention` `:283` | yes | **crm** (on the entity) |
| 3.5 | `enum DataSource` `:60` | `enum DataSource` `:163` | **NO** — see §4.3 | **crm** |
| 3.6 | `enum ProcessingBasis` `:76` / `enum BlocklistType` `:67` | `:178` / `:218` | yes | **crm** |
| 3.7 | `config auto_created_contact_retention = 730.days` | `config auto_created_retention = 730.days` | yes | **crm** |
| 3.8 | `config timeline_retention = 1095.days` | same, `:` annotated by W-E6 as reference-only | yes | **gdpr** (owns the rule) |

3.1 needs care: `FulfillErasureRequest` is not purely redundant. It is the *DSR-wrapper* form — it
sets `request.status`, `request.completed_at` and builds an `ErasureResult` — and it covers three
entities `crm.allium` does not model (§5). It should **delegate** the person-anonymisation half to
`crm/AnonymizePerson` rather than restate it. `crm.allium:675` already points the other way in
`@guidance` (*"Implementation should also anonymize MessageParticipant and
CalendarEventParticipant per crm-gdpr.allium"*), so the two halves are already understood as
complementary — just not expressed that way.

`ImportedContactMetadata` (`:545`) has **no** `crm.allium` counterpart: there is no import rule.
`imported` is a live `DataSource` value in code (`src/models/person.model.ts:97`,
`ContactsPageClient.tsx:59,227`) but nothing creates it. It is an orphan rule for an unbuilt path —
keep, mark aspirational.

---

## 4. Stale shapes — the stub vs the real entity

### 4.1 `external entity Person` (`crm-gdpr.allium:35-42`)

| stub field | real `crm/Person` (`crm.allium:236`) | Prisma (`schema.prisma:1025`) |
|---|---|---|
| `name: String?` | `name: FullName` | `firstName` + `lastName` |
| `emails: List<String>` | `emails: List<TypedEmail>` | JSON `TypedEmail[]` |
| `phones: List<String>` | `phones: List<TypedPhone>` | JSON `TypedPhone[]` |
| `job_title: String?` | **gone** — `headline` (Welle 3, Kette B) | `headline` |
| `city: String?` | **gone** — `address: Address?` | `addressCity`, … |
| `created_at` | `created_at` | `createdAt` |
| — | missing from stub: `user_id`, `status`, `social_profiles`, `avatar_url`, `companies`, `data_source`, `processing_basis`, `retention_expires_at`, `created_by`, `updated_by` | |

**This is not cosmetic.** `crm-gdpr.allium:262-263` and `:431-432` build the **Art. 15 access** and
**Art. 20 portability** payloads from `person.job_title` and `person.city`. The implementation moved
on without the spec: `src/lib/export/collect-user-data.ts` exports `headline`, `companies`,
`socialProfiles`. The spec describes an export that cannot be produced.

The missing `user_id` is the **mechanical cause of W-H1**: no ownership field on the stub → no
ownership predicate available → no actor can be tied to it → no surface can be declared.

### 4.2 `entity PersonGdprExtension` (`:148`) exists only because of the stub

Its own comment says so (`:150-153`): *"In implementation: these fields are added directly to the
Person Prisma model. Modeled as a separate entity here because Person is an external entity from
the CRM reference spec."*

Field-by-field, once `Person` is the real one:

| field | disposition |
|---|---|
| `person: Person` | dissolves — the fields move onto `crm/Person` |
| `data_source`, `processing_basis`, `retention_expires_at` | **already on `crm/Person`** (`:253-255`) and in Prisma |
| `consent_withdrawn_at` | **on Prisma (`consentWithdrawnAt`) but MISSING from `crm/Person`** — a real gap this work closes |
| `erasure_requested_at` | **dead**: declared `:158`, referenced nowhere; no Prisma column, no code. Delete. |
| `is_anonymized` | redundant with `crm/Person.status = anonymized` (a modelled terminal state). Referenced at `:460,527,541,555` — all four sites are in rules being deleted or rewritten. |
| `is_retention_expired`, `is_auto_created` | **already derived on `crm/Person`** (`:272-273`) |
| `is_consent_blocked` | keep — moves onto `crm/Person` with `consent_withdrawn_at` |

`invariant EveryPersonHasGdprExtension` (`:563`) is pure artefact: it asserts the join that only
exists because of the split. It disappears with the split.

### 4.3 `enum DataSource` is stale in a way that breaks a documented plan

`crm-gdpr:60` has three values: `manual | auto_created | imported`.
`crm.allium:163` has four: `manual | auto_created | imported | quick_capture`.
Code has four (`src/models/person.model.ts:97`).

`quick_capture` appears **zero times** in `crm-gdpr.allium`. Every GDPR rule and invariant that
switches on `data_source` is therefore blind to a live provenance value.

And `crm.allium:1749` — an open question added in this very work stream — says:

> *"a quick_capture Person today gets no `retention_expires_at` and never auto-archives … **Decide in
> crm-gdpr.allium** before quick-capture volume accumulates"*

The spec it defers to cannot express the value it is deferring about. This alone would force the
migration eventually.

---

## 5. Stubs that must STAY external (the flip is not "delete all twelve")

The handoff said "delete the 12 stubs". Checked: **eight** map onto `crm.allium`, one maps under a
different name, and **three must stay** — deleting them would be wrong.

| stub | real home | action |
|---|---|---|
| `Person` `:35` | `crm/Person` | replace |
| `Note` `:44` | `crm/Note` `:359` | replace |
| `Task` `:45` | `crm/Task` `:320` | replace |
| `NoteTarget` `:46` | `crm/NoteTarget` `:372` | replace |
| `TaskTarget` `:47` | `crm/TaskTarget` `:350` | replace |
| `JobContact` `:48` | `crm/JobContact` `:381` | replace |
| `Interview` `:49` | `crm/Interview` `:288` | replace |
| `Blocklist` `:53` | `crm/Blocklist` `:412` | replace |
| `TimelineActivity` `:50` | `crm/ActivityLog` `:397` — **renamed**, same concept | replace + rename |
| `MessageParticipant` `:51` | nowhere in JobSync's own specs — only `reference-twenty-crm.allium:483`; no Prisma model; `communication-connector.allium` is deferred | **keep external** |
| `CalendarEventParticipant` `:52` | same as above (`reference-twenty-crm.allium:562`) | **keep external** |
| `Attachment` `:54` | **name collision, not a match.** `application-documents.allium:229` `Attachment` belongs to an `ApplicationBundle` and has no `target_person`. The CRM attachment (`reference-twenty-crm.allium:586`) has no Prisma model. | **keep external** |

The three survivors are honest externals: they describe an integration that does not exist yet. That
is what `external entity` is *for*. The other nine were copies of things that do exist.

---

## 6. What closes W-H1

W-H1: `WithdrawConsent` / `ReinstateConsent` are invoked from `PersonDetailClient.tsx:140,150` yet
`crm-gdpr.allium` declares **0 actors and 0 surfaces** (verified: `grep -c "^surface\|^actor"` → 0).

The chain is mechanical, and every link is a consequence of the stub:

```
stub Person has no user_id
  → no ownership predicate
  → no actor can be identified against it
  → no surface can be declared
  → two Art. 7(3) actions exist at no declared boundary
```

Once `crm/Person` is the referenced entity, `crm/CrmUser` (`crm.allium:1390`, `identified_by: User`)
is available, and a `ConsentManagement` surface can be declared. **W-H1 closes as a by-product** —
which is the argument for doing the flip rather than bolting a surface onto the stub.

---

## 7. Order of work

1. Drop `crm.allium:21` (`use "./crm-gdpr.allium" as gdpr`) — unused, and would otherwise cycle.
2. Add `consent_withdrawn_at` + `is_consent_blocked` to `crm/Person`; keep the Art. 7(3) rationale.
3. `crm-gdpr.allium`: `use "./crm.allium" as crm`; replace the nine stubs; keep three.
4. Dissolve `PersonGdprExtension`; drop `erasure_requested_at`; map `is_anonymized` → `status`.
5. Delete duplicated enums and config; point at `crm/…`.
6. Delete `ExpireAutoCreatedContacts` (§2) and the duplicated metadata rules (§3.2, §3.3, §3.4).
7. Rewrite `FulfillErasureRequest` to delegate to `crm/AnonymizePerson` and own only the DSR wrapper
   plus the three external-entity cascades.
8. Fix the Art. 15 / Art. 20 payloads: `job_title` → `headline`, `city` → `address`, add what
   `collect-user-data.ts` actually exports.
9. Declare `actor` + `surface ConsentManagement` → close W-H1's open question.
10. Re-check: `allium check specs/` must stay at 0 errors; warnings should **fall**, not rise.

**Not in scope:** `DataSubjectRequest` has no Prisma model and no code
(`grep -rn "DataSubjectRequest" src/` → nothing). Seven of the fourteen rules describe an unbuilt
DSR workflow. That is a legitimate aspirational spec — it stays, but it should say so, so the next
reader does not go looking for the table.
