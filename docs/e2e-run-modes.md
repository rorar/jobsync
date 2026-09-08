# E2E run modes — `E2E_PROD=1` (default) vs `E2E_PROD=0`

Reference for `scripts/test-e2e.sh`. `CLAUDE.md` § E2E Test Infrastructure carries the short
version, because it is loaded into every session; this file is the long one. Where the two
disagree, believe the code — every claim below names the file and line it came from, so it can
be rechecked rather than inherited.

Production became the default on 2026-09-08 (`06552fed`).

```bash
./scripts/test-e2e.sh                                    # production build (default)
E2E_PROD=0 ./scripts/test-e2e.sh                         # dev server
E2E_PROD=0 ./scripts/test-e2e.sh e2e/crud/x.spec.ts      # spec iteration while editing app code
```

## The difference, line by line

| | `E2E_PROD=0` — dev | `E2E_PROD=1` — production (default) |
|---|---|---|
| server | `scripts/dev-e2e.sh` → `bun run dev` (`next dev --turbopack`) | `scripts/prod-e2e.sh` → `bunx next start -p <port>` |
| build | none; compiles on request | `scripts/e2e-prod-build.sh` runs first, into `.next-e2e/` |
| `NODE_ENV` | `development` | `production` (`prod-e2e.sh` exports it) |
| React bundle | **development** Flight build | production Flight build |
| memory watchdog | **present** — restarts the server mid-run | **absent** — not compiled in |
| auth rate-limit bypass | `E2E_AUTH_RATE_LIMIT_BYPASS=1` (`scripts/dev-e2e.sh:10`) | none; `scripts/prod-e2e.sh:45-48` actively unsets it |
| node heap / cgroup | 3072 MB / 8 G (`scripts/dev-e2e.sh:83,97`) | 2048 MB / 4 G (`scripts/prod-e2e.sh:83,84`) |
| CPU quota | 300 % | 300 % |
| server log | `/tmp/jobsync-e2e-dev.log` | `/tmp/jobsync-e2e-prod.log` |
| restart report + attribution | printed | skipped (`scripts/test-e2e.sh:876`) — there is nothing to report |
| full suite, measured | 19–27 min | **~13 min** |
| source edit picked up by | HMR, no rebuild | a rebuild (1 min 54 s measured) |

Port and lock are **shared** by both modes on purpose: one server per worktree whichever mode it
is in, so a stale dev server can never answer a production run.

## Why the difference exists

`next dev` loads React's development Flight build, which installs an unguarded process-wide
`async_hooks` hook at module load and retains ~2,749 `{promise, awaited, previous}` nodes per
request. There is no runtime opt-out — React gates the feature at its own build time, and BOTH
`app-page.runtime.dev.js` and `app-page-turbo.runtime.dev.js` carry it, which is why switching
bundler changed nothing. Measured from a heap-snapshot pair, 701 MB and 1170 MB heapUsed, 401
requests apart. Tracked as `E2E-B42`; full write-up in
`docs/e2e-dev-server-restart-analysis.md`.

Next's own watchdog then reacts to that growth: `node_modules/next/dist/server/lib/start-server.js:233`
checks the used heap after **every request** and calls `process.exit(RESTART_EXIT_CODE)` past 80 %
of the cap. The request that tripped it has already answered; every other request in flight dies
with no response, no error and no end handler. Nothing application-side can observe it.

That whole block is inside `if (isDev)`. Under `next start` it is not merely quieter — it is not
there.

## What each mode has actually produced

Both directions are load-bearing, which is why `E2E_PROD=0` still exists.

**Production found a defect dev hid.** `E2E-B43`: `TagInput` cleared its controlled search field
from inside a `startTransition`, so the clear could commit after the user had typed the next
skill and React wrote the stale empty value back into the DOM. The next Enter was swallowed —
no request, no chip, no error, no toast. It failed **6 production runs out of 6** and passed
**3 dev runs out of 3**: the dev server is slow enough at the right place to lose the race
reliably. Fixed in `ff06f705`.

**Dev produces failures that are not about the application.**

- `E2E-B11` — a hydration mismatch in the dashboard chrome, provably outside app code, in a
  region Next gates on `NODE_ENV !== 'production'`. It reds the console oracle roughly one run in
  three on the dev path and cannot occur under production.
