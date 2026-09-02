# Phase 2 — enforce the property, not the pattern

## Context

Phase 1 gave every E2E run its own database (ADR-045). That was meant to be the setup for Phase 2
— "ownership fixtures across 26 spec files" — and it removed most of Phase 2's justification
instead. The measurement, from one complete run, subtracting the seeded template from the run
database:

| Grows per run | Ends at zero |
|---|---|
| `Resume +29`, `JobTitle +15`, `Company +15`, `Location +14`, `Tag +7`, `Person +4`, `Referral +1` | `WebhookEndpoint`, `PublicApiKey`, `SmtpConfig`, `CompanyBlacklist`, `Question` |

The right-hand column is the argument. Those are exactly the models with a capacity limit (webhook
and API key cap at 10) or a per-user singleton (`SmtpConfig`) — the ones that can break a *later
test in the same run* — and they already end at zero, because those specs already own their rows.
The left-hand column has no consumer that reads it by count, and it dies with the run database.

So rewriting 77 tests would buy a property that is already true, at a real regression cost. Doing
nothing leaves `FixtureOwnedTeardown` violated by 25 of 27 spec files.

**The durable problem is neither leaked rows nor a violated rule: the suite cannot notice when it
starts depending on something it should not.** E2E-B22 (a purge that could never match its target),
E2E-B30 (a fixture nobody seeds), E2E-B31 (a wait for a table that cannot exist), E2E-B27 (a test
whose only surviving assertion is a console oracle) — each found by a human reading code, each
invisible for months.

Phase 2 therefore becomes: **make the suite's own invariants observable and enforced.** Two of them
are already written down and unenforced.

## Principles

1. **Enforce the property, not the pattern.** "Every spec uses a factory fixture" is a pattern; "no
   model outside this allowlist grows across a run" is what the pattern was meant to buy.
2. **You cannot enforce what you cannot measure.** These numbers did not exist until Phase 1 made
   them measurable.
3. **Detection beats prevention when prevention costs more than the defect.**
4. **An allowlist entry carries its reason** — and its tombstones, the way
   `check-notification-writers.sh:26-32` keeps removed entries readable in place.
5. **Prefer the tier that runs automatically.** Jest runs in CI (`ci.yml:52`); Playwright does not,
   and CI does not even trigger on this branch. A check that can be a Jest test should be one.
6. **Fail loudly, never fail stale.** A gate that could not run says so instead of passing.

## The work

### 1. Residue gate — `scripts/check-e2e-residue.sh` + `bun run check:e2e-residue`

**This implements an invariant the spec already states and nothing enforces:**
`specs/e2e-test-infrastructure.allium:1047-1055` `SettledTestCaseOwnsNoLeakedRow`. Its only current
implementations are the per-file `afterEach` detectors in `e2e/crud/settings-api-keys.spec.ts:199-240`
and `webhook-settings.spec.ts:216-240`, which `console.warn` and never fail.

- Diff `prisma/.e2e-run.db` against `prisma/.e2e-template.db` with the `sqlite3` CLI — the exact
  subtraction that produced the table above. Both paths already exist as variables in
  `scripts/e2e-db.sh:29-31`; source it rather than re-deriving them.
- Read the database in place. Do **not** copy it: `e2e-db.sh:46-54` records that a `.db` must
  travel with its `-wal`/`-shm` or the snapshot is torn. `sqlite3` against the live file sees the
  WAL; a `cp` does not.
- Shape copied from `scripts/check-notification-writers.sh`: repo-rooted, `ALLOWED_MODELS` bash
  array with a per-entry reason, three exits (nothing grew / everything that grew is allowed /
  FAIL with the offending models, their counts and a pointer to the invariant).
- Budgets where a number is defensible (`Resume 40`), not just membership — a model that suddenly
  grows tenfold is a finding even if it is on the list.
- **Full runs only.** A single-spec invocation produces small residue and must not be judged
  against a full-run baseline; the gate detects positional args and skips, saying which.
- Wired at the end of `scripts/test-e2e.sh` so the exit code is ours. Not Playwright's
  `globalTeardown`: its failure semantics are less predictable, and `DiscardRunDatabase` guidance
  (`spec:104-109`) requires anything needed from the database to be read before discard — the run
  DB is kept by default (`test-e2e.sh:104-106`), which is exactly what makes a post-run gate
  possible.

### 2. Swallowed-assertion gate — a Jest test, not a script

`keyboard-ux.spec.ts:714-727` wraps a selection block in `try { … } catch { console.log(…) }`; when
the option never appears, every functional assertion is skipped and the console oracle at `:729` is
the only surviving one (E2E-B27). Siblings at `:766` and `:866`.

