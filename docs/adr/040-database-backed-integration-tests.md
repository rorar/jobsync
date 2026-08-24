# ADR-040: Database-Backed Integration Tests via Migration Replay

**Status:** Accepted
**Date:** 2026-08-24
**Context:** Arose from the W-D3 orphan-note prune (`docs/weed-findings-2026-08-17.md`
W-D3..W-D7, `docs/BUGS.md` OP-B1..OP-B7). Records why the repo now has a second test tier
and how to add to it; does not restate what the tests assert.

## Context

Until this work, **every test in the repo mocked Prisma.** 5,700 tests, 310 suites, all in
jsdom, with no `@jest-environment node` override anywhere and no test that opened a database.

That was not a problem until a change landed whose correctness lived entirely at the database
layer. The orphan-note prune depends on three things a mock cannot express:

1. **An FK cascade fires and completes within its own statement** — the prune's predicate is
   only true *after* `ON DELETE CASCADE` has removed the join rows.
2. **A Prisma array `$transaction` executes in order** — the whole reason the prune may be
   appended last.
3. **`targets: { none: … }` compiles to a correlated `NOT EXISTS` that distinguishes "no
   targets" from "has targets"** — including the case of a join row whose polymorphic FKs are
   all null.

Three separate defects hid in exactly those gaps and shipped to the fork branch. The mocked
tests did not merely fail to catch them — they *encoded the same assumption as the code*, so
they asserted the position of an operation in an array and called that "ordering verified".
All three reviewers independently ranked "nothing exercises the real database" as the largest
residual risk in the change set, and they were right.

A query-plan defect (OP-B6) sat in the same blind spot for a different reason: a mock never
reaches a query planner, so a `DELETE` that degraded to a full table scan from three
candidates upward was invisible.

## Decision

### 1. Add a database-backed tier rather than converting the existing one

The mocked tier stays as it is. It is fast, it covers ownership predicates and call shapes
well, and rewriting 310 suites would be enormous and would lose that speed. The new tier is
narrow by design: it is for behaviour that **only exists in the database** — cascades,
transaction semantics, query planning, constraint interactions.

The rule for choosing a tier: *if the assertion would still hold against a mock that encodes
the same assumption as the implementation, it belongs in the mocked tier; if the mock would
have to be taught the database's behaviour to make the test meaningful, it belongs here.*

### 2. Build the schema by replaying the committed migrations, not by any other route

The alternatives were weighed:

| Option | Rejected because |
|---|---|
| `@quramy/jest-prisma` or similar | A new dependency and a new lifecycle to understand, for a tier with (today) one file. |
| `prisma db push` / `migrate deploy` at test time | Needs the Prisma CLI and engines in the test process; slow; another moving part on a constrained host. |
| A committed fixture `.db` file | A binary artefact that silently drifts from `prisma/schema.prisma` — precisely the failure mode this tier exists to prevent. |
| Copy `prisma/dev.db`'s schema | Depends on a developer's local database existing and being current. |

Replaying `prisma/migrations/*/migration.sql` in filename order into a temp SQLite file takes
**~0.75 s** for all 63 migrations, needs no dependency and no CLI, and **cannot drift** — the
migrations are the same artefact production applies. A migration that would break a real
deployment breaks this test first.

### 3. Skip loudly when the environment cannot support it

The tier needs the `sqlite3` CLI (present in devenv and on the CI image) and, outside the
devenv shell, `PRISMA_QUERY_ENGINE_LIBRARY`. The suite guards on `sqlite3` and uses
`describe.skip`, so a developer without it sees the tests reported as skipped rather than a
wall of confusing failures. This is a deliberate trade: a silent skip is a real hazard, but a
*visible* skip is better than the alternative failure mode, where the missing Prisma engine
already produces ~15 unrelated-looking suite failures across the existing tier.

## Consequences

- **Adding to this tier is cheap.** Copy the `@jest-environment node` docblock, the
  `buildSchemaSql()` + `execFileSync("sqlite3", …)` setup, and point a `PrismaClient` at the
  temp file. There is no framework to learn.
- **The tier will grow slowly and should.** It is not a general integration-test suite; it is
  for claims about database behaviour. Everything else stays mocked.
- **Migration correctness is now partly under test.** A migration whose SQL does not apply
  cleanly on top of its predecessors fails this suite, which nothing checked before.
- **Open:** the tier is not yet wired into a documented CI step, and the `sqlite3` /
  `PRISMA_QUERY_ENGINE_LIBRARY` prerequisites are not stated anywhere outside this ADR and the
  test file's header. Until that is done, a CI runner missing `sqlite3` would pass silently
  with the tier skipped.

## Reference

- `__tests__/crm-orphan-prune.integration.spec.ts` — the first suite in this tier.
- `docs/BUGS.md` § Session 2026-08-21/23 — the defects that motivated it.
- `.full-review/05-final-report-wd3-orphan-prune.md` — the review that identified the gap.
