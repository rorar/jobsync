# ADR-042: CRM retention erases on expiry, on a last-activity clock, with an off switch that keeps the policy

**Status:** Accepted
**Date:** 2026-08-31
**Context:** WH-B3 (`spec/gdpr-data-rights-person-stub`), commits `72f4138f` and
`669104a0`, built on the recommendation in `docs/wh-b3-retention-analysis.md` §3
**Supporting records:** `docs/retention-settings-plan.md` (settings half),
`docs/fix-1-clock-notes.md` (clock half), `docs/handoff-2026-08-30-retention.md`
(open items, §4 and the §5 TODO table)

## Context

`rule ExpireAutoCreatedPersons` was JobSync's only enforcement of storage
limitation over CRM contacts, and it did not enforce anything. When an
auto-created Person's retention period elapsed the rule flipped `status` from
`active` to `archived` and stopped. `archived` is a filter facet in this
codebase, not a restriction of processing: an archived Person is still stored,
still listed, still searched, still emitted by the Art. 15 export, and one click
from restoration. Expiry that archives never ends the processing, so it
discharged neither Art. 5(1)(e) storage limitation nor — more sharply — the
Art. 5(2) accountability duty to demonstrate that the system enforces the
retention policy it declares.

The aggravating fact is the one nobody had noticed. In the same transaction the
expiry wrote a `CrmActivityLog` row carrying `linkedRecordName` — the person's
full name — with `happenedAt` defaulting to the erasure instant. That row is
governed by a separate, longer clock
(`src/lib/scheduler/retention-config.ts:8`, `crmActivityLogRetentionDays: 1095`),
counted from `happenedAt`. Retention expiry therefore *lengthened* the life of
the very identifier it existed to retire, and it did so by copying that
identifier into an append-only table. The analysis records this at
`docs/wh-b3-retention-analysis.md` §0 V1b; the spec now records it as a
tombstone at `specs/crm.allium:899-906`.

Two facts bound how urgent this was and what the fix had to be. First, the
defect is **latent rather than live**: no code path creates `auto_created`
Persons today, so no record has yet been mis-retained
(`docs/wh-b3-retention-analysis.md` §1.4). That removes the migration pressure
from the strongest option and is why the most compliant option was also
affordable. Second, the compliant answer had already been written down once and
deleted: W-H1 removed `crm-gdpr.allium`'s `ExpireAutoCreatedContacts`, which said
expiry raises an erasure request, on sound spec-hygiene grounds — it was a
duplicate owner (ADR-041). Deleting the duplicate was right; the normative
question it happened to answer was never re-decided in the surviving owner. The
repair therefore had to strengthen `crm.allium`, not restore the duplicate.

The four candidate outcomes were weighed in `docs/wh-b3-retention-analysis.md`
§2 against the criterion @rorar set — *most flexible and long-lasting, but
completely GDPR compliant*, both halves binding — and the recommendation at §3
was **(a) + (e)**: erase through the existing `AnonymizePerson` cascade, on a
last-activity clock. The two commits implement that, plus (f), the bounded
user-configurable period.

## Decision

Four decisions are bundled here. They are separable and each was taken against
named alternatives.

### 1. Expiry erases; it does not archive

`ExpireAutoCreatedPersons` now delegates to the `AnonymizePerson` cascade. The
spec states this as `ensures: AnonymizePerson(system, person, reason:
retention_expired)` (`specs/crm.allium:892`) and deliberately does not restate
the post-state, because `AnonymizePerson` owns the cascade and copying it in
"would be a second owner and therefore a drift mechanism"
(`specs/crm.allium:888-891`). The implementation follows at
`src/lib/scheduler/crm-cron.ts:125-130`.

