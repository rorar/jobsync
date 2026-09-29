# WH-B3 — Retention-Expiry of Auto-Created Persons: Compliance Analysis & Recommendation

**Status:** COMPLETE — all claims verified at source; no spec or source file modified.
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

### V2 — The arithmetic of the log copy (verified)

| Constant | Value | Site |
|---|---|---|
| `CRM_CONFIG.autoCreatedRetentionDays` | **730** (2 y) | `src/models/person.model.ts:342` |
| `CRM_CONFIG.timelineRetentionDays` | **1095** (3 y) | `src/models/person.model.ts:343` |

`retention-cron.ts:201 purgeOldCrmActivityLogs` prunes on the timeline clock, keyed on
`happenedAt`. The archival log row is *created* at expiry, so its `happenedAt` is `T+730`.
Its own purge therefore lands at **`T+730+1095` = `T+1825` days ≈ 5 years** after the
Person was auto-created — where `T+730` was supposed to be the end of the retention
period. **Retention expiry currently lengthens the identifier's lifetime by 1095 days
rather than ending it.** That is the sharpest statement of the defect and it is arithmetic,
not judgement.

### V3 — The capability to fix the log copy already exists, unused by this path

`anonymizePerson` (`src/actions/person.actions.ts:542`) already performs exactly the
required scrub at `src/actions/person.actions.ts:641-644`:

```ts
prisma.crmActivityLog.updateMany({
  where: { targetPersonId: personId, userId: user.id },
  data: { targetPersonId: null, details: null, linkedRecordName: null },
}),
```

matching `specs/crm.allium:688-693` (`for al in person.timeline_activities: al.target_person = null; al.details = null; al.linked_record_name = null`). So the erasure path handles all
three PII carriers on the timeline. The retention path simply never calls it. This is a
**wiring gap, not a missing capability** — which materially changes the cost of the options
below.

**Correction to V2 (verified at source):** the purge clock is
`RETENTION_CONFIG.crmActivityLogRetentionDays = 1095` (`src/lib/scheduler/retention-config.ts:8`),
read at `src/lib/scheduler/retention-cron.ts:202`, keyed on `happenedAt`
(`retention-cron.ts:203-205`). `CRM_CONFIG.timelineRetentionDays = 1095`
(`src/models/person.model.ts:343`) is a **second, independent copy of the same number that
nothing in the cron path reads**. The arithmetic (T+1825) is unchanged, but the duplicated
constant is a latent drift risk worth folding into whatever change lands here: if a future
edit shortens one, the other silently disagrees.

Also note `retention-cron.ts:203` is a **hard `deleteMany`**, with no `userId` filter (a
global cron sweep). This is directly relevant to open decision #1 below — the *code's*
answer to timeline retention is "hard delete after 1095 days", which is not what either
spec says.

### V4 — Crucial history: the compliant answer was written down, and was deleted as drift 1 day ago

`specs/crm-gdpr.allium:588-605` is a W-H1 tombstone. Verbatim substance:

> `rule ExpireAutoCreatedContacts` was DELETED by W-H1 (2026-08-25). `crm.allium rule
> ExpireAutoCreatedPersons` is the SOLE OWNER of auto-created retention expiry. The rule
> deleted here CONTRADICTED it outright: on the same trigger and the same subject, this
> module said expiry **raises an erasure `DataSubjectRequest` and ends in `anonymized`
> (terminal, irreversible)**, while `crm.allium` says `archived` (reversible) plus
> `ReminderTriggered`. The code archives […] That matches `crm.allium` exactly.

**This reframes WH-B3.** The GDPR module already contained the erasure-on-expiry rule.
W-H1 correctly identified a contradiction and correctly established single ownership — but
it resolved the contradiction **toward the code**, on the (sound, spec-hygiene) ground that
the code and `crm.allium` agreed with each other. Nobody at that moment asked which of the
two positions was *lawful*. WH-B3 is the bill for that: the deletion removed the only
written statement that retention expiry must erase.

I want to be plain about what this does and does not mean. W-H1 was not wrong to delete the
duplicate — two owners of one rule is exactly the failure it existed to end. It was wrong
only in that a *normative* question got settled by a *hygiene* criterion. The right repair
is therefore **not** to restore the deleted rule in `crm-gdpr.allium` (that would recreate
the two-owner defect W-H1 just fixed), but to strengthen the surviving sole owner in
`crm.allium`. That constraint shapes the implementation sketch in §4 below.

### V5 — Open decision #1 verified in all three places (I am NOT resolving it)

Timeline-activity retention has three written answers over the **same subject and the same
1095-day window**:

| Source | Outcome | Site |
|---|---|---|
| `crm-gdpr.allium` `ExpireOldTimelineActivities` | anonymise in place: `ta.target_person = null` | `specs/crm-gdpr.allium:608-637` (rule body at `:629-632`) |
| `gdpr-data-rights.allium` `PurgeOldCrmActivityLogs` | hard delete: `not exists cal` | `specs/gdpr-data-rights.allium:443` |
| Implementation | hard delete | `src/lib/scheduler/retention-cron.ts:201-207` (`prisma.crmActivityLog.deleteMany`, `:203`) |

Both specs already carry explicit "CONTRADICTION — UNRESOLVED" tombstones naming each other
(`crm-gdpr.allium:611-627`, `gdpr-data-rights.allium:453-457`). This is a live, known,
deliberately-parked decision. **My recommendation must not depend on which way it goes** —
see §5.

Note also that `1095` now exists in **three** places: `retention-config.ts:8` (the one the
cron reads), `person.model.ts:343` (read by nothing in the cron path), and
`crm-gdpr.allium:277` `timeline_retention: Duration = 1095.days`.

### V6 — The Art. 15 export emits retention-expired Persons (verified)

