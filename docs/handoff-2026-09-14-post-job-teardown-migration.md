# Handoff — 2026-09-14, after the Job E2E teardown migration

**Worktree:** `/home/pascal/projekte/jobsync-e2e` · **Branch:** `fix/e2e-elysium`
**HEAD:** `d55b82bb` · **Pushed to `origin/fix/e2e-elysium`** (`991e922e..d55b82bb`, 60 commits ahead of the
branch point) · **Working tree:** clean

**Gates, last verified this session:** `scripts/typecheck-safe.sh` `EXIT=0`; `scripts/test.sh`
5912/5912 (319 suites); `scripts/test-e2e.sh` over the 5 migrated files: 28 passed, `[residue] OK`
(2.3 min, down from ~8.4-8.5 min pre-migration).

This supersedes `docs/handoff-2026-09-13-session-resume.md` for state purposes (that doc was
written *before* the API-Teardown plan/Pathfinder/fixture-migration work below started — its own
open items, the three knip clusters, are now all resolved, see §1).

---

## 1. What happened this session (context for everything below)

Three streams, in order:

1. **Three knip clusters, decided and executed.** Connector facades
   (`data-enrichment/registry.ts`, `reference-data/registry.ts`), 4 UI primitives
   (avatar/pagination/calendar2 deleted, `base-combobox.tsx` kept for ADR-038), 8 demo-data/stray
   files — all resolved via a sub-agent swarm, cap lifted for that pass. Commits `e4fe2a23`,
   `7b19a067`, `9c81dd2a`, `7c209403`, `2bd0cc16`. `bun knip`'s "Unused files" count went from 21 to
   8 (the remaining 8 are all deliberate: the LinguiJS staging block, `base-combobox.tsx`,
   `actionResult.type-test.ts`).
2. **API-based Job E2E teardown, planned via `/plan` + Pathfinder, then implemented.** Full detail
   in §2 — this is the bulk of the session and the reason for most of the open items below.
3. **This handoff.**

## 2. The Job teardown migration — what changed, why, and what it exposed

**Decision record:** `docs/adr/046-job-e2e-teardown-fixture-and-api-based-deletion.md` (narrows
`docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md`, cross-referenced from its own Neutral
section). Read that ADR first if you need the full reasoning — this section is a summary with
pointers, not a replacement.

