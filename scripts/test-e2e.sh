#!/usr/bin/env bash
# Resource-aware E2E runner. Single worker by default whatever the host reports.
#
# Unlike the production build (which OOM-hangs the host -> see build-safe.sh),
# the E2E suite is not memory-bound; it was blocked by two VM-specific issues,
# both fixed here:
#   1. Prisma NixOS engine + auth bypass: Playwright's webServer ("bun run dev")
#      sources NEITHER env.sh NOR E2E_AUTH_RATE_LIMIT_BYPASS. So we pre-start a
#      correct dev server (scripts/dev-e2e.sh). Since 47369e15 this script
#      REPLACES any server already on the port — see the block below for why.
#      (e2e/CONVENTIONS.md's "never stop the dev server" is a rule for ad-hoc
#      kills by hand; the wrappers restart it deliberately.)
#   2. Cold-compile signin flake: the first AUTHENTICATED /dashboard load (in
#      global-setup) triggers a Turbopack compile that can exceed the default
#      30 s login timeout on a slow VM. We raise it via E2E_LOGIN_TIMEOUT_MS,
#      which e2e/global-setup.ts now honours.
#
# The DEV server is confined by dev-e2e.sh's own scope, not by this one. The
# RUNNER and its browsers do get a cgroup here (E2E_MEM_MAX / E2E_CPU_QUOTA,
# applied at the bottom of this file) so a runaway Chromium cannot take the host
# with it — an earlier version of this comment said there was no cgroup at all,
# which stopped being true when that scope was added.
#
# Extra args pass straight through to `playwright test`, e.g.:
#   ./scripts/test-e2e.sh                                  # full suite (smoke -> crud)
#   ./scripts/test-e2e.sh e2e/crud/inside-track-crud.spec.ts
#   ./scripts/test-e2e.sh --project=smoke
#
# Tunables (env):
#   E2E_PROD               1 = run against `next build` +   (default 0: dev
#                          `next start` instead of the dev   server)
#                          server. Removes the cause of the mid-run restarts
#                          (E2E-B42: the dev Flight bundle's async_hooks
#                          retention, and a watchdog that only exists under
#                          `isDev`), at the price of a build per code change.
#                          scripts/e2e-prod-build.sh decides whether that build
#                          is needed; E2E_PROD_BUILD=always|never overrides it.
#   E2E_WORKERS            playwright workers              (default 1)
#   E2E_LOGIN_TIMEOUT_MS   global-setup login wait, ms     (default 90000)
#   E2E_SERVER_WAIT        seconds to await cold server    (default 150)
#   E2E_KEEP_SERVER        1 = leave OUR dev server up     (default 0: stopped,
#                          because THIS wrapper always starts a fresh one. Note
#                          the cost: a following E2E_REUSE_SERVER=1 run has
#                          nothing left to borrow and silently pays a cold
#                          compile, so set this when looping with that flag)
#   E2E_REPORT_JSON        path of the JSON report this    (default
#                          wrapper produces for the gate    test-results/.e2e-run-report.json)
#   E2E_KEEP_RUN_DB        0 = discard the run database    (default 1: kept)
#   E2E_DB_WATCH           1 = sample the run database     (default 0) every
#                          0.5 s and log every row that appears or disappears
#                          (scripts/e2e-db-watch.sh); the log is kept beside
#                          the JSON report. Answers "was the server ever
#                          asked?" for a failure — a question the database
#                          cannot answer after the run.
#   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH  chromium binary   (auto: NixOS path if
#                                        present, else Playwright's own download)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