Three details carry most of the compliance weight. The name-write is **deleted
outright rather than scrubbed**: the accountability row is now produced by the
`ContactDeleted → contact_deleted` projection, which is PII-free by
construction, so the expiry path writes no timeline row of its own and the
`select` no longer reads `firstName`/`lastName` at all
(`src/lib/scheduler/crm-cron.ts:74-78`). "PII-free by construction" is meant
literally and is checked at the projection rather than asserted at the call site:
`targetPersonId` and `linkedRecordName` are written as `null`, `details` carries
only `JSON.stringify({ reason })`, and `reason` is a closed four-member Zod enum
validated at the boundary (`src/lib/events/consumers/crm-activity-logger.ts:231-237`,
`src/lib/events/event-schemas.ts:243-247`). The payload does carry `personId`;
the projection deliberately drops it. Idempotency became **structural**
rather than guarded — `anonymized` is terminal and the query excludes it, so the
rule cannot fire twice on one Person and needs no activity-log guard row
(`src/lib/scheduler/crm-cron.ts:52-56`, `specs/crm.allium:895-897`). And the
guard **widens** from `status: "active"` to `status: { not: "anonymized" }`
(`src/lib/scheduler/crm-cron.ts:70`, `specs/crm.allium:885`), because an
`active`-only predicate let exactly the records a user had already set aside
escape retention entirely; it is now deliberately the same predicate as the
`AnonymizePerson` trigger rather than a third one.

Two smaller defects went with the name-write, and both were misattribution
rather than leakage. The deleted row carried `activityType: "reminder_triggered"`,
so an archival event had been **masquerading as a reminder** in the user's
timeline; deleting the row removes the mislabelling along with the name. And the
interview scrub inside the cascade wrote `updatedByType: "user"` on every path,
which on the cron path is a **false human attribution** — a record asserting that
a person did something no person did. It is now
`reason === "retention_expired" ? "system" : "user"`
(`src/lib/crm/anonymize-person.ts:144`), matching the `"system"` the surrounding
scrubs already used (`:114`, `:123`). Both are the same class of defect as the
name-copy: the expiry path telling the record something untrue about itself.

Anonymise-with-full-scrub is simultaneously the most compliant and the most
flexible option, which is unusual and is why it won. Recital 26 places
genuinely anonymised data outside the Regulation entirely, so the erased
tombstone stops being personal data rather than becoming better-governed
personal data; and reusing the Art. 17 cascade verbatim means one constant, one
rule, one owner, with nothing new to keep in sync.

**Hard delete (option (c)) was rejected**, and not on cost. It defeats itself in
operation: with the row gone, nothing records that this contact was retired, so
the next email from the same address re-creates the Person and restarts a fresh
period, indefinitely. That is a worse storage-limitation outcome than the status
quo, achieved with more code. **A two-stage expiry (option (b))** — keep
`archived`, add a longer-dated `archived → anonymized` sweep — was rejected as
strictly more work for the same endpoint: it needs *two* fixes to the name-copy
rather than one, and its only genuine advantage, a grace period, exists only if
the grace period is surfaced to the user. **Documenting "archived retention is
indefinite by design" (option (d))** was rejected as not even the cheap option;
it is more deletion of existing behaviour than erasing is.

### 2. "Off" suspends the erasure, not the policy

`PrivacySettings.crmRetentionEnabled` (`src/models/userSettings.model.ts:79`)
gates the sweep per user (`src/lib/scheduler/crm-cron.ts:102`, via the per-user
policy cache at `:86-93`). When it is false, `retentionExpiresAt` is still
computed at creation, still advanced by the clock, and still displayed on the
contact; only the unattended erasure stops.

The reasoning is that deleting the policy along with the automation makes the
accountability story worse rather than better. The defect being repaired is
"the system does not enforce its declared retention policy" — an Art. 5(2)
argument. If "off" also deleted the declared period, that argument would
collapse into "there is no policy", and Art. 5(1)(e) applies to the operator
regardless of what this software does unattended. Off therefore means the
operator has taken the storage-limitation review over by hand, and the UI says
exactly that (`src/components/settings/PrivacySecuritySettings.tsx:305`). The
same logic makes the period a **bounded union with no "unlimited" member**,
`180 | 365 | 730 | 1095` (`src/models/userSettings.model.ts:89`): offering
indefinite retention as a configuration would re-create as a setting the exact
defect this work removes. The 1095 ceiling is chosen so a Person is never
retained longer than its own timeline.

The default is **on**, matching `auditAccountDeletion` in the same interface
(`src/models/userSettings.model.ts:118, 122`). Turning it off is opting out of a
safeguard, so the enforcing value is the safe default. The default period is 730
days (`:125`), equal to `CRM_CONFIG.autoCreatedRetentionDays`
(`src/models/person.model.ts:342`), so an operator who never opens the setting
keeps precisely today's declared policy.

