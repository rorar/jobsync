# Welle 3 full-review — consolidated report (2026-06-11)

Branch `welle-3-crm-connection` vs merge-base `92ded71e`. Ran in substance (3 parallel
specialized reviewers: security+architecture, testing+performance, best-practices+i18n),
autonomous, every finding verified against the actual diff before action.

## Findings + disposition
- **HIGH (Testing)** — recruiter persistence/ownership/validation in addJob/updateJob was
  UNtested (job.actions.spec had 0 recruiter refs). FIXED: +4 tests (persist on create+update,
  cross-user recruitingCompany rejection CON-C01, invalid relationshipType→null ADR-019).
- **MEDIUM (i18n)** — AddJob `SelectFormCtrl label="Relationship"` hardcoded English →
  "Select Relationship" placeholder/aria in all locales. FIXED: `label={t("crm.relationshipType")}`.
  (Residual: SelectFormCtrl's "Select " prefix is hardcoded across ALL call sites — pre-existing,
  follow-up.)
- **LOW (Security, defense-in-depth)** — crm-activity-logger company resolution used unscoped
  `job.findUnique`. Not exploitable (jobId always from a userId-verified action) but a latent
  foot-gun. FIXED: switched all 6 job lookups to `findFirst({ id, userId })`.
- **LOW (dead code)** — `isValidActorType`/`ACTOR_TYPES` unused. ACCEPTED: documented forward-
  provision for ROADMAP 9.5/1.12 (ADR-035); not a CI risk (knip is on-demand).
- **LOW (test scope)** — dictionary-completeness.spec only guards 3 errors.* keys, not CRM parity.
  Pre-existing; the 8 new keys ×4 locales were manually verified present. Follow-up.

## Confirmed-holding (two reviewers, cited lines)
ADR-015 IDOR (every new Prisma query userId-scoped incl. getActivityTimeline company filter,
isHandleBlocked findMany, recruiter FK-ownership in addJob/updateJob); ADR-019 erased-union
runtime validation (relationshipType at both write paths); ReDoS-safe matchGlobPattern
(linear segment scan, no regex); no JOB_*_SELECT leak (relation+enum exposed, raw FK not);
no XSS (React-escaped, no dangerouslySetInnerHTML); DDD aggregate boundaries clean (Route A;
recruiter fields on Job aggregate); ContactUpdated jobId backward-compatible; migrations additive.

## Result
No Critical. 1 High + 1 Medium + 1 Low FIXED; 2 Low accepted/deferred-with-note.
Post-fix: tsc 0; 114 affected-suite tests green.