source "$DIR/env.sh"
source "$DIR/lib-runtime-guard.sh"
source "$DIR/e2e-db.sh"
source "$DIR/lib-devserver.sh"
# Chromium: prefer an explicit override, then the NixOS system binary, else leave
# UNSET so Playwright falls back to its own downloaded browser. Hardcoding the
# NixOS store path as the default made every launch fail with "executable doesn't
# exist" on a non-NixOS host, even though a usable browser was installed.
NIXOS_CHROMIUM=/run/current-system/sw/bin/chromium
if [ -n "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
elif [ -x "$NIXOS_CHROMIUM" ]; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$NIXOS_CHROMIUM"
else
  unset PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
fi

# Preflight: when we are relying on Playwright's own download, check the build it
# actually wants is present, and say so BEFORE the run instead of dying inside
# global-setup.ts with "Executable doesn't exist at …chromium_headless_shell-NNNN".
#
# The shared cache ~/.cache/ms-playwright is not ours alone. A newer playwright-core
# living elsewhere on the machine populates it with ITS pinned build: on this host
# `@playwright/mcp@latest` pulls playwright-core 1.63.0-alpha, which downloads
# chromium 1234, while this project's 1.57.0 wants 1200 — so the cache looks full
# and the launch still fails. Installing an MCP server should not break a test suite
# that knows nothing about it, but it does, silently, and the resulting error names
# a path rather than a cause.
#
# We used to fail hard here rather than substitute whatever build sits in the cache,
# on the grounds that an unpinned browser works until it does not and a silent skew is
# worse than a loud stop. That reasoning assumed the stop was ACTIONABLE — that the
# advice it printed, `npx playwright install chromium`, could fetch the pinned build.
# On this host it cannot, and the advice was simply wrong:
#
#     Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
#
# playwright-core 1.57.0 has no ubuntu26.04-x64 mapping for chromium 1200 at all
# (`npx playwright install --dry-run chromium` prints an install location but no
# download URL), so the pinned build is unobtainable until @playwright/test is
# upgraded. The real choice on this machine is therefore between a WARNED
# substitution and a suite that cannot run at all.
#
# So: substitute, but never silently. Every run prints which build it used and which
# one the package pins, so a failure that turns out to be browser skew is one line away
# from being recognised as such. A hard stop remains for the case the fallback cannot
# cover — no chromium in the cache at all.
if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  # Read the file by path, NOT via require("playwright-core/browsers.json"):
  # the package's "exports" map does not expose it, so require throws
  # ERR_PACKAGE_PATH_NOT_EXPORTED, the revision comes back empty, and the check
  # below silently passes — a preflight that looks like it checks and does not.
  WANT_REV="$(node -e 'const f="node_modules/playwright-core/browsers.json";const fs=require("fs");if(!fs.existsSync(f))process.exit(0);const b=JSON.parse(fs.readFileSync(f,"utf8")).browsers.find(x=>x.name==="chromium");process.stdout.write(b?String(b.revision):"")' 2>/dev/null || true)"
  CACHE_ROOT="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
  if [ -n "$WANT_REV" ] && [ ! -d "$CACHE_ROOT/chromium-$WANT_REV" ]; then
    PW_VER="$(node -p 'require("playwright-core/package.json").version' 2>/dev/null)"
    HOST_OS="$( . /etc/os-release 2>/dev/null && echo "${ID:-unknown}${VERSION_ID:-}" )"
    # Newest cached build wins. sort -V, not sort: plain sort puts 999 above 1234.
    FALLBACK_CHROMIUM="$(ls -d "$CACHE_ROOT"/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)"
    if [ -n "$FALLBACK_CHROMIUM" ] && [ -x "$FALLBACK_CHROMIUM" ]; then
      export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$FALLBACK_CHROMIUM"
      echo "[test-e2e] WARNING: chromium $WANT_REV, pinned by playwright-core $PW_VER, is NOT installed"
      echo "                    and cannot be installed on $HOST_OS with this playwright version."
      echo "                    Falling back to: $FALLBACK_CHROMIUM"
      echo "                    If a failure smells like browser behaviour, this skew is the first suspect."
      echo "                    Removing the skew means upgrading @playwright/test, not re-running install."
    else
      echo "[test-e2e] ERROR: chromium build $WANT_REV is not installed and no cached chromium"
      echo "                 was found to fall back to. playwright-core $PW_VER pins it;"
      echo "                 $CACHE_ROOT holds:"
      ls -1 "$CACHE_ROOT" 2>/dev/null | sed 's/^/                   /' || echo "                   (cache directory missing)"
      echo "                 On a supported OS:  npx playwright install chromium"
      echo "                 On $HOST_OS that install is refused — point"
      echo "                 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at a browser you trust instead."
      exit 1
    fi
  fi
fi

# Guarded HERE, not next to the runner invocation: everything below this line
# has side effects the operator pays for — it kills their dev server and eats a
# ~30s cold compile. Aborting after that costs them the server on a run that
# then refuses to start.
guard_host_load "test-e2e" || exit 75

export E2E_LOGIN_TIMEOUT_MS="${E2E_LOGIN_TIMEOUT_MS:-90000}"
WORKERS="${E2E_WORKERS:-1}"
SERVER_WAIT="${E2E_SERVER_WAIT:-150}"

# Dev server or production server. Everything that differs between the two is
# decided HERE, once, rather than tested again at each use site — the readiness
# poll, the teardown message and the restart report all read these.
#
# E2E_PROD is exported because playwright.config.ts reads it: its `webServer`
# block is a FALLBACK for a bare `playwright test`, and a fallback that starts a
# dev server for a production run would answer the readiness check with the
# wrong server entirely.
export E2E_PROD="${E2E_PROD:-0}"
if [ "$E2E_PROD" = "1" ]; then
  SERVER_KIND="production"
  SERVER_STARTER="$DIR/prod-e2e.sh"
  SERVER_LOG=/tmp/jobsync-e2e-prod.log
  # Must match what the build wrote; next.config.mjs reads it at both ends.
  export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-e2e}"
else
  SERVER_KIND="dev"
  SERVER_STARTER="$DIR/dev-e2e.sh"
  SERVER_LOG=/tmp/jobsync-e2e-dev.log
fi
# One port per worktree (scripts/lib-devserver.sh). The main checkout keeps
# 3737; a linked worktree derives its own, so a suite here cannot take down a
# server there. Playwright reads E2E_BASE_URL, NextAuth reads NEXTAUTH_URL, and
# both must agree with the port the server actually binds.
PORT="$(devserver_port)"
export E2E_BASE_URL="http://localhost:${PORT}"

# NextAuth must agree with Playwright's baseURL ("http://localhost:3737"). A
# developer .env legitimately points NEXTAUTH_URL at a LAN or Tailscale address so
# the app is reachable from other machines; NextAuth then redirects sign-out and
# callbacks to that origin, and the smoke test's post-logout assertion waits on a
# navigation to a host Playwright is not on -- or, after a machine move, one that
# no longer resolves at all. E2E must not depend on the operator's remote-access
# choice, so pin it. This is the value CI already uses (ci.yml).
export NEXTAUTH_URL="$E2E_BASE_URL"

# Pass AUTH_SECRET through to the PLAYWRIGHT process.
#
# e2e/global-setup.ts mints the NextAuth session cookie instead of signing in,
# which needs the same secret the server signs with. Next loads `.env` for the
# SERVER; the Playwright process is an ordinary node process and loads nothing,
# so without this the setup falls back to a real sign-in — correct, but it
# spends one of the 5-per-15-minute signins for no reason, and under E2E_PROD=1
# there is no bypass to absorb it.
#
# Read with `sed`, not by sourcing `.env`: that file legitimately contains values
# with spaces and `#`, and sourcing it would also execute anything in it.
if [ -z "${AUTH_SECRET:-}" ] && [ -f .env ]; then
  AUTH_SECRET="$(sed -n 's/^AUTH_SECRET=//p' .env | head -1 |
                 sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
  [ -n "$AUTH_SECRET" ] && export AUTH_SECRET
fi

