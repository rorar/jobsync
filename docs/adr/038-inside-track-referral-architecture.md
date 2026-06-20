# ADR-038: Inside Track — Referral Aggregate, Reification & Picker Architecture

**Status:** Accepted
**Date:** 2026-06-20
**Context:** Welle 5 — Inside Track (Tippgeber / Vitamin-B). Behaviour SoT:
`specs/inside-track.allium` (+ `crm.allium`, `crm-gdpr.allium`); UI design:
`docs/design/inside-track-ui.md`. This ADR records the decisions + rationale; it
does not restate the specs.

## Context

"Inside Track" models warm referrals: a tipster opens a door into a role/company,
either by relaying the applicant's documents (works *at* the company) or by
brokering an introduction to an insider (knows someone there). It needs its own
lifecycle, a person-to-person network for 2-hop discovery, and a GDPR erasure
story — without polluting the Job aggregate or the Job list.

## Decision

### 1. Referral = independent, Person-adjacent aggregate; sum type, ONE shared lifecycle
`entity Referral` is a sum type `InsiderRelay | NetworkPath` (variants carry only
their structural fields) over a **single** status graph:
`open → engaged → relayed → in_review → converted | declined | stale`. It is its
own aggregate with nullable FKs to Person (tipster/forwardedTo/insider), Company
(target), and Job (reified) — it is **not** part of the Job aggregate.
Controlled vocabularies (`kind`, `status`, `ConnectionKind`, `ConnectionStrength`)
are app-level enums (TEXT + runtime guards) since SQLite has no native enums —
mirrors `RelationshipType` / `JobContactRole` (ADR-019 boundary validation).

### 2. TipReifiesToJob — a tip becomes a Job only on commit
A Job is created only when the user commits to apply **and** a target company is
known (`in_review → converted`, atomic with `JobStatusHistory` + a `JobStatusChanged`
event, mirroring `addJob`). Target status resolves via
`resolve_applied_status` (applied-kind → user default → any; never null). Until
then the Referral itself is the lightweight opportunity holder, so unmaterialised
tips never appear in the Job list.

### 3. Shared CRM pickers; Inside Track gets its own component dir
`myjobs/JobContactPicker` promoted to **`crm/ContactPicker`** (a shared,
select-existing CRM-contact widget); new **`crm/CompanyPicker`**. Rationale: a
contact/company picker is a CRM (Person/Company) concern — promoting it avoids an
`inside-track → myjobs` cross-context import and duplication. `WarmPathFinder`
(consumed by both the workspace and `myjobs/JobDetails`) lives in a **new
`src/components/inside-track/`** dir so it does not force the reverse
`myjobs → crm` coupling.

### 4. GDPR severing cascade (AnonymizeCascadesToInsideTrack)
`anonymizePerson` (already keeps the Person row, status=anonymized + PII nulled)
additionally, in the same `$transaction`: hard-deletes `PersonConnection` edges
touching the person (`Referral.viaId` is `onDelete:SetNull`, so dangling `via`
auto-nulls — G-B); severs `forwardedTo` / `insider`; de-identifies tipster
referrals (working → `tipster=null` + `declined`; terminal → `tipster=null` only).
DSAR export (`collect-user-data` + `gdpr-data-rights.allium UserDataExport`)
covers Referral + PersonConnection. `via` is auto-resolved server-side in
`recordNetworkTip` (≤1 edge per ordered pair), enforcing
`NetworkPathViaConnectsTipsterToInsider` at the boundary.

## Consequences

- **+** New referral kinds (e.g. endorsement-derived, ROADMAP 4.10) reuse the one
  lifecycle + add only structure + per-step i18n label.
- **+** Referral channel recorded by the `source_referral` link, orthogonal to Job
  `relationshipType`; speculative tips never pollute the Job list.
- **+** Pickers consolidated in `crm/`; bounded-context imports stay acyclic.
- **−** Any NEW Person-processing path must keep adding the `isConsentBlocked`
  gate (ADR-037) and userId scoping (ADR-015); the GDPR cascade is enumerated +
  regression-tested, not a DB invariant.
- **−** Referral lifecycle changes currently emit **no domain events**, so they
  are not yet on any CRM timeline (deferred — `docs/inside-track-implementation-debt.md` §F).

## Deferred / follow-ups (tracked)

- **Combobox consolidation** onto `ui/base-combobox.tsx` (C4 ComboBox Recommendation 2).
  `BaseCombobox` first needs trigger `aria-label`, an `aria-live` announce, a loading
  slot, and overridable width/`capitalize`; migrate **all** specialised comboboxes in
  one pass — piecemeal would regress a11y. (§G)
- **Inline quick-create in pickers** (contact + company) — future UX; complements
  ROADMAP 2.20 (Spotlight Action-Registry) + 2.16. (§G)
- IT-7 (cover-letter tipster ref ← cv-document 4.2) + IT-8 (outreach tone-gate ←
  1.12 Communication) remain roadmap-gated. (§E)

## Alternatives rejected

- **Two separate entities** (InsiderRelay, NetworkPath) — duplicates the identical
  lifecycle; harder to extend.
- **Superset entity + carving invariants** — less Allium-idiomatic than structural
  variants over one aggregate.
- **Create the Job early in a `lead` status** and move it on conversion — would put
  unmaterialised tips in the Job list; rejected in favour of the Referral holding
  the pre-application opportunity.