`src/lib/export/collect-user-data.ts:293-294`:

```ts
db.person.findMany({
  where: { userId },
```

**No `status` filter.** So an archived, retention-expired Person is selected and its
`firstName`, `lastName`, `emails`, `phones` are written into the export
(`collect-user-data.ts:295-305`, parsed at `:548`). Two consequences:

1. This is the same *shape* as OP-B3 (`docs/BUGS.md:30`), which this project already
   classified **HIGH** on exactly the reasoning "unreachable in the UI — but the Art. 15
   export emits it."
2. More importantly for the compliance argument in §1: it proves the expired data is not
   dormant. It is **actively processed** — read, parsed, serialised, and disclosed — by a
   live code path, and each such export additionally writes a `person.pii_read` audit row
   per exported Person (`collect-user-data.ts:534-545`). "We merely still hold it" is not
   an available defence.

### V7 — `archived` is a filter facet, not a restriction of processing (verified)

This is the fact that decides §1, and it was not in the bug report.

- **Archived Persons remain listed.** `getPersons` (`src/actions/person.actions.ts:225`)
  builds `where = { userId }` and applies a status filter **only if the caller passes one**
  (`:240-241`). The Contacts page defaults `statusFilter` to `"all"`
  (`src/app/dashboard/contacts/ContactsPageClient.tsx:75`) and maps `"all"` to `undefined`
  (`:112`). Default view therefore includes archived records.
- **Archived Persons remain name-searchable.** The same action's search arm
  (`person.actions.ts:249-257`) matches `firstName`, `lastName`, `emails`, `headline`,
  `companies` — with no status exclusion.
- **Archiving is freely reversible by the user.** `archivePerson` writes
  `{ status: "archived" }` (`person.actions.ts:415-421`); `restorePerson` writes
  `{ status: "active" }` (`:445`).
- **Archived Persons are exported** — V6.

So `archived` in JobSync restricts **nothing**. It is a UI label with a reversible toggle.
Calling it a retention outcome is a category error: under Art. 4(2) the record is still
being *processed* (stored, consulted, searched, disclosed by export) after the controller's
own declared retention period ended.

### V8 — Both target transitions are already legal; neither option needs a state-machine change

`specs/crm.allium:297-303`:
```
transitions status {
    active -> archived
    active -> anonymized
    archived -> active
    archived -> anonymized
    terminal: anonymized
}
```
mirrored exactly in `src/models/person.model.ts:178-182`
(`active: ["archived","anonymized"]`, `archived: ["active","anonymized"]`, `anonymized: []`).

And the trigger guard `AnonymizePerson(user, person) when person.status != anonymized`
(`specs/crm.allium:1618-1619`) **already admits an archived Person**. The erasure cascade is
reachable from both `active` and `archived` today. Options (a) and (b) are therefore both
pure wiring; neither requires touching the state machine, the transition table, or the
trigger guard.


---

## 1. Is the current behaviour actually non-compliant?

**Yes — and the strongest formulation of why is also the least contestable one.** But the
household-exemption question genuinely does not need to be answered to get there, and I
will show that first, because it makes the conclusion robust against the one legal
question this project has deliberately left open.

### 1.1 The argument that does not depend on the household exemption

The controller has **declared a retention period and then not enforced it**.

- `Person.retentionExpiresAt` exists and is populated for auto-created contacts —
  `crm.allium` invariant `AutoCreatedHasRetention` (`specs/crm.allium:305`),
  `CRM_CONFIG.autoCreatedRetentionDays = 730` (`src/models/person.model.ts:342`).
- The enforcement job runs, finds the expired records, and **does nothing that reduces
  identifiability** (`src/lib/scheduler/crm-cron.ts:52-98`; V1, V7).
- It then **writes a fresh copy of the name** with a new 1095-day clock
  (`crm-cron.ts:80`; V1b, V2).

This is a failure of **Art. 5(2) accountability** before it is anything else: the controller
cannot demonstrate compliance with a policy the system never executes, and the artefact
that was supposed to be the evidence of enforcement is instead evidence of extension. It
is *also* Art. 5(1)(e) storage limitation, but note that the accountability framing does
not require agreeing that 730 days is the right number, or that the GDPR applies at all in
a given deployment. **The system is inconsistent with its own written policy.** No reading
of Art. 2(2)(c) repairs that.

### 1.2 Is there a defensible reading where it is fine? Four candidates, all fail.

**(i) "The household exemption applies (Art. 2(2)(c)), so none of this binds."**
Not available, for three independent reasons.

*Legally*, the exemption is construed narrowly and covers processing "by a natural person in
the course of a purely personal or household activity". Recital 18's examples are
"correspondence and the holding of addresses" and personal social networking. A structured
database of professional counterparties — recruiters, hiring managers, referrers — kept to
advance an **economic objective** (obtaining employment), populated by **automated
indirect collection** (auto-creation from email sync), and subjected to automated
enrichment, reminders and AI matching, is a long way from "holding of addresses". The
CJEU's line (Lindqvist C-101/01, Ryneš C-212/13, Buivids C-345/17) has consistently pushed
back on expansive readings, and Ryneš in particular holds that once the processing reaches
beyond the private sphere the exemption falls away — which auto-collection of third-party
professional contacts plainly does.

*Structurally*, Recital 18 second sentence: the Regulation **applies to those who provide
the means** for personal/household processing. JobSync is distributed software. Even in the
deployments where the operator is exempt, the software should be built compliant — and it
cannot know at build time which deployments those are.

