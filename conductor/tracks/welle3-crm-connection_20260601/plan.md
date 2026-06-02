# Implementation Plan: Welle 3 — CRM-Verbindung (Kette C)

**Track ID:** welle3-crm-connection_20260601
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-01
**Status:** [ ] Not Started

## Overview

Mostly UI/wiring over an existing CRM backend, with two small backend extensions.
F-AJ-07 (contact picker) lands first; F-AJ-08 (recruiter triangle) follows; the three
Gap items parallelise. TDD; UI phases consult the ui-design agents before implementing.

## Domain Findings (exploration 2026-06-02 — `/understand-domain`, verified vs HEAD `92ded71`)

Locked decisions + overlooked cross-aggregate items surfaced before implementation:

- **P3 DECIDED — extend, don't fork.** Add optional `targetCompanyId` to `getActivityTimeline`
  (`crmActivityLog.actions.ts:31-35`) + `ActivityTimeline.tsx:16-50`. Do NOT build a separate
  `CompanyTimeline` — spec `crm.allium` CompanyTimeline = identical fields/contract/ordering as
  Person/Job, read action already `include`s `targetCompany`. A fork only duplicates icon-map +
  filter UI + i18n.
- **P3 real blocker is upstream.** The `targetCompanyId` FK (mig `20260510193831`) is **never
  populated** by any of the 11 projections (`crm-activity-logger.ts:97-290`) → company timeline is
  empty until projections resolve `companyId → targetCompanyId`. P3 must patch the relevant
  projections to set `targetCompanyId`, else the reused timeline shows nothing.
