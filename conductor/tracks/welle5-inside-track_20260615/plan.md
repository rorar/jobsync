# Implementation Plan: Welle 5 — Inside Track (Tippgeber/Vitamin-B)

**Track ID:** welle5-inside-track_20260615
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-15
**Status:** [ ] Not Started

## Overview

Implement the Allium-specified Inside Track behaviour (SoT: `specs/inside-track.allium`,
`crm.allium`, `crm-gdpr.allium`). Strict TDD. Critical path: **Phase 2 (Prisma) blocks
Phases 3/4/6**; Phase 1 (CRM prereqs) is independent and goes first. Phase ordering from
`docs/inside-track-implementation-debt.md`. Run `allium:weed` after spec-touching phases.

## Phase 1: CRM Prerequisites (IT-1, IT-2 — independent, low-risk)

Controlled contact-role vocabulary + company-position rename. No inside-track dependency.

### Tasks
- [x] Task 1.1: Add `JOB_CONTACT_ROLES` const + `isValidJobContactRole` runtime guard (mirror `RELATIONSHIP_TYPES`/`ActorType` in `src/models/job.model.ts`); unit tests first.
- [x] Task 1.2: Enforce role at the boundary in `addJobContact` (validate → reject invalid); regression test for invalid value.
- [x] Task 1.3: Migration script mapping existing free-text `JobContact.role` (known→enum, unmappable→null); idempotent; test on a seeded fixture.
- [x] Task 1.4: `CompanyAssociation.role` → `position`: rename interface field + `parseCompanies` (`src/models/person.model.ts`); data migration of `companies` JSON key role→position (+ parser backcompat read); tests.
- [x] Task 1.5: PersonForm — role `Input`→`Select` (JobContactRole), company `c.role`→`c.position` (`updateCompany` key); PersonDetailClient display; component tests; i18n keys (role labels + badge) × 4 locales.
- [x] Task 1.6: Role badge on Person (ROADMAP 2244) derived from primary JobContact.role; component test.

### Verification
- [ ] tsc 0, jest green; dictionary test 4 locales; `allium:weed` shows JobContactRole + position aligned (crm.allium 0 drift).

## Phase 2: Persistence Foundation (IT-4 — blocks 3/4/6)

Prisma models for Referral + PersonConnection.

### Tasks
- [x] Task 2.1: `Referral` model (kind, nullable tipster/forwarded_to/insider/via/target_company, status, received_at, last_activity_at, updated_by_type/id, timestamps; `@@index([userId])`); `Job.sourceReferralId` back-ref. Domain model types in `src/models/`.
- [x] Task 2.2: `PersonConnection` model (userId, fromPersonId, toPersonId, kind, strength, notes, createdAt; `@@unique([userId, fromPersonId, toPersonId])`, indexes).
- [x] Task 2.3: Prisma migration; verify zero data loss + engine-rpath (NixOS) per CLAUDE.md; `prisma generate`.
- [x] Task 2.4: Lifecycle/transition validators (`isValidReferralTransition`) + ConnectionKind/Strength guards (ADR-019); unit tests first.

### Verification
- [ ] Migration applies clean on a copy; tsc 0; validator unit tests green.

## Phase 3: Referral Lifecycle & Actions (IT-5a)

### Tasks
- [x] Task 3.1: `referral.actions.ts` Repository (ActionResult<T>, userId-scoped, session user only): RecordInsiderTip/RecordNetworkTip (create), ApplicantEngages/IntermediaryRelays/TargetReviews/DeclineReferral/ReviveReferral (status-gated transitions). Tests first per transition (incl. illegal-transition rejection).
- [x] Task 3.2: `personConnection.actions.ts` (add/remove/list; from≠to guard; unique guard; max-per-user cap). Tests.
- [x] Task 3.3: `TipReifiesToJob` — commit-to-apply creates a Job; `resolve_applied_status` helper (applied-kind→default→any, never null) via `status-categories`; tests incl. no-applied-status fallback.
- [x] Task 3.4: `ReferralGoesStale` in CRM cron (`crm-cron.ts`); idempotent; consent-block respected for any reminder; test with fake clock.