# Teardown, reachable from EVERY exit rather than only from the bottom.
#
# The stop used to live at the end of the script, which meant it ran only when
# the script fell off the end. This script is `set -uo pipefail` WITHOUT `-e`,
# so nothing else routed control there -- and the `exit 1` on "dev server not
# ready" therefore leaked exactly the server this teardown exists to reclaim.
# That path is not the unlikely one: a readiness timeout means the server is
# ALIVE and still compiling, and a cold compile overruns SERVER_WAIT precisely
# when the host is loaded. The leaked `next dev` then holds the port lock and
# its heap, becomes the top consumer the pre-run guard aborts on, and so blocks
# the next run -- the one that would have replaced it.
#
# Three properties this has to keep, because each was a way to get it wrong:
#   - It must not change the exit status. An EXIT trap that does not itself
#     call `exit` leaves the script's status alone, so nothing here may `exit`.
#   - It must not fire twice. The bottom of the script still calls it directly
#     so the stop is printed BEFORE the contention verdict rather than after
#     it; the latch makes the trap's later call a no-op.
#   - It must not fire for a server that is not ours. `E2E_SERVER_STARTED` is
#     set only on the branch that starts one, so an early exit BEFORE that --
#     a failed guard, a missing browser, a lock we could not take -- runs
#     nothing, and `E2E_REUSE_SERVER`'s borrowed server survives the run.
e2e_teardown() {
  [ "${E2E_TEARDOWN_DONE:-0}" = "1" ] && return 0
  E2E_TEARDOWN_DONE=1
  # The row sampler (E2E_DB_WATCH=1) is ours on every path that started it.
  # Left alone it outlives the run and keeps appending, by path, to a log the
  # next run truncates — which is how a re-created log once carried a stale
  # baseline from an aborted attempt.
  if [ -n "${DB_WATCH_PID:-}" ] && kill -0 "$DB_WATCH_PID" 2>/dev/null; then
    kill "$DB_WATCH_PID" 2>/dev/null; wait "$DB_WATCH_PID" 2>/dev/null
  fi
  [ "${E2E_SERVER_STARTED:-0}" = "1" ] || return 0

  if [ "${E2E_KEEP_SERVER:-0}" = "1" ]; then
    echo "[test-e2e] leaving the ${SERVER_KIND} server on :${PORT} up (E2E_KEEP_SERVER=1)."
    return 0
  fi
  echo "[test-e2e] stopping the ${SERVER_KIND} server this run started on :${PORT} (E2E_KEEP_SERVER=1 keeps it)."
  # devserver_stop, not a kill of our own: it refuses a pid whose /proc/<pid>/cwd
  # is not this worktree, and it walks UP to the supervisor, because `next dev`
  # respawns `next-server` within seconds and killing the listener alone looks
  # like it worked. `pkill -f "next dev"` matches a command line every worktree
  # shares and has taken a sibling's server down.
  devserver_stop "$PORT"
}
# INT/TERM get their own handlers because bash does not run the EXIT trap for an
# untrapped fatal signal: an operator who ^Cs a run that is measuring the machine
# is exactly the case that most needs the server reclaimed. They re-exit with the
# conventional 128+signal so callers still see why the run ended.
trap 'e2e_teardown' EXIT
trap 'e2e_teardown; exit 130' INT
trap 'e2e_teardown; exit 143' TERM

# 1. Start a FRESH env-correct dev server for every run.
#
# This used to reuse whatever answered on :3737, and that reuse was silently
# unsound. Two run-scoped fixtures live in the server PROCESS, not in the
# database, so reuse carries state across runs that the cleanup cannot reach:
#
#   - Module activation. `syncRegistryFromDb` (src/actions/module.actions.ts:476)
#     latches on `dbSynced` and reads ModuleRegistration ONCE per process, so a
#     fresh run database — which holds NO ModuleRegistration rows at all, since
#     neither seed writes one, and therefore lets the manifest defaults reapply —
#     has no effect on a server that already synced. A per-run database fixes
#     the state on disk; it cannot reach state latched in a process.
#     automation-wizard-modules.spec.ts deactivates JSearch and cannot restore it
#     (credential-gated), so on a reused server its own precondition fails on the
#     SECOND run. Measured 2026-09-01: same process, DB already reset, test red at
#     :118 with `Expected: true / Received: false`.
#   - Memory. `next dev` under E2E traffic reached 7.3 GB RSS in 28 minutes and
#     preceded a runner hang; the operator had to kill it twice in one day.
#
# The cost is one cold Turbopack compile per run (~30 s, bounded by
# SERVER_WAIT). That buys a deterministic fixture state, which is worth more than
# the 30 s — a suite whose result depends on how many times it ran before is not
# measuring the tree.
#
# E2E_REUSE_SERVER=1 restores the old behaviour for a quick single-spec loop
# where you know the process state is clean. Do not use it for a full run.
if [ "${E2E_REUSE_SERVER:-0}" = "1" ] &&
   curl -fsS -o /dev/null "http://localhost:${PORT}/signin" 2>/dev/null; then
  echo "[test-e2e] reusing the server already on :${PORT} (E2E_REUSE_SERVER=1)"
  echo "[test-e2e] WARNING: this branch cannot tell a dev server from a production one."
  echo "                   Whatever answers on the port is what the suite measures, so"
  echo "                   E2E_PROD=${E2E_PROD} describes this run's INTENT and not its server."
  echo "[test-e2e] WARNING: module-state fixtures are per-process; a reused server"
  echo "                   can fail automation-wizard-modules on its precondition."
  echo "[test-e2e] WARNING: this run uses prisma/dev.db, NOT a disposable copy."
  echo "                   A reused server holds the DATABASE_URL it was started"
  echo "                   with, so provisioning one here would put the app and"
  echo "                   the test runner on DIFFERENT databases — a failure that"
  echo "                   names neither. Your working data WILL be written to."
