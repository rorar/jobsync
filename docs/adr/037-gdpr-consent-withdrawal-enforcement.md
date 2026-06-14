# ADR-037: GDPR Consent Withdrawal & Processing-Restriction Enforcement

**Status:** Accepted
**Date:** 2026-06-14
**Context:** Tech-Debt Cleanup track, cluster 4 (BACKLOG §1b GDPR-Consent)

## Context

`Person.processingBasis` (`legitimate_interest | consent | contract`) was
**write-only**: set on creation, shown in the UI, and included in the DSAR
export, but never *enforced* and with **no way to withdraw consent**. DSGVO
Art. 7(3) requires that consent be withdrawable as easily as it was given, and
that after withdrawal the controller stops processing the data subject's data
(while processing performed *before* withdrawal stays lawful).

## Decision

Implement consent withdrawal as a **reversible, processing-restricting state**
that applies **only** to records held on the `consent` basis ("restrict +
exclude from active flows" — chosen over auto-anonymization, which would
conflate withdrawal with Art. 17 erasure).

### State + predicate
- `Person.consentWithdrawnAt` (`DateTime?`, nullable) — migration
  `20260614100117_add_person_consent_withdrawn_at`.
- `isConsentBlocked(person)` (`src/models/person.model.ts`) =
  `processingBasis === "consent" && consentWithdrawnAt != null`. Basis-gated, so
  a stray timestamp on a non-consent record is inert.

### Transitions (`src/actions/person.actions.ts`, owner-scoped per ADR-015)
- `withdrawConsent(personId)` — valid only when basis `consent` and not already
  withdrawn; sets `consentWithdrawnAt = now`.
- `reinstateConsent(personId)` — inverse. Both emit `ContactUpdated`.

### Enforcement points (all return `crm.errors.consentWithdrawn`)
Enforcement is at the **action/write boundary**, not a DB constraint — read
paths still return consent-blocked records so the operator can export / erase /
reinstate them.

| Function | File | Effect |
|---|---|---|
| `updatePerson` | `person.actions.ts` | blocks field edits |
| `scheduleInterview` | `crmInterview.actions.ts` | blocks new interview for the contact |
| `createCrmTask` | `crmTask.actions.ts` | blocks task targeting the contact |
| `createCrmNote` | `crmNote.actions.ts` | blocks note targeting the contact |
| `checkInterviewReminders` | `crm-cron.ts` | skips automated reminder |
| `checkOverdueTasks` | `crm-cron.ts` | skips reminder for tasks targeting the contact |

**Allowed while withdrawn:** export (Art. 15/20 — DSAR export includes
`consentWithdrawnAt`), anonymize/erase (Art. 17), delete, reinstate.

`rescheduleInterview` is intentionally NOT gated — it only re-dates an existing
interview and attaches no new contact (not new processing).

### Spec
`specs/crm-gdpr.allium` — `WithdrawConsent` / `ReinstateConsent` rules,
`ConsentBlockedRecordIsProcessingRestricted` + `ConsentBlockOnlyOnConsentBasis`
invariants, `consent_withdrawn_at` on `PersonGdprExtension` + `PersonDataExport`.

## Consequences

- **+** Art. 7(3) satisfied with a reversible, non-destructive model.
- **+** Single source of truth (`isConsentBlocked`); enforcement enumerated + tested.
- **−** Enforcement is per-entry-point (not a DB invariant); any NEW
  Person-processing path must add the `isConsentBlocked` gate. This is the same
  discipline as ADR-015 (userId in every query) and is pinned by the Allium
  invariant + regression tests.
- Read paths deliberately remain unrestricted (required for export/erasure).

## Alternatives rejected
- **Auto-anonymize on withdrawal** — conflates Art. 7(3) withdrawal with Art. 17
  erasure; destructive; withdrawal ≠ erasure request.
- **DB-level constraint** — cannot express "block edits but allow export/erase".
