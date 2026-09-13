# ADR-046: Job E2E teardown moves to a Playwright fixture, and to the Public API

**Status:** Accepted
**Date:** 2026-09-13
**Context:** E2E-B38, E2E-B47 (`docs/BUGS.md`); narrows `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md`
**Related:** `specs/e2e-test-infrastructure.allium` (`FixtureOwnedTeardown`), `docs/adr/040-database-backed-integration-tests.md`

## Context

Five spec files (`e2e/crud/{job-crud,job-detail-panels,enrichment,kanban,job-status-crud}.spec.ts`)
deleted their own Jobs by clicking through the UI in a hand-written `test.afterEach` hook, each with
its own drifted copy of `ensureTableView`/`deleteJobTracked`. That mechanism caused two real, dated
bugs: E2E-B38 (2026-09-09) and E2E-B47 (2026-09-13), both false "already deleted" results produced
by DOM-locator fragility — a view-mode mismatch between Kanban and Table, and a hydration race —
because the teardown's only way to confirm a Job was gone was to look for its row on screen.

`specs/e2e-test-infrastructure.allium`'s `FixtureOwnedTeardown` rule already says ownership belongs
to a Playwright fixture, not a hand-written `afterEach`. But `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md`
(Accepted, 2026-09-02) had already evaluated exactly this move — its "Option 2: Ownership by
fixture, suite-wide" — and deliberately **deferred** it, because its own within-run residue
measurement found no model reaching a threshold that broke a later test in the same run. Job wasn't
even in that measurement's leak list. Reading the spec rule alone and acting on it would have
repeated a reasoning error this project had already corrected once: converting because a rule says
so, not because new evidence justifies it.

E2E-B38 and E2E-B47 are that new evidence — postdating ADR-045's measurement by a week, specific to
Job, not a re-litigation of the suite-wide question.

## Decision

Two changes, made together because implementing one meant rewriting the same code the other needed:

1. **Job deletion moves to `DELETE /api/v1/jobs/:id`**, resolved by `GET /api/v1/jobs?search=<title>`
   (exact-title-filtered against the OR-matched `search` field). No DOM state, no view mode, no row
   to fail to see.
2. **Teardown ownership moves from `test.afterEach` to one local `auto: true` Playwright fixture per
   file** — narrowly, for Job, not suite-wide. ADR-045's broader deferral stands unchanged for the
   ~24 other spec files still using `afterEach`/inline cleanup (four of which — `activity-crud`,
   `task-crud`, `keyboard-ux`, `profile-crud` — were found this session to have the identical
   ordering-sensitive shape; no new measurement exists for them, so this ADR does not touch them).

### The ordering hazard that shaped the fixture's actual scope

All five files' `afterEach` hooks do more than delete a Job: they sweep JobTitle/Company/Location
(and, per file, JobSource/Resume/JobStatus) afterward, in a REQUIRED order — the reference-table
deletes refuse while a Job still references them. The first design considered here converted only
the Job-deletion step into its own `test.extend()` fixture, leaving the reference sweep in
`afterEach`. That would have silently broken the required order: Playwright's `afterEach` hooks
ALWAYS run before any fixture's teardown code (verified directly against
`node_modules/playwright/lib/worker/workerMain.js:339` vs. `:345` — no exception), and Playwright's
own documentation confirms no interleaving is guaranteed between a bare `afterEach` and a fixture's
teardown otherwise — explicitly recommending, for exactly this situation, moving the whole related
setup/cleanup into one fixture rather than splitting it. So the fixture in each file wraps its
**entire** former `afterEach` body, same order, same steps — only the Job-deletion step's internals
changed from a UI click sequence to the two API calls above. This is now written up as reusable
guidance in `e2e/CONVENTIONS.md` § "Converting afterEach to a Playwright fixture — the ordering
trap", and forward-referenced from `docs/ROADMAP.md` §8.7 Phase 1 (Module SDK Developer-Doku) so a
future external module author writing co-located Playwright tests for their own module doesn't
rediscover it.

### Auth and seeding

