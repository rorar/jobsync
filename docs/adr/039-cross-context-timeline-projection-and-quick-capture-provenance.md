# ADR-039: Cross-Context Timeline Projection & Quick-Capture Provenance

**Status:** Accepted
**Date:** 2026-08-17
**Context:** Closes `docs/inside-track-implementation-debt.md` §F (referral lifecycle
invisible on any CRM timeline) and the contact half of §G (inline quick-create gated on
a provenance decision). Behaviour SoT: `specs/event-bus.allium`, `specs/crm.allium`,
`specs/inside-track.allium`. Extends ADR-038 (referral aggregate) and ADR-035 (CRM
update-actor provenance). Records decisions + rationale; does not restate the specs.

## Context

Two gates blocked the next Inside Track wave, and both had to be decided **before** code
because neither is reconstructable afterwards:

1. **Referral lifecycle changes appear on no timeline.** `crm-activity-logger.ts` registers
   projections for JobStatusChanged / Contact\* / Interview\* / CrmTask\*, none for
   Referral. Only a *converted* referral is visible, via the reified Job's
   `JobStatusChanged`. This was not a broken contract — the spec defined no referral
   events, so nothing expected them.
2. **A contact quick-created inline from a picker is indistinguishable from a full manual
   create.** `CreatePerson` already permits a minimal contact, so the capability existed;
   what was missing was whether the *origin* is a durable fact. Contacts created in the
   gap are born ambiguous.

## Decision

### 1. Three-layer split: events register centrally, projections stay in the read model's owner

The spec layer mirrors the code layer, and that dictates the file split:

| Spec | Code counterpart | Gains |
|---|---|---|
| `event-bus.allium` | `event-types.ts` + `event-schemas.ts` | `DomainEventType` members + payload value types |
| `inside-track.allium` | `referral.actions.ts`, `crm-cron.ts` | the emissions |
| `crm.allium` | `crm-activity-logger.ts` | `ActivityType` members + the projection rules |

**`inside-track.allium` never writes into crm's read model.** `inside-track` imports `crm`;
crm does **not** import inside-track. Placing the projections in inside-track would invert
that and have a foreign context both writing crm's append-only `ActivityLog` and reaching
into crm's `ActivityType` enum. crm already consumes three foreign events *unqualified* —
`JobStatusChanged`, `VacancyPromoted`, `AutomationDegraded` — and Allium explicitly permits
responding to a foreign trigger with no declared extension point. We follow that precedent
exactly.

Accepted cost: two new `allium.rule.unreachableTrigger` infos, the same kind already carried
by those three projections.

### 2. Referral identity travels in `details`; no new target column

`ActivityLog` has `target_person` / `target_company` / `target_job` only. A `target_referral`
field would force `crm.allium` to depend on `inside-track.allium` — the direction Decision 1
exists to prevent. The referral identity therefore rides in `details` as a camelCase JSON
object, the convention already used by every projection
(`crm-activity-logger.ts:128, 191, 332, 346`).

Both `target_person` (tipster) and `target_company` are set when known, so one entry surfaces
on **both** `PersonTimeline` and `CompanyTimeline` — the two questions a referral answers.
`ActivityLog` carries no exactly-one-target invariant (unlike `TaskTarget` / `NoteTarget`), so
this is legal by construction.

### 3. `system_initiated` is carried explicitly on the status payload

The projection must distinguish the temporal stale sweep (no actor) from a user-driven
transition. Rejected: inferring it via `new_status = "stale"` — that couples crm to a status
literal owned by inside-track. A boolean on the payload is the honest carrier.

Consequence: `flagStaleReferrals` (`crm-cron.ts:115-121`) is today a blind bulk `updateMany`.
Per-referral events need `previous_status` and the tipster/company links, so it must become
read-then-update. It must also record `updatedByType: "automation"` rather than leaving the
last human editor in place (see BUGS IT-B4).

### 4. The GDPR cascade deliberately emits nothing

`AnonymizeCascadesToInsideTrack` moves working referrals to `declined`, yet is the **only**
status transition that does not project. The payload carries `tipster_person_id`, so
projecting here would write a *fresh* timeline entry naming the person being erased, while
`anonymizePerson`'s cascade is concurrently nulling `targetPersonId` + `details` +
`linkedRecordName` on that person's existing rows — an Art. 17 self-defeat. The erasure trace
stays `ContactDeleted(reason: anonymized)` → `RecordContactDeletion`, which is already
de-identified (`target_person: null`) by design.

### 5. Quick-capture origin is a `DataSource` literal, not a parallel governance state

