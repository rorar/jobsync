# ADR-043: E2E fixtures reset global state by deletion, never by writing a status

**Status:** Accepted
**Date:** 2026-09-01
**Context:** E2E data-leak fix, commit `b85c45df`; findings E2E-B1..E2E-B12 in `docs/BUGS.md`
**Supporting records:** `E2E-FIX-NOTES.md` § Extraction, `e2e/CONVENTIONS.md` § Shared Fixtures

## Context

The E2E suite leaks rows. Every spec cleans up inline as the last statement of a test, so any
assertion that throws earlier leaves its data behind, and `e2e/cleanup-stale-data.ts` is the
backstop that removes the residue before the next run. That backstop is name-scoped: it deletes
rows whose title, name or pattern starts with `"E2E "`, always filtered by the test user's id.

Two leaks escaped it, and they failed in opposite directions.

`WebhookEndpoint` had no cleanup step at all. A user may hold at most ten
(`webhook.actions.ts:19,110`), and at the cap `WebhookSettings.tsx:275,344` renders the create
form **disabled**. Ten leaked rows accumulated over months, and on 2026-09-01 every webhook test
began failing on an input that could not be filled — presenting as an application bug rather than
as stale data. That is loud, and it was eventually diagnosed.

`ModuleRegistration` is worse, and it is the reason this record exists. It is **global**: no user
column, no name to prefix, one row per module id shared across every user. Two specs deactivate a
module, assert the consequence, and restore it — each guarded by `if (wasActive)`, a guard added
in an earlier session precisely to stop the spec poisoning its own fixture. When a run dies
between the deactivation and the restore, the next run reads `wasActive === false`, skips the
deactivation, asserts that an already-absent option is absent, passes, and skips the restore. The
test is green while exercising nothing, and it stays that way forever. Both `jsearch` and
`google_favicon` were in that state when it was found. A permanent outage announces itself; a
permanently vacuous test does not.

So the suite needed a way to reset global state between runs. The obvious implementation is to
write the known-good value.

## Decision Drivers

- **Must restore a known baseline** before every run, or leaked state silently voids tests.
- **Must not encode module knowledge in test infrastructure.** The Connector architecture is
  manifest-driven: modules self-register, and `CLAUDE.md` is explicit that new modules require
  "no hardcoded arrays, no ENV_VAR_MAP entries".
- **Must cover modules that do not exist yet.** A list that needs maintaining will not be
  maintained, and its rot is silent.
- **Must not contradict the domain spec.** `specs/module-lifecycle.allium:85` states that modules
  register as active and that users deactivate explicitly.

## Considered Options

### Option 1: Write the baseline — `updateMany({ data: { status: "active" } })`

- **Pros**: obvious, one statement, immediately readable.
- **Cons**: encodes a status policy in the test suite. Every future module inherits an assertion
  nobody wrote deliberately. It also states, in test code, a fact the manifest already owns — so
  the two can drift, and the test suite wins by accident.

### Option 2: Enumerate and restore per module

- **Pros**: explicit about which modules the suite depends on.
- **Cons**: a hardcoded list in exactly the place the architecture forbids one. New modules are
  uncovered until someone remembers. This is the failure mode the manifest pattern exists to
  prevent.

### Option 3: Delete every row and let the default reapply

- **Pros**: writes no status, names no module, covers modules that do not exist yet.
- **Cons**: relies on a property of the registry that is not obvious from the cleanup file, so it
  needs a comment to survive review. Takes effect only from the next server process (below).

### Option 4: Restore through the product's own API

- **Pros**: exercises the real path; no direct DB manipulation.
- **Cons**: impossible for credential-gated modules. `activateModule` refuses to re-activate
  JSearch without a key (`credential.type: API_KEY, required: true`), which is exactly why the
  spec's own restore could never succeed. Making it work would mean inventing a credential fixture
  to satisfy a step that a central reset makes redundant.

## Decision

**Test fixtures reset global state by deleting the persisted override, never by writing a value.**

Concretely, `e2e/cleanup-stale-data.ts` step 0b is `prisma.moduleRegistration.deleteMany({})` —
unfiltered, no status, no module id.

## Rationale

The database is an **override layer** over manifest-declared defaults, not the source of truth.
This is verifiable in three places: `module.actions.ts:439-450` iterates only over rows that
exist and calls `setStatus` for each, so a missing row is never touched; `registry.ts:67`
registers every module as `ModuleStatus.ACTIVE`; and the error path at `:452` says as much —
"using in-memory defaults".

Deleting a row therefore does not *impose* a state, it *removes an opinion*. What remains is
whatever the manifest declared, which is the definition of the baseline the suite wants. A leaked
`inactive` row is not a user's choice — it is a test artifact — and `specs/module-lifecycle.allium:85`
says deactivation is an explicit user act, so removing the artifact restores the specified default
rather than inventing one.

