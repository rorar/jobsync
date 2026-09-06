# Handoff — E2E Elysium, 2026-09-05/06

Branch `fix/e2e-elysium`. **Updated 2026-09-06 evening** — the section "The open thing"
below is no longer open in the way it was written; read § The leak, named before
acting on it.

Run `git rev-parse HEAD` and `git status` rather than trusting a SHA in prose. The
first version of this file said HEAD was `9303b872` and was right at the time; the
point of the instruction is that "at the time" expires.

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
named in §5 of the analysis were audited and cleared. **This was done — see § The leak,
named. What follows is the reasoning that led there, kept because it is still the record
of what was ruled out.** The step was: a heap snapshot pair, taken EARLY (1 GB vs 2.5 GB — growth is linear, so the small end shows the same
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


---

# Added 2026-09-06, evening

## The leak, named

The snapshot pair proposed above was taken, and it answers the question. **The retention
is React's development Flight build.** Not Turbopack, not application code.

`react-server-dom-webpack-server.node.development.js` installs a process-wide
`async_hooks.createHook(...).enable()` at module load, unguarded, for React's async
debug-info / owner-stack tracking. Each tracked operation is a node
`{tag, owner, stack, start, end, promise, awaited, previous}`. `destroy` deletes the MAP
entry; the nodes are also chained to each other through `previous`/`awaited`, and
`promiseResolve` builds nodes that are assigned as `node.previous` and never entered into
the Map at all — unreachable by `destroy` by construction.

Evidence, one server lifetime, 701 MB and 1170 MB heapUsed, 401 requests apart:
`object: WeakRef` +1,102,348 (~2,749 per request), each referenced by a distinct plain
`Object` through a property `promise`, those Objects chaining through `awaited`
(1,337,594) and `previous` (950,488). Full numbers and the code: second addendum in
`docs/e2e-dev-server-restart-analysis.md`; tracked as `E2E-B42`.

**What this changes for anyone continuing.** Three things:

1. **Do not spend another run on bundlers or caps.** Both `app-page.runtime.dev.js` and
   `app-page-turbo.runtime.dev.js` carry the hook, which is why the webpack measurement
   grew identically. The bundler was never the cause and neither cap was ever a fix.
2. **There is no runtime opt-out.** No `process.env` test within 200 lines of the
   `.enable()` in either the stable or the `-experimental` React build; the feature is
   gated at React's own build time.
3. **The only remedy that addresses the cause is remedy (iii)** — run the suite against
   `next build` + `next start`, where no development Flight bundle is loaded. Its blocker
   is unchanged and unrelated: `E2E_AUTH_RATE_LIMIT_BYPASS` is deliberately inert under
   `NODE_ENV=production`. **That is the open decision, and it is the only one left here.**
   ROADMAP §8.5 Phase 3 already plans the move for other reasons.

## Tools this leaves behind

Three, in `tools/next-heap/`, each with a `--self-test` that proves it can fire:

| | |
|---|---|
| `snapshot-pair.py` | takes two snapshots at `heapUsed` thresholds read from `.next/trace`. Refuses to signal a process that is not armed, because Node's default disposition for SIGUSR2 is to TERMINATE. |
| `heap-classes.py` | streams a multi-GB snapshot and aggregates by class; `--diff` compares two. Refuses a truncated file by comparing the header's `node_count`. |
| `heap-retainers.py` | walks the edge array to name what points at a class, with `--hop-through` for one more level. Excludes structural edges by default. |

Armed with `E2E_DEV_HEAP_SNAPSHOT=1` on `scripts/dev-e2e.sh`.

**If you take another snapshot, raise `E2E_DEV_MEM_MAX` first.** A snapshot raises the
process's RSS floor permanently — V8 allocates to serialise and does not give it back.
Measured: one snapshot at 1.0 GB heap, then an OOM kill four minutes later at 1.9 GB heap
with anon-rss 7.81 GiB against `MemoryMax=8G`, with the heap nowhere near the watchdog
threshold so the dev log said nothing. That is WORSE than a watchdog restart: SIGKILL
leaves `next-dev.js:272` declining to respawn, so the port stays dead and every remaining
test fails against nothing (80 of them, on that run). The second attempt used
`E2E_DEV_MEM_MAX=11G` with thresholds 700/1150 MB and peaked at 6.8 GB.

## Also closed since the first version of this file

- **`job-crud.spec.ts:290`** — the missing toast half of its `deleteJob`, now present.
- **`task-crud.spec.ts`** — the status-filter half of E2E-B40. The widener now confirms
  each toggle reached `aria-checked="true"`, returns a boolean, and closes the menu in a
  `finally`; the caller distinguishes "deleted" from "invisible" instead of printing
  silence that reads as clean.
- **`check-spec-refs.sh` is wired in.** Both CI (`.github/workflows/ci.yml`, with a pinned
  allium 3.6.1 installed from the `juxt/allium-tools` release) and a local pre-push hook
  (`scripts/hooks/pre-push`, armed by `scripts/install-hooks.sh` — **not installed for
  you**; `core.hooksPath` is per-repository and takes effect for every linked worktree).

## One more withdrawn claim, and how it was caught

The first version of this file, and the analysis it points at, said the retention lived in
the "Turbopack dev request path". That was wrong, and it was wrong in the way the previous
four were: a hypothesis from static reading, written in the register of a finding. The
webpack measurement had already contradicted it — floors rose identically — and the
contradiction was recorded as "the upstream reports do not hold for this tree" rather than
as "the hypothesis is dead". Reading the evidence as a surprise about webpack, instead of
as a refutation of Turbopack, cost a measurement.

It was also **caught by the user, not by me**: a claim in this session that `allium` had
"no published install step" and could therefore not run in CI was concluded from a local
check only — not in `package.json`, a hand-installed binary in `~/bin` — and the user asked
for it to be checked independently. Upstream publishes prebuilt Linux archives per release.
The pattern in both is the same: local absence read as global absence.

## The production-build decision, sized

Asked and answered after the above was written, so the numbers here are newer than
§ The leak, named.

**It is the common denominator under four open entries, not a fifth item beside
them.** `E2E-B42` (the leak — the only remedy at the cause), `E2E-B11` (the
hydration oracle is only meaningful where the tree is deterministic; that entry
already names ROADMAP §8.5 Phase 3 itself), `E2E-B28` (the same dev-server
warning is what its console oracle collects), and `E2E-B35` (whose own text says
*"The real lever is not the timeouts: the dev server reaches 4-5 GB RSS during a
run"* — a hypothesis in that entry, not a measurement). The other six open E2E
entries are residue and hygiene and are untouched by it.

The causal link to work already done is in the history, not in interpretation:
`2da07586`'s body says the toast assertion exists because the watchdog restart
swallowed a delete. Those assertions do NOT become redundant under a production
build — they still separate "the server refused" from "the server never
answered", and only the second cause disappears.

**The auth blocker is smaller than this file and `docs/BUGS.md` say.** Both call
`E2E_AUTH_RATE_LIMIT_BYPASS` *the* blocker. Counted rather than asserted: the
limit is 5 signins per 15 minutes per IP (`src/lib/auth/auth-rate-limit.ts:24-25`)
and a full run spends exactly **three** — `e2e/global-setup.ts:23`,
`e2e/smoke/signin.spec.ts:15`, `e2e/smoke/locale-switching.spec.ts:247`. A single
run fits comfortably; the SECOND run inside 15 minutes trips.

And there is a clean way out that touches neither the rate limiter nor the
production gate: this project uses **JWT sessions**, not database sessions
(`src/auth.config.ts:13` declares `@auth/core/jwt`; there is no `model Session`
in `prisma/schema.prisma`). A session is a cookie signed from `AUTH_SECRET`, so
`global-setup.ts` could mint it directly instead of signing in — removing one of
the three, and leaving two runs per 15 minutes comfortable. The double gate at
`auth-rate-limit.ts:61-62` and its contract test
(`__tests__/auth-rate-limit.spec.ts:229`) stay exactly as they are.

**The real recurring cost is the build, not the auth**: every run needs
`build-safe.sh` first (7 G cgroup), and again after every code change.
`playwright.config.ts:59` also hardcodes `command: "bun run dev"`.

**Correction to § Tools this leaves behind.** That section says the restart
reporter and the heap tooling lose their purpose. True of about 8 of the 11
commits in that chain — but NOT of `1d819221` and `c742d811`, which bound the
dev server's memory and CPU. A production server needs those bounds too; it is
merely thriftier.