### Verification
- [ ] All transitions match `specs/inside-track.allium` graph; jest green; `allium:weed` 0 drift on Referral rules.

## Phase 4: Warm-Path Discovery (IT-5b)

### Tasks
- [x] Task 4.1: `findWarmPaths(company)` server action — 1-hop insiders (CompanyAssociation.companyId incl. former/endDate) + 2-hop (PersonConnection); rank by strength + recency (active before former). Tests.
- [x] Task 4.2: Consent-block exclusion (`isConsentBlocked`) for every surfaced person — satisfies `@guarantee ExcludesConsentBlockedPersons`; regression test with a withdrawn-consent person.

### Verification
- [ ] Finder excludes consent-blocked; depth capped at config.max_warm_path_depth; jest green.

## Phase 5: UI & i18n (IT-5c)

Design gate DONE (2026-06-15): `docs/design/inside-track-ui.md` (frontend-design + ui-designer +
accessibility-expert). IA: new `/dashboard/referrals` route + `[id]` workspace PAGE; WarmPathFinder
panel reused on `myjobs/[id]`; components in NEW `src/components/inside-track/`.

### Tasks
- [x] Task 5.0: Referral READ actions (gap — `referral.actions.ts` is write-only): `getReferral(id)` + `listReferrals({jobId?})` (ActionResult, userId-scoped, explicit `select`; resolve tipster live per @guarantee TipsterShownLive — no snapshot). Mirror `listPersonConnections`. Tests first.
- [x] Task 5.1: `TipCapture` (quick-add insider/network tip + add connection) — consult ui-design agent first; component tests.
- [x] Task 5.2: `ReferralWorkspace` (status-gated lifecycle actions, exposes per spec); component tests.
- [x] Task 5.3: WarmPathFinder panel on Job/Company (reveals the path); component tests.
- [x] Task 5.4: i18n keys (own `insideTrack.*` namespace) × 4 locales; dictionary test.
- [x] Task 5.5: E2E happy-path (record tip → engage → relay → in_review → reify to Job), per `e2e/CONVENTIONS.md`.

### Verification
- [x] Component green (260+ inside-track tests); dictionary 4 locales; a11y encoded in component tests (design gate + ui-designer + accessibility-expert). E2E written, RUN-deferred (env-blocked global-setup). Full jest suite + build at Phase 7.

## Phase 6: GDPR Integration (IT-3, IT-6)

### Tasks
- [ ] Task 6.1: Extend `anonymizePerson` cascade — sever tipster/forwarded_to/insider, null `via`, delete PersonConnection, decline/detach Referral (status≠converted→declined, converted→detach only), scrub draft refs (no-op until cv-document). Regression test asserting no re-identifying ref survives → satisfies `AnonymizeCascadesToInsideTrack`.
- [ ] Task 6.2: Add Referral + PersonConnection to `collect-user-data` + `gdpr-data-rights.allium UserDataExport` (Art. 15/20); export test.

### Verification
- [ ] Anonymize leaves no inside-track PII; DSAR export includes new entities; `allium:weed` 0 drift on crm-gdpr + inside-track GDPR rules.

## Phase 7: Drift-Gate & Wrap-up

### Tasks
- [ ] Task 7.1: `allium:weed` full pass over the three specs ↔ code; resolve any residual drift.
- [ ] Task 7.2: `/comprehensive-review:full-review` (architecture/security/perf/testing/best-practices); fix findings.
- [ ] Task 7.3: blind-spot analysis; `/understand` graph refresh (Welle-end rule); docs (User Guide + ADR if architecture decision).

### Verification
- [ ] Honesty-gate (2 questions) pre-push; full suite green; tsc 0; build clean; allium 0 drift.

## Final Verification
- [ ] All acceptance criteria (spec.md) met
- [ ] Tests passing (unit + component + E2E + dictionary)
- [ ] `allium:weed` 0 drift on inside-track / crm / crm-gdpr
- [ ] Docs updated; ready for review

---

_Generated by Conductor. Behaviour SoT = Allium specs. IT-7/IT-8 (cover-letter, outreach) are OUT of scope — gated on cv-document 4.2 / 1.12 Communication._