- **P1↔P3 coupling.** `addJobContact` emits `ContactUpdated` with only `{personId, userId}`
  (`jobContact.actions.ts:38`) → projection writes `targetPersonId` only, **no `targetJobId`**.
  Linking a person to a job is invisible on the Job timeline. P1 must enrich the event payload +
  the `ContactUpdated` projection with `targetJobId` (+ resolve `targetCompanyId` from job's company).
- **P1 picker has no caller today.** `addJobContact` has **zero callers**; the only existing
  person-combobox pattern is `InterviewForm.tsx:441-486` (reuse, don't reinvent). Person-side host
  = `PersonDetailClient.tsx` "Related Jobs" tab (~`:144`); job-side host arrives with P1/P3.
- **P4 honesty — no auto-creation flow exists.** `isHandleBlocked` (`crmBlocklist.actions.ts:103-119`)
  has **zero callers** and is **exact-match only** (ignores `BlocklistType`). P4 = extend matcher
  (domain-suffix + ReDoS-bounded pattern) + settings UI; the "wire into auto-creation" is a FUTURE
  hook (no person auto-creation today — `enrichment-trigger` never does participant matching).
- **P4 anonymize parity.** `anonymizePerson` blocklist cleanup (`person.actions.ts:425-430`) deletes
  **exact email** only; spec `AnonymizePerson` also wants **domain-type** removal. When P4 adds domain
  matching, the anonymize branch needs symmetric domain-handle deletion or the invariant drifts.
- **P2 API leak.** New `recruitingCompanyId`/`relationshipType` MUST be added to `JOB_*_SELECT` in
  `src/lib/api/helpers.ts` (explicit select — never `include`).
- **P3 IDOR.** Gate company timeline by `crmActivityLog.userId = user.id AND targetCompanyId = X`.
  Do NOT assume a `Company.userId` join (Company is a shared lookup).
- **P5 carve-out (DECIDED, see memory `welle3-p5-actor-tracking-decision`).** Person KEEPS
  name-string + source-tag actor model (anonymize-safe; future ROADMAP 9.5 self-submitters have no
  User account). Add `updatedBy` User FK ONLY to internal CRM entities (CrmInterview/Task/Note/Blocklist).
- **i18n pre-existing gap.** `ACTIVITY_TYPES` (`ActivityTimeline.tsx:39`) is missing
  `vacancy_promoted`/`automation_degraded` though both are projected; P3 reuse inherits it — fix while there.

## Phase 1: F-AJ-07 / Gap-1 — Point-of-Contact picker in Add Job

### Tasks

- [x] Task 1.1: Component test: Add Job renders a Person picker; selecting a Person creates
      a `JobContact` (with optional role) on save. DONE — `JobContactPicker.spec.tsx` (8 tests) +
      AddJob create-mode render + submit-shape assertions.
- [x] Task 1.2: Build the contact-picker UI (reuse the Person search/create flow); wire to
      `jobContact.actions.ts` (NOT `job.actions.ts` — aggregate boundary). DONE (commit edce548):
      `JobContactPicker` (select-only, cmdk, mirrors CountrySelect); AddJob create-only block +
      Route-A non-blocking link after addJob; `AddJobFormSchema` += contactPersonId/contactRole.
      Inline person-create intentionally deferred (lossy from a single label; lives on /contacts).
- [x] Task 1.3: i18n picker/role labels (en/de/fr/es). DONE — crm.pointOfContact /
      contactRolePlaceholder / contactSelected ×4; dictionary-completeness green.
- [x] Task 1.4: E2E happy-path: add a job with a point of contact; build + tests. DONE (commit
      27c970b): job-crud cross-aggregate test (create person → job w/ contact → verify on
      Related Jobs → cleanup). Type-checks in-project (tsc 0); executes in the Playwright suite run.
- [x] Task 1.5: Enrich `ContactUpdated` payload + projection with `targetJobId` (+ resolve
      `targetCompanyId` from the job's company) so a job↔person link is visible on the Job/Company
      timeline (closes the P1↔P3 coupling gap). Projection test asserts both targets written.
      DONE (commit f7503e8): optional `jobId` on payload/schema, both emitters carry it, projection
      resolves company via `job.findUnique`; 27 tests green, tsc 0. (link/unlink both covered.)

### Verification

- [x] Creating a job with a contact persists a `JobContact`; picker reuses the Person select flow.
- [x] Linking a person to a job produces a `CrmActivityLog` row carrying `targetJobId` (+ company).

## Phase 2: F-AJ-08 — Recruiter triangle (depends on F-AJ-07)

### Tasks

- [x] Task 2.1: Unit test: `relationshipType` boundary validation (runtime membership) +
      hiring-vs-recruiting company distinction. DONE — `relationshipType.spec.ts` (4 tests):
      RELATIONSHIP_TYPES const + `isValidRelationshipType` (erased-union guard, ADR-019).
- [x] Task 2.2: Prisma migration: add `recruitingCompanyId` (FK) + `relationshipType` to Job.
      DONE — migration `20260602090323`; named "HiringCompany"/"RecruitingCompany" relations,
      Company back-relation + index; FK onDelete SetNull.
- [x] Task 2.3: UI to set the recruiting company + relationship type on the Job form. DONE
      (commit 5b6d848): recruiting-company combobox (creatable) + relationship-type select in
      AddJob, create + edit, prefilled on edit. addJob/updateJob persist + FK-verify ownership +
      sanitize type; getJobsList selects the relation; JOB_*_SELECT leak-guarded (relation+type,
      not raw FK).
- [x] Task 2.4: i18n relationship-type labels; build + tests. DONE — crm.recruitingCompany /
      relationshipType / relationship.{direct,recruiting_agency,staffing_agency} ×4;
      dictionary-completeness green. Spec: job-aggregate.allium RelationshipType + invariant (via /tend).

### Verification

- [x] A job can record a distinct recruiting agency + relationship type; invalid types rejected
      (isValidRelationshipType at the boundary; recruitingCompany FK-ownership verified).

## Phase 3: Gap-5 — Job-detail CRM tab + CompanyTimeline (parallel)

### Tasks

- [x] Task 3.1: Component test: Job detail shows a CRM tab embedding the (extended)
      `ActivityTimeline` filtered by job + company. (NO separate CompanyTimeline component — DECIDED.)
      DONE — `crmActivityLog.actions.spec.ts` (filter+IDOR, 4) + projection company-population (2).
- [x] Task 3.2: Extend `getActivityTimeline` (+IDOR: `userId AND targetCompanyId`) and
      `ActivityTimeline.tsx` with an optional `targetCompanyId` prop; add the CRM section to the Job
      detail page (`JobDetails.tsx`) embedding it via props. DONE (commit 7a13b1a). NOTE: JobDetails
      is a flat stacked layout (no Tabs system) → added a labeled CRM section, not a literal tab.
- [x] Task 3.3: Patch the relevant projections (`crm-activity-logger.ts`) to populate
      `targetCompanyId` from the job's company. DONE — JobStatusChanged, InterviewScheduled,
      InterviewCompleted, VacancyPromoted (+ ContactUpdated from Task 1.5) now resolve companyId.
- [x] Task 3.4: i18n tab/timeline labels; complete `ACTIVITY_TYPES` + icons with the projected-but-
      missing `contact_deleted`/`automation_degraded` (the actual missing types; `vacancy_promoted`
      maps to the already-present `application_submitted`) + crm.activity.* ×4. DONE.

### Verification

- [x] Job page CRM section renders person + company timeline entries; company rows gated by `userId`.

## Phase 4: Gap-6 — Blocklist domain/pattern matching (parallel)

### Tasks

- [ ] Task 4.1: Unit tests: exact + domain + pattern matches; ReDoS-bounded; non-match passes.
- [ ] Task 4.2: Extend the `CrmBlocklist` matcher (`isHandleBlocked`) with domain-suffix + pattern
      modes honouring `BlocklistType`. NOTE: no person auto-creation flow exists yet (zero callers) —
      expose the matcher as the reusable suppression primitive; the auto-creation call-site is a
      future hook, not built here. Document this in the spec `@guidance`.
- [ ] Task 4.3: Anonymize parity — extend `anonymizePerson` blocklist cleanup
      (`person.actions.ts:425-430`) to also remove **domain-type** entries matching the person's
      email domain (spec `AnonymizePerson`), symmetric with the new domain matcher.
- [ ] Task 4.4: Settings UI for the new match modes; i18n; build + tests.

### Verification

- [ ] Domain + pattern blocklist entries match per `BlocklistType`; anonymize removes domain entries.

## Phase 5: Gap-7 — updatedBy FK tracking (parallel)

### Tasks

- [ ] Task 5.1: Migration test: existing name-based actor strings preserved/backfilled.
- [ ] Task 5.2: Prisma migration adding the `updatedBy` User FK to internal CRM entities ONLY —
      CrmInterview, CrmTask, CrmNote, CrmBlocklist. **Person is EXCLUDED** (keeps name-string +
      source-tag; DECIDED — memory `welle3-p5-actor-tracking-decision`, ROADMAP 9.5 self-submitters
      have no User account). Write an ADR for the carve-out.
- [ ] Task 5.3: Update the internal CRM action writers to populate the FK (ADR-015); build + tests.

### Verification

- [ ] `updatedBy` resolves to a User FK on internal CRM entities; Person actor model unchanged; historical actor data not lost.

## Final Verification

- [ ] All acceptance criteria met (F-AJ-07, Gap-5, F-AJ-08, Gap-6, Gap-7)
- [ ] `bash scripts/test.sh` green; `bun run build` zero type errors
- [ ] UI changes reviewed via ui-design agents + responsive check
- [ ] i18n consistent across en/de/fr/es
- [ ] Ready for review

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._

## Phase 6: Wrap-Up (finale Phase — vor Merge/Push)

Per `conductor/workflow.md` § Wrap-Up-Phase. Run only after all prior phases pass.

### Tasks
- [ ] Task 6.1: Blind-Spot-Analyse — projektweit `grep` nach den Pattern-Fixes dieses Tracks; adjacent Lücken schließen.
- [ ] Task 6.2: `/comprehensive-review:full-review` (Architecture+Security+Performance+Testing+Best-Practices) — alle realen Findings autonom fixen; Agent-Claims gegen `git diff`/Code verifizieren (kein Fabrizieren).
- [ ] Task 6.3: `/understand` inkrementell-Refresh + Graph-Commit (1× am Welle-Ende, NICHT per-Commit; `autoUpdate` OFF).
- [ ] Task 6.4: Honesty-Gate voll ausführen (2 Fragen: Shortcuts/fehlende Skills/Gaps? Docs/Handoff?).
- [ ] Task 6.5: Push eigenständig — nach Gate, Fork `main`, NIE upstream.
- [ ] Task 6.6: Doku-Update (README/User-Guide/API/ADR wo nötig) + `docs/BACKLOG.md` + `docs/BUGS.md` + Memory-Handoff aktualisieren.

### Verification
- [ ] full-review: keine offenen Critical/High. Honesty-Gate sauber. Auf Fork `main` gepusht. BACKLOG/BUGS/Docs synchron.
