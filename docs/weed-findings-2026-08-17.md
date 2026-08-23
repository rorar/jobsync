# `allium:weed` findings — 2026-08-17 (`crm.allium` + `inside-track.allium`)

Spec↔code divergences from a systematic `allium:weed` pass.
**38 findings — 35 resolved, 2 open (W-D4, W-D5), 1 aspirational (W-F2, not a bug).**
*(W-D3 found 2026-08-21 while reviewing the W-D2 decision; W-D4 split off from it 2026-08-23.)*

> **Resolution pass 2026-08-20.** The remaining code + spec findings were closed in
> two commits (`5c49bb43` code, `71da1c52` specs). Code side: W-B2 (isValidInterviewOutcome
> guard), W-C3 (anonymise blocklist domain+phone arms), W-C4 (updatedBySource=system),
> W-H2 (updatePerson subdivision-requires-country), W-H3 (isValidSocialPlatform guard),
> plus IT-B1 (active-only contact pickers) and W-G5 (comment). Spec side (via `allium:tend`):
> W-A2, W-B3, W-C2, W-E1, W-E2, W-E3, W-E4, W-E5, W-E6, W-F4, W-G1, W-G2, W-G4, W-G6,
> W-G7, W-G8, W-G9, W-H2, W-H3, and IT-B3 (RecordVacancyPromotion→application_submitted).
> W-G3 (set forwarded_to after creation) and W-H1 (crm-gdpr consent surface) were recorded
> as `open question`s — both need a decision/refactor a spec edit alone cannot supply.
> **W-D2 resolved (decision C, @rorar, 2026-08-20):** `ConvertedReferralHasJob` reshaped from a
> standing "converted referral currently has a Job" predicate to a conversion-time obligation
> (TipReifiesToJob creates the Job atomically at conversion; `target_job` may be null after a later,
> independent Job deletion). Zero code — the invariant now conforms to `deleteJobById`'s existing
> hard delete. Chosen over blocking the delete (A, UX friction) and a `converted→declined` recovery
> edge (B): B would make Job-delete a two-entity operation, reintroducing the undoStore split-brain
> hazard (M-A-09) and risking an illegal `declined→declined` on re-delete. See the W-D2 entry below
> and ROADMAP "Undo-Erweiterung" (Job-undo + undo-point discovery backlog). **W-F2 stays aspirational
> (the suppression path has no producer).**
> Verified: full Jest suite 309 suites / 5685 passed + 2 todo / 0 fail; `allium check` 0 errors.
>
> **Follow-up pass 2026-08-21 (review of the W-D2 decision).** Decision C was upheld, but its
> *implementation* and its *rationale* both had a defect:
> 1. The "structural residue" expression left behind by C was a **tautology** — `target_job` is
>    defined as `Job with source_referral = this` (`inside-track.allium:146`) and
>    `Job.sourceReferralId` is `@unique`, so `r.target_job.source_referral = r` can never be false.
>    A checker-blind construct is worse than none: it reads as a live guard. The invariant was
>    removed and the guarantee moved onto `TipReifiesToJob` as prose, where the enforceable
>    artefact already lives (`ensures: Job.created(... source_referral: referral)`). The language
>    reference agrees: a property comparing two moments in time is not expressible.
> 2. The rationale claimed Job-delete is a "single-entity operation". It is not — see **W-D3**.

**Original triage tally (superseded by the roll-up above):**
34 findings, 7 fixed (W-C1, W-F1, W-F3, W-D1, W-A1, W-B1, W-C5), 27 open.

W-C1 and W-F1 sat inside files the 2026-08-17 session was already committing — shipping without them
would have committed a spec making a false statement about a sibling spec. W-F3 and W-F4 were found
*while fixing* W-F1, under `allium:tend`; W-F3 was fixed because resolving W-F1 made its expression
the sole surviving statement of the property.

> **`allium check` does not catch malformed expressions.** Both W-F3's invalid
> `not exists X in Collection where …` and its valid replacement return **0 errors**. So did a
> fabricated enum literal earlier the same session (`"InsiderRelay"` where the code uses
> `insider_relay`). A green check means the file parses, not that it is correct — verify constructs
> against the language reference and claims against the code.