**What changed:** `e2e/crud/{job-crud,job-detail-panels,enrichment,kanban,job-status-crud}.spec.ts`
each moved their entire former `test.afterEach` cleanup body — Job deletion, then the
reference-group sweep, same required order — into one local `auto: true` Playwright fixture. Job
deletion itself moved from UI clicks to `DELETE /api/v1/jobs/:id`, resolved by
`GET /api/v1/jobs?search=<title>` (`e2e/helpers/job-fixture.ts`'s `deleteJobViaApi()`). Auth is a
seeded `PublicApiKey` (`prisma/seed-e2e.ts`), whose one shared plaintext lives in
`e2e/helpers/api-key-fixture.ts`.

**Why a fixture, not `afterEach`, and why only these 5 files:** `specs/e2e-test-infrastructure.allium:868`
(`FixtureOwnedTeardown`) asks for fixture ownership project-wide, but
`docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md` already evaluated that exact move and
**deliberately deferred it**, pending per-model measurement. E2E-B38/E2E-B47 (`docs/BUGS.md`) are
new, Job-specific measurement ADR-045 didn't have — that's what justifies narrowing the deferral
for Job alone, not the spec rule by itself. **This reasoning correction happened mid-session,
caught before any code was written** — worth knowing if you're tempted to extend the same fixture
pattern elsewhere without an equivalent measurement (see §3.3).

**A real implementation hazard, now documented as reusable project knowledge:** converting only the
Job-deletion step into its own fixture while the reference-group sweep stayed in `afterEach` would
have silently broken the required Job-first order, because Playwright's `afterEach` hooks always
run before any fixture's teardown
(`node_modules/playwright/lib/worker/workerMain.js:339` vs. `:345`, verified against source, then
against Playwright's own docs). Fix: move the *whole* former `afterEach` body into one fixture, not
just the piece that changed. Written up in `e2e/CONVENTIONS.md` § "Converting afterEach to a
Playwright fixture — the ordering trap", forward-referenced from `docs/ROADMAP.md` §8.7 Phase 1
(Module SDK Developer-Doku).

**Two real, pre-existing production bugs, found because this fixture was the first real caller of
the Public API v1 from outside the dashboard UI** — both fixed, both documented in `docs/BUGS.md`:

- **E2E-B48** (`docs/BUGS.md` search for `E2E-B48`): `GET /api/v1/jobs?search=` used Prisma's
  `mode: "insensitive"` (Postgres-only), 500'ing on every call on this project's SQLite database
  since the endpoint shipped. Fixed in `src/app/api/v1/jobs/route.ts` (commit `742200d0`).
- **E2E-B49**, more serious: `src/auth.config.ts`'s `authorized` callback redirected *any* request
  to `/dashboard` if a session cookie was present, for every matched route other than `/dashboard`
  itself — correct for `/signin`/`/signup`, but `/api/v1/:path*` shares the same middleware matcher
  and fell into the same branch. Any Public API caller who *also* carried a valid dashboard session
  cookie — ROADMAP's own named primary consumer, the browser extension (2.17), running in the same
  browser as a logged-in dashboard tab, is exactly that caller — was silently redirected before its
  Bearer token was ever checked. Fixed in commit `e0ebcfb4`, pinned by the new
  `__tests__/auth-authorized-callback.spec.ts` (zero coverage existed before).

**Measured result:** the 5-file suite dropped from ~8.4-8.5 min to 2.3 min (API round trips
replacing UI click-and-wait chains), `[residue] OK`, Job/JobTitle/Company/Location no longer in the
gate's debt block.

**Commits, in order:** `742200d0` (E2E-B48) → `e0ebcfb4` (E2E-B49) → `e0375805` (seeding + helper,
foundation) → `645b6ef6` (the 5 spec files) → `d9090fef` (CONVENTIONS.md + ROADMAP.md) →
`30d127a0` (BUGS.md) → `d55b82bb` (ADR-046 + ADR-045 cross-ref).

## 3. Open items — decisions needed

### 3.1 `WEED-1` / `CHANGELOG.md:491` — still wrongly attributed, not yet fixed

Verified again just now: `docs/BUGS.md:1445` and `CHANGELOG.md:491` both credit the `aria-expanded`
+ `type="button"` a11y fix to **`BaseCombobox`** (`src/components/ui/base-combobox.tsx`) — the file
with zero importers, per this session's own knip-UI-primitives investigation
(`docs/knip-unused-ui-primitives.md`). The live component, **`src/components/ComboBox.tsx:135-136`**,
already had both attributes 5 days before that patch landed (commit `32a33707`). The shipped fix
reached zero users. Not fixed this session — small, mechanical, no design decision needed:

- Correct `docs/BUGS.md:1445`'s WEED-1 row to say the fix landed in the wrong (unused) file and
  that `ComboBox.tsx` already had both attributes.
- Correct or remove `CHANGELOG.md:491`'s claim — it describes a user-facing change that never
  reached any user.
- Optional: actually add the attributes to `ComboBox.tsx` if for some reason they're not exactly
  what's needed there (they already match — see line numbers above — so this is likely just a
  documentation correction, not a code change).

### 3.2 API v1 route-stack duplication — deliberately deferred, not scheduled

Found by the same Pathfinder sweep that informed the Job migration. Real, but not required for
anything to work:

- UUID-validation boilerplate identical across 6 call sites in `src/app/api/v1/jobs/[id]/route.ts`,
  `src/app/api/v1/jobs/[id]/notes/route.ts`, `src/app/api/v1/jobs/[id]/status/route.ts`.
- Ownership-check pattern (`findFirst({ id, userId })` + 404) across 5 sites, same files.
- JSON-body-parsing across 4 sites.
- Two Zod-error-formatting idioms, 3 sites each.

Natural home: `src/lib/api/helpers.ts` (already exists for this exact route family — see
`JOB_API_SELECT`/`JOB_LIST_SELECT`/`findOrCreate` for the existing pattern to match). **Decision
needed:** schedule this now (small, mechanical, low-risk) or leave it — not blocking anything.

### 3.3 Four more spec files share the exact ordering-sensitive `afterEach` shape — NOT converted

Found via the same Pathfinder-style sweep that caught the Job hazard in §2. **The full citation
detail for this currently exists ONLY in the local plan file
`~/.claude/plans/serene-beaming-peacock.md` (§8), which is outside the git repo and not guaranteed
to survive plan-file rotation/cleanup.** A short summary survives in
`docs/adr/046-job-e2e-teardown-fixture-and-api-based-deletion.md`'s Consequences/Neutral section
(names the four files, no line numbers). **Recommend moving the full detail into `docs/BUGS.md` (a
new low-severity tracking row) before that plan file is lost** — the table below is everything
needed to reconstruct it, verified against source this session:

| File | Lines | Order | Why required |
|---|---|---|---|
| `e2e/crud/activity-crud.spec.ts` | 234-293 | Activities before ActivityTypes | `Activity.activityTypeId` is `NOT NULL` behind `ON DELETE RESTRICT` (`prisma/schema.prisma:509-510`); the file's own comment states this. |
| `e2e/crud/task-crud.spec.ts` | 344-408 | Activities before Tasks | `deleteTaskById` refuses while `task.activity` exists (`src/actions/task.actions.ts:237`). Same Task/Activity/ActivityType relationship as `activity-crud`, entered from the other end. |
| `e2e/crud/keyboard-ux.spec.ts` | 84-163 | Resumes before JobTitle/Company/Location/Tag | `deleteJobTitleById`/`deleteJobLocationById`/`deleteCompanyById` refuse while a `WorkExperience`/`Education` row (owned by the resume) still references them; comment at line 133 states this, cites `jobtitle.actions.ts:120-131`. |
| `e2e/crud/profile-crud.spec.ts` | 160-280 | Resumes before Company/Location (JobTitle deliberately skipped, E2E-B39) | Same FK-refusal reasoning as `keyboard-ux`. |

**Decision needed, three options, none chosen yet:**
1. Convert all four to the same single-combined-`auto:true`-fixture pattern as Job — same safety
   property, same mechanical approach, no new pattern to invent. Requires the same kind of
   per-model measurement this session used to justify Job (§2) before doing it just because the
   pattern is now proven — check `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md`'s
   within-run residue numbers for Activity/Resume first; if neither shows a within-run break
   (a cap being hit, a subsequent test failing), a fixture is not automatically warranted.
2. Leave `afterEach` as-is, only deduplicate the near-identical `deleteActivity` between
   `activity-crud`/`task-crud` (both cite E2E-B40 in comments, showing the authors knew of each
   other's copy) — safe *only* if each file's full ordered sequence (including the Type/Task step)
   moves together into any shared helper, never split.
3. Do nothing — these four aren't broken today, this is preventive.

### 3.4 `docs/handoff-2026-09-13-session-resume.md` is now stale

Written before the API-Teardown/Pathfinder/fixture-migration stream started. Superseded by this
document for state purposes; not deleted, kept for its own citations (the three knip-cluster TL;DRs
it contains are still accurate history).

### 3.5 Minor: `docs/BUGS.md`'s header date

Line 1 still reads "Updated 2026-09-08" despite `E2E-B48`/`E2E-B49` being added today. Cosmetic,
zero functional impact, fix opportunistically.

## 4. What's NOT open (verify before re-litigating)

- The three original knip clusters (§1) — fully resolved and committed.
- LinguiJS scaffold — confirmed staged/planned, documented in `CLAUDE.md` § Dead Code Detection;
  not a knip false-positive to chase.
- Job E2E teardown (§2) — done, measured, documented, pushed.
- The other ~24 spec files still using `afterEach`/inline cleanup **that do NOT have the ordering
  hazard** (single-model cleanup, or no cross-model FK dependency) — `docs/adr/045` already
  evaluated and deferred converting these suite-wide; no new information changes that for them.

## References

- `docs/adr/046-job-e2e-teardown-fixture-and-api-based-deletion.md` — the full decision record
- `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md` — the decision it narrows
- `docs/BUGS.md` — search `E2E-B47`, `E2E-B48`, `E2E-B49`, `WEED-1`
- `e2e/CONVENTIONS.md` § "Converting afterEach to a Playwright fixture — the ordering trap"
- `e2e/helpers/job-fixture.ts`, `e2e/helpers/api-key-fixture.ts` — the new shared teardown/auth code
- `docs/knip-connector-facades.md`, `docs/knip-unused-ui-primitives.md`,
  `docs/knip-demo-data-and-strays.md` — the three resolved knip investigations
- `~/.claude/plans/serene-beaming-peacock.md` — the full implementation plan (outside the repo,
  see §3.3 for the risk of relying on it long-term)