else
  # Build first, before anything with side effects.
  #
  # A production run needs a build, and a build is the one step here that can
  # take minutes and fail. Doing it FIRST means a failure costs nothing else:
  # the operator's server is still up, no database has been provisioned, and the
  # error names the build. e2e-prod-build.sh decides whether a build is actually
  # needed, so a loop over one spec pays this only after a source change.
  if [ "$E2E_PROD" = "1" ]; then
    bash "$DIR/e2e-prod-build.sh" || exit 1
  fi

  # Give this run its own database. Everything the suite writes lands in a copy
  # of a seeded template that the next run replaces, so prisma/dev.db is never
  # opened: scripts/e2e-db.sh and ADR-045 say why a disposable copy REPLACED the
  # old between-runs purge rather than improving it. Must happen BEFORE the
  # server starts — the export below reaches the app only through the
  # environment dev-e2e.sh is spawned with, and a running server cannot be
  # re-pointed afterwards; provisioning under one is how a run ends up with the
  # app on one database and its checks on another, a failure that names neither.
  e2e_db_provision_run || exit 1
  E2E_DB_PROVISIONED=1

  # Optional row-level sampler over the run database (E2E_DB_WATCH=1).
  # Started HERE, after provisioning and before the server, so its baseline is
  # THIS run's file: started earlier it baselines the previous run's database
  # and logs the whole provisioning as deletions. What it answers, and why the
  # question cannot be answered after the run, is in scripts/e2e-db-watch.sh.
  # Opt-in because each sample holds a shared lock for a few milliseconds.
  if [ "${E2E_DB_WATCH:-0}" = "1" ]; then
    DB_WATCH_LOG=/tmp/jobsync-e2e-db-watch.log
    bash "$DIR/e2e-db-watch.sh" "$E2E_RUN_DB" "$DB_WATCH_LOG" 0.5 &
    DB_WATCH_PID=$!
  fi

  # Stop the incumbent HERE, not inside the starter.
  #
  # dev-e2e.sh acquires the port lock BEFORE it stops anything, which is right
  # for a direct invocation -- it refuses rather than killing a server someone
  # else is using. But this wrapper's contract is the opposite: it always
  # replaces. Left to the starter, the second consecutive run in one worktree
  # met its own previous server still holding the lock, exited 75 into a
  # backgrounded nohup nobody reads, and the readiness poll below then answered
  # YES against that OLD server -- while e2e_db_provision_run had already
  # pointed the Playwright process at a new database the old server has never
  # opened. Two databases in one run, and nothing says so.
  #
  # devserver_stop only touches servers whose /proc/<pid>/cwd is this worktree,
  # so "always replaces" still means "replaces MINE".
  devserver_stop "$PORT"

  # And confirm the precondition rather than assuming the stop implied it.
  if ! devserver_wait_lock_free "$PORT" 10; then
    echo "[test-e2e] ERROR: port ${PORT} is still locked after stopping our server:" >&2
    echo "[test-e2e]        $(devserver_lock_describe "$PORT")" >&2
    exit 1
  fi

  if [ "$E2E_PROD" = "1" ]; then
    echo "[test-e2e] starting a fresh E2E production server (env.sh, ${NEXT_DIST_DIR}, NO auth bypass) ..."
  else
    echo "[test-e2e] starting a fresh E2E dev server (env.sh + E2E_AUTH_RATE_LIMIT_BYPASS) ..."
  fi
  # Timestamped, so a dev-server event can be placed against the Playwright
  # timeline without summing test durations. The restart described below leaves
  # no trace on the runner's side, so the log is the only place the two can be
  # correlated at all.
  # `set -o pipefail` is repeated INSIDE: a new `bash -c` does not inherit the
  # one at the top of this file, and without it the pipeline reports the
  # while-loop's status instead of the starter's -- which silently killed the
  # rc=75 diagnostic below (measured: 75 became 0).
  #
  # `printf '%(%T)T'` is a bash builtin; `$(date +%T)` forked once per output
  # line, about ten thousand times on a full run.
  #
  # `|| [ -n "$l" ]` keeps the LAST line when the server dies without a trailing
  # newline -- which is exactly the line a crashing server writes.
  nohup bash -c "set -o pipefail; bash '$SERVER_STARTER' 2>&1 | while IFS= read -r l || [ -n \"\$l\" ]; do printf '%(%T)T %s\n' -1 \"\$l\"; done" \
    >"$SERVER_LOG" 2>&1 &
  STARTER_PID=$!
  # Recorded HERE, on the only branch that starts a server, because the teardown
  # at the end of this script may stop OURS and must never stop anyone else's:
  # under E2E_REUSE_SERVER the server predates this run and outlives it.
  E2E_SERVER_STARTED=1

  # Wait for the OLD server to go down before waiting for the new one to come
  # up. dev-e2e.sh pkills and sleeps 1s before exec'ing, so polling for "ready"
  # immediately can observe the dying process and declare success against the
  # very server we are replacing — which would reinstate the stale-process
  # problem this restart exists to remove, invisibly.
  for _ in $(seq 1 20); do
    curl -fsS -o /dev/null "http://localhost:${PORT}/signin" 2>/dev/null || break
    sleep 1
  done

  # A starter that died is not a slow starter. Without this the only symptom is
  # a 150 s wait ending in "dev server not ready", which names the timeout and
  # not the reason -- and if anything else is listening, no symptom at all.
  if ! kill -0 "$STARTER_PID" 2>/dev/null; then
    wait "$STARTER_PID"; STARTER_RC=$?
    echo "[test-e2e] ERROR: the ${SERVER_KIND} server starter exited immediately (rc=$STARTER_RC)." >&2
    [ "$STARTER_RC" = "75" ] && echo "[test-e2e]        rc 75 means the port lock is held: $(devserver_lock_describe "$PORT")" >&2
    tail -20 "$SERVER_LOG" >&2
    exit 1
  fi

  # A production server has nothing to compile — it either binds the port or it
  # does not — so naming a cold compile there would send the reader after a
  # phase that does not exist. The BUDGET is unchanged: an overloaded host can
  # still be slow to start a process, and shrinking the wait would only convert
  # slowness into a different error message.
  if [ "$E2E_PROD" = "1" ]; then
    echo "[test-e2e] waiting up to ${SERVER_WAIT}s for the production server to bind (log: ${SERVER_LOG}) ..."
  else
    echo "[test-e2e] waiting up to ${SERVER_WAIT}s for cold compile (log: ${SERVER_LOG}) ..."
  fi
  ready=0
  for _ in $(seq 1 "$SERVER_WAIT"); do
    if curl -fsS -o /dev/null "http://localhost:${PORT}/signin" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    echo "[test-e2e] ERROR: ${SERVER_KIND} server not ready in ${SERVER_WAIT}s — see ${SERVER_LOG}"
    exit 1
  fi