**Scope note:** the pass was run as the pre-commit gate for the referral-events / quick-capture
session (`docs/session-2026-08-17-open-items.md`). **None of these findings was caused by that
session's changes** — they are pre-existing drift. Three areas where the spec is *deliberately*
ahead of code (`quick_capture`, the two referral `ActivityType` members, the 9 referral emissions)
were excluded from the pass by design and are not findings.

**Verification status:** 5 findings were independently re-verified by the main thread against the
cited files (marked ✅ **verified**). The rest are agent-reported with file:line citations and are
credible — the 5 that were checked all landed exactly as reported — but **re-verify before acting**,
per the standing rule that an index or report is not the code.

Baselines at the time of the pass: `allium check specs/` → 0 errors in both files;
`allium analyse` → 0 findings in both.

---

## Severity roll-up

| Severity | IDs |
|---|---|
| **High** | W-A1, W-B1, W-D1 |
| **Medium-High** | W-B2, W-C5, W-D2 |
| **Medium** | W-A2, W-C1, W-C2, W-C3, W-E1, W-E2, W-E4, W-F1, W-F3, W-F4, W-G1, W-G3, W-G4, W-G7, W-G8, W-H1, W-H2 |
| **Low / Low-Medium** | W-B3, W-C4, W-E3, W-E5, W-E6, W-F2, W-G2, W-G5, W-G6, W-G9, W-H3 |

3 High + 3 Medium-High + 17 Medium + 11 Low/Low-Medium = 34.

Which side is wrong: **spec** 20 · **both** 7 · **code** 6 · **aspirational (not a bug)** 1.
The spec-heavy skew is expected — the code has shipped and been reviewed repeatedly, while several
spec rules were written ahead of it and never reconciled afterwards.

---

## A. Task lifecycle

**W-A1 — `DeleteTask`'s terminal-state precondition is enforced nowhere. [High] [code] ✅ verified — ✅ FIXED 2026-08-19**
`deleteCrmTask` now rejects non-terminal tasks with `crm.errors.taskNotTerminal` (+4 locales); the
pinned test `crmTask.actions.spec.ts:379` was flipped to a terminal-status success case plus two
rejection cases.