Written as `__tests__/e2e-no-swallowed-assertions.spec.ts`, following
`__tests__/pii-redaction.spec.ts:93-107` exactly: walk `e2e/`, collect `offenders: string[]`,
`expect(offenders).toEqual([])`. That file's own comment says it "converts a doc-comment convention
into a checked invariant, mirroring `check-notification-writers.sh`" — the same move, one tier up.

**Chosen over a shell script because Jest runs in CI and Playwright does not.** The allowlist covers
the cases where swallowing is correct: the `afterEach` cleanup nets swallow deliberately, so a hook
cannot replace a real test failure.

### 3. `uniqueId()` gets a worker discriminator — E2E-B29

`e2e/helpers/index.ts:5` is `Date.now().toString(36)`: millisecond resolution, no worker component,
while `playwright.config.ts` runs `fullyParallel: true` with `workers: 3` locally. Three workers in
the same millisecond produce identical names. Use `test.info().parallelIndex`.

### 4. Spec — `allium:tend`

- `SettledTestCaseOwnsNoLeakedRow` gains its enforcement mechanism by name, and the honest note
  that the gate — not `allium check` — is what makes it real.
- `FixtureOwnedTeardown` is narrowed to the property the measurement supports: a spec whose model
  has a capacity limit or is a per-user singleton must own its teardown; the rest are covered by
  the disposable database. Today it demands teardown from all 27 and gets it from 2.

### Deliberately not done

- **Fixtures across all 26 specs.** No measured benefit after Phase 1, certain cost. Trigger to
  reconsider, per spec: the residue gate fires for a capacity-bound model.
- **A database per worker.** The natural completion of Phase 1, still blocked: one dev-server
  process serves all workers and binds Prisma to one `DATABASE_URL`. Trigger: E2E gains CI with
  memory for a server per worker. Record in `docs/NOT-PLANNED.md`, which today holds three entries
  and nothing about test isolation.

## Files

- `scripts/check-e2e-residue.sh` (new) — sources `scripts/e2e-db.sh` for the paths
- `__tests__/e2e-no-swallowed-assertions.spec.ts` (new) — pattern from `__tests__/pii-redaction.spec.ts`
- `scripts/test-e2e.sh` — invoke the residue gate after the run; skip with a reason on partial runs
- `package.json` — `check:e2e-residue`, following the one existing `check:` entry
- `e2e/helpers/index.ts` — `uniqueId()`
- `e2e/crud/keyboard-ux.spec.ts` — the three swallowing catches
- `specs/e2e-test-infrastructure.allium` — via `allium:tend`, never by hand
- `docs/BUGS.md`, `docs/NOT-PLANNED.md`, `e2e/CONVENTIONS.md`, `CLAUDE.md`

## Verification

```bash
bash scripts/check-e2e-residue.sh                 # against the kept run DB: passes
bash scripts/test.sh __tests__/e2e-no-swallowed-assertions.spec.ts   # FAILS until keyboard-ux is fixed
./scripts/test-e2e.sh --project=crud              # 109-112 green, gate runs and passes
./scripts/test-e2e.sh e2e/crud/job-crud.spec.ts   # partial: gate skips and says why
bash scripts/typecheck-safe.sh && bash scripts/test.sh
```

**Arm each gate before trusting it.** Insert a deliberate leak (a row no allowlist entry covers)
and a deliberate swallowing `catch`, confirm each gate fails, then remove them. A gate never seen
to fail is not known to work — the same check that caught a vacuously-passing `typecheck-safe.sh`
earlier in this session.

---

# Review outcome (Fable 5.1, high effort, 8m55s) — plan revised

Every load-bearing claim below was re-verified by me against the tree before accepting it.

## Corrections to the plan's own evidence

1. **Counts cannot see UPDATE residue.** `deactivateModule` upserts `status: INACTIVE`
   (`module.actions.ts:346-352`); the row already exists because the health monitor creates one per
   module, so the update branch fires and the count is unchanged. `automation-wizard-modules.spec.ts:27-28`
   documents that later tests see the result. Every per-user singleton has this shape.
   → The gate must add `updatedAt > template build time` per table where the column exists, and the
   plan must state that `Profile` has no `updatedAt` and is therefore uncovered.
2. **"Ends at zero" means the run was green, not that the spec owns its rows.** Only webhook and
   API-key specs have failure-path nets; `SmtpConfig`, `CompanyBlacklist` and `Question` clean
   inline at the end of the test body — the path a failed assertion skips. The invariant the gate
   claims to implement quantifies over passed OR failed.
   → **Re-measure on a deliberately red run** before this argument is repeated anywhere.
