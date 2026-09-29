# ADR-044: Health observation must not assert lifecycle state

**Status:** Accepted
**Date:** 2026-09-02
**Context:** finding E2E-B18; commit `f56da9ff`; audit of that commit
**Related:** ADR-043 (whose recorded rationale for this was retracted — see below),
`specs/module-lifecycle.allium` invariant `AdminOnlyModuleLifecycle`

## Context

`ModuleRegistration` carries two columns that answer different questions:

- **`status`** (`active` / `inactive` / `error`) — *lifecycle*, an intention. It is asserted only
  by `activateModule` / `deactivateModule`, which are admin-gated, rate-limited and audit-logged
  (`src/actions/module.actions.ts`), and by `handleAuthFailure` in `degradation.ts`.
- **`healthStatus`** (`healthy` / `degraded` / `unreachable`) — *health*, an observation of an
  external system, written by the periodic probe.

`checkModuleHealth` persisted its result with an upsert whose `update` branch touched only
`healthStatus`, but whose `create` branch also wrote `status: registered.status`.

That is not a cosmetic overlap. `specs/module-lifecycle.allium:765-768` — a **prose** invariant,
i.e. a comment that `allium check` cannot enforce, which is precisely why it could drift from the
code for five months with no tool objecting — cites the separation as
the **stated reason `runHealthCheck` is excluded from the admin gate**:

> `runHealthCheck` is intentionally EXCLUDED from this gate — confirmed-safe by Sprint 3 Stream C
> audit. Reason: checkModuleHealth writes only module.healthStatus (HEALTHY/DEGRADED/UNREACHABLE),
> NOT module.status (ACTIVE/INACTIVE).

The Sprint 3 audit comment at `src/actions/module.actions.ts:474-477` says the same, and quotes the
`update` payload correctly — then generalises to "the health-monitor path". A two-branch upsert was
audited on one branch. The invariant was therefore **false for the create branch from `32426cca`
(2026-03-29) until `f56da9ff` — five months**; `git log -S 'status: registered.status'` returns
exactly those two commits.

**The Sprint 3 conclusion was nevertheless correct.** A non-admin caller of `runHealthCheck` could
not flip a *recorded* lifecycle value even under the old code: the create branch fires only when no
row exists, and no row means no recorded deactivation to overwrite; when a row exists the update
branch runs, which never wrote `status`. Right conclusion, wrong reason. It is stated here so
nobody re-derives it under time pressure.

## Decision Drivers

- **An Allium invariant used to justify a security boundary must be true.** `CLAUDE.md`: specs are
  the single source of truth for domain rules.
- **The reset in ADR-043 depends on absence meaning the default.** A probe that writes `status`
  turns absence back into a value.
- **Behaviour must not change** for any reachable ordering; this is not the commit to alter
  lifecycle semantics.

## Considered Options

### Option 1: Leave the code, weaken the spec to match

- **Pros**: no code change; the spec becomes true immediately.
- **Cons**: inverts the project's stated direction of authority, and the weakened invariant would
  no longer justify the admin-gate exclusion it exists to justify — the gate decision would have to
  be reopened.

### Option 2: Write the manifest default explicitly in the create branch

- **Pros**: explicit; no reliance on a column default.
- **Cons**: still a health probe asserting lifecycle, just with a nicer value. It also restates a
  fact the manifest already owns, which is the duplication ADR-043 exists to avoid.

### Option 3: Omit `status` from the create payload

- **Pros**: the health path stops asserting lifecycle at all; the schema default supplies the
  value, and that default coincides with the manifest default; ADR-043's "absence expresses the
  default" holds end to end.
- **Cons**: the equivalence between `prisma/schema.prisma` and `registry.ts` becomes load-bearing
  and was previously untested; one narrow ordering loses information (below).

## Decision

**Option 3.** `checkModuleHealth` no longer writes `status`. Health observes; lifecycle is
asserted elsewhere. A row materialised by a probe carries no opinion about activation.

## Rationale