*Project-internally, and decisively*: `specs/crm-gdpr.allium:23-25` declares
**"Legal basis: Art. 6(1)(f) DSGVO — Berechtigtes Interesse (Legitimate Interest)"**.
Invoking an Art. 6 basis is only meaningful if the Regulation applies. The project has
already taken the position, in its own authoritative spec, that it does. You cannot claim
legitimate interest for the features you want and the household exemption for the
obligations you don't. Note also that the very same header says
**"single-user/small-team"** (`:24`) — "small-team" is already outside "a natural person …
purely personal", and multi-user deployment is a first-class supported mode
(`ADMIN_USER_IDS`, `src/lib/auth/admin.ts`, CLAUDE.md § Admin Authorization Tiered Rule).

**(ii) "Art. 5(1)(e) permits longer storage for archiving purposes."**
The proviso is limited to "archiving purposes **in the public interest**, scientific or
historical research purposes or statistical purposes". A personal job-search CRM is none of
these. The word `archived` in the codebase has no relationship to the word "archiving" in
Art. 5(1)(e). This coincidence is worth stating explicitly because it is exactly the kind of
thing that gets mistaken for a justification later.

**(iii) "It's archived, therefore processing is restricted (Art. 18)."**
Falsified at source — V7. Archived Persons are listed by default
(`ContactsPageClient.tsx:75,112` + `person.actions.ts:240-241`), are name/email-searchable
(`person.actions.ts:249-257`), are exported (`collect-user-data.ts:293-294`), and can be
un-archived with one click (`person.actions.ts:445`). Art. 18(2) restriction means stored
only, plus narrow exceptions. `archived` restricts nothing.

**(iv) "Legitimate interest genuinely continues past 730 days — a recruiter contact may
matter again in year three."**
This is the only candidate with real force, and it is a good argument — **against the
current value of the constant, not against enforcing it.** Art. 5(1)(e) does not mandate
any particular period; it forbids keeping data longer than necessary. If the interest is
genuinely open-ended, the correct response is to change the necessity criterion (see
option (e) below), not to leave a declared boundary unenforced. As written, the system gets
the worst of both: it asserts a boundary (so it cannot claim the interest is open-ended)
and ignores it (so it cannot claim enforcement).

Additionally, auto-created contacts are obtained **indirectly** — the data subject never
volunteered them. Art. 14 applies, and the Art. 6(1)(f) balancing test is correspondingly
less favourable to the controller: a subject who does not know they are in the database
cannot object, which weighs against indefinite retention. (`crm-gdpr.allium:975` parks the
Art. 14 notification question separately; I am not resolving it, but its existence is a
reminder that this is the *indirect-collection* branch.)

### 1.3 Conclusion

Non-compliant. The cleanest statement, which I recommend using in `docs/BUGS.md` and in any
spec comment, is:

> The retention job does not enforce the retention policy it exists to enforce, and the
> record it writes to evidence enforcement restarts a longer clock on the identifier it
> was supposed to retire.

That formulation is verifiable arithmetic (V2), survives any answer to the household
question, and does not commit the project to a view on what the right retention period is.


---

### 1.4 CORRECTION TO THE SEVERITY FRAMING — the defect is latent, not live

I have to flag this plainly, because this project has already been burned once by exactly
this (`docs/BUGS.md:19-23` records OP-B3's original present-tense framing being wrong for
the same reason).

**No production code path writes `dataSource = "auto_created"`, and no production code path
ever writes `retentionExpiresAt`.** Verified exhaustively:

| Symbol | Every production write site | Verdict |
|---|---|---|
| `Person.dataSource` | `src/actions/person.actions.ts:168` — hardcoded `"manual"` | the *only* writer |
| `Person.retentionExpiresAt` | **none** | read at `crm-cron.ts:57`, `collect-user-data.ts:308`, displayed at `PersonDetailClient.tsx:431-434`; written only in `src/lib/data/testFixtures.ts:1397,1445` |
| `auto_created` as a value | `crm-cron.ts:56` (a *read* filter); `testFixtures.ts:1443-1444` | never written in production |
| `quick_capture` / `imported` | none (enum members + UI filter options only: `person.model.ts:97`, `ContactsPageClient.tsx:226-228`) | never written |

The Prisma column defaults are `dataSource @default("manual")` and
`retentionExpiresAt DateTime?` (`prisma/schema.prisma:1061,1063`), so rows created by any
other route still land as `manual` with a null expiry.

**Consequences, in both directions:**

