# Handoff — 2026-09-14, E2E fixture consolidation

**Worktree:** `/home/pascal/projekte/jobsync-e2e` · **Branch:** `fix/e2e-elysium`
**Written at `308ebd41`**, before this document's own commit · **Working tree:** clean
**Pushed 2026-09-14:** `d55b82bb..36a9d276 -> origin/fix/e2e-elysium`, seven commits, this document
among them. A header that names the current HEAD cannot survive its own commit; this one names the
range it describes instead.

**Gates, all verified after the last commit:** `scripts/typecheck-safe.sh` `RC=0` / `EXIT=0`;
`scripts/test.sh` 320 suites, 5910 passed + 2 todo; `scripts/test-e2e.sh` over the seven affected
specs 41 passed in 3.1 min with `[residue] OK`, plus `activity-crud` alone 13 passed in 40.4 s.

This supersedes `docs/handoff-2026-09-14-post-job-teardown-migration.md` for *state*. That document
is still the authority for the Job teardown migration itself (its §2) and for two open items this
session did not touch (its §3.1 and §3.2). Its §3.3 — the four-file ordering-trap table — is the
subject of this session and is now **decided**, see §3 below.

---

## 1. What this session did

The previous session ended with three open decisions. The user chose to work on the third: four
spec files (`activity-crud`, `task-crud`, `keyboard-ux`, `profile-crud`) that carry the same
ordering-sensitive `test.afterEach` shape the Job migration (ADR-046) had just converted away from.

The instruction was to fan out first. Four read-only sub-agents were dispatched, one per file, each
required to cite `file:line` for every claim and forbidden from running any test, build, typecheck
or server. What they returned changed the decision — not by confirming the hazard, but by removing
the reasons to act on it and surfacing a different, better-evidenced problem alongside it.

**The four files were NOT converted.** Two other things were, and a fifth commit removed a latent
flake found on the way.

## 2. The evidence that decided it

### 2.1 The residue argument is settled, and it points the other way

`scripts/check-e2e-residue.sh` has been pruned twice since ADR-045's measurement. `KNOWN_DEBT` is
now two entries (`:142-143`): `Person:E2E-B22` and `Referral:E2E-B23`, both structural. Everything
else is **enforced** — a leak fails the run.

The pruning comment names our four files as the mechanism that keeps the enforced models at zero
(`:173-185`):

> Each of these measured ZERO across the same four consecutive full runs, and each has a cleanup
> path that runs on the failing path too (**an `afterEach` net, not an inline delete**), which is why
> the zero is expected to hold: Tag — keyboard-ux sweeps it via ADMIN_TAB.tag · Task — task-crud's
> afterEach purge · Activity — activity-crud's afterEach purge · ResumeSection/ContactInfo/Summary/
> WorkExperience/Education — profile-crud deletes the resume …

ADR-045's own numbers (`Resume +29`, `JobTitle +15`, …) are **obsolete**: `:108-133` records those
six models leaving the debt list on 2026-09-08 once E2E-B38's cause was found statically and fixed.

### 2.2 The scope hypothesis was wrong in all four files

The worry was that a describe-scoped `afterEach` would silently *broaden* to uncovered tests if
turned into a file-scoped fixture. Measured per file:

| File | Hook | Structure | Tests newly covered |
|---|---|---|---|
| `activity-crud.spec.ts` | 234-293 | sole describe 224-515 (EOF), 5 tests | **0** |
| `task-crud.spec.ts` | 344-408 | sole describe 338-724 (EOF), 8 tests | **0** |
| `keyboard-ux.spec.ts` | 84-163 | file-level, 6 describes, 22 tests | **0** |
| `profile-crud.spec.ts` | 160-281 | **no describe at all**, 8 top-level tests | **0** |

### 2.3 The API half does not exist here

`keyboard-ux.spec.ts` writes and deletes **zero Job rows** — no `job-fixture` import, and its own
header (`:19-21`) states that no test submits the AddJob form. The other three deal with
Activity/Task/Resume. `deleteJobViaApi()` has nothing to act on in any of the four. For Job, moving
off DOM locators onto the Public API was half the justification (E2E-B38/E2E-B47); here that half is
absent.