The two defaults are the same value from two directions — `status String @default("active")`
(`prisma/schema.prisma:606`, and the migration SQL) and `ModuleStatus.ACTIVE` (`registry.ts:67`) —
so omitting the column preserves behaviour in every reachable ordering while removing the
assertion. `checkModuleHealth` guards on `ACTIVE` before the persist (`health-monitor.ts:110-118`),
so `registered.status` was already `ACTIVE` there in practice.

This does **not** rest on a concurrency defect. ADR-043 twice recorded one — a stale-`inactive`
process, then a concurrent deactivation inside the probe's await window — and both were retracted:
the guard closes the first, and every lifecycle writer's upsert asserts its own status in both
branches (`module.actions.ts:219-231`, `:348-360`, `degradation.ts:92-100`), so both interleavings
converge on the intended value. The justification is the spec divergence, not a race.

## Consequences

### Positive

- `AdminOnlyModuleLifecycle` is true as written, so the admin-gate exclusion for `runHealthCheck`
  rests on a fact rather than an aspiration.
- ADR-043's reset yields the manifest default by construction rather than by coincidence.
- The health path now has exactly one concern.

### Negative

- **One ordering loses information, and it runs against this change.** If a lifecycle writer
  mutates memory and its own DB write then *fails* — `deactivateModule` calls `setStatus` at
  `module.actions.ts:345` before persisting at `:348`, and `handleAuthFailure` wraps its write in a
  try/catch that logs and continues (`degradation.ts:101-103`) — a probe already past the guard
  reaches an absent row and creates it. The old code wrote the in-memory `inactive`, accidentally
  recording the intention the failed write had lost; the new code writes `active` and the intention
  is gone. It requires a database failure, not mere concurrency.

  The recovery is a trap worth knowing: `module.actions.ts:337-342` early-returns `success: true`
  when memory already says `INACTIVE`, so re-issuing the deactivation writes nothing and reports
  success. Recovery needs activate-then-deactivate. Persisting before mutating memory would close
  this properly and is a larger change than this one should carry.

- The schema/registry equivalence is now load-bearing. Mitigated, not eliminated (below).

- **ADR-043 widens the window this record accepts, and neither document noticed.** The negative
  above needs "no row exists", which is rare in production and *routinely manufactured* by
  ADR-043's step 0b, which deletes every row before every E2E run. Severity stays low — on a
  freshly reset database the lost intention is a test artefact, not a user's — but the two
  decisions interact on exactly the machine where the reset runs.

- The upstream defect this exposes is tracked as **MOD-B1** in `docs/BUGS.md`, not only here. An
  ADR records a decision; it is not a bug tracker, and a finding filed only in a Consequences
  section has been forgotten on purpose.

### Neutral

- No behavioural difference in any ordering that does not involve a failed database write.

## Implementation Notes

Three tests in `__tests__/health-monitor.spec.ts`:

1. the upsert's `create` payload carries no `status`, while `update` still carries `healthStatus`;
2. the not-active guard itself, so a future relaxation cannot silently re-open the path;
3. `prisma/schema.prisma` **and** the migration SQL both declare the default as
   `ModuleStatus.ACTIVE` — the equivalence this decision delegates to was previously pinned on the
   registry side only, so flipping the schema default would have left every unit test green while
   the E2E reset silently inverted.

`src/actions/module.actions.ts:474-477` carries a note that its audit block described a state the
code did not have until `f56da9ff`.

## References

- `specs/module-lifecycle.allium:765-768` — the invariant, and the admin-gate exclusion it justifies
- `src/lib/connector/health-monitor.ts:110-118` — the not-active guard
- `src/lib/connector/health-monitor.ts:227-239` — the upsert, create branch now status-free
- `src/actions/module.actions.ts:219-231`, `:337-342`, `:345-360` — the lifecycle writers
- `src/lib/connector/degradation.ts:89-103` — the third writer, and its swallowed failure
- `docs/adr/043-e2e-global-state-reset-by-deletion.md` — the reset that depends on the equivalence
- `docs/BUGS.md` § Session 2026-09-01 — E2E-B18