A `PublicApiKey` row is seeded into `prisma/seed-e2e.ts` (idempotent, upserted on `keyHash`), using
the real `hashApiKey()`/`getKeyPrefix()` from `src/lib/api/auth.ts` rather than a local
reimplementation, so the seed can never drift from what `validateApiKey()` actually checks. Its one
shared plaintext lives as a single exported constant in `e2e/helpers/api-key-fixture.ts` (not an env
var — the seed and Playwright run as separate processes against a cached, hash-keyed template; see
that file's own header for the full reasoning). No environment-derived double-gate exists or was
added, unlike `E2E_AUTH_RATE_LIMIT_BYPASS`: nothing in the Public-API-key auth path branches on
`NODE_ENV`, so a seeded key is a real credential in every environment — "test-only" comes entirely
from where it's provisioned (only ever inserted into the disposable per-run template database), not
from a code-level gate.

## Two bugs the migration exposed, not caused

Exercising the Public API v1 from a real caller for the first time — this fixture — surfaced two
independent, pre-existing production bugs, both fixed in the same pass (`docs/BUGS.md` E2E-B48,
E2E-B49):

- **E2E-B48**: `GET /api/v1/jobs?search=` used Prisma's `mode: "insensitive"`, a Postgres-only
  option; this project runs SQLite, which rejects it outright. Every call to this endpoint 500'd
  since it shipped. The existing Jest test mocked Prisma and only proved the application code SENT
  that argument, never that Prisma would ACCEPT it — the same "mock encodes the same assumption as
  the implementation" gap ADR-040 was written to name.
- **E2E-B49**, more serious: `src/auth.config.ts`'s `authorized` callback redirected any
  already-logged-in request to `/dashboard` for every matched route other than `/dashboard` itself —
  correct for `/signin`/`/signup`, but `/api/v1/:path*` shares the same middleware matcher (added for
  CORS/security headers, not this redirect) and fell into the same branch. Any Public API caller
  that also carried a valid dashboard session cookie — the browser extension ROADMAP names as the
  Public API's primary external consumer (2.17), running in the same browser as a logged-in
  dashboard tab, is exactly that caller — was silently redirected before its Bearer token was ever
  checked. Zero test coverage existed for this callback; `__tests__/auth-authorized-callback.spec.ts`
  now pins it.

Both are recorded as their own `docs/BUGS.md` entries with full reproduction detail, not folded into
this ADR's own consequences — they are Public API v1 correctness bugs that happen to have been
found via this migration, not a property of the migration itself.

## Consequences

### Positive

- The four DOM-dependent bug classes E2E-B38/E2E-B47 exposed (view-mode mismatch, pagination edge,
  aria-hidden interaction, hydration race) cannot recur for Job teardown: there is no DOM state left
  to misread.
- Measured: the migrated suite (28 tests across the 5 files) dropped from ~8.4-8.5 minutes to 2.3
  minutes — API round trips replacing UI click-and-wait chains.
- `FixtureOwnedTeardown` is now satisfied for Job's entire cleanup chain, not just the Job step,
  across all 5 files — closing more of the spec-vs-code gap than the narrower Job-only design would
  have.
- Two real, dated production bugs in the Public API v1 (E2E-B48, E2E-B49) are fixed, each with a
  regression test that didn't exist before.

### Negative

- A second authenticated path into the application (Public API v1, via a seeded key) now exists
  specifically for E2E teardown, alongside the UI path the suite still uses to prove deletion works
  in `job-crud.spec.ts`'s dedicated delete test. Two paths that could in principle diverge without a
  test noticing — mitigated by `job-crud.spec.ts` deliberately running both the UI-proven delete and
  the API-based teardown in the same file, in the same run.
- The seeded `PublicApiKey` permanently occupies one of the 10-active-key-per-user slots
  `createPublicApiKey()` enforces; `settings-api-keys.spec.ts` never exercises the cap-reached path,
  so this has no measured test impact today.

### Neutral

- ADR-045's own "Neutral" section is updated with a pointer to this ADR, since it explicitly
  anticipated this: "the honest position until Option 2 is either taken or the rule is narrowed to
  what holds." This is that narrowing — for Job only.
- The other ~24 `afterEach`/inline-cleanup spec files, including the four found this session with
  the identical ordering-sensitive shape (`activity-crud`, `task-crud`, `keyboard-ux`,
  `profile-crud`), are unchanged. Converting them would need the same kind of per-model measurement
  this ADR relied on for Job — ADR-045's deferral is not reopened for them by this decision.

## References

- `e2e/helpers/job-fixture.ts` — `deleteJobViaApi()`, the API-based deletion function
- `e2e/helpers/api-key-fixture.ts` — the shared seeded-key plaintext and why it isn't an env var
- `prisma/seed-e2e.ts` — the seeded `PublicApiKey` row
- `e2e/CONVENTIONS.md` § "Converting afterEach to a Playwright fixture — the ordering trap"
- `docs/BUGS.md` E2E-B38, E2E-B47 (the motivating bugs), E2E-B48, E2E-B49 (found via this migration)
- `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md` — the decision this narrows
- `docs/adr/040-database-backed-integration-tests.md` — the "mock encodes the same assumption" gap
  E2E-B48 repeats
- `specs/e2e-test-infrastructure.allium` — `FixtureOwnedTeardown`