`quick_capture` joins `manual | auto_created | imported` on the **same axis**. This reuses the
existing provenance machinery and the `AutoCreatedHasRetention` precedent (a `data_source`
value that implies governance) instead of inventing a second concept. Witnessed by
`rule QuickCapturePerson` + `surface PersonQuickCapture` (the picker modelled as an
embeddable boundary, not a page).

`created_by.source` stays `manual`: `ActorSource` is the *channel* a party acted through,
`DataSource` is how the record *originated*. Keeping the axes separate is why no new
`ActorSource` member was needed.

Explicitly **not** decided here, by design:

- **Completeness stays derived** (only name + one email present), never a stored flag. No
  consumer derives it yet; the first one that needs it adds it.
- **The consequences belong at their consumers:** outreach gating (IT-8,
  `communication-connector` `OutboundIsThirdPartyTransfer`), the completion nudge
  (ROADMAP 2.20), and bulk-import reuse (5.7/5.8 — imported contacts are minimal too and must
  reuse *this* fact rather than minting a second "incomplete contact" concept).
- **Retention posture is an open question** (`crm-gdpr.allium`). `ExpireAutoCreatedPersons`
  guards on `is_auto_created`, so a `quick_capture` Person is currently governed exactly like
  `manual`: no expiry. Recommended posture is manual-like — a quick capture is a deliberate
  user act, and incompleteness is a data-*quality* issue, not a lawfulness one — but it needs
  a documented balancing rationale before it is closed.

## Consequences

- **+** A referral's whole pre-conversion life becomes visible, on both the tipster's and the
  target company's timeline, without the Job aggregate learning about referrals.
- **+** Any future bounded context can project onto the CRM timeline by emitting an event and
  adding a projection in crm — no reverse dependency, no extension point to declare.
- **+** Quick-create can now ship for contacts without producing records whose origin is
  unknowable, and the seam exists *before* the first such write.
- **−** Timeline entries describe a referral but cannot deep-link to one; a consumer must
  parse `details`. Recorded as an open question proposing a nullable-FK seam mirroring
  `TaskTarget` / `NoteTarget`, deferred with a trigger (a second non-crm context wanting to
  project, or a click-through requirement).
- **−** `quick_capture` is not free to introduce: `event-schemas.ts:230` is a `z.enum` that
  rejects the value at runtime until updated, plus `person.model.ts:83`, `event-types.ts:223`,
  4 i18n keys, and the contacts filter UI.
- **−** The stale sweep must be rewritten from a one-statement bulk update to read-then-update.
- **Risk** — anonymization empties referral entries: the cascade nulls `targetPersonId` and
  `details`, so an anonymized tipster's referral rows keep only company + type + timestamp,
  becoming visible-but-unnavigable. Correct minimal de-identification or deletable? Open
  (item C-2), and an argument for the polymorphic seam.

## Deferred / follow-ups (tracked)

Full list in **`docs/session-2026-08-17-open-items.md`** (27 items, A–F). Directly load-bearing
for this ADR:

- `docs/BUGS.md` **IT-B2** — `details` is currently rendered to users as a raw JSON blob
  (`ActivityTimeline.tsx:143`, no `JSON.parse` anywhere). Blocks Decision 2 delivering a
  readable label.
- `docs/BUGS.md` **IT-B3** — `ActivityType.vacancy_promoted` is dead and the spec disagrees
  with the code (`application_submitted`); the label lookup has no fallback, so a missing
  i18n key leaks a key name. The two new activity types need 8 translations.
- `docs/BUGS.md` **IT-B4** — the stale sweep's actor attribution (Decision 3).
- Item **A-1** — the spec does not yet *witness* `updated_by_*`, which code sets on all four
  referral write paths (ADR-035 territory, spec-behind-code).

## Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Projections in `inside-track.allium` (as §F's wording suggested) | Inverts the dependency; a foreign context writing crm's append-only read model and its enum. §F's intent was "spec before code", not "one file". |
| `target_referral` column on `ActivityLog` | Forces `crm → inside-track`. Deferred in favour of a general polymorphic seam if a second context ever needs it. |
| Reuse `status_changed` for referrals | `status_changed` means "a Job's status changed"; a timeline showing both would make them indistinguishable. |
| Infer system-initiated from `new_status = "stale"` | Couples crm to a foreign status literal, and breaks the moment a user can mark a referral stale. |
| A stored "incomplete contact" flag | A second governance concept alongside `data_source`; and field emptiness is erased by the first edit, so it cannot serve as provenance. |
| A new `ActorSource` member for quick capture | Conflates the channel axis with the origin axis. |