The generalisation is the point: **absence expresses the default better than any value can**,
because the default is owned elsewhere and may change. A written status is a copy, and copies
drift. This is the same reasoning that put six duplicated resume fixtures into one shared helper
in the same change set — the defect in both cases is a fact stated twice.

Position matters too. Steps 0a and 0b run **first**, ahead of the foreign-key-ordered chain. Any
later `deleteMany` that throws aborts the whole function, and the steps that prevent a *permanent*
outage must not be reachable only when everything else succeeded. The same file already documents
such an abort happening (`step 6a`, a foreign-key error escaping `globalSetup` and failing every
test in the run).

## Consequences

### Positive

- No module list and no status literal anywhere in the test suite. New modules are covered the
  day they register.
- The manifest stays the single source of truth for defaults, including for tests.
- Per-test restoration of global state becomes unnecessary. The JSearch restore block — which
  could never succeed on a host without a RapidAPI key — was deleted rather than propped up with
  a credential fixture.
- Verified in practice: after the reset, `jsearch` and `google_favicon` hold **no row at all** and
  resolve to the manifest default, and `automation-wizard-modules.spec.ts` runs its real subject
  and passes.

### Negative

- **The reset lands one process late.** `syncRegistryFromDb` latches on `dbSynced`
  (`module.actions.ts:430`), so a dev server that already synced will not re-read the table. The
  cleanup runs in `globalSetup`, a separate process, so its effect appears at the next server
  start. This is documented in the cleanup comment and in the spec that depends on it.
- **A live server process can resurrect the row the reset just deleted.** Deleting the override
  removes it from the table, not from the memory of a process that already read it.
  `getModuleManifests` fires a background `checkModuleHealth` for every module whose in-memory
  health is `UNKNOWN` — with **no filter on status** (`module.actions.ts:79-86`) — and that
  function's upsert writes `status: registered.status` on its **create** branch
  (`health-monitor.ts:215-227`). A process still holding a stale `inactive` therefore re-persists
  that `inactive` into the table `globalSetup` had just emptied, and the next process syncs the
  resurrected value. The window opens on the first settings-page load after the reset.

  Starting a fresh dev server per run (`scripts/test-e2e.sh`, `47369e15`) largely defuses this: a
  new process syncs from an empty table, holds the manifest defaults, and so any row it re-creates
  carries `active`. It does not eliminate it — any other process sharing the database (a
  `scripts/dev.sh` server left running, a second run overlapping the first) can still write back
  what it remembers.

  This race is **orthogonal to the delete-versus-write choice**: Option 1 would be undone by the
  same upsert carrying the same stale value, so it is not a cost of this decision. What it does is
  bound the decision's guarantee — **the reset is durable only against processes that start after
  it**, which is the same one-process-late boundary as the bullet above, seen from the other side.
  A reset that must outlive a running process would need the registry to re-read on write, or the
  health path to stop persisting `status` at all; neither is in scope here.

- **The step is global while every other step is `userId`-scoped**, because the model has no user
  column. On a shared database it would reset another user's deliberate deactivations. Acceptable
  for a test database; it would not be for anything else.
- **Health and monitoring columns on those rows are discarded** and re-populated by the health
  monitor. Observed and harmless, but it means the table is not a durable record across runs.
- The mechanism is non-obvious. Someone reading `deleteMany({})` without the comment could
  reasonably think it was a blunt instrument rather than a deliberate use of default-by-absence.

### Neutral

- A leaked module state now produces a **loud failure** rather than a silent pass:
  `automation-wizard-modules.spec.ts` asserts its precondition instead of skipping. The assertion
  is only reachable if the reset failed, so it doubles as a regression guard on this decision.

## Scope

This applies to **global** state a test mutates — state with no user column and no name to
prefix. It does not change the treatment of user-scoped rows, which remain name-filtered and
`userId`-scoped, nor does it license deleting product data that a user might own.

`enrichment.spec.ts` is deliberately untouched: its `if/else` toggles in whichever direction it
finds the module and asserts both transitions, so it has no precondition to violate. It was
initially changed to match the JSearch spec and reverted when that was recognised.

## Related Decisions

- `e2e/CONVENTIONS.md` § Shared Fixtures — the sibling style rule (share fixtures, add a named
  option rather than a copy). Deliberately not an ADR: it is a convention, and it belongs where
  someone writing a spec will look.
- `specs/module-lifecycle.allium` — the authority for "modules register as active".

## References

- `src/actions/module.actions.ts:430,439-450,452` — the sync latch and the rows-that-exist loop
- `src/lib/connector/registry.ts:67` — the manifest default
- `e2e/cleanup-stale-data.ts` steps 0a/0b — the implementation and its comment
- `src/actions/module.actions.ts:79-86` — the unfiltered background health check that opens the resurrection window
- `src/lib/connector/health-monitor.ts:215-227` — the upsert `create` branch that writes `status`
- `docs/BUGS.md` § Session 2026-09-01 — E2E-B4, E2E-B9 (credential-gated restore), E2E-B18 (resurrection race)
