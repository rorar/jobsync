# ADR-045: The E2E suite owns nothing that outlives the run

**Status:** Accepted
**Date:** 2026-09-02
**Context:** findings E2E-B22..B35; supersedes ADR-043
**Related:** ADR-043 (reset by deletion — the decision this replaces),
`specs/e2e-test-infrastructure.allium` (`DisposableRunDatabase`, `EntityOwnership`)

## Context

The suite ran against `prisma/dev.db` — the developer's working database, the same file the dev
server uses. Every mechanism downstream of that fact existed to manage the consequences:

- `e2e/cleanup-stale-data.ts`, 330 lines of foreign-key-ordered deletes, whose only job was
  removing the previous run's residue from a database that should never have held it.
- The `"E2E "` name prefix, a convention living in prose and in a `startsWith` filter, which is
  what that cleanup matched on.
- `E2E_ALLOW_DESTRUCTIVE`, gating the one delete that could not be name-scoped (ADR-043).

All three worked, and none of them was sufficient, because a convention enforced by a string
comparison drifts silently. Measured on 2026-09-02, before any change:

| | |
|---|---|
| `Person` rows in `dev.db` | **77 — every one of them** a test artefact named `E2E${uid}`, no trailing space, while the purge filtered `"E2E "` **with** one. Four specs wrote them (E2E-B22); all four only archived, none deleted. Nothing had ever been able to remove them. |
| `Resume` rows | 91, of which 28 carried the prefix |
| `StagedVacancy` rows | 56, seeded by nothing (E2E-B30) |
| `dev.db` sha256 | **changed on every full run** |

The last line is the one that mattered. ADR-043 called the single unfiltered delete "acceptable for
a test database"; the whole file was writing to the developer's own.

Worse than the leak was what it concealed. Three tests passed only because leftovers satisfied
their preconditions:

- `staging-details-sheet.spec.ts` needs a `StagedVacancy` and says so in a hard failure, pointing
  at `bun run seed-dev` — **a script that has never existed** (E2E-B30).
- `job-detail-panels.spec.ts` waited for a `<table>` before creating its job. There is no table
  when the user has no jobs; `dev.db` held four (E2E-B31).
- `selectOrCreateComboboxOption` took the select path because almost every value already existed.
  On an empty database it pays ~11 s per value it must create (E2E-B32).

Shared mutable state does not hide these bugs. It hides the fact that they are bugs.

## Decision Drivers

- **A precondition must be declared, not inherited.** A test that passes because of what a previous
  run left behind is not passing.
- **The suite must not be able to damage the developer's data** — structurally, not by an env-var
  gate that covers one statement out of thirty.
- **Cleanup enforced by a naming convention will drift.** It already had, twice (E2E-B3, E2E-B22).
- **No new dependency.** Whatever replaced this had to work with the tools already here.

## Considered Options

### Option 1: Keep cleaning, fix the gaps

Add the missing steps (`Referral`, `Tag`, the resume children), correct the `Person` prefix, repair
the `workExperiences: { none: {} }` guard that made `"E2E Corp"` permanently undeletable.

- **Pros**: smallest change; the file already exists and is well understood.
- **Cons**: fixes the instances, not the class. The next spec to write an unprefixed name
  re-creates the defect, and nothing catches it — the gap is invisible until a cap or a count turns
  it into an apparent application bug, which is exactly how E2E-B1 surfaced after months.

### Option 2: Ownership by fixture, suite-wide

Playwright `test.extend` factories that register each row and delete it in teardown, across all 26
spec files.

- **Pros**: the guarantee holds even when an assertion throws; it is what
  `specs/e2e-test-infrastructure.allium` already prescribed.
- **Cons**: does nothing about cross-run residue, which is where every measured leak lived. A
  mechanical change across 77 tests carries real regression risk, and the measurement afterwards
  showed no model reaching a threshold that breaks a later test **within** one run.

### Option 3: A disposable database per run

Build a template from migrations plus seeds, copy it per run, point `DATABASE_URL` at the copy.

- **Pros**: cross-run residue becomes impossible rather than managed; the cleanup file, the
  destructive gate and the cross-run purpose of the name prefix all disappear; the developer's
  database is untouchable by construction.
- **Cons**: every implicit dependency on ambient data becomes an immediate failure — which is a
  cost on the day it lands and the point of the exercise thereafter. Within a run, workers still
  share one database.

### Option 4: A database per worker

- **Pros**: complete isolation, including within a run.
- **Cons**: impossible without restructuring. One dev-server process serves all workers and binds
  Prisma to a single `DATABASE_URL`; per-worker isolation means a server per worker (memory this
  host does not have) or request-scoped database routing (invasive, and a production risk taken for
  a test).

## Decision

**Option 3.** Every run executes against a fresh copy of a deterministically seeded template, and
`prisma/dev.db` is never opened by the suite.