Making the period configurable created a second-order obligation that is part of
this decision: changing it **re-bases existing deadlines immediately**
(`src/actions/privacy.actions.ts:168-181` → `rebaseCrmRetention`,
`src/lib/crm/retention-policy.ts:193-231`). Without that, an operator tightening
730 → 180 to be *more* protective would see nothing happen for years, which is
the same "declared policy is not enforced" defect re-created as a configuration.
The re-base shifts the stored deadline by the delta —
`newDeadline = oldDeadline - oldDays + newDays` — rather than recomputing it from
a timestamp, which makes it exact and idempotent. Recomputing from `updatedAt`
would walk the clock forward, because the re-base write itself bumps `updatedAt`,
so repeatedly saving the settings page would extend retention.

### 3. The clock advances on a principle, not an enumeration

Commit `72f4138f` wired the last-activity touch at exactly one site,
`updatePerson`, which made it a *last field edit* clock: a contact worked with
through notes, tasks and interviews for two years was still erased on the
anniversary of the last name edit — the necessity test failing in the case it
most needs to hold. `669104a0` closed that, and did so by deciding a rule rather
than a list:

> The clock advances when a deliberate act by the authenticated user creates a
> **new durable association** with that specific Person, or **refreshes the
> Person record** itself. System-driven writes never count; acts that end or
> wind down the association never count.

Both limbs matter under Art. 5(1)(e): an interaction is admissible evidence that
the controller still needs the data only if it is intentional — otherwise it
measures system churn, not necessity — and constitutive, advancing the purpose
rather than merely observing the record. The doctrine is stated at
`src/lib/crm/retention-policy.ts:104-132` and mirrored on the spec's
`AutoCreatedHasRetention`. An enumerated list drifts the moment a new action
file lands and nobody can answer "does my new site count?" without asking the
author; a structural rule is auditable and survives new code.

Eight activity sites are wired, across nine exported server actions (the two
referral tips are one site, wired twice):

| Site | Call | Helper |
|---|---|---|
| `updatePerson` | `src/actions/person.actions.ts:401` | `touchPersonRetention` |
| `reactivatePerson` | `src/actions/person.actions.ts:472` | `touchPersonRetention` |
| `addJobContact` | `src/actions/jobContact.actions.ts:57` | `touchPersonRetention` |
| `createCrmNote` | `src/actions/crmNote.actions.ts:102` | `touchPersonsRetention` — every person target |
| `createCrmTask` | `src/actions/crmTask.actions.ts:121` | `touchPersonsRetention` — every person target |
| `scheduleInterview` | `src/actions/crmInterview.actions.ts:98` | `touchPersonRetention` |
| `addPersonConnection` | `src/actions/personConnection.actions.ts:89` | `touchPersonsRetention` — both endpoints |
| `recordInsiderTip` / `recordNetworkTip` | `src/actions/referral.actions.ts:100`, `:179` | `touchPersonsRetention` — all named roles |

The plural helper (`src/lib/crm/retention-policy.ts:151-161`) exists because
notes, tasks, connections and referrals can name several Persons in one act; it
drops nullish and duplicate ids and re-bases all of them in one `updateMany`.
Note and task touch **every** person target, not just the first — the event
payload carries only the first, for timeline placement, but every named Person is
equally evidence of necessity.

The rejections are the more valuable half of the decision, because they are what
a future reader will otherwise re-litigate.

| Rejected site | Why |
|---|---|
| `mergePersons` | The correct operation is `max(winner.deadline, loser.deadline)`, not `now + days`. Touching would give the winner a deadline **later than either input**, letting de-duplication *extend* retention — the same class of defect as walking the clock forward from the settings page. A different mechanism, so it needs its own decision; filed as an open question (`specs/crm.allium:1961`) rather than guessed at. |
| Lifecycle transitions — complete/cancel task, complete/cancel/reschedule interview, referral transitions | Genuinely ambiguous: completing a task is as consistent with "we are done here" as with "still working". The codebase's own recorded tie-break says ambiguous signals err toward retaining longer, which is the wrong direction under Art. 5(1)(e). Additive later if reality disagrees. |
| `archivePerson` | Archiving is the opposite of "still needed". Regression-tested. |
| Consent withdraw / reinstate | Lawfulness, not necessity — a different Article. |
| Removals (unlink, delete target) | Negative evidence by construction. |
| Read-only views | Rejected on the merits first: **a view is evidence of curiosity, not necessity.** Art. 5(1)(e) asks whether the data is still needed *for the purpose*, and opening a record to look at it advances no purpose. Both ways of counting one are also independently bad. Writing on the read path turns a GET into a mutation and makes it non-idempotent, and — decisively — **Next.js prefetches on link hover**, so a hovered list row, a back-navigation or a crawler would silently extend retention with zero user intent; that is the "system churn masquerading as necessity" failure `specs/crm.allium:1926` already condemns for `updatedAt`. A `PersonAccessLog` table plus a sweeper is correct in principle but **an access log of who viewed which data subject is itself personal data with its own storage limit** — it would create a fresh GDPR obligation in order to discharge an existing one, and still costs a write on every read. |