fi
echo "[test-e2e] ${SERVER_KIND} server ready :${PORT} | workers=${WORKERS} loginTimeout=${E2E_LOGIN_TIMEOUT_MS}ms chromium=${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-playwright-bundled}"

# 2. Run Playwright gently (single worker + low CPU/IO priority), inside a
#    transient cgroup so the runner and its Chromium children cannot take the
#    host with them. The DEV SERVER is not in this scope — dev-e2e.sh opens its
#    own — so a runaway browser cannot starve the app under test, and vice
#    versa. NOT the same ladder as typecheck-safe.sh: there is no system-scope
#    branch here, so on a host without a user session this degrades straight to
#    plain nice/ionice. That is deliberate — a host without transient scopes can
#    still run the suite — but it is two branches, not three.
#
#   E2E_MEM_MAX     cgroup memory cap for runner + browsers  (default 6G)
#   E2E_CPU_QUOTA   cgroup CPUQuota                          (default 400%)
MEM_MAX="${E2E_MEM_MAX:-6G}"
CPU_QUOTA="${E2E_CPU_QUOTA:-400%}"
# The residue gate refuses to judge a swamped run, and it counts the timeouts
# from a JSON report. Nothing produced one: `PLAYWRIGHT_JSON_OUTPUT_NAME` was
# unset on every ordinary invocation, the file was absent, and the absence was
# read as "zero timeouts". The guard added in `1cd54f8d` had therefore never
# fired in a default run and could not — measured 2026-09-04 on a run with 50
# timedOut tests, which the gate went on to judge.
#
# So the wrapper produces the report itself. A caller who overrides `--reporter`
# takes that guarantee away, and the gate then SKIPS rather than assume: absence
# of evidence is not evidence of a healthy run.
#
# `html` is named EXPLICITLY here, and that is not decoration. A CLI `--reporter`
# REPLACES the configured list rather than adding to it —
# `node_modules/playwright/lib/common/config.js:90` resolves it as
# `takeFirst(configCLIOverrides.reporter, resolveReporters(userConfig.reporter, …))`
# — so `--reporter=list,json` silently dropped `playwright.config.ts:25`'s
# `["html", { open: "never" }]` and stopped producing `playwright-report/` on
# every default run. The earlier version of this comment said the wrapper "ran
# with the default `list` reporter", which is what made the replacement look
# free: `list` is Playwright's default, but it is not what this repo configures.
#
# `open: "never"` does NOT survive that move either — it is a config option, and
# a CLI-named html reporter falls back to its own default of opening the report
# on failure, which would block this script waiting on a browser. The env var is
# the only way to say it from here; `html.js:154` reads
# `PLAYWRIGHT_HTML_OPEN || PW_TEST_HTML_REPORT_OPEN`.
export PLAYWRIGHT_HTML_OPEN="${PLAYWRIGHT_HTML_OPEN:-never}"
E2E_REPORT_JSON="${E2E_REPORT_JSON:-$PWD/test-results/.e2e-run-report.json}"
mkdir -p "$(dirname "$E2E_REPORT_JSON")"
rm -f "$E2E_REPORT_JSON"
export PLAYWRIGHT_JSON_OUTPUT_NAME="$E2E_REPORT_JSON"

REPORTER_ARGS=()
case " $* " in
  # Caller owns the reporter; see above. Only `--reporter` is matched: playwright
  # 1.57 has no `-r` alias (`node_modules/playwright/lib/program.js:140` declares
  # `--reporter <reporter>` and nothing shorter), so testing for one could only
  # ever produce a false positive and silently disarm the gate.
  *" --reporter"*) : ;;
  *) REPORTER_ARGS=(--reporter=html,list,json) ;;
esac

RUN=(nice -n 10 ionice -c3 npx playwright test --workers="$WORKERS" \
     "${REPORTER_ARGS[@]}" "$@")

echo "[test-e2e] limits: mem=${MEM_MAX} cpu=${CPU_QUOTA}"
if systemd-run --user --scope -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 \
     -p CPUQuota="$CPU_QUOTA" true 2>/dev/null; then
  systemd-run --user --scope -p Description=jobsync-e2e-run \
    -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUQuota="$CPU_QUOTA" \
    "${RUN[@]}"
else
  echo "[test-e2e] WARNING: no systemd transient scope — nice/ionice only."
  "${RUN[@]}"
fi
RC=$?