### 2.4 Conclusion

Converting the four would be "because the pattern is now proven" — a cost reduction, not a benefit
demonstration. That is precisely the reasoning error ADR-046 §Context records the project having
already corrected once. The ordering trap remains **latent**: it fires only if someone later moves
*part* of one of these hooks into a fixture.

## 3. What was done instead

### 3.1 `cd52b54d` — one shared activity fixture (new: `e2e/helpers/activity-fixture.ts`)

`activity-crud` and `task-crud` each carried a private copy of `deleteActivity` and `purgeActivity`.
The copies had drifted **over each other's gaps**:

- `task-crud:203` asserted the row visible before opening its menu, because `getAllActivities`
  filters on `endTime: { not: null }` (`src/actions/activity.actions.ts:69-72`) so a still-running
  activity is not in the table. `activity-crud` lacked it.
- `activity-crud:178-181` carried the E2E-B40 rationale for `toHaveCount(0)` over
  `waitFor({ state: "detached" })`. `task-crud` lacked it — although task-crud is where E2E-B40 was
  measured, and its own leak (6 of 7 tasks, reported green) is what that comment preserves.

`e2e/CONVENTIONS.md` § "Shared Fixtures" already forbids this ("Never copy a fixture into a spec")
and records the same failure mode for the resume fixture: *"the fix had to be found six times and
was found twice."* Two copies sit below the threshold anyone greps for, which is how this pair
survived the pass that unified the other six.

Merged without choosing a side. Bookkeeping stays per-file via a three-line `deleteActivityTracked`
in each spec — the `X` / `XTracked` split `resume-fixture`'s `deleteResume` and `keyboard-ux`'s
`deleteResumeTracked` already use.

### 3.2 `21066424` — the cleanup-fixture factory (new: `e2e/helpers/cleanup-fixture.ts`)

ADR-046 gave each of the five Job specs its own verbatim copy of the
`base.extend<{ cleanup: void }>({ cleanup: [..., { auto: true }] })` mechanism. `testWithCleanup()`
collects it. A factory, not one shared extended `test`: the bodies are genuinely per-file, and the
ordering trap means a body must never be assembled from parts — the factory takes exactly one body
and offers no way to pass half of one.

Verifiable as mechanical: `git diff -w` reports **exactly 12 changed lines per file, identical
across all five** (3 added, 9 removed); everything else is the four-space dedent. Applied by a
script that asserted the expected shape and would have refused rather than guessed.

**The scope boundary is in that file's header, and is the answer to the Module-SDK question raised
this session.** It is internal E2E infrastructure, *not* Module SDK surface:

- `playwright.config.ts:47-54` pins `testDir` to `./e2e/smoke` and `./e2e/crud` — nothing inside a
  connector module's directory is collected as a Playwright test at all.
- The co-located module test convention (ROADMAP §8.7 Phase 0c, marked DONE) is a **Jest** glob
  (`jest.config.ts:205`), and all eleven `src/lib/connector/**/modules/*/__tests__/` directories
  currently contain only a `.gitkeep` — the scaffolding exists, nothing has moved in.
- Whether modules should get E2E coverage of their own is an **open** ROADMAP question (§8.0,
  "Discovery: Self-Contained Module E2E Coverage (offen)", `docs/ROADMAP.md:2511-2517`). Its two
  leading options both put that coverage in ONE central manifest-driven spec, which would consume
  this helper like any other spec under `e2e/`.
- The third shape — per-module Playwright files importing this — would make the module depend on
  infrastructure outside its own directory, breaking Phase 0's "everything a module defines lives in
  its own directory", and would turn this file into a versioned public API. The header ends: *"Do not
  let it happen by import."*

The E2E suite has **zero** coupling to the connector layer today (`grep -rn
"moduleRegistry\|ConnectorType\|lib/connector" e2e/` is empty) and should stay that way. App ↔
Connector ↔ Module governs the *outbound* ACL; Public API v1, which `job-fixture` calls, is the
*inbound* Open Host Service. Test helpers are in neither.