3. **The capacity list was incomplete in both directions.** `MAX_SUBSCRIPTIONS_PER_USER = 10`
   (`push.actions.ts:41`) and the `VapidConfig` singleton (`schema.prisma:888-890`) are capped
   models absent from the table; `company-crud.spec.ts:37` *does* read by count (`10 × 25 = 250`).
   Unique keys are a second bites-later class the plan never named: `JobStatus @@unique`
   (`schema.prisma:310`), `EnrichmentResult` (:845), `CompanyBlacklist` (:764).
   → Claim becomes "no consumer **within today's growth**"; unique-keyed models stay in scope.
4. **Two of my citations were wrong.** `spec:104-109` is `SingleSourceHelpers`, not
   `DiscardRunDatabase`; `test-e2e.sh:104-106` is the chromium fallback message.

## The contradiction I created today

`DiscardRunDatabase` (`spec:552-568`) requires the run database to be **removed when the run ends,
on every terminal outcome**, and says a suite that leaves it behind "has reintroduced exactly the
residue this design removes". The code keeps it (`E2E_KEEP_RUN_DB=1` default), and ADR-045 states
that as a decision. My own brief to the tend agent said "removed after the run"; I then implemented
the opposite and did not notice.

→ The tend pass must resolve this explicitly. Either the rule becomes "discarded at the next
provision" (with the post-mortem and unlinked-inode reasons), or the gate is defined as reading
before discard. Not both.

## Gate design changes

- **Drop budgets. Membership only.** `AdminAuditLog` is written on every job create/update/delete
  and every Person PII read (`data-audit.ts:77`), fire-and-forget; the CRM cron writes every 15
  minutes; the dev server is not stopped at the end of a run. Counts vary with wall clock. A
  number like `Resume 40` would move with every test added.
- **Drop the `check:e2e-residue` package alias.** `check-notification-writers.sh` is wired
  nowhere — `package.json:16` is an alias, no hook, no CI step — and its own header says it
  "should run in pre-commit and/or CI". It is a check that silently stopped running, which is what
  principle 5 warns against. The gate lives inside `test-e2e.sh` only.
- **Partial-run detection by positional args is wrong**: `--project`, `-g`, `--grep`,
  `--last-failed`, `--shard`, `--repeat-each` are all non-positional, and the plan's own
  verification line uses `--project=crud`. With budgets gone, completeness stops mattering and the
  gate can judge membership on any run.
- **Four false paths to close**: run the gate only when Playwright exited 0 or 1 (`test-e2e.sh:35`
  is `set -uo pipefail`, no `-e`); key it on `E2E_DB_PROVISIONED` (`E2E_REUSE_SERVER=1` skips
  provisioning and the run DB is then the previous run's file); write the template stamp INTO the
  run database at provision time (`PRAGMA user_version` or an `_e2e_meta` table) and refuse on
  mismatch; and order the gate before the `E2E_KEEP_RUN_DB=0` discard, saying which exit code the
  `EXIT=` line reports when both Playwright and the gate fail.

## Jest check changes

- Write the heuristic down: a `try` whose body contains `expect(` and whose `catch` neither
  rethrows nor asserts. Applied today it flags more than keyboard-ux's three —
  `automation-crud.spec.ts:114-124`, `task-crud.spec.ts:54-64`, `activity-crud.spec.ts:14-24`,
  `job-status-crud.spec.ts:125-160` and `:236-248` are cleanup nets that swallow by design. Six to
  eight allowlist entries out of ~90 catch sites, each with a reason.
- Attach it to the invariant it enforces, which already exists and the plan never cited:
  `ConsoleOracleIsNeverTheOnlyAssertion` (`spec:1122`).

## `uniqueId()`

`UniqueTestData` (`spec:592-613`) pins `Date.now().toString(36)`. Change code and spec in the same
tend pass or it manufactures the drift this plan exists to stop. Note the collision needs
`E2E_WORKERS>1`; the wrapper forces `--workers=1`.

## The missing item — the expensive one in six months

**Playwright never runs unattended.** `ci.yml:3-7` triggers on `main`/`dev` only and has no
Playwright job, so every detector in this plan has exactly one consumer: a person who remembers to
run the wrapper, on one machine, with a substituted chromium build. That is the mechanism that kept
E2E-B22, B30 and B31 invisible for months, and the plan reproduces it. The disposable database
removed the last real obstacle to a nightly or `workflow_dispatch` job on `ubuntu-latest` with one
worker.

## Also add to the file list

Eight stale references to the deleted `cleanup-stale-data.ts`, in comments that justify test
behaviour: `test-e2e.sh:151,180,183`, `automation-wizard-modules.spec.ts:122,159`,
`webhook-settings.spec.ts:236`, `settings-api-keys.spec.ts:175,220`. (The ADR-043/045 mentions are
historical and correct.)