# Residue gate: did the run leave state behind that no test owns?
#
# Conditions, each closing a way this could report on something it did not
# measure:
#   - only when WE provisioned the database (E2E_REUSE_SERVER skips provisioning,
#     and the run database is then the PREVIOUS run's file);
#   - only for exit codes 0 and 1, i.e. Playwright ran and reported. This script
#     is `set -uo pipefail` without -e, so a runner killed by the cgroup or the
#     timeout leaves a partial database that would be judged as if it were a
#     finished run.
#
# Exit semantics, stated because two failures can meet here: Playwright's status
# wins when it is non-zero -- it is the more informative failure and the residue
# is likely a consequence of it. A clean run with dirty residue exits 1.
#
#   - and only when the run was not swamped. A test killed by its own timeout
#     dies mid-body and leaves its rows behind, so a contended run reports
#     residue that says nothing about ownership. Measured 2026-09-02: a run with
#     43 timeouts flagged Job +5 and JobStatus +1, both of them tests that never
#     reached their cleanup. Playwright's exit code cannot express this -- it was
#     1, meaning "ran and reported" -- so the count comes from the JSON report
#     when one was produced.
# A MISSING report is not a quiet run. The previous version initialised the
# count to 0 and left it there when the file was absent, which is the one value
# that lets the gate proceed — so the check was strongest exactly when it knew
# least. Three states now, and only one of them judges.
#
# ONE pass over the report, three numbers, TWO readers: the gate below, which
# refuses to JUDGE a swamped run, and the verdict at the end of this script,
# which refuses to let one be READ as a verdict on the code.
#
#   timeouts — `"status": "timedOut"` is written on RESULT objects only.
#   results  — counted by `"workerIndex"`, which the reporter emits exactly once
#              per result (node_modules/playwright/lib/reporters/json.js). NOT by
#              `"status"`: TEST objects carry that same key with outcome values
#              (expected/unexpected/flaky/skipped), so counting it double-counts.
#   duration — stats.duration, the run's wall clock in ms. It is the first
#              `"duration"` AFTER `"stats": {`; every earlier one belongs to a
#              single result. The reporter pretty-prints (indent 2), so one key
#              per line holds.
RESULT_COUNT=0
RUN_MS="unknown"
if [ -f "${PLAYWRIGHT_JSON_OUTPUT_NAME:-}" ]; then
  read -r TIMED_OUT RESULT_COUNT RUN_MS < <(awk '
    /"status": *"timedOut"/   { t++ }
    /"workerIndex":/          { n++ }
    /"stats": *\{/            { in_stats = 1; next }
    in_stats && /"duration":/ { d = $2; sub(/,$/, "", d); in_stats = 0 }
    END { printf "%d %d %s\n", t, n, (d == "" ? "unknown" : d) }
  ' "$PLAYWRIGHT_JSON_OUTPUT_NAME" 2>/dev/null)
else
  TIMED_OUT="unknown"
fi
# A count that is not a count must say so. A truncated or unreadable report
# otherwise leaves this empty, every `-lt`/`-ge` below fails with "integer
# expression expected", and the gate takes a branch whose message names the
# wrong reason.
case "${TIMED_OUT:-}" in ''|*[!0-9]*) TIMED_OUT="unknown" ;; esac

# The SAME argument applies to the report as a whole, and validating only the
# timeout count left the hole half-open. A TRUNCATED report yields a perfectly
# numeric `TIMED_OUT` -- often 0, because the timeouts had not been written yet
# -- beside an empty duration. The count then passes every check below while
# being an undercount of unknown size, and the gate judges a partial database as
# if it were a finished run. Same class as the bug this gate was built to fix:
# missing evidence taking the permissive branch.
#
# The reachable route is NOT a killed runner, which was the first guess and is
# wrong: a cgroup SIGKILL exits 137 and the RC condition below already refuses
# it. It is a reporter error that never reaches the exit code.
# `multiplexer.js:87-93` wraps every `onEnd` in a try/catch that logs and
# swallows, and `:57-58` only assigns `result.status` when the reporter returned
# one -- so a throw leaves Playwright exiting 0 or 1, inside the allowed set.
# `json.js:228-233` does one `JSON.stringify` and one `writeFile`, so an ENOSPC
# or EIO landing mid-write leaves a partial file behind that status.
#
# `RUN_MS` is the sentinel, because `stats` is the LAST top-level key emitted
# (`json.js:64-93`: config, suites, errors, stats — and `JSON.stringify`
# preserves object-literal order), so truncation removes the duration before it
# removes anything the count is read from. "Saw a duration" is therefore
# equivalent to "read a whole report". Should a future Playwright reorder those
# keys the oracle degrades toward a false "truncated" and a SKIP — the safe
# direction.
REPORT_COMPLETE=1
case "${RUN_MS:-}" in ''|*[!0-9.]*|0|0.0) REPORT_COMPLETE=0 ;; esac

#
# The branch ORDER below is part of the correctness, not cosmetics. Each SKIP
# names a reason, and a reason that is wrong is worse than a generic one: it
# sends the reader after the wrong thing. The previous order tested "no JSON
# report" before the exit code, so a runner killed by the cgroup -- which writes
# no report at all, since `json.js` writes only in `onEnd` -- was told a custom
# `--reporter` had suppressed it. That is precisely the case the exit-code
# condition exists for. Most specific cause first: the run did not finish, then
# the database is not ours, then the evidence is unusable, then the run was
# swamped.
if [ "${E2E_DB_PROVISIONED:-0}" = "1" ] && { [ "$RC" = "0" ] || [ "$RC" = "1" ]; } &&
   [ "$TIMED_OUT" != "unknown" ] && [ "$REPORT_COMPLETE" = "1" ] && [ "$TIMED_OUT" -lt 3 ]; then
  if ! bash "$DIR/check-e2e-residue.sh"; then
    [ "$RC" = "0" ] && RC=1
  fi
elif [ "$RC" != "0" ] && [ "$RC" != "1" ]; then
  echo "[residue] SKIPPED — playwright exited $RC, so it did not run and report; a run that did not finish leaves a database nobody should judge."
elif [ "${E2E_DB_PROVISIONED:-0}" != "1" ]; then
  echo "[residue] SKIPPED — this run did not provision a database (E2E_REUSE_SERVER)."
elif [ "$TIMED_OUT" = "unknown" ]; then
  echo "[residue] SKIPPED — no JSON report at ${PLAYWRIGHT_JSON_OUTPUT_NAME:-<unset>}, so the timeout count is unknown and a swamped run cannot be told from a quiet one. A custom --reporter suppresses it."
elif [ "$TIMED_OUT" -ge 3 ]; then
  echo "[residue] SKIPPED — ${TIMED_OUT} tests timed out; a test killed mid-body leaves rows that say nothing about ownership."
