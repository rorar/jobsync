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
#   E2E_WORKERS            playwright workers              (default 1)
#   E2E_LOGIN_TIMEOUT_MS   global-setup login wait, ms     (default 90000)
#   E2E_SERVER_WAIT        seconds to await cold server    (default 150)
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

# 1. Start a FRESH env-correct dev server for every run.
#
# This used to reuse whatever answered on :3737, and that reuse was silently
# unsound. Two run-scoped fixtures live in the server PROCESS, not in the
# database, so reuse carries state across runs that the cleanup cannot reach:
#
#   - Module activation. `syncRegistryFromDb` (src/actions/module.actions.ts:437)
#     latches on `dbSynced` and reads ModuleRegistration ONCE per process, so
#     cleanup-stale-data.ts step 0b — which deletes every row so the manifest
#     default reapplies — has no effect on a server that already synced.
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
  echo "[test-e2e] reusing dev server already on :${PORT} (E2E_REUSE_SERVER=1)"
  echo "[test-e2e] WARNING: module-state fixtures are per-process; a reused server"
  echo "                   can fail automation-wizard-modules on its precondition."
  echo "[test-e2e] WARNING: this run uses prisma/dev.db, NOT a disposable copy."
  echo "                   A reused server holds the DATABASE_URL it was started"
  echo "                   with, so provisioning one here would put the app and"
  echo "                   the test runner on DIFFERENT databases — a failure that"
  echo "                   names neither. Your working data WILL be written to."
else
  # Give this run its own database. Everything the suite writes lands in a copy
  # of a seeded template that dies with the next run, so prisma/dev.db is never
  # opened: see scripts/e2e-db.sh for why that replaces cleanup-stale-data.ts
  # rather than improving it. Must happen BEFORE the server starts — the export
  # reaches the app only through dev-e2e.sh's environment, and the Playwright
  # process needs it too (e2e/cleanup-stale-data.ts opens its own PrismaClient).
  e2e_db_provision_run || exit 1
  E2E_DB_PROVISIONED=1

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

  echo "[test-e2e] starting a fresh E2E dev server (env.sh + E2E_AUTH_RATE_LIMIT_BYPASS) ..."
  nohup bash "$DIR/dev-e2e.sh" >/tmp/jobsync-e2e-dev.log 2>&1 &
  STARTER_PID=$!

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
    echo "[test-e2e] ERROR: the dev server starter exited immediately (rc=$STARTER_RC)." >&2
    [ "$STARTER_RC" = "75" ] && echo "[test-e2e]        rc 75 means the port lock is held: $(devserver_lock_describe "$PORT")" >&2
    tail -20 /tmp/jobsync-e2e-dev.log >&2
    exit 1
  fi

  echo "[test-e2e] waiting up to ${SERVER_WAIT}s for cold compile (log: /tmp/jobsync-e2e-dev.log) ..."
  ready=0
  for _ in $(seq 1 "$SERVER_WAIT"); do
    if curl -fsS -o /dev/null "http://localhost:${PORT}/signin" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    echo "[test-e2e] ERROR: dev server not ready in ${SERVER_WAIT}s — see /tmp/jobsync-e2e-dev.log"
    exit 1
  fi
fi
echo "[test-e2e] dev server ready :${PORT} | workers=${WORKERS} loginTimeout=${E2E_LOGIN_TIMEOUT_MS}ms chromium=${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-playwright-bundled}"

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
RUN=(nice -n 10 ionice -c3 npx playwright test --workers="$WORKERS" "$@")

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

# The run database is kept by default: a red run leaves its data inspectable,
# and unlinking the file under a still-running dev server would leave the
# operator with a server bound to a deleted inode. The next run replaces it.
if [ "${E2E_KEEP_RUN_DB:-1}" = "0" ] && [ "${E2E_DB_PROVISIONED:-0}" = "1" ]; then
  e2e_db_discard_run
fi

report_exit "test-e2e" "$RC"
exit "$RC"