`scripts/e2e-db.sh` builds `prisma/.e2e-template.db` from migrations + `prisma/seed.ts` +
`prisma/seed-e2e.ts`, keyed by their combined hash, and copies it to `prisma/.e2e-run.db` per run.
`scripts/test-e2e.sh` exports the absolute `DATABASE_URL` before the dev server starts, so the app
and the test runner see the same file.

Option 2 is **not** rejected on principle — it is deferred to where measurement justifies it. See
Consequences.

## Rationale

The cheapest cleanup is a universe you throw away. Everything the suite writes lands in a file that
dies at the next provision, so there is nothing to enumerate, nothing to filter by name, and no
step whose omission is silent.

Three implementation details are load-bearing and non-obvious:

1. **The path is absolute.** A relative SQLite URL resolves against the schema directory, not
   `$PWD`, and that discrepancy is silent until the wrong file is written.
2. **WAL sidecars travel together.** Copying a `.db` while a `-wal` exists yields a torn snapshot
   that opens cleanly and is missing the most recent writes. The template is checkpointed at build
   time; provisioning removes all three files.
3. **The run database is discarded at PROVISION time, not at exit.** A red run stays inspectable,
   and no still-running dev server is left holding an unlinked inode. `E2E_KEEP_RUN_DB=0` opts into
   deleting at exit.

## Consequences

### Positive

- **Measured, not asserted:** `dev.db` is byte-identical before and after a full run, verified
  across three consecutive 15-24 minute runs with unchanged row counts. Before this change its
  sha256 moved on every run.
- `e2e/cleanup-stale-data.ts` is deleted, with `E2E_ALLOW_DESTRUCTIVE` and the cross-run purpose of
  the `"E2E "` convention.
- **E2E-B9 closes without being fixed.** A fresh database has no `ModuleRegistration` row, so a
  credential-gated module resolves to its manifest default and the spec's precondition holds. The
  credential gate is still real; it no longer reaches the suite.
- **E2E-B12 closes the same way.** A mode that bypasses `globalSetup` cannot inherit residue,
  because there is none.
- The template makes previously ambient dependencies explicit, which is what turned E2E-B30 and
  E2E-B31 from "occasionally flaky" into "wrong, here, at this line".

### Negative

- **Creating is now the common path, and it was slow.** `selectOrCreateComboboxOption` cost ~11 s
  per created value (a 5 s wait for an option list that stays empty, then two 3 s matchers that can
  only expire). `profile-crud.spec.ts:327` went 14.2 s → 60 s timeout → 25.0 s once the dead waits
  were short-circuited. Anything that looks slow on an empty database should be measured before it
  is called a flake.
- **A spec that needs a row must declare it in `prisma/seed-e2e.ts`.** That is the intended cost,
  but it is a cost: the failure lands on the day the template arrives, not on the day the
  dependency was introduced.
- **Within a run, workers still share one database.** Measured over a full run, the residue is
  `Resume +29`, `JobTitle +15`, `Company +15`, `Location +14`, `Tag +7`, `Person +4` — while
  `WebhookEndpoint`, `PublicApiKey`, `SmtpConfig` and `CompanyBlacklist` end at **zero**, because
  those specs already own their rows. No model reaches a threshold that breaks a later test in the
  same run, which is why Option 2 was deferred rather than adopted: its cost is certain and its
  benefit, today, is not measurable.
- **`E2E_REUSE_SERVER=1` is now a footgun and says so.** A reused server holds the `DATABASE_URL`
  it started with, so provisioning under it would put the app and the runner on different
  databases. The wrapper skips provisioning in that mode and warns.

### Neutral

- `specs/e2e-test-infrastructure.allium` prescribes fixture-owned teardown
  (`FixtureOwnedTeardown`), which 25 of 27 spec files still violate. That divergence is now
  **known and recorded** rather than accidental — the honest position until Option 2 is either
  taken or the rule is narrowed to what holds.

## Supersedes ADR-043

ADR-043 decided that fixtures reset global state by deleting the persisted override rather than
writing a value. That reasoning is **correct and still applies** — absence expresses a default
better than any copy of it. What is superseded is its scope: it reset one table inside a shared
database, and a disposable database resets everything by construction, so the mechanism it chose no
longer has a caller.

Its own retraction is worth carrying forward: ADR-043 twice recorded a concurrency race that does
not exist, each version tracing the path far enough to look plausible and stopping before the thing
that closes it. That shape recurred four times in the session that produced this record.

## References

- `scripts/e2e-db.sh` — the template, the staleness stamp, the provisioning
- `prisma/seed-e2e.ts` — the fixtures the suite depends on, declared
- `docs/BUGS.md` § Session 2026-09-02 — E2E-B22..B35, the measurements quoted above
- `specs/e2e-test-infrastructure.allium` — `DisposableRunDatabase`, `ProvisionRunDatabase`,
  `RunDatabaseIsNeverTheWorkingDatabase`
- `docs/adr/043-e2e-global-state-reset-by-deletion.md` — the superseded decision