elif [ "$REPORT_COMPLETE" != "1" ]; then
  # LAST, deliberately, and after the ≥3 branch rather than before it:
  # truncation can only UNDERCOUNT, so "at least 3 timed out" stays true of a
  # truncated report and is the more actionable reason to skip. This branch is
  # for the genuinely dangerous shape the other four let through — provisioned,
  # exit 0 or 1, a report present and its count below the threshold, and no way
  # to know how much of the run that count actually covers.
  echo "[residue] SKIPPED — the JSON report at ${PLAYWRIGHT_JSON_OUTPUT_NAME:-<unset>} has no run duration, so it was truncated before the reporter finished. Its ${TIMED_OUT} timeouts are a lower bound of unknown slack, not a clean bill."
fi

# Stop the server this run started.
#
# Since 47369e15 every run starts its OWN, so the process still resident when the
# suite ends is ours and nothing else's — and on 2026-09-04 that one stayed up
# for 13 h 50 m holding 5.6 GB after its run had finished. Nothing needed it: the
# next run would have replaced it anyway, and until then it was the top consumer
# the pre-run guard aborts on, so it also blocked the run that would have
# reclaimed it.
#
# Called explicitly HERE, though an EXIT trap would reach it anyway, so the stop
# is reported before the contention verdict rather than after it. The function
# latches, so the trap's later call is a no-op. Its reasoning, and why it refuses
# a server we did not start, is at its definition above.
e2e_teardown

# The run database is kept by default: a red run leaves its data inspectable,
# and unlinking the file under a still-running dev server would leave the
# operator with a server bound to a deleted inode. The next run replaces it.
#
# Discarded AFTER the stop above, for exactly the reason that sentence gives:
# while this ran first, the one path that discards was the one path that unlinked
# the file under a live server — the case the comment was written to rule out.
if [ "${E2E_KEEP_RUN_DB:-1}" = "0" ] && [ "${E2E_DB_PROVISIONED:-0}" = "1" ]; then
  e2e_db_discard_run
fi

# Contention verdict: say when the run measured the machine.
#
# On 2026-09-04 a full run reported "71 failed" and nothing said that 50 of those
# results were timedOut, that the run had taken 13.1 hours, or that the host was
# loaded from outside this container. The list was read as a verdict on the code.
# It was a verdict on the machine, and the reading cost more than the run did.
# The residue gate above already refuses to judge such a run; this makes the TEST
# RESULT say the same thing, in the place the operator is told to read.
#
# It reports, it does not decide: RC is Playwright's and stays Playwright's, so
# the `[test-e2e] EXIT=<rc>` contract is unchanged. Silent when no report was
# produced — absence of evidence is handled by the gate's SKIP above, and a
# second guess here would be worse than none.
#
# The count ALONE must not trigger it, and the first version's `>= 3` did. This
# banner tells the operator to disbelieve the failures above it, so a false
# positive destroys real evidence — which is the opposite failure from the
# residue gate's, where the same threshold is safe because its action is merely
# to decline to judge. Two genuine, uncontended reports from this repo sit at
# ONE timeout in 23.7 min and TWO in 40.2 min, both over 112 results. Three is
# therefore one step above the observed noise floor, and three real hangs from a
# single broken shared helper would have been waved off as "not findings".
#
# So the shape decides, not the count: a contended run is distinguished by the
# SHARE of results that timed out, or by how long each result took. The
# separation is not marginal — the uncontended runs sit at 0.9%/1.8% and
# 12.7 s/21.5 s per result, the 13.1-hour run at 45% and 421 s. Thresholds of 5%
# and 120 s sit clear of both, and `mean` is skipped when the report carried no
# usable duration rather than guessed at.
CONTENDED=0
if [ "$TIMED_OUT" != "unknown" ] && [ "$TIMED_OUT" -ge 3 ]; then
  CONTENDED="$(awk -v t="$TIMED_OUT" -v n="${RESULT_COUNT:-0}" -v ms="${RUN_MS:-unknown}" 'BEGIN{
      share = (n + 0 > 0) ? t / n : 0
      mean  = (ms ~ /^[0-9.]+$/ && n + 0 > 0) ? ms / n : 0
      print (share >= 0.05 || mean >= 120000) ? 1 : 0
    }')"
fi

if [ "$CONTENDED" = "1" ]; then
  RUN_WALL="$(awk -v ms="${RUN_MS:-unknown}" 'BEGIN{
      if (ms !~ /^[0-9.]+$/ || ms + 0 <= 0) { print "unknown"; exit }
      s = ms / 1000
      if (s >= 3600)     printf "%.1f h", s / 3600
      else if (s >= 60)  printf "%.1f min", s / 60
      else               printf "%.0f s", s
    }')"
  TOTAL_DESC="$RESULT_COUNT"
  case "${RESULT_COUNT:-0}" in ''|0|*[!0-9]*) TOTAL_DESC="an unknown number of" ;; esac

  echo
  echo "[test-e2e] ============= CONTENDED RUN — READ BEFORE THE FAILURES ============="
  echo "[test-e2e] ${TIMED_OUT} of ${TOTAL_DESC} results timed out; wall clock ${RUN_WALL}."
  echo "[test-e2e] A run this shape measures the MACHINE, not the code: a test killed by"
  echo "           its own timeout dies mid-body and proves nothing about the tree. The"
  echo "           failures above are not findings — do not file them, and do not 'fix'"
  echo "           them as test drift."
  echo "[test-e2e] The pre-run guard can be quiet while this happens. It samples THIS"
  echo "           container's cgroup cpu.stat, so load in other containers on the same"
  echo "           host is invisible to it, and /proc/loadavg cannot stand in because it"
  echo "           is not namespaced here. See scripts/lib-runtime-guard.sh."
  echo "[test-e2e] Re-run on an idle host before believing anything above."
  echo "[test-e2e] ===================================================================="