`reactivatePerson` runs the other way: it was **not** on the analysis's candidate
list and was included deliberately. The analysis excludes `archivePerson`
because archiving is the opposite of still-needed; by the same logic un-archiving
is the strongest still-needed signal in the aggregate. It also closes a live
defect, since the sweep guards only on `status != "anonymized"` and the clock
keeps running while a Person is archived — so restoring a Person one day before
their deadline would erase them the next, contradicting the intent the user had
just expressed (`src/actions/person.actions.ts:464-472`).

Every touch is deliberately weak by design. It runs *after* its action's write
and only on success, never inside a consent guard's path; it is wrapped
best-effort so a committed action can never be failed by the clock
(`src/lib/crm/retention-policy.ts:81-91`); its `where` carries `userId` per
ADR-015 and `dataSource: "auto_created"`, so manual and quick-capture contacts
are untouched; and it uses `updateMany` rather than `update` so a non-match
returns zero rows instead of throwing (`:85-88`).

### 4. No `Person.lastActivityAt` column

"Add a column" is the obvious suggestion and will be re-proposed unless the
reasoning has a home, so it is recorded here and at `specs/crm.allium:1963`.

`retentionExpiresAt` is already a **lossless** encoding of last activity given
the period: `lastActivity == retentionExpiresAt - days`. Every write path
preserves that identity — the initial `computeRetentionExpiry`, each touch, and
the delta re-base — and toggling `crmRetentionEnabled` shifts nothing.
`rebaseCrmRetention` depends on exactly that identity; it is what lets the
re-base be a delta shift and therefore idempotent. A column would be redundant
derived state: a second source of truth for a fact the first already carries
exactly, requiring a double write at eight touch sites, for no new fact. This
module already rejects a second owner in those words for the anonymise cascade
(`specs/crm.allium:891`).

The trade-off is accepted and stated: without a column, no surface can render
"last interaction: `<date>`" directly — it must be derived, and no UI asks for it
today. The one thing a column would genuinely fix is `rebaseCrmRetention`'s
null-deadline fallback, which uses `Person.updatedAt` as a proxy and so errs
toward retaining longer (`src/lib/crm/retention-policy.ts:213-215`); but that
branch is reachable only for a row that already violates the
`AutoCreatedHasRetention` invariant, so it is defence in depth against a
forbidden state, not a live path. **Re-open if** a UI needs the raw instant, or
a second retention clock with a different period appears — at which point one
materialised deadline stops being sufficient.

## Structural consequence: the session-free cascade

This is not a fifth decision but a change forced by the first one, recorded
because it moved a GDPR-critical code path between files.

`anonymizePerson` opened with `getCurrentUser()`, and a cron has no session. Its
body moved to `src/lib/crm/anonymize-person.ts` — `import "server-only"` at `:1`,
taking `userId` explicitly at `:51-56` — and `anonymizePerson` remains a thin
auth wrapper owning the session check, the ADR-015 ownership lookup and the
terminal-status guard (`src/actions/person.actions.ts:568-598`). The precedent is
`src/lib/account/execute-deletion.ts:1-12`, which uses the identical shape for
the identical reason and which this cron already imported
(`src/lib/scheduler/crm-cron.ts:25`).

ADR-019 is satisfied because the helper is a `server-only` leaf, not an export of
a `"use server"` file, so accepting a raw `userId` does not expose a callable
Server Action. ADR-015 is satisfied because every inner `where` still carries
`userId`; the cron supplies it from the row it already owns.

