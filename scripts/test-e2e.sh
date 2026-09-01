#!/usr/bin/env bash
# Resource-aware E2E runner. Single worker by default whatever the host reports.
#
# Unlike the production build (which OOM-hangs the host -> see build-safe.sh),
# the E2E suite is not memory-bound; it was blocked by two VM-specific issues,
# both fixed here:
#   1. Prisma NixOS engine + auth bypass: Playwright's webServer ("bun run dev")
#      sources NEITHER env.sh NOR E2E_AUTH_RATE_LIMIT_BYPASS. So we pre-start a
#      correct dev server (scripts/dev-e2e.sh) and let Playwright reuse it
#      (reuseExistingServer:true). The server is NEVER stopped (e2e/CONVENTIONS.md).
#   2. Cold-compile signin flake: the first AUTHENTICATED /dashboard load (in
#      global-setup) triggers a Turbopack compile that can exceed the default
#      30 s login timeout on a slow VM. We raise it via E2E_LOGIN_TIMEOUT_MS,
#      which e2e/global-setup.ts now honours.
#
# No memory cgroup here: the DEV server (incremental Turbopack) is far lighter
# than a production build and runs safely on this VM daily; single-worker +
# nice is enough. Add a cgroup only if a future run proves it necessary.
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

export E2E_LOGIN_TIMEOUT_MS="${E2E_LOGIN_TIMEOUT_MS:-90000}"
WORKERS="${E2E_WORKERS:-1}"
SERVER_WAIT="${E2E_SERVER_WAIT:-150}"
PORT=3737

# NextAuth must agree with Playwright's baseURL ("http://localhost:3737"). A
# developer .env legitimately points NEXTAUTH_URL at a LAN or Tailscale address so
# the app is reachable from other machines; NextAuth then redirects sign-out and
# callbacks to that origin, and the smoke test's post-logout assertion waits on a
# navigation to a host Playwright is not on -- or, after a machine move, one that
# no longer resolves at all. E2E must not depend on the operator's remote-access
# choice, so pin it. This is the value CI already uses (ci.yml).
export NEXTAUTH_URL="http://localhost:${PORT}"

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
else
  echo "[test-e2e] starting a fresh E2E dev server (env.sh + E2E_AUTH_RATE_LIMIT_BYPASS) ..."
  nohup bash "$DIR/dev-e2e.sh" >/tmp/jobsync-e2e-dev.log 2>&1 &

  # Wait for the OLD server to go down before waiting for the new one to come
  # up. dev-e2e.sh pkills and sleeps 1s before exec'ing, so polling for "ready"
  # immediately can observe the dying process and declare success against the
  # very server we are replacing — which would reinstate the stale-process
  # problem this restart exists to remove, invisibly.
  for _ in $(seq 1 20); do
    curl -fsS -o /dev/null "http://localhost:${PORT}/signin" 2>/dev/null || break
    sleep 1
  done

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
#    versa. Same fallback ladder as typecheck-safe.sh; unlike that script this
#    one degrades to plain nice/ionice rather than aborting, because a host
#    without transient scopes can still run the suite.
#
#   E2E_MEM_MAX     cgroup memory cap for runner + browsers  (default 6G)
#   E2E_CPU_QUOTA   cgroup CPUQuota                          (default 400%)
MEM_MAX="${E2E_MEM_MAX:-6G}"
CPU_QUOTA="${E2E_CPU_QUOTA:-400%}"
RUN=(nice -n 10 ionice -c3 npx playwright test --workers="$WORKERS" "$@")

echo "[test-e2e] limits: mem=${MEM_MAX} cpu=${CPU_QUOTA}"
if systemd-run --user --scope -p MemoryMax="$MEM_MAX" true 2>/dev/null; then
  exec systemd-run --user --scope -p Description=jobsync-e2e-run \
    -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUQuota="$CPU_QUOTA" \
    "${RUN[@]}"
else
  echo "[test-e2e] WARNING: no systemd transient scope — nice/ionice only."
  exec "${RUN[@]}"
fi