Spec `crm.allium:923-936` requires `task.status in {done, cancelled}` ("active tasks must be
cancelled first"). `crmTask.actions.ts:224-241` checks ownership only, then `prisma.crmTask.delete`
— no status check, unlike every sibling (`startCrmTask:145`, `completeCrmTask:171`,
`cancelCrmTask:209`, all of which call `isValidTaskTransition`). **The divergence is pinned by a
test:** `__tests__/crmTask.actions.spec.ts:379-389` mocks `status: "pending"` and asserts success, so
fixing the code requires changing the test. Browser-callable `"use server"` export; targets cascade.

**W-A2 — `DeleteTask` has no surface, yet is publicly callable. [Medium] [spec + code] — ✅ RESOLVED 2026-08-20**
Resolved spec-side by keeping the divergence out of the surface: `TaskBoard` still provides only
Create/Start/Complete/Cancel (matching the UI), and a comment records that `DeleteTask` is
deliberately NOT surfaced — cancel is the terminal board action. The `DeleteTask` rule stays as a
callable, terminal-guarded repository capability for a future bulk/API/UI consumer. Chose this over
wiring a UI delete button (a new feature, ui-design-gated, out of scope for spec↔code
reconciliation). Zero code; `deleteCrmTask` and its tests are unchanged. Original finding text follows.
`TaskBoard` (`crm.allium:1442-1449`) provides Create/Start/Complete/Cancel only. `deleteCrmTask` has
no UI consumer (only the spec file's test). Either add it to `TaskBoard provides` with a
`when task.status in {done, cancelled}` guard, or drop the action. Compounds W-A1.

## B. Interview lifecycle

**W-B1 — `CompleteInterview`'s `target_person` can never be populated. [High] [code] ✅ verified — ✅ FIXED 2026-08-19**
`InterviewCompletedPayload` now carries optional `personId` (schema + type); `completeInterview`
emits `interview.personId`; the projection sets `targetPersonId`, so completion reaches
`PersonTimeline`.

Spec `crm.allium:788-797` sets `target_person: interview.person`. `InterviewCompletedPayload`
(`event-types.ts:252-257`) carries `interviewId, jobId, userId, outcome` and **no `personId`**, so
the projection (`crm-activity-logger.ts:218-235`) never sets it. `InterviewScheduledPayload`
(`:244-250`) *does* carry `personId`. Net effect: a scheduled interview appears on `PersonTimeline`,
its completion does not — half the interview story is silently lost. Emit site:
`crmInterview.actions.ts:139-146`.

**W-B2 — `InterviewOutcome` has no runtime guard. [Medium-High] [code]**
`crm.allium:188-190` declares the vocabulary; `crmInterview.actions.ts:108-136` writes the
TS-erased union straight to Prisma. No `isValidInterviewOutcome` exists anywhere in `src/`, while
every comparable enum has one (`isValidActorType`, `isValidPersonTransition`,
`isValidJobContactRole`, `isValidReferralStatus`). ADR-019 boundary validation violated for exactly
one enum — any string reaches `CrmInterview.outcome`.

**W-B3 — `RescheduleInterview` nulls location on omission. [Low] [spec]**
Spec `:818` is unconditional (`interview.location = new_location`); code
(`crmInterview.actions.ts:204`) preserves on `undefined`. Code is right; the spec should use the
`if new_location != null:` form it already uses in `UpdateNote` (`:998-1002`).

## C. GDPR

**W-C1 — the `DeleteCrmContact` drift note is factually wrong. [Medium] [spec] ✅ verified — ✅ FIXED 2026-08-17**
`inside-track.allium:491-493` warns that "crm-gdpr.allium's `DeleteCrmContact` rule says
`not exists person`, which DRIFTS from this implementation". **No such rule exists.**
`grep -rn "DeleteCrmContact" specs/ src/ docs/` matches only that comment; `not exists person`
appears nowhere in `crm-gdpr.allium`. The real rule is `FulfillErasureRequest` (`:283-377`), whose
own header states the row is *retained as a de-identified tombstone*. There is no drift — both CRM
specs already match `anonymizePerson`. The note actively misdirects the next weeder.

**W-C2 — `ActiveReferralHasTipster` is referenced but never declared. [Medium] [spec]**
`inside-track.allium:136` cites it; the Invariants section (`:627-647`) declares only three, not
including it. Not benign: the invariant, if written, would be *violated* by the merge path (W-D1).

**W-C3 — anonymize drops the domain-matching blocklist arm. [Medium] [code]**
Spec `crm.allium:645-648` removes blocklist entries matching an email **or its domain**.
`person.actions.ts:568-573` deletes on exact lower-cased emails only — no domain arm, no phone arm
despite its own comment saying "emails/phones". The reusable matcher exists
(`blocklist-match.ts:70-95 isBlockedByEntries`) and its docstring claims the anonymise cascade uses
it; it does not.

**W-C4 — anonymize never sets `updated_by.source = system`. [Low-Medium] [code]**
Spec `crm.allium:617-618`. `person.actions.ts:629-630` nulls the names but leaves
`updatedBySource` untouched, so after erasure the record claims a human last touched it.
`ActorSource` includes `system`; the column exists (`schema.prisma:1072`).

**W-C5 — the consent gate is missing at 2 of 8 write sites. [Medium-High] [code + spec] ✅ verified — ✅ FIXED 2026-08-19**
`isConsentBlocked` now gates `addJobContact` and `addPersonConnection` (the latter switched from
`person.count` to `findMany` to read the consent fields). **Spec side:** a first attempt added a
per-rule `requires: not exists ext in gdpr/PersonGdprExtensions where … ext.is_consent_blocked` to
`AddJobContact`/`AddPersonConnection`, but that was **reverted** — it (a) crosses external-entity
identities (`crm/Person` vs `crm-gdpr`'s own `external entity Person`), (b) uses an
alias-qualified entity as an iterable collection, for which there is no precedent and which
`allium check` does **not** validate (a deliberately-bogus entity name still returns 0 errors — the
checker is blind here), and (c) is the wrong *shape*: the restriction guards the creating **action**,
whereas a standing `requires`/invariant over link state would be falsified by the lawful
"link first, withdraw consent later" sequence. The spec's chosen encoding for this is the **prose**
invariant `ConsentBlockedRecordIsProcessingRestricted` (crm-gdpr.allium), which was extended to name
`AddJobContact` and `AddPersonConnection` explicitly. Code remains the authoritative enforcement.

`crm-gdpr.allium:606-620` forbids automated CRM flows acting on a consent-blocked record.
`isConsentBlocked` is enforced in `person`, `crmInterview`, `crmTask`, `crmNote`, `referral`,
`warmPath` actions and `crm-cron` — but is **absent from `jobContact.actions.ts` and
`personConnection.actions.ts`**. `addJobContact` links a blocked Person to a Job (new processing,
and emits `ContactUpdated` → a fresh timeline entry); `addPersonConnection` records an edge naming
the blocked Person, which `findWarmPaths` then filters out again. Also a spec gap: neither
`AddJobContact` (`crm.allium:695`) nor `AddPersonConnection` (`inside-track.allium:457`) carries the
`requires`.

## D. Person merge

**W-D1 — `MergePersons` orphans Referrals and destroys PersonConnections. [High] [both] ✅ verified — ✅ FIXED 2026-08-18**
`person.actions.ts:731-785` transfers five CRM relations, then `person.delete(loser)`. **No Referral
or PersonConnection arm**, in neither the code nor `inside-track.allium` (which has a cascade for
anonymization only). FK behaviour then applies: `Referral.tipsterId/insiderId/forwardedToId` are
`onDelete: SetNull` (`schema.prisma:1332/1340/1344`), `PersonConnection.fromPerson/toPerson` are
`onDelete: Cascade` (`:1374-1376`). So merging a duplicate who happens to be a tipster leaves a live
`open`/`engaged` referral with `tipster = null` — the warm path is **lost, not transferred** — and
hard-deletes every network edge on the loser. **Silent data loss on a routine, non-GDPR
housekeeping operation**, producing exactly the state W-C2's undeclared invariant would forbid.

**W-D3 — deleting a Person, Company or Job silently orphans CRM notes. [High] [code] — ✅ RESOLVED 2026-08-21, CORRECTED 2026-08-23**
Found while checking the W-D2 claim that Job-delete is a "single-entity operation". It is not.
`CrmNoteTarget.targetJob` / `targetPerson` / `targetCompany` and the `CrmTaskTarget` equivalents are
all `onDelete: Cascade` (`prisma/schema.prisma:1186,1225` and the person/company arms). Deleting the
target removes the join rows, so a record whose ONLY target was that entity survives with **zero
targets**. `CreateNote`/`CreateTask` require `targets.count > 0` (`crm.allium:913,1032`) and creation
is atomic, so that state is not reachable by any legal action.

**Notes are residue; tasks are not.** Every note read filters by target (`getCrmNotes` is only ever
called as `getCrmNotes({ targetPersonId })`), so an orphaned note vanishes from the UI while keeping
its free-text body — on `anonymizePerson` that is free text *about the person being erased*, retained
indefinitely and invisible to the UI that would let the user delete it (GDPR Art. 17). Notes are
therefore pruned.

Tasks are left alone. The first implementation pruned them too, on a false premise — corrected
2026-08-23 after the Phase-1 quality review:
- the board reads `getCrmTasks()` with **no filter** (`CrmTasksPageClient.tsx:101`) and renders the
  zero-target case explicitly, so an orphaned task stays visible and actionable;
- `checkOverdueTasks` (`src/lib/scheduler/crm-cron.ts:240`) selects on status + dueDate alone, so it
  keeps firing reminders for it;
- worst of all, a blanket prune hard-deleted `pending` tasks, bypassing `rule DeleteTask`
  (`crm.allium:987`, terminal-only) — the exact guard **W-A1** had added to `deleteCrmTask`. The fix
  re-opened a closed finding through a second path.
A task that loses its last target simply loses its link: `targets.count > 0` is an obligation on the
creating action, not a standing predicate (the same reasoning as `TipReifiesToJob`, W-D2).

Fix: `src/lib/crm/orphan-targets.ts`. `withOrphanedCrmPrune(db, userId, ops)` returns the caller's
transaction array with the note prune appended — the helper **owns** the last position, so a caller
cannot append past it (the earlier `...buildOrphanedCrmPruneOps(...)` spread could be mispositioned,
and a `PrismaPromise` is lazy, so a dropped op is a silent no-op rather than an error). Wired into
five paths: `deleteJobById`, `DELETE /api/v1/jobs/:id`, `deleteCompanyById`, `anonymizePerson`, and
`clearMockProfileDataAction` (via the awaited `pruneOrphanedCrmNotes`). `mergePersons` was checked and
is NOT affected — it dedupes and transfers targets to the winner (`person.actions.ts:726-833`).
`CrmActivityLog.targetJobId` is `onDelete: SetNull`, so the timeline history of a conversion survives
a Job deletion — which is what makes W-D2's "converted is a historical fact" defensible.
Tests assert array **position** (not build order), that tasks are never deleted, and the `userId` +
`targets: { none: {} }` scoping.

**W-D4 — open, deliberately not fixed here.** An orphaned *task* keeps its title/description, which on
the `anonymizePerson` path may contain free text about the erased person. Deleting it is wrong (see
above) and the established GDPR pattern in this codebase is to **scrub** free text rather than delete
the row (`crmInterview.updateMany` sets `notes: null, outcomeNotes: null` in the same transaction).
Deciding whether task free-text should be scrubbed on erasure is a product/DPO call, not a
reconciliation.

**W-D5 — the note prune is not observable. [Medium] [code] — OPEN (2026-08-23, Phase-1 architecture review)**
The prune hard-deletes user records and emits nothing: no audit row, no domain event, no timeline
entry, no count in the action's result. On the `anonymizePerson` path that is an erasure side effect
with no trace of what was erased. Deliberately NOT fixed here: `DataAuditAction`
(`src/lib/audit/data-audit.ts:26`) mirrors the spec-governed `enum AuditAction`
(`specs/audit-trail.allium:52`), so adding a prune action means a spec change — a new rule saying when
the entry is emitted, plus the `SnapshotsAreFieldDiffsNotPii` obligation — not a code tweak.
Do it via `allium:tend` first, then the code. Nor is there a cheaper fallback: server actions have no
logging convention to lean on — `logRule` (`src/lib/scheduler/retention-cron.ts:53`) is cron-local,
so "just log the count" would introduce a new pattern rather than follow one.

**W-D6 — the prune had no construct in `crm.allium`. [Medium] [spec] — ✅ RESOLVED 2026-08-23**
This is a spec-driven project, and "a note always belongs to something" is behaviour a stakeholder
cares about, yet no construct described it — which is exactly how the task-deletion bug (see W-D3)
got past `allium check`.

My first reading was that the `TipReifiesToJob` prose precedent (W-D2) transferred here. The
architecture review pushed back and was right: that obligation was inexpressible because it compares
two moments in time, and its residue was a tautology. This one is different — "every note has at
least one target" is a single-moment, falsifiable predicate over current state, so it belongs in an
expression-bearing invariant.

Added `invariant NoteHasAtLeastOneTarget` next to the existing `ExactlyOneNoteTarget` /
`ExactlyOneTaskTarget` shape constraints, as their cardinality companion. Had it existed, the
original orphan bug would have been a straightforward invariant violation. Its comment also records
why there is deliberately **no** Task counterpart: a task may legitimately hold zero targets, since
`TaskBoard` lists tasks unfiltered, the overdue reminder still fires, and `DeleteTask` permits a hard
delete only from a terminal status. That asymmetry being undocumented is what made the task bug
possible. `allium check specs/`: 0 errors; `allium analyse`: unchanged from HEAD.



**W-D2 — `ConvertedReferralHasJob` is unenforceable against Job deletion. [Medium-High] [both] — ✅ RESOLVED 2026-08-20 (decision C)**
Reshaped to a conversion-time obligation instead of a standing predicate: `converted` is a
historical outcome, and `target_job` (a relationship, `Job with source_referral = this`) may be null
after a later independent Job deletion — the referral is not un-converted. Job delete stays a
single-entity operation (no cascading referral status change), keeping its future undo compensation
Job-only. Spec-only; no code change (current `deleteJobById` hard delete now conforms). Rejected A
(block the delete — UX friction) and B (converted→declined recovery edge — two-entity delete,
undoStore split-brain M-A-09, illegal declined→declined on re-delete).
**Amended 2026-08-21:** the residue expression C left in the invariant was tautological (see the
follow-up note at the top), so the invariant is now gone entirely and the guarantee lives as prose
on `TipReifiesToJob`. UI follow-through: the converted banner now says the job was deleted instead
of rendering a success banner with no link (`insideTrack.workspace.convertedJobDeleted`).
Original finding text follows.
`inside-track.allium:635-638`; `converted` is terminal (`:190`). `deleteJobById`
(`job.actions.ts:761-791`) hard-deletes the Job; `Job.sourceReferralId` is `onDelete: SetNull`,
which protects the Job when the Referral goes, not the reverse. Deleting the Job strands the
Referral permanently in an invariant-violating terminal state with no outbound edge. No rule models
Job deletion's effect (candidates: block the delete, or add a `converted → declined|stale` recovery
edge).

## E. Activity timeline

**W-E1 — two projections exist in code with no witnessing rule. [Medium] [spec]**
`ActivityType` declares `contact_created` / `contact_updated` (`crm.allium:199`) but no rule
produces them; `crm-activity-logger.ts:137-153` and `:159-180` do. Consequence: the timeline writes
a person's name into `linkedRecordName` with no specified retention/erasure treatment, and consent
withdrawal/reinstatement produce entries nobody specified.

**W-E2 — the spec contradicts itself about `MergePersons`. [Medium] [spec]**
`RecordContactDeletion` (`:1041-1044`) says it is fired by AnonymizePerson **and MergePersons
(reason: merged)**, but `rule MergePersons` (`:657-693`) has no such `ensures`. Code does emit it
(`person.actions.ts:787-793`, payload union includes `"merged"`).

**W-E3 — `ContactUpdated` is emitted with three different shapes. [Low-Medium] [spec]**
`UpdatePerson` (`:573`) vs `AddJobContact` (`:710`) vs `RemoveJobContact` (`:720`); code's payload is
`{ personId, userId, jobId? }` and `jobContact.actions.ts:47,74` deliberately pass `jobId` so the
entry reaches Job/Company timelines. One trigger, one shape.

**W-E4 — `details: null` in the cron rules forbids the idempotency mechanism. [Medium] [spec]**
`InterviewReminder` (`:835-843`) and `TaskOverdueReminder` (`:950-956`) specify `details: null`, and
`ExpireAutoCreatedPersons` (`:723-737`) specifies no ActivityLog at all. But `crm-cron.ts:73-83`
writes one, and `:179-186` / `:249-259` write `details` JSON that `:162-169` / `:239-246` then
**query as the duplicate-reminder guard** (`details: { contains: '"interviewId":"…"' }`). The spec
does not merely understate this — it forbids the mechanism that makes reminders idempotent.

**W-E5 — cron reminder rules lack the consent guard they implement. [Low-Medium] [spec]**
`crm-cron.ts:159` and `:236` skip consent-blocked targets; the rules require only a status.
`inside-track.allium:677` calls this "the verified crm-cron pattern", so it should be visible.

**W-E6 — timeline retention is duplicated across two constants. [Low] [both]**
`crm.allium:437 timeline_retention = 1095.days` is referenced by no rule (the rule lives in
`crm-gdpr.allium:470`). Implemented against `RETENTION_CONFIG.crmActivityLogRetentionDays`
(`retention-config.ts:8`), while `CRM_CONFIG.timelineRetentionDays` (`person.model.ts:314`) has zero
consumers. Same class: `follow_up_default_delay`, `max_connected_accounts` dead on both sides.

## F. Blocklist

**W-F1 — `crm.allium`'s blocklist model is stale against code *and* its sibling spec. [Medium] [spec] — ✅ FIXED 2026-08-17**
Three counts: (a) `BlocklistType` (`:215-217`) lacks `pattern`, which `crm-gdpr.allium:67-74`,
`person.model.ts:123` and `crmBlocklist.actions.ts:11,30` all have; (b) `domain` semantics are
understated — code matches parent domains (`domain.endsWith("."+handle)`,
`blocklist-match.ts:70-95`); (c) `invariant BlocklistSuppressesAutoCreation` (`:1223-1235`) is framed
**retroactively** while the same-named invariant in `crm-gdpr.allium:623-635` is explicitly
*"enforced at creation time, not as a retroactive check"*. **Two specs cannot own one invariant name
with opposite enforcement models.**

**Resolution (2026-08-17).** `pattern` + per-member semantics added to `crm.allium`'s enum.
On (c), the duplicate was **removed rather than synchronised** — `crm-gdpr.allium` is now the sole
owner. The specs' own scope headers decide it: `crm-gdpr.allium` declares it *includes* "contact
auto-creation constraints" and "data minimization rules" and *excludes* the "CRM domain model", and
only its version documents all four match modes. `crm.allium` keeps a comment in its Invariants
section explaining the absence, and still **enforces** the property through
`AutoCreatePersonFromEmail`'s `requires` guards — it simply no longer restates it. Two synchronised
copies is the arrangement that produced this finding; one owner cannot drift from itself.

**W-F3 — `not exists X in Collection where …` is not valid Allium. [Medium] [spec] — ✅ FIXED 2026-08-17**
`crm-gdpr.allium`'s `BlocklistSuppressesAutoCreation` used
`not exists b in Blocklists where b.type = email and …`. The language reference permits only
`exists <let-binding>` and `exists Entity{field: value}` (invariant expression table: *"Existence —
`exists entity`, `not exists entity`"*); there is no `… in Collection where …` form. The correct
idiom is already used elsewhere in the same codebase (`crm.allium:540-543`
`not exists Blocklist{user_id: …, handle: …, type: email}`).
**Found by copying the shape into `crm.allium` while fixing W-F1** — the copy passed `allium check`
with 0 errors, which is how the malformed original survived in the first place. Both were rewritten
as nested `for` + `implies`, matching the reference's own `UniqueEmail` example.

**W-F4 — the suppression rule implements 2 of the 4 declared match modes. [Medium] [spec]**
After W-F1 added `pattern`, `BlocklistType` advertises four modes (`email`, `phone`, `domain`,
`pattern`), but `AutoCreatePersonFromEmail`'s guards (`crm.allium:540-541`) test only exact `email`
and exact `domain`. Nothing in the spec suppresses on `phone` or on a `pattern` glob, and the
`domain` guard is exact-match where the code matches parent domains too
(`blocklist-match.ts:70-95` handles all four, including `domain.endsWith("."+handle)`). Adding the
enum member did not create this gap — it made an existing one visible. Note the invariant can only
express the `email` arm as a pure predicate, so the other three modes are carried by the rule's
guards; those guards are what need extending.

**W-F2 — the whole suppression path has no producer. [Low] [aspirational, not a bug]**
`isHandleBlocked` / `isBlockedByEntries` have no production consumer (tests only), and
`expireAutoCreatedPersons` filters `dataSource: "auto_created"`, which nothing writes. Consistent
with `crm.allium:1585`'s open question ("no surface provides AutoCreatePerson") — so
`AutoCreatePersonFromEmail`, `AutoCreatedHasRetention` and the cron expiry rule are all currently
unreachable, and the glob machinery is dead code with tests.

## G. Referral lifecycle

Clean (verified matching): `REFERRAL_TRANSITIONS` (`insideTrack.model.ts:76-84`) is an **exact**
match for the spec graph including `stale → open` and both terminals; `INSIDE_TRACK_CONFIG` matches
the config block; `DistinctEndpointsPerUser` is a real DB constraint (`schema.prisma:1386`) with an
app pre-check + P2002 backstop; `NoSelfConnection` enforced; `NetworkPathViaConnectsTipsterToInsider`
enforced at creation and kept vacuous by the GDPR cascade.

**W-G1 — `TipReifiesToJob` produces two unspecified effects. [Medium] [spec]**
Code (`referral.actions.ts:268-303`) also seeds the initial `JobStatusHistory` row and emits
`JobStatusChanged`, which fans out to a `status_changed` timeline entry. The spec witnesses neither.
Matters because `RecordReferralStatusChange`'s guidance (`crm.allium:1170-1171`) explicitly reasons
about that entry. Make it an `ensures`.

**W-G2 — `last_activity_at` refreshed on transitions the spec leaves alone. [Low] [spec]**
`transitionReferral` (`:185-193`) and `commitReferralToApply` (`:293-300`) set it for all five
transitions; `DeclineReferral` and `TipReifiesToJob` don't specify it. Harmless (both targets
terminal), but should be stated.

**W-G3 — `forwarded_to` can be set at creation but never afterwards. [Medium] [both]**
`variant InsiderRelay` promises the decision-maker is "filled in later"; **no rule fills it in**, and
`referral.actions.ts` exposes no update action for `forwardedTo`/`insider`/`via`/`targetCompany` —
only the five transitions + commit + reads. Meanwhile the code *does* accept `forwardedToId` at
create (`:28,73-76,87`), which the rule signature omits. So an InsiderRelay recorded before the
tipster names the decision-maker can never be completed.

**W-G4 — `via` auto-resolution is unspecified. [Medium] [spec]**
`referral.actions.ts:130-140` silently looks up an existing tipster→insider `PersonConnection` when
`viaId` is absent. That is a domain decision (a NetworkPath auto-adopts a known edge), not plumbing;
it belongs in `RecordNetworkTip` as a `let`.

**W-G5 — stale cross-reference in the UI. [Low] [code comment]**
`TipCaptureSheet.tsx:42-47` claims the omitted `via` picker is "documented in
specs/inside-track.allium as an open question" — none of the seven open questions concerns `via`.

**W-G6 — `find_warm_paths` takes a depth argument the code lacks. [Low-Medium] [spec]**
Surface exposes `find_warm_paths(viewer, company, config.max_warm_path_depth)` (`:559`); code is
`findWarmPaths(companyId)` with depth 2 structural, and `maxWarmPathDepth` has no consumer anywhere.
A hardwired topology presented as parameterised. (`ExcludesConsentBlockedPersons` *is* genuinely
honoured.)

**W-G7 — `ReferralWorkspace` exposes less than the read side returns. [Medium] [spec]**
`getReferral` (`:381-398`) additionally returns `forwardedTo`, `insider`, `via`, `createdAt`,
`updatedAt`, `targetJobTitle`, all rendered by the client. `forwardedTo`/`insider` are live Person
references including names + status — **PII crossing a boundary the surface does not declare.**

**W-G8 — `RemovePersonConnection` / `listPersonConnections` have no rule or surface. [Medium] [spec]**
`personConnection.actions.ts:85-103` is a hard delete on a modelled entity, unwitnessed. Interacts
with `NetworkPathViaConnectsTipsterToInsider`: edge deleted → `viaId` SetNull → the invariant goes
vacuous and the NetworkPath silently loses its route, with nothing specified about it.

**W-G9 — rule/surface signature mismatches. [Low] [spec]**
`RecordInsiderTip` rule (`:324`) omits the `?` its own surface (`:583`), its own ensures
(`target_company?.id`, `:339`) and the code all treat as optional. Same for `RecordNetworkTip`
(`:346` vs `:584`). `AddPersonConnection` (`:460`) omits `notes`, which the entity has and the code
stores.

## H. Person surfaces vs UI

**W-H1 — `PersonDetail` omits three actions the page offers. [Medium] [spec]**
`PersonDetailClient.tsx` calls `withdrawConsent` (`:140`), `reinstateConsent` (`:150`),
`addPersonConnection` (`:208`). The first two are rules in `crm-gdpr.allium:485-514`, but **that spec
declares no surfaces at all** — so two user-facing GDPR actions exist at no declared boundary in any
spec.

**W-H2 — `Address` subdivision requires country: enforced in code, absent from spec, and asymmetric. [Medium] [both]**
`person.actions.ts:143-145` rejects a subdivision without a country — **on create only**.
`updatePerson:361-369` validates the country-code *format* but not the pairing, so an update can null
`addressCountryCode` while leaving a subdivision set. The spec has no
`invariant SubdivisionRequiresCountry`, which is precisely what would have caught the asymmetry.

**W-H3 — `SocialProfile` URL/platform validation unmodelled. [Low] [spec + smell]**
`person.actions.ts:127-135, 341-349` enforce `^https?://` and platform membership against an **inline
`VALID_PLATFORMS` array**, duplicating `SocialPlatform` instead of using an `isValid*` guard like
every other enum. The scheme restriction is domain behaviour and belongs in the spec.

---

## Suggested triage

1. **W-D1** first — silent data loss on a routine operation, and the only finding that destroys user
   data rather than mis-recording it.
2. **W-A1**, **W-B1**, **W-C5** — the other correctness/GDPR issues. Note W-A1 requires updating a
   test that currently pins the wrong behaviour.
3. **W-C1**, **W-F1** — both sit in files touched by the 2026-08-17 session and are cheap
   comment/enum corrections; candidates to ride along with that commit rather than wait.
4. The remaining spec bugs are best batched into a single `allium:tend` pass rather than fixed
   piecemeal.