One subtlety is worth keeping, because it was nearly missed. The cascade ends
with `writeDataAuditLog({ actorId, actorEmail, … })`
(`src/lib/crm/anonymize-person.ts:232-238`), and a cron has no `user.email`. The
helper therefore takes an explicit actor descriptor
(`AnonymizePersonOptions.actorEmail?: string | null`, `:36-40`) and the cron
passes `null` (`src/lib/scheduler/crm-cron.ts:125-130`) rather than inventing an
address — the audit row records the account owner as actor with no email. The
same options object carries `reason: "retention_expired"`, which widened
`ContactDeletedPayload.reason` and its Zod schema together
(`src/lib/events/event-types.ts:246-247`, `src/lib/events/event-schemas.ts:246`).

## Consequences

### What improves

Retention now actually ends processing, and the fix is a delegation rather than a
new mechanism, so there remains exactly one owner of the erasure cascade. The
timeline no longer receives a fresh copy of the name at the moment of expiry, so
expiry shortens rather than lengthens the identifier's life. The widened guard
means manually-archived records can no longer escape retention. The clock
measures necessity instead of approximating it from a creation date, which is
what Art. 5(1)(e) asks for and what a controller has to be able to articulate
under Art. 5(2) — and it is a *bounded* necessity test, since the period has no
"never" option. Because the touch is scoped to `auto_created`, none of this
touches contacts the user entered themselves, and the UI scope line says so
plainly: "contacts JobSync created automatically", not "your contacts"
(`src/i18n/dictionaries/settings.ts:248`).

The verified state at `669104a0` is 314 suites / 5767 tests passed / 0 failed,
`scripts/typecheck-safe.sh` exit 0, `allium check` 0 errors and 269 warnings, and
`check-spec-refs` 38 references resolved / 0 dangling. That last figure carries a
caveat: `scripts/check-spec-refs.mjs` does **not** exist on this branch — it
lives on `feat/quick-capture-and-referral-events` at `cb614f9c` — so the check
cannot currently be re-run from this lineage.

### What this costs, and should be weighed

**A reversible outcome became an irreversible one, and it now happens
unattended.** `anonymized` is terminal, so an erasure that should not have
happened cannot be undone from inside the product. The gate is deliberately
narrow — auto-created provenance, past deadline, policy enabled, and the default
period unchanged at 730 days — and this is precisely the point of the change
rather than a side effect of it. It is nonetheless the one property a reviewer
should satisfy themselves about, because everything else here is recoverable and
this is not. The clock work in `669104a0` is what makes it defensible: on the
one-site version, an unattended irreversible erasure could fire on the
anniversary of the last *name edit*.

**`rebaseCrmRetention` is a read-then-write loop that runs inside a settings
save.** It is bounded by `CRM_CONFIG.maxPersonsPerUser` (10 000) and today by the
fact that nothing creates auto-created Persons at all
(`src/lib/crm/retention-policy.ts:202-205`), so it is cheap now. If an
auto-creation writer ever lands and produces thousands of rows per user, changing
the retention period becomes a slow synchronous action and the rebase wants to
become a background job. Recorded here rather than pre-solved, since the
triggering condition does not exist yet.

### What was deliberately left undone

**The pre-expiry notice is not built, and shipping it half-right would be worse
than not shipping it.** A `Notification` row lives 30 days, so a notice fired 14
days before erasure leaves a **named residue roughly 16 days *after* the erasure
that existed to retire the name** — unless it uses the late-binding pattern
(ADR-030) with `personId` in `titleParams` rather than a rendered name in
`message`. The consumer half already assumes exactly that shape and is
implemented and tested (`buildNotificationActions("retention_expired", {
personId })` at `src/lib/notifications/deep-links.ts:325-330` and `:580`,
covered by `__tests__/notification-deep-links.spec.ts:116-126`). Rather than delete the
now-unemitted enum member, `ReminderTriggered(reason: "retention_expired")` is
kept and documented as **reserved** for this, with the trap and a naming caveat
recorded at `src/lib/events/event-types.ts:266-292` and the matching Zod comment
at `src/lib/events/event-schemas.ts:267-270`. The caveat: a *pre*-expiry notice
fires before expiry, so the honest member is `retention_expiring`; whoever builds
it should rename or add rather than inherit the mismatch.

**Retention for `quick_capture` Persons is an open question nobody has settled.**
The rule keeps its `is_auto_created` guard, so a quick-captured contact today
carries no retention leash and is governed exactly like a manual create. The
question is stated at `specs/crm.allium:1953`. This change makes it easier to
answer without answering it: a last-activity leash is a defensible default for
*both* provenance sources, which removes the sharpest edge — a deliberate user
act being erased on an arbitrary anniversary — but does not decide whether
`quick_capture` should carry a leash at all. The UI scope wording is honest about
today's behaviour in the meantime.