1. **Down:** `expireAutoCreatedPersons` (`crm-cron.ts:52-98`) cannot match a row in any real
   deployment. Its `findMany` requires `dataSource: "auto_created"` **and**
   `retentionExpiresAt <= now`, and neither is ever set. The invariant
   `AutoCreatedHasRetention` (`crm.allium:305`) is vacuously satisfied. So there is **no
   present-tense population of retention-expired contacts retaining identifiers**, and the
   `linkedRecordName` clock-extension of V1b/V2 also cannot fire today. The bug report's
   present tense ("an archived, retention-expired contact keeps name/emails/phones
   indefinitely") describes something that currently cannot happen. **BUGS.md should be
   corrected to past-conditional / latent, exactly as OP-B3 was.** I would not reduce the
   severity much — see (2) — but the *tense* is wrong and, in this project, wrong tense is
   a tracked defect class in its own right.

2. **Up:** this is the **cheapest possible moment to fix it, and the last cheap one.** The
   producing feature is the Communication Connector / email sync (ROADMAP 1.12,
   `docs/ROADMAP.md:988`), which is unbuilt; `crm/AutoCreatePersonFromEmail` exists only as
   a spec rule referenced from `crm-gdpr.allium:281,302,710,726,883`. Fixing the semantics
   now costs **zero migration, zero backfill, zero user-visible change** — there is no data
   to endanger and no behaviour to regress. Fixing it after auto-creation ships means
   retro-fitting an erasure onto a live population, which is precisely the "data-minimisation
   judgement made after the fact" that `crm.allium:1858` and `crm-gdpr.allium:983` warn
   against for the sibling `quick_capture` question.

This reframing matters for the options below: **option (a)'s single real drawback —
irreversible cron-driven erasure of records a user might still want — has no existing
dataset to endanger.** That materially strengthens it relative to option (b), whose whole
justification is a grace period protecting data that does not yet exist.


---

## 2. The options, weighed against "completely compliant AND most flexible/durable"

Two facts from §1.4 and the verification log govern every row below:

- **F1.** Any fix that does not remove the `linkedRecordName` copy at `crm-cron.ts:80` is
  incomplete (the team lead's escalation; V1b/V2).
- **F2.** There is no production data at stake (§1.4), so "protects the user's existing
  contacts" carries much less weight than it would normally, while "gets the semantics
  right before the producing feature is built" carries much more.

A third fact, discovered while sketching the implementation, changes the arithmetic in
option (a)'s favour and is stated once here because every row references it:

- **F3.** The de-identified audit row that a compliant expiry needs **already exists and
  already fires automatically.** `AnonymizePerson` emits `ContactDeleted`
  (`specs/crm.allium:711`); the CRM activity logger projects it at
  `src/lib/events/consumers/crm-activity-logger.ts:226-238` as
  `{ targetPersonId: null, details: {reason}, linkedRecordName: null }` — PII-free by
  construction. So the correct audit artefact for a retention erasure is produced as a
  side-effect of using the existing cascade, and the offending `linkedRecordName` write is
  **deleted, not replaced**.

### (a) Anonymise on expiry, via the existing `AnonymizePerson` cascade

| Dimension | Assessment |
|---|---|
| **Compliance** | **Complete.** Art. 5(1)(e) enforced at the declared boundary; Art. 17 pattern reused verbatim; Art. 5(2) accountability satisfied by the PII-free `contact_deleted` row (F3). Tombstone doctrine (`crm-gdpr.allium` CRITICAL PATTERN, `:446`) preserved. |
| **F1 (log copy)** | **Fully resolved, by deletion.** The `retention_expired` log write (`crm-cron.ts:73-81`) goes away entirely; the cascade's own `crmActivityLog.updateMany({ targetPersonId: null, details: null, linkedRecordName: null })` (`person.actions.ts:641-644`) scrubs any *prior* timeline rows naming the person, and F3 supplies the replacement audit row. Net: **fewer lines than today.** |
| **Flexibility** | Moderate–high. One constant (`autoCreatedRetentionDays`), one rule, one owner. Nothing new to keep in sync. Low flexibility in the narrow sense that expiry is a single hard cliff — mitigated by (e) below. |
| **Reversibility** | None past the cliff (`anonymized` is terminal, `crm.allium:302`). Before it: full — the user can edit, promote, or manually retain. |
| **Cost to the user** | Today: **zero** (F2). After ROADMAP 1.12 ships: a contact auto-created 2 years ago that the user never touched is erased without a second chance. This is the option's only real weakness, and it is what (e) fixes. |
| **Audit trail** | Preserved and *improved*: a PII-free, permanent `contact_deleted` row replaces a PII-bearing `reminder_triggered` row. |

### (b) Two-stage — expiry → `archived` (unchanged), then a longer-dated `archived → anonymized` sweep

| Dimension | Assessment |
|---|---|
| **Compliance** | **Conditionally complete, and the condition is expensive.** A second retention window needs its own necessity justification. The only defensible one is "stage 1 is a *restriction of processing* and a grace period for the controller to intervene" — but that framing is only true if `archived` actually restricts. Today it restricts **nothing** (V7). So (b) is compliant only if it *also* ships: exclusion of archived Persons from the default list (`ContactsPageClient.tsx:75,112`), from search (`person.actions.ts:249-257`), and from the Art. 15 export (`collect-user-data.ts:293`) — the last of which collides head-on with open decision #2. Without that work, (b) is (d) with extra steps. |
| **F1 (log copy)** | Requires **two** fixes: stop writing `linkedRecordName` at stage 1 (`crm-cron.ts:80`) *and* scrub at stage 2. Strictly more work than (a). |
| **Flexibility** | Highest in the naive sense — two tunable knobs. But see durability. |
| **Reversibility** | Best: a real window in which the user can rescue a record. |
| **Cost to the user** | Lowest — if the grace period is surfaced. If it isn't, it is identical to (a) but slower. |
| **Audit trail** | Same tombstone endpoint, plus one extra intermediate event. |
| **Durability — the decisive objection** | It adds a **second retention constant** and a **second sweep** over the same subject. This project's entire recent history is duplicated normative statements drifting apart: W-H1 (two owners of retention expiry, opposite outcomes), the still-unresolved three-way timeline contradiction (V5), and `1095` living in three places (`retention-config.ts:8`, `person.model.ts:343`, `crm-gdpr.allium:277`). Adding a second retention number to *this* codebase is adding fuel to the specific fire it has been fighting for a month. It also re-opens the settled ownership question: which spec owns stage 2? |

### (c) Hard delete on expiry

| Dimension | Assessment |
|---|---|
| **Compliance** | Satisfies Art. 5(1)(e)/17 on its face, but **defeats itself in operation.** With the row gone, nothing records that this contact was retired — so the next email from the same address re-creates the Person and restarts a fresh 730-day clock, indefinitely. That is a *worse* storage-limitation outcome than the status quo, achieved with more code. |
| **F1 (log copy)** | Would still need explicit handling — deleting the Person does not delete the `CrmActivityLog` row that names them (no FK cascade covers `linkedRecordName`, which is a denormalised string). Easy to overlook precisely because "delete" feels total. |
| **Flexibility / reversibility** | Lowest and none. |
| **Audit trail** | Destroyed. Directly contradicts the project's stated CRITICAL PATTERN (`crm-gdpr.allium:446`, "anonymize participants, do NOT delete") and the blocklist mechanism, whose purpose is suppressing re-creation. |
| **Verdict** | **Rejected** on the project's own doctrine and on the re-creation loop. |

### (d) Document "archived retention is indefinite by design"

| Dimension | Assessment |
|---|---|
| **Compliance** | **Not available**, and not fixable by documentation. To be internally coherent it would require *removing* `retentionExpiresAt` (`schema.prisma:1063`), the `AutoCreatedHasRetention` invariant (`crm.allium:305`), the `is_retention_expired` derived field (`crm.allium:290`), and `ExpireAutoCreatedPersons` itself — and then justifying indefinite retention of **indirectly collected** third-party contacts under Art. 6(1)(f). That fails the necessity limb: the balancing test is least favourable exactly where the subject never volunteered the data and does not know they are in the database. |
| **Verdict** | **Rejected.** Note it is not even the cheap option: it is *more* deletion than (a). |

### (e) Make the retention clock a **last-activity** clock (composable with (a) or (b))

Not an alternative to (a)–(d) — a modifier, and the one that carries the flexibility.

Today `retentionExpiresAt` would (once anything wrote it) mean "730 days since we first saw
this email address". The GDPR skill's Pattern 3 models retention on
`'trigger': 'last_activity_date'` for exactly this reason. Re-basing the clock so that any
substantive user interaction with a Person (edit, note, task, interview, JobContact link,
referral link) pushes `retentionExpiresAt` forward — or promotes `dataSource` to `manual` —
makes the period *track necessity* rather than approximate it.

| Dimension | Assessment |
|---|---|
| **Compliance** | **Strongest of any option.** It converts the retention rule from an arbitrary interval into an actual necessity test, which is what Art. 5(1)(e) asks for and what a controller has to be able to articulate under Art. 5(2). |
| **Flexibility** | Highest *where it matters*: the policy adapts per record instead of per deployment. A recruiter you still talk to is never at risk; one you have ignored for two years is exactly the record the balancing test says you should not still hold. |
| **Cost** | One design decision ("what counts as activity?") and a touch-point at each interaction site. Notably it needs **no new constant** — the durability advantage (b) forfeits. |
| **Risk it removes** | It is the specific answer to (a)'s only weakness: the contact a user actually cares about is, by definition, one they have interacted with. |

### (f) User-configurable retention period (layerable on any of the above)

Expose `autoCreatedRetentionDays` as a bounded per-user setting. Maximises operator
flexibility and fits the self-hosted ethos. **Must be bounded** — Art. 5(1)(e) does not
permit "never", so a UI offering unlimited retention re-creates option (d) as a
configuration. Defer: it is additive, changes nothing about the rule's shape, and can land
any time after the semantics are right.


---

## 3. Recommendation

> **Adopt (a) + (e): erase on expiry through the existing `AnonymizePerson` cascade, on a
> last-activity retention clock, with the `status = active` guard widened to
> `{active, archived}` in the same change — and delete the `linkedRecordName` write rather
> than scrubbing it.**
>
> Add a pre-expiry notice (§4.6) as a strongly recommended companion, not as a state.
> Reject (b), (c) and (d). Defer (f).

### Does this invert the earlier pragmatic recommendation?

**Partly, and the part it inverts is the important one.** A pragmatic reading of this
codebase points at (b): it is the smallest diff against the current rule, it keeps
`archived` meaningful-looking, and it never erases anything a user might miss. Under
@rorar's stated criterion it loses on all three counts — its compliance is conditional on
work nobody has scoped (making `archived` actually restrict), its extra constant is the
precise failure mode this project has spent a month removing, and the data it protects does
not exist (§1.4). **The compliant-and-durable answer is the one that removes code.**

### Why this is the most durable compliant option

1. **It is a net deletion.** The archival write and its PII-bearing log row
   (`crm-cron.ts:66-92`) are removed; nothing is added except a call to an existing,
   already-specified, already-tested cascade. Fewer moving parts is the only reliable
   durability mechanism this codebase has demonstrated.
2. **It introduces no second owner and no second constant.** `crm.allium` remains the sole
   owner of retention expiry (the W-H1 settlement stands), `autoCreatedRetentionDays`
   remains the only number, and `crm-gdpr.allium` keeps delegating. Contrast (b), which
   would immediately re-open "which spec owns stage 2?".
3. **The audit artefact is produced automatically and is PII-free by construction** (F3).
   No future edit can accidentally reintroduce the identifier, because the projection at
   `crm-activity-logger.ts:231-236` hardcodes `targetPersonId: null` /
   `linkedRecordName: null`. The current design's fragility is that the name is written by
   a hand-rolled `create` at the call site; the recommended design has no call site.
4. **It survives a change of deployment posture.** Nothing in it depends on
   single-user, on the household exemption, or on legitimate interest surviving the
   balancing test at year three. If JobSync goes multi-user or an organisation adopts it,
   this rule needs no revisiting. (d) collapses on day one; (b)'s grace period needs
   re-justifying.
5. **The last-activity clock makes the period defensible rather than arbitrary**, and does
   so without a settings surface, a migration, or a second sweep.
6. **Timing** (§1.4): zero data, zero migration, and the producing feature (ROADMAP 1.12) is
   unbuilt. This is the last moment the fix is free.

### How it handles the `status = active` guard

The guard at `specs/crm.allium:817` / `src/lib/scheduler/crm-cron.ts:55` must widen to
`{active, archived}` **in the same change**, for the reason the team lead identified: today
the guard is inert because `archived` *is* the post-state, but the moment the post-state
becomes `anonymized`, a leading `status = active` filter silently exempts every
manually-archived record from erasure — creating a *new* indefinite-retention population out
of the fix itself.

Two things make the widening safe and, I would argue, semantically obligatory:

- `anonymized` must stay **excluded** (it is terminal, `crm.allium:302`; and
  `person.actions.ts:551-552` already rejects re-anonymisation). So the guard is
  `status != anonymized`, which is *exactly* the guard the existing `AnonymizePerson`
  trigger already carries at `crm.allium:1618-1619`. **Widening the expiry guard makes it
  identical to the erasure trigger's guard rather than inventing a third predicate** — one
  fewer thing to drift.
- A manually archived contact is a *stronger* signal of "no longer needed" than an active
  one. Exempting it from retention would invert the policy. Correspondingly, under (e),
  archiving must **not** count as retention-extending activity — "I'm done with this" is
  the opposite of "I still need this".

### What I am explicitly not recommending

- Not re-adding `ExpireAutoCreatedContacts` to `crm-gdpr.allium`. The right repair is to
  strengthen the surviving sole owner in `crm.allium`; restoring the deleted rule would
  recreate the two-owner defect W-H1 just removed (V4).
- Not scrubbing the `linkedRecordName` write. **Delete it.** A scrub leaves a write site
  that a future edit can un-scrub; a deletion cannot regress.
- Not changing the Person state machine, the transition table, or the `AnonymizePerson`
  trigger guard — none needs it (V8).


---

## 4. Implementation sketch — the sites, not the code

### 4.1 Spec: `specs/crm.allium` — the sole owner, strengthened

| Site | Change |
|---|---|
| `:813-832` `rule ExpireAutoCreatedPersons` | The rule's identity changes from *archive* to *erase*. Retitle the doc-comment accordingly ("Temporal: auto-archive Persons…" at `:814` is now wrong). |
| `:817` `requires: person.status = active` | → `requires: person.status != anonymized`. Deliberately the **same predicate** as the `AnonymizePerson` trigger at `:1618-1619`, not a third one. |
| `:815` `when: person: Person.retention_expires_at <= now` | Prefer the existing derived field `person.is_retention_expired` (`:290`), which is defined as exactly this and is currently unused. One expression of the condition, not two. |
| `:820-826` the `ensures` block | Replace `person.status = archived` + `ReminderTriggered(reason: retention_expired)` with the `AnonymizePerson` post-state. Two spec-shape choices for the implementer: (i) restate the cascade inline — verbose and a drift risk; (ii) express the rule as *invoking* `AnonymizePerson(system, person)` and let the erasure rule own the post-state. **(ii) is right** and matches how the codebase will be written (§4.3). Note `AnonymizePerson` already records a system actor: `person.updated_by = ActorMetadata(source: system, name: null)` (`:679`). |
| `:827-831` `@guidance` | Rewrite. The W-E4 note ("the implementation also writes a timeline entry … queries as an idempotency guard") describes the row that is being **deleted**. Idempotency after this change is structural: `anonymized` is terminal and the widened guard excludes it, so the rule cannot fire twice on one Person. Say that instead. |
| `:711` `ensures: ContactDeleted(… reason: anonymized)` | Needs a `retention_expired` reason so the audit row distinguishes user-initiated erasure from automatic expiry. Either widen the reason enum at the `AnonymizePerson` site or have the caller supply it. |
| `:305` `invariant AutoCreatedHasRetention` | Unchanged — but under (e) it acquires a companion obligation ("interaction extends `retention_expires_at`"). That is where the last-activity clock is declared. |
| `:1858` `open question` (quick_capture retention) | **Leave open.** The rule keeps its `is_auto_created` guard (`:818`), so `quick_capture` is untouched. Worth one sentence noting that (e) makes that question easier to answer later, since a last-activity clock is a defensible default for both sources. |

### 4.2 Spec: `specs/crm-gdpr.allium` — one tombstone needs correcting, nothing re-added

| Site | Change |
|---|---|
| `:588-605` W-H1 tombstone | Its *reasoning* becomes historically inaccurate the moment `crm.allium` says `anonymized`: it currently reads "this module said expiry … ends in `anonymized` … while `crm.allium` says `archived`". Update it to record that the outcomes have since **converged on `anonymized`**, and that ownership nonetheless remains with `crm.allium`. Without this, the next careful reader concludes the deleted rule was right all along and re-adds it — recreating the exact two-owner defect W-H1 removed. **Do not re-add the rule.** |
| `:975` Art. 14 notification open question | Untouched. |
| `:983` quick_capture open question | Untouched. |
| `:277` `timeline_retention: Duration = 1095.days` | Not part of this change, but see §5.1 — it is one of three copies. |

### 4.3 Code: extract the cascade behind a session-free helper (the one structural change)

`anonymizePerson` is a server action (`src/actions/person.actions.ts:542-744`) that opens
with `getCurrentUser()` (`:544`). **A cron has no session, so the cascade cannot be called
as-is.**

The precedent to copy is exact and already imported by this very cron
(`crm-cron.ts:25`): `src/lib/account/execute-deletion.ts`, whose header
(`:1-12`) reads *"Accepts raw userId (no session required) — called by: … cron rule (no
session). ADR-019: NOT a server action export. Lives in a `server-only` file."*

- **New:** `src/lib/crm/anonymize-person.ts` — `import "server-only"`, signature
  `(userId: string, personId: string, reason)`. Natural home: it sits beside
  `src/lib/crm/orphan-targets.ts`, which the cascade already depends on
  (`person.actions.ts:568,599`).
- **Move:** the body at `person.actions.ts:555-737` — blocklist-handle collection (`:560-565`),
  orphan-candidate collection (`:568-570`), the PII-task id query (`:585-590`), the
  `withOrphanedCrmPrune` transaction (`:593-...`), and the `ContactDeleted` publish
  (`:732-737`).
- **Keep:** `anonymizePerson` as a thin auth wrapper — `getCurrentUser()` (`:544`),
  ownership `findFirst` (`:547-550`), the already-anonymized guard (`:551-552`), then
  delegate. ADR-015 is preserved because the wrapper still supplies `user.id` and the
  helper takes `userId` explicitly (every inner `where` already carries it).
- **ADR-019 note:** the helper must NOT be exported from any `"use server"` file.

### 4.4 Code: `src/lib/scheduler/crm-cron.ts` — the rule becomes shorter

| Site | Change |
|---|---|
| `:51-98` `expireAutoCreatedPersons` | Whole body reshaped. |
| `:55` `status: "active"` | → `status: { not: "anonymized" }`. **This is the guard-widening the fix must not omit.** |
| `:58` `select: { id, userId, firstName, lastName }` | → `select: { id: true, userId: true }`. The names were selected *only* to build the log row; once that row is gone they must not be read. |
| `:66-84` the `$transaction` | Replaced by a call to the §4.3 helper per person. The helper already runs its own transaction, so the loop keeps its per-person `try/catch` (`:65,93-95`) — one failure must not abort the sweep. |
| `:73-81` `crmActivityLog.create({… linkedRecordName: [firstName,lastName].join(" ") })` | **DELETE.** This is F1/V1b. Not scrubbed — deleted. The audit row is supplied automatically by the `ContactDeleted` → `contact_deleted` projection (`crm-activity-logger.ts:226-238`), which is PII-free by construction. |
| `:86-92` `eventBus.publish(ReminderTriggered{reason:"retention_expired"})` | Replaced by the helper's `ContactDeleted{reason:"retention_expired"}`. Decide deliberately whether `ReminderTriggered/retention_expired` survives as the **pre-expiry notice** (§4.6) or is retired — do not leave both live. |

### 4.5 Code: event contract widening (two linked sites, compile-error-coupled)

| Site | Change |
|---|---|
| `src/lib/events/event-types.ts:246` | `reason: "anonymized" \| "merged" \| "deleted"` → add `"retention_expired"`. |
| `src/lib/events/event-schemas.ts:246` | `z.enum([...])` → same addition. These are linked by `satisfies z.ZodType<ContactDeletedPayload>` at `:247`; changing one alone is a **compile error by design** (CLAUDE.md § Domain Events). |
| `src/lib/events/consumers/crm-activity-logger.ts:226-238` | **No change needed** — the projection already emits `details: JSON.stringify({reason: p.reason})` with `targetPersonId: null` and `linkedRecordName: null`. |
| `src/components/crm/activity-format.ts` | Check whether the `contact_deleted` renderer surfaces `reason`; if so, 4 locales in `src/i18n/dictionaries/crm.ts`. |

### 4.6 Code: pre-expiry notice (recommended companion, not required for compliance)

Model it on the sibling rule in the same file — `checkInterviewReminders`
(`crm-cron.ts:151-232`), which fires N hours ahead and uses the documented
activity-log-as-idempotency-guard pattern (`crm-cron.ts:9-10`).

**One trap worth naming in the spec:** the notification body would naturally carry the
person's name, and `Notification` rows persist for 30 days
(`RETENTION_CONFIG.notificationRetentionDays = 30`, `src/lib/scheduler/retention-config.ts:4`)
— so a notice fired 14 days before expiry leaves a named residue until ~16 days *after*
erasure. Bounded and far short of 1095 days, but avoidable at zero cost: use the
late-binding pattern (CLAUDE.md § Notification Late-Binding) with the **personId** in
`titleParams` and resolve the display name at render time. After erasure the tombstone has
no name, so the notification degrades gracefully to an identifier instead of retaining one.
`buildNotificationActions` already deep-links by id
(`__tests__/notification-deep-links.spec.ts:116-134` covers `retention_expired`).

### 4.7 Code: the last-activity clock (option (e))

The write sites that must push `retentionExpiresAt` forward (or promote `dataSource` to
`manual`). **Which of these counts is a design decision, not a mechanical one** — I am
listing candidates, not prescribing:

- `updatePerson` — `src/actions/person.actions.ts` (the update action)
- `addJobContact` / `jobContact.actions.ts`
- `crmNote.actions.ts`, `crmTask.actions.ts` when a target is the Person
- `crmInterview.actions.ts` `scheduleInterview` (`:75` is the existing consent guard site)
- `personConnection.actions.ts`, `referral.actions.ts` (Inside Track links)
- **Explicitly NOT:** `archivePerson` (`person.actions.ts:415-421`) — archiving is the
  opposite of "still needed" (§3).

Note `retentionExpiresAt` has **no production writer today** (§1.4), so whichever set is
chosen, this is greenfield: there is nothing to backfill.

### 4.8 Tests

- `__tests__/crm-cron.spec.ts:64-80` currently asserts the archival behaviour — must be
  rewritten to assert erasure, the widened guard (an **archived** expired Person is
  erased), and **that no `CrmActivityLog` row bearing `linkedRecordName` is produced** —
  a regression test aimed squarely at V1b.
- `__tests__/person.actions.spec.ts` — the extraction in §4.3 must leave the existing
  `anonymizePerson` assertions passing unchanged (CLAUDE.md § refactoring rule).
- `__tests__/event-schemas.spec.ts:896` already references `retention_expired` in a
  reminder context — check it still describes reality after §4.4's decision.


---

## 5. Interaction with the two still-open decisions (neither resolved here)

### 5.1 Timeline-activity retention ownership

**The open decision** (V5): `crm-gdpr.allium ExpireOldTimelineActivities` (`:608-637`)
anonymises in place; `gdpr-data-rights.allium PurgeOldCrmActivityLogs` (`:443`) hard-deletes;
`retention-cron.ts:201-207` hard-deletes. Same subject, same 1095-day window, three
statements, two outcomes, no owner. Both specs carry explicit unresolved-contradiction
tombstones.

**What my recommendation constrains — and it is less than it looks:**

1. **It removes one input from the decision, in the direction of making it easier.** Today
   an argument for "hard delete" can lean on the fact that the timeline holds a live PII
   copy created by the retention job itself (V1b) and therefore needs a strong sweep.
   Deleting that write (§4.4) removes the strongest PII-bearing row from the CRM timeline
   and leaves the projections, which are already PII-lean by construction
   (`crm-activity-logger.ts:231-236`). **After the fix, both candidate outcomes are
   defensible on their own merits rather than under pressure from this defect.**
2. **It creates a mild pull toward "anonymise in place"** — i.e. toward
   `crm-gdpr.allium`'s side — because the recommendation's whole logic is that a PII-free
   audit tombstone is more valuable than an absent row (F3, §2(c)). Consistency would
   favour the same answer for the timeline. **I am flagging that pull, not exercising it.**
   The counter-argument (three-year-old timeline rows have no residual audit value once
   de-identified, so deleting is cleaner and matches the code) is untouched by anything
   here.
3. **It has a hard dependency in one direction only:** if the decision goes to **hard
   delete**, then the `contact_deleted` audit row the recommendation relies on is itself
   purged at 1095 days. That is fine — Art. 5(2) accountability does not require permanent
   records, and 1095 days comfortably outlives any DSAR window. **My recommendation works
   under either outcome.** It would only break if the timeline sweep were shortened below
   the DSAR-response horizon, which nobody is proposing.
4. **Housekeeping the decision should absorb:** `1095` exists in three places —
   `retention-config.ts:8` (the only one the cron reads), `person.model.ts:343` (read by
   nothing in the cron path), `crm-gdpr.allium:277`. Whoever settles ownership should
   collapse these, since a duplicated constant is how the contradiction stayed invisible
   in the first place.

### 5.2 Art. 15 export completeness

**The open decision:** which Person columns must appear in `collect-user-data.ts`
(`docs/TASKLIST-2026-08-26.md` §4 — the durable fix proposed there is a field-level audit
test over models already in the export, `__tests__/collect-user-data-audit.spec.ts`).

**What my recommendation constrains:**

1. **It does not add or remove a column.** Erasure on expiry changes *which rows carry
   values*, never which fields are selected. `retentionExpiresAt` is already exported
   (`collect-user-data.ts:308`) and stays.
2. **It shrinks the export's exposure without touching it.** Retention-expired Persons
   currently reach the export in full (V6: `where: { userId }` at `:293-294`, no status
   filter). After the fix, such rows are tombstones — the same query returns them with
   nulled identifiers. So the export becomes correct *by upstream data change*, which is
   strictly better than a filter: a filter would have to be maintained, and a `status`
   filter on the export is itself contestable (a controller arguably should see their own
   tombstones).
3. **One thing it does foreclose, and this is worth stating:** it removes the option of
   fixing V6 by **excluding archived Persons from the export**. That fix would have been
   wrong anyway — it hides data from the controller rather than erasing it, and it is
   exactly the move that makes option (b) look compliant without being so (§2(b)). If the
   Art. 15 work is tempted toward a status filter, this analysis is the argument against.
4. **A live coupling to watch:** if option (b) had been chosen, the export decision would
   have become *load-bearing for compliance* (b's stage 1 is only a restriction of
   processing if archived rows are withheld from export). The recommendation deliberately
   keeps the two decisions **decoupled**. That decoupling is itself a durability argument
   for (a) over (b).

---

## 6. Summary for the reader in a hurry

1. **The defect is real** — `ExpireAutoCreatedPersons` archives and stops
   (`crm.allium:813-832`, `crm-cron.ts:51-98`); `retention-cron.ts` never touches Person
   (zero matches in 366 lines).
2. **It is worse than reported**: the expiry writes the person's name into the timeline
   with a fresh 1095-day clock (`crm-cron.ts:80`), so expiry *extends* the identifier's
   life to ~1825 days from creation.
3. **It is also less urgent than reported**: nothing in production writes
   `dataSource = "auto_created"` or `retentionExpiresAt`, so the rule cannot currently
   match a row (§1.4). **BUGS.md's present tense should be corrected**, severity largely
   retained — this is the last moment the fix is free.
4. **It is non-compliant** on the least contestable ground available — the system does not
   enforce its own declared retention policy (Art. 5(2) before Art. 5(1)(e)) — and that
   holds regardless of the unresolved household-exemption question, which in any case is
   unavailable to a project that has already declared Art. 6(1)(f) as its basis
   (`crm-gdpr.allium:23`).
5. **`archived` restricts nothing** (V7) — archived Persons are listed, searched, exported,
   and un-archivable in one click. It is a UI label, not a retention outcome.
6. **Recommendation: (a) + (e).** Erase on expiry via the existing `AnonymizePerson`
   cascade, on a last-activity clock, guard widened to `status != anonymized` in the same
   change, and the `linkedRecordName` write **deleted** rather than scrubbed. It is a net
   deletion of code, adds no second owner and no second constant, produces a PII-free audit
   row automatically (F3), and needs no state-machine change (V8).
7. **Rejected:** (b) two-stage — compliant only if `archived` is made to restrict, which
   nobody has scoped, and it adds the second constant this project has spent a month
   removing. (c) hard delete — destroys the tombstone and enables an infinite
   re-creation loop. (d) indefinite-by-design — not available, and requires *more*
   deletion than the fix.
8. **Neither open decision is resolved here**, and the recommendation works under either
   outcome of both.

---

*End of analysis. No spec or source file was modified in producing this document.*
