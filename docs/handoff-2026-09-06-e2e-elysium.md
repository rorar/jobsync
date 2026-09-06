# Handoff — E2E Elysium, 2026-09-05/06

Branch `fix/e2e-elysium`, HEAD `9303b872`, **everything is pushed** (0 ahead, 0 behind
`origin/fix/e2e-elysium`). 79 commits since `5e5d4ae8`, 27 of them in this session.
Working tree clean.

Run `git rev-parse HEAD` rather than trusting a SHA in prose — the previous handoff said
the same thing and was right.

## Gates, last measured

| Gate | Result |
|---|---|
| `scripts/test.sh` | 315 suites / 5,800 tests, `EXIT=0` |
| `scripts/typecheck-safe.sh` | `EXIT=0` |
| `allium check specs/` | 0 errors (syntax only — see below) |
| `scripts/check-spec-refs.sh` | 0 active, 7 acknowledged, self-test PASS |
| E2E `--project=crud` | **111 passed / 1 failed**, 20.2 min, residue gate clean, no contention banner |

The one E2E failure was `job-detail-panels.spec.ts:389`, and it was **not a code defect**:
the dev server restarted mid-run and abandoned the delete request. See § The open thing.

## What this session actually closed

**E2E-B39 was a product defect, not test flakiness.** It sat in `docs/BUGS.md` for days as
a test-isolation problem. `Combobox` made a just-created option visible by calling
`options.unshift(result)` — mutating the array its PARENT owns — while deriving the
trigger's text from that same array. A parent that legitimately replaces it
(`AddExperience` refetches on mount) dropped the created row while `field.value` still held
its id, so `options.find` missed and the trigger rendered `""`. The row was in the database
throughout, which is why every investigation that checked the DATA concluded the test was
at fault. Fixed in the component (`3fe7412a`), five call sites benefit, and both failing
tests are green in the suite.

The repair the row itself proposed — make the spec independently runnable — would have
hidden it. That fix was one commit away from being made.

**MOD-B1 closed, both halves.** `f721f693` claimed `activateModule` "is fixed the same way"
as `deactivateModule`; true of the ordering, false of the short-circuit. The missing half
landed in `ea693c20`, and the escalation cascade is now atomic — status write, automation
query and pause inside one `prisma.$transaction`, with the memory mirror and the domain
event strictly after the commit.

**Sixteen reference-integrity defects across eight spec files**, none of which `allium check`
or `allium analyse` can see. Three dangling `provides` triggers, a surface advertising an
admin-gated cross-tenant operation at the wrong arity, invariants iterating `value` types
that have no addressable collection, and two surfaces binding `user_id = viewer.email` where
the owner is matched by id — String on both sides, so it type-checked and matched nothing.

**A gate for that class now exists**: `scripts/check-spec-refs.sh` +
`tools/allium-refcheck/refcheck.py`, calibrated against history (23 findings at
`3663e8cc^`, 15 at `176cb8b9^`, 0 at HEAD) with a `--self-test` that proves each check can
fire. Wired as `bun run check:spec-refs`; **not yet in any pre-push hook or CI step.**

**Reference-data leaks in seven specs**, 43 rows on a green run, plus two defects the
cleanup work exposed: `await locator.count()` used as a readiness probe (it does not
auto-wait, so the guarded block was skipped in silence) and a `kanban.spec.ts` that was
living on jobs another spec leaked.

## The open thing, and it is the interesting one

**The E2E dev server leaks, and every remedy only chooses which symptom to pay.**
Full analysis in `docs/e2e-dev-server-restart-analysis.md`, including an addendum with both
options measured rather than estimated.

Mechanism: `node_modules/next/dist/server/lib/start-server.js:234` runs a watchdog after
EVERY request and calls `process.exit(77)` once the used heap passes 80% of the cap. The
request that tripped it has already answered; **every other request in flight dies with no
response, no error and no end handler.** No application code can observe it. The parent
respawns on the same port, so the suite carries on and the only symptom is one test failing
on an outcome that never happened.

Measured:
- At 3072 MB (current default): threshold 2.62 GB, ~1 restart per run.
- At 5120 MB: **zero restarts over 93 tests**, but floors ran 580 → 3783 MB across 81
  collections — monotonic, ~40 MB each — and the peak hit 3909 MB against a 4096 MB
  threshold. A full suite does not fit. That run also produced **13 failures with durations
  up to 6.6 minutes**: contention, because the host had ~11 GB free and the raise does not.
- `next dev --webpack` (knob: `E2E_DEV_BUNDLER=webpack`): floors +672 MB. Ruled out.

So ~34 KB is retained per request and the leak itself is the thing to fix. The suspects
named in §5 of the analysis were audited and cleared. **Next honest step: a heap snapshot
pair**, taken EARLY (1 GB vs 2.5 GB — growth is linear, so the small end shows the same
accumulation with smaller files and shorter stop-the-world pauses), via
`--heapsnapshot-signal=SIGUSR2` in `NODE_OPTIONS` and `kill -USR2` at the `next-server`.
Do it on a run whose test results are discarded; the pause will fail tests.

Third option in the analysis, still unevaluated: run the suite against `next build` +
`next start`, where the watchdog does not exist. Blocked by `E2E_AUTH_RATE_LIMIT_BYPASS`
being disabled under `NODE_ENV=production` by design.

Mitigation already shipped (`fc331d62`, repaired in `9fefaf9c`): the wrapper counts the
restarts and says what they mean, and the dev log is timestamped so a restart can be placed
against the Playwright timeline.

## Also open

- `docs/BUGS.md`: 656 found, **642 fixed, 12 open**, arithmetic verified. `E2E-B11` is an
  oracle decision, not work.
- `job-crud.spec.ts:290` — its `deleteJob` proves removal by the row alone, the same missing
  half repaired in `job-detail-panels`. It is the inline cleanup of seven tests.
- `task-crud.spec.ts` — `revealAllTaskStatuses` swallows its failure, and the status filter
  then hides the row from `purgeTask` AND from the re-check equally. Silent leak. This is
  the status-filter half of E2E-B40, still open.
- `check-e2e-residue.sh` maps a MODEL to a finding id and cannot know which spec wrote a
  row. It now says so, but the debt entries are still model-keyed.

## The thing worth carrying forward

The previous handoff said errors collect in *statements about code*, because code is tested
and prose is not. This session produced nine more instances and, more usefully, four of them
were mine and were caught:

1. I named the wrong mechanism for the truncated-report guard (cgroup kill; it is a swallowed
   reporter error) — caught by a verifier, and the wrong mechanism was already committed as a
   comment.
2. I presented the residue gate's output as evidence of *which spec* leaked. It maps models,
   not specs, and the rows belonged to seven other files.
3. I wrote that the language server found the spec defects. It found some, produces thirteen
   confirmed false positives, and cannot sweep more than the file being edited.
4. I shipped a commit whose only purpose was to make an invisible failure visible, and it
   contained three defects — one of which printed a shell error immediately above the line
   the operator is told to read.

Two operational lessons with teeth: **do not edit a shell script while it is executing**
(bash reads lazily by byte offset; it destroyed a 36-minute run), and **`TaskStop`, never
`kill`**, for subagents — `kill` ends the process but leaves the session entry, so the user's
TUI shows agents that no longer exist.