**Timeline (`CrmActivityLog`) retention is not resolved here and must not be.**
Ownership is settled — `gdpr-data-rights.allium`'s own scope line S4 lists
`crm/ActivityLog` among the system-wide retention policies it owns
(`specs/gdpr-data-rights.allium:9-10`), and `crm-gdpr.allium` excludes
system-wide retention — but the policy is a @rorar decision, recorded at
`docs/handoff-2026-08-30-retention.md` §4.1 and TODO-2. The live question is that
`CrmActivityLog` has **three** PII carriers (`targetPersonId`, `details`,
`linkedRecordName`) and the anonymise rule as specified nulls only the first,
while `crm/AnonymizePerson` scrubs all three — so anonymise-as-specified is
currently worse than deleting. Whatever is decided, it belongs in
`gdpr-data-rights.allium`, not here.

**`mergePersons` needs its own decision**, per §3 above:
`specs/crm.allium:1961` asks whether the winner should inherit the later of the
two deadlines and, if so, states that it belongs as an `ensures` on the rule.

**Two live behavioural gates are invisible to `allium check`**, recorded at
`specs/crm.allium:1965`: the sweep is skipped entirely for a user whose
`crm_retention_enabled` is false, and the period is a per-user choice rather than
`config.auto_created_retention`. Both live only in that rule's `@guidance`
(`specs/crm.allium:908-926`), stated as prose rather than as a `requires:`
because no user-configurable setting has a spec representation anywhere in this
codebase — `cooling_off_days` is equally unspec'd, so this is a pattern, not a
one-off. Minting a bespoke predicate form for one rule was rejected as spec
machinery with no precedent to keep it honest. The real question — whether Allium
should model `UserSettings` as an entity rules may read, or whether user
configuration is deliberately out of scope and should say so once, centrally —
is open (TODO-4).

**There is no E2E test for the retention settings** (TODO-9). CLAUDE.md wants at
least one per feature. The risk is low — a shadcn `Switch` plus `Select` inside
an existing settings section, and the server-action half is covered by
`__tests__/privacy-retention-settings.spec.ts` (defaults, `getPrivacySettings`,
ADR-019 boundary validation, and the persistence-plus-re-base path) — but no test
exercises the rendered control, and the gap exists because the VM could not take a Playwright
pass concurrently, not because it was judged unnecessary.

**One piece of copy is now an understatement.** The period description was
written at `72f4138f`, when `updatePerson` was the only wired site, and still
names only editing: `src/i18n/dictionaries/settings.ts:250` (EN), `:523` (DE),
`:796` (FR). After `669104a0` eight kinds of act advance the clock. Nothing it
says is false; it is simply no longer the whole rule, and it should be widened
the next time that namespace is touched.

## Related

- ADR-041 — `crm-gdpr.allium` depends on `crm.allium`; the dependency flip whose
  deletion of the duplicated `ExpireAutoCreatedContacts` left this normative
  question unanswered in the surviving owner
- ADR-037 — GDPR consent withdrawal and processing-restriction enforcement; the
  reason consent transitions are *not* clock-touch sites
- ADR-033 — GDPR data audit trail on `AdminAuditLog`; the writer the cascade
  calls with an explicit actor descriptor
- ADR-030 — notification late-binding; the pattern the deferred pre-expiry notice
  must use
- ADR-019 — `server-only` leaves and `"use server"` export security; why the
  extracted cascade may accept a raw `userId`
- ADR-015 — IDOR ownership scoping; preserved through the extraction
- `docs/wh-b3-retention-analysis.md` — the compliance analysis; §1.4 the latency
  correction, §2 the option table, §3 the (a)+(e) recommendation, §4.6 the
  pre-expiry notice sketch
- `docs/retention-settings-plan.md` — the settings half, including D2 ("off"
  semantics)
- `docs/fix-1-clock-notes.md` — the clock half, including the rejected sites
- `docs/handoff-2026-08-30-retention.md` — §4 open decisions, §5 TODO table
- `specs/crm.allium` — `rule ExpireAutoCreatedPersons` (`:874-927`) and the four
  W-B3 open questions (`:1953`, `:1961`, `:1963`, `:1965`)