### 3.3 `c269a456` — the Shared Fixtures table listed one of five

`e2e/CONVENTIONS.md`'s table had a single row (`resume-fixture`) while `job-fixture`,
`api-key-fixture` (both from ADR-046) and `admin-reference-cleanup` (eleven callers, the most widely
shared helper in the suite) were never listed. Adding the new fixture to this table was a collateral
item on ADR-046's own verification list and did not get done.

### 3.4 `308ebd41` — five doubled toast assertions removed

Every deletion in `activity-crud` asserted the success toast twice: once inside `deleteActivity`,
once in the test body immediately after. The second could not catch anything the first missed, and
waited on a worse signal — `expectToast` requires visibility, Sonner auto-dismisses, and a row check
allowed to take 15 s sits between them. A failure with a delay fuse.

The cause is still readable: the old `deleteActivity` comment records that the toast was once
considered insufficient proof and that *"task-crud has since measured it wrong"* — the toast wait
moved INTO the deleter during the E2E-B40 work, and the outer assertions simply stayed.

### 3.5 `e57aa432` — four drifted citations in the previous handoff

Checking `docs/handoff-2026-09-14-post-job-teardown-migration.md` §3.3's table against source found
an error in **every one of its four rows**. Three were imprecision, one was wrong:

| Row | Was | Is |
|---|---|---|
| `task-crud` | guard at `task.actions.ts:237` | `:237` is the declaration; guard is `:261-267` |
| `keyboard-ux` | all three deletes refuse on WorkExperience **or** Education | only `jobLocation.actions.ts` guards on both (`:99`, `:119-128`); `jobtitle.actions.ts:124-134` and `company.actions.ts:351` guard on WorkExperience alone |
| `activity-crud` | `ON DELETE RESTRICT` at `schema.prisma:509-510` | NOT NULL is explicit at `:510`; RESTRICT is Prisma's implicit default and the literal constraint is only in migration SQL. Asymmetry: `Task.activityTypeId` is nullable with `ON DELETE SET NULL` — **only the Activity side restricts** |
| `profile-crud` | "JobTitle deliberately skipped, E2E-B39" | **stale when written** — the sweep was re-enabled 2026-09-08 (`3fe7412a`); `profile-crud.spec.ts:225` sweeps JobTitle today |

The last one had a traceable cause, fixed at source: the spec's 40-line E2E-B39 block is a
deliberately kept chronological log whose *heading* still announced the decision its body records
being reversed 22 lines down. A skimming reader stops at the heading — which is what produced the
table row and informed the residue gate's own wording. The heading is now marked SUPERSEDED
(`profile-crud.spec.ts:185`); the history below is untouched, as that block's closing note asks.

## 4. Open items — decisions needed

### 4.1 Push — DONE 2026-09-14

The seven commits `9a7eaecf` … `36a9d276` (the six listed when this was written, plus this document)
were pushed to `origin/fix/e2e-elysium` on request, fast-forward, `d55b82bb..36a9d276`.

### 4.2 `WEED-1` mis-attribution — unchanged, still open

`docs/BUGS.md:1445` and `CHANGELOG.md:491` credit an `aria-expanded` + `type="button"` a11y fix to
`src/components/ui/base-combobox.tsx`, a file with zero importers. The live
`src/components/ComboBox.tsx:135-136` already had both attributes five days earlier (`32a33707`).
The shipped fix reached zero users. Mechanical documentation correction, no design decision.
See the previous handoff §3.1.

### 4.3 API v1 route-stack duplication — unchanged, still deferred

UUID validation ×6, ownership-check ×5, JSON-parsing ×4, two Zod-formatting idioms ×3 each, across
`src/app/api/v1/jobs/[id]/route.ts`, `.../notes/route.ts`, `.../status/route.ts`. Natural home
`src/lib/api/helpers.ts`. Optional. See the previous handoff §3.2.

### 4.4 The four ordering-trap files — DECIDED, do not re-litigate without new evidence

Not converted, on the evidence in §2. What would reopen it, specifically:

- a residue-gate failure naming Activity, ActivityType, Task, Resume, Tag or any resume child; or
- a dated bug where one of these four hooks produces a false "already deleted" (the E2E-B38/E2E-B47
  shape); or
- someone needing to move *part* of one of these hooks into a fixture, which is the latent trap
  itself — in which case convert the whole body at once, and it is now a one-line change per file
  via `testWithCleanup`.

The full citation table survives in the previous handoff §3.3, **now corrected** (§3.5 above). It is
no longer at risk from plan-file rotation.

### 4.5 Minor, carried forward — DONE 2026-09-14, and the first item was bigger than stated

- `docs/BUGS.md` — the stale date was the visible end of a counting drift. The block table's ten rows
  summed to 681 / 673 beneath a stated Total of 682 / 674, because `5a81d456` (2026-09-09) added
  `E2E-B47` to the Total without giving it a row; the header line then went to 684 / 676 when
  `30d127a0` (2026-09-13) recorded `E2E-B48`/`E2E-B49` without touching the table. Three findings had
  no block row. Both sessions now have rows, the Total reconciles with the header at 684 / 676 / 2 / 6,
  and the correction is logged in the file's own arithmetic block.
- ROADMAP §8.7 Phase 0c now carries the qualifier. Counted rather than asserted: the glob is real and
  active (`jest.config.ts:205`), co-located tests number **zero**, 11 of **14** module directories
  have a `__tests__/` and each holds only a `.gitkeep` — including the `modules/logo-dev/__tests__/`
  the bullet names as its example. `currency`, `geo-codes` and `public-holidays` have none at all.
- Two drifted dates found while checking the above, both corrected: `docs/adr/046-…:13` and
  `e2e/helpers/job-fixture.ts:9` dated `E2E-B47` to 2026-09-13. It is 2026-09-09 —
  `git log -S "E2E-B47" -- docs/BUGS.md` returns exactly one commit, `5a81d456`, and the row's own
  disposition cell reads "Fixed 2026-09-09". The wrong date entered through the plan file, which
  called it "2026-09-13, today", and was copied twice from there.
- `docs/handoff-2026-09-13-session-resume.md` and
  `docs/handoff-2026-09-14-post-job-teardown-migration.md` are both superseded for state purposes.

## 5. Two process errors from this session, recorded so they are not repeated

1. **A glob inside a block comment closed it.** The first draft of `cleanup-fixture.ts` cited
   `src/lib/connector/**/modules/` in its header; the `*/` inside `**/` terminated the comment and
   produced ten syntax errors. A comment that quotes a glob can end itself.
2. **`typecheck-safe.sh | tail -4 && ...` masked a guard abort.** The busy-host guard aborted the
   typecheck (exit 75), but the pipeline reported `tail`'s exit 0, so the `&&` chain continued and
   the gate was very nearly recorded as passed without having run. This is the exact trap CLAUDE.md
   documents. It was re-run without the pipe (`RC=0`), and the host was diagnosed first — the top
   consumer was an unrelated process, no stale server of ours existed, so no `ALLOW_BUSY_HOST=1`
   override was used.

## References

- `e2e/helpers/activity-fixture.ts` — the unified activity deleters, with the drift history in its header
- `e2e/helpers/cleanup-fixture.ts` — `testWithCleanup()`, and the Module-SDK scope boundary
- `e2e/CONVENTIONS.md` § "Shared Fixtures" and § "Converting `afterEach` to a Playwright fixture — the ordering trap"
- `scripts/check-e2e-residue.sh:103-188` — `KNOWN_DEBT`, the two prunings, and why `afterEach` nets are credited
- `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md` — the suite-wide deferral that still stands
- `docs/adr/046-job-e2e-teardown-fixture-and-api-based-deletion.md` — the narrow exception taken for Job
- `docs/handoff-2026-09-14-post-job-teardown-migration.md` — prior state; §3.3's table corrected by `e57aa432`
- `docs/ROADMAP.md:2511-2517` (§8.0 module E2E coverage, open) and §8.7 (Module SDK)