- `e2e/crud/job-detail-panels.spec.ts:440` — the watchdog's **deterministic landing zone**. The restart is
  request-count driven, so with the fixed single-worker order it fires after ~1,620–1,650 of
  ~3,130 logged requests, which is inside that test's window in 5 of 5 measured runs. It fails
  when a navigation is in flight at that second and passes when none is. Not a flake, not a
  product bug (`E2E-B35`).

The general shape: a dev-only suite measures an artefact nobody ships and, in the same motion,
hides defects that exist only in what IS shipped.

## Choosing

- **Any run whose result is meant to be a verdict** — before a commit, a full suite, a
  re-measurement, anything you would quote — use the default.
- **`E2E_PROD=0` while you are editing the application code a spec exercises.** HMR beats a
  rebuild per iteration. Expect the watchdog to land in `e2e/crud/job-detail-panels.spec.ts:440`; read the
  `[attribute-restarts]` line before treating any dev failure as real.
- Do not mix the two inside one measurement. Timing differs by roughly a factor of two, and that
  is exactly the variable most of these findings turn on.

## The build, and its cost

`scripts/e2e-prod-build.sh` builds only when `.next-e2e/BUILD_ID` is missing or a source file is
newer than it (`src`, `public`, `prisma/schema.prisma`, `next.config.mjs`, `package.json`,
`tsconfig.json`). `E2E_PROD_BUILD=always|never` overrides. It builds through `build-safe.sh`, so
the 7 G cgroup applies, and it verifies the artefact rather than trusting the exit status — a
wrapper that exits 0 without producing a `BUILD_ID` has not built anything.

Measured: 1 min 54 s wall, of which 49 s compilation, 1.3 GB output.

`.env` is deliberately NOT a staleness input: Next reads it at runtime for `next start`. The
exception is `NEXT_PUBLIC_*`, which is inlined at build time — see the next section.

## Things that surprise people

**The output directory is `.next-e2e`, not `.next`.** Turbopack's dev cache and a production
build write the same manifest filenames, so one shared directory means every mode switch
silently invalidates the other's work — and a stale manifest surfaces as "Internal Server Error",
not as a cache problem. `next.config.mjs` reads `NEXT_DIST_DIR`, which must be identical at build
time and at start time or `next start` reports "Could not find a production build".

**Mock data and the Developer Options sidebar entry exist only in dev.**
`isMockDataEnabled()` (`src/lib/constants.ts:68-73`) is
`NODE_ENV === "development" || NEXT_PUBLIC_ENABLE_MOCK_DATA === "true"`, and that variable is not
set in `.env`. So `/dashboard/developer` is hidden under production. No spec navigates there
(checked), but a spec written against it would pass only with `E2E_PROD=0`.

**`next start` prints a warning about `output: "standalone"`** and serves correctly anyway:

```
⚠ "next start" does not work with "output: standalone" configuration.
  Use "node .next/standalone/server.js" instead.
```

`next.config.mjs:3` sets `output: "standalone"` for deployment. The standalone bundle is an
ADDITIONAL artefact; `next start` runs from the ordinary build in the same directory. 112 of 112
tests pass through it. The warning is recorded here because it looks alarming and has not, so
far, corresponded to any observed difference — if a production-only failure ever resists
explanation, running the suite against `node .next-e2e/standalone/server.js` is the experiment
that has not been done.

**The auth bypass is not needed under production, and must never be set there.**
`E2E_AUTH_RATE_LIMIT_BYPASS` is double-gated on `NODE_ENV !== "production"`
(`src/lib/auth/auth-rate-limit.ts:60-62`) and is inert by design. It is also unnecessary: the
limit is 5 signins per 15 minutes per IP (`:24-25`) and a run spends **two**, because
`e2e/global-setup.ts` mints the NextAuth session cookie instead of signing in — this project uses
JWT sessions, so a session is a cookie signed from `AUTH_SECRET` and nothing has to be written.
The two remaining signins belong to the smoke tests that exercise the auth flow itself.

## Related

- `docs/e2e-dev-server-restart-analysis.md` — the leak, the watchdog, and the three remedies with
  the measurements that ruled two of them out.
- `docs/BUGS.md` — `E2E-B42` (the retention), `E2E-B43` (the defect production surfaced),
  `E2E-B35` (the cluster, and the watchdog's landing zone), `E2E-B11` (the hydration oracle).
- `e2e/CONVENTIONS.md` § Reading a failure's artefacts — the sampler, the restart attribution, and
  why `error-context.md` is not a failure snapshot.