elif [ "$TIMED_OUT" != "unknown" ] && [ "$TIMED_OUT" -ge 3 ]; then
  # Timeouts, but not the shape of a contended run. Say so WITHOUT telling the
  # operator to discard anything: the residue gate above still declines to judge
  # at this count, and that asymmetry is deliberate — declining to judge costs a
  # check, disbelieving costs a finding.
  echo
  echo "[test-e2e] ${TIMED_OUT} tests timed out, but this run does not have the shape of a"
  echo "           contended one (${TIMED_OUT} of ${RESULT_COUNT} results; see the durations above)."
  echo "[test-e2e] Treat them as findings until something shows otherwise. The residue gate"
  echo "           still skipped, because a test killed mid-body leaves rows it cannot judge."
fi

# Dev-server restarts: the failure mode that leaves no evidence on this side.
#
# `next dev` runs its own watchdog after EVERY request
# (node_modules/next/dist/server/lib/start-server.js:234) and calls
# `process.exit(77)` the moment the used heap passes 80% of the cap. The request
# that tripped it has already answered; every OTHER request in flight dies with
# no response, no error and no end handler. The parent respawns on the same port,
# so the suite continues and the only symptom is one test failing on an outcome
# that never happened — no audit line, no error path, nothing decided.
#
# `scripts/dev-e2e.sh` caps the heap at 3072 MB, so the threshold is ~2.62 GB and
# one server lifetime serves roughly 3,100 requests against a full run's ~6,000.
# Expect one restart per run until that budget changes.
#
# This block exists because the failure has now been misdiagnosed twice — once as
# a console-oracle defect and once as a reference-cleanup defect — each costing
# hours and reaching the wrong file. It reports, it does not decide: RC stays
# Playwright's.
# Only for a run that started its OWN server: the E2E_REUSE_SERVER branch never
# truncates this log, so the grep would count a PREVIOUS run's restarts and
# report them as this one's.
#
# Skipped entirely for a production run, and not because it would find nothing:
# the watchdog is inside `if (isDev)` at start-server.js:233, so under
# `next start` it does not exist. A block that reported "0 restarts" there would
# imply the count was measured against a mechanism that was running. It was not.
if [ "$E2E_PROD" != "1" ] && [ "${E2E_SERVER_STARTED:-0}" = "1" ] && [ -f "$SERVER_LOG" ]; then
  # `|| true`, not `|| echo 0`: `grep -c` PRINTS 0 and EXITS 1 when nothing
  # matches, so the fallback appended a second zero and the test below failed
  # with "integer expected" -- on stderr, immediately above the EXIT= line.
  RESTARTS="$(grep -c "approaching the used memory threshold" "$SERVER_LOG" 2>/dev/null || true)"
  case "${RESTARTS:-}" in ''|*[!0-9]*) RESTARTS=0 ;; esac
  if [ "${RESTARTS:-0}" -gt 0 ]; then
    echo
    echo "[test-e2e] ${RESTARTS} dev-server restart(s) during this run — Next's own memory watchdog."
    echo "[test-e2e] Any server action in flight at those moments was ABANDONED: no response, no"
    echo "           error, no audit entry. A test that failed on 'the row is still there' may be"
    echo "           reporting a request nobody answered rather than one the server refused."
    echo "[test-e2e] Timestamps: grep -n 'approaching the used memory threshold' ${SERVER_LOG}"
    echo "[test-e2e] Cause and remedies: docs/e2e-dev-server-restart-analysis.md"
    echo "[test-e2e] The remedy that reaches the cause is E2E_PROD=1: a production server"
    echo "           loads no development Flight bundle and has no watchdog at all."
    # Place each restart against the test that was running, because the runner
    # side records nothing about it and this signature has been misdiagnosed
    # twice. Measured 2026-09-07 over five valid full dev runs: every restart
    # fell inside job-detail-panels.spec.ts:440 (it fires after ~1,620-1,650
    # logged requests, and the suite order is fixed), which failed in four of
    # them. Needs the JSON report, which a custom --reporter removes.
    if [ -f "${E2E_REPORT_JSON:-}" ]; then
      bash "$DIR/e2e-attribute-restarts.sh" "$E2E_REPORT_JSON" "$SERVER_LOG"
    fi
  fi
fi

# Keep this run's server log with this run's report.
#
# `$SERVER_LOG` is truncated by the NEXT run, so a restart recorded in run N
# cannot be placed against run N's timeline once run N+1 has started — and the
# banner above tells the operator to grep exactly that file. Measured 2026-09-07:
# a dev run failed `job-detail-panels.spec.ts:440` with one watchdog restart in
# the same run, and by the time the failure was read the log described the run
# after it. The correlation the banner exists to enable was unavailable.
#
# Copied rather than moved: the live path is what the banner names and what an
# operator watching a run already has open.
if [ "${E2E_SERVER_STARTED:-0}" = "1" ] && [ -f "$SERVER_LOG" ]; then
  SERVER_LOG_KEPT="$(dirname "$E2E_REPORT_JSON")/.e2e-server-${SERVER_KIND}.log"
  if cp "$SERVER_LOG" "$SERVER_LOG_KEPT" 2>/dev/null; then
    echo "[test-e2e] server log for THIS run kept at ${SERVER_LOG_KEPT} (${SERVER_LOG} is truncated by the next run)."
  fi
fi
# Same for the row sampler's log, for the same reason. The sampler was stopped
# by e2e_teardown above, so the copy is complete.
if [ -n "${DB_WATCH_LOG:-}" ] && [ -f "$DB_WATCH_LOG" ]; then
  DB_WATCH_KEPT="$(dirname "$E2E_REPORT_JSON")/.e2e-db-watch.log"
  if cp "$DB_WATCH_LOG" "$DB_WATCH_KEPT" 2>/dev/null; then
    echo "[test-e2e] row sampler log for THIS run kept at ${DB_WATCH_KEPT}."
  fi
fi

report_exit "test-e2e" "$RC"
exit "$RC"
