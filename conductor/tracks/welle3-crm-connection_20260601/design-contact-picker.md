# Design Note — Point-of-Contact picker (Welle 3 Phase 1, tasks 1.1–1.4)

ui-design consult, 2026-06-02. Actionable checklist for the implementer. No code.

## Reuse (IMPORTANT correction)
- **`InterviewForm.tsx` is SELECT-ONLY** — it has **no** inline "create new person" path
  (only select-existing + a `__clear__` em-dash row). Lift its person-select Popover+Command
  (lines ~443–513: trigger `role="combobox"`+`aria-expanded`, `Loader2` in `CommandEmpty` while
  loading, `getPersons({ pageSize: 200 })`, label `"First Last — primaryEmail"` via `parseEmails`,
  `setPersonSearch("")` reset on select).
- The **select-or-create-inline** pattern actually used in the Add Job dialog is
  **`src/components/ComboBox.tsx`** (`creatable` + `onCreateOption`; already does
  `shouldFilter={false}` + manual filter + `role="status" aria-live="polite"` announcer).
  **Recommended:** build the picker as a thin wrapper over `ComboBox`, wiring `onCreateOption`
  → `createPerson` (`person.actions.ts:70`, returns `ActionResult<{id}>`). If `createPerson`'s
  required `PersonInput` can't be satisfied from a single typed label, fall back to lifting
  InterviewForm's select-only Popover and **drop inline-create** (don't invent a mini person form).

## Scope + placement
- **Single optional contact at create time.** Multi-contact management (N:M list-builder) is
  deferred to the Job detail page (Phase 3 surface), NOT the create modal.
- **Render only when `!editJob`** (create-only, like `sendToQueue`). Editing existing JobContacts = detail-page concern.
- Insert a full-width block (`md:col-span-2`) **before the Tags block (~`AddJob.tsx:670`)**, after Company/Salary/Resume.
- Internal layout: section label, then 2-col sub-grid — person combobox (col 1) + role `Input` (col 2); stack on mobile.

## Anatomy
- **Person combobox:** label `crm.pointOfContact`, placeholder `crm.selectContact` (existing).
  Option label `"First Last — email"`. States: loading (`Loader2`), no-results (`crm.noContactsFound`),
  create-new (`CommandItem` "Create '{query}'" → `createPerson` → auto-select returned id),
  selected (filled trigger w/ `ChevronsUpDown`, NOT a chip), `__clear__` row to unset.
- **Role field:** plain `Input` (model `role` is free text), label `crm.contactRole`, placeholder
  `crm.contactRolePlaceholder`. **Disabled until a person is selected.**

## Validation / UX
- Contact fully optional — save with nothing selected → just don't call `addJobContact`.
- Role only meaningful with a person; if `personId` empty, **drop `role`** (never block save).
- Clearing the person resets/disables role (no stale role against no-person).
- No required-field markers (must read as optional).

## a11y
- Trigger `role="combobox"` + `aria-expanded`; accessible name via `FormLabel htmlFor`.
- Reuse `role="status" aria-live="polite" sr-only` announcer: announce on select + on create
  (`crm.contactSelectedAnnouncement` / `crm.contactCreatedAnnouncement`, `{name}` param).
- Focus order: trigger → CommandInput → items → Enter selects+closes+returns focus → Tab to role.
  Do NOT auto-focus role on enable (no focus theft). Tap targets ≥44px.

## Save wiring (the open question to resolve FIRST)
- `AddJobFormSchema` (`models/addJobForm.schema.ts`) += optional `contactPersonId?: string`, `contactRole?: string | null`.
- **OPEN — confirm `addJob` returns the new job id.** Two routes:
  - **(A) client post-save:** in `onSubmit` (create only), after `addJob` succeeds, if `contactPersonId`
    set → `addJobContact(newJobId, contactPersonId, contactRole || null)`, treat failure as
    NON-blocking (warn toast, don't roll back the job). Requires `addJob` to return the id.
  - **(B) server-side (more DDD-aligned, preferred):** pass contact fields into `addJob`; `addJob`
    calls the `jobContact.actions` repository after creating the job — one round-trip, respects the
    Job/Person aggregate boundary (Job action delegates to the JobContact repository, never writes
    JobContact directly). Pick (B) if `addJob`'s return shape can't cleanly expose the id.

## i18n (crm.* namespace, ×4 locales en/de/fr/es)
- New: `crm.pointOfContact`, `crm.contactRole`, `crm.contactRolePlaceholder`, `crm.createContact`
  (`{query}`), `crm.contactSelectedAnnouncement` (`{name}`), `crm.contactCreatedAnnouncement` (`{name}`).
- Reuse (do NOT recreate): `crm.selectContact`, `crm.noContactsFound`, `crm.searchContacts`, `crm.loadError`.
- Create-error: reuse existing `common.error` + `errors.unknown` like other creatable fields, no new key.

## Tests (TDD)
- 1.1 component test: Add Job renders the picker (only when `!editJob`); selecting a Person →
  on save `addJobContact` called with (jobId, personId, role). Role disabled until person chosen.
- 1.4 E2E happy-path (`e2e/crud/job-crud.spec`, read `e2e/CONVENTIONS.md`): add a job with a point of contact.
