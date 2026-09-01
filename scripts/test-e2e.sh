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

# 1. Ensure an env-correct, warm dev server (start if down; never stop it).
if curl -fsS -o /dev/null "http://localhost:${PORT}/signin" 2>/dev/null; then
  echo "[test-e2e] reusing dev server already on :${PORT}"
else
  echo "[test-e2e] starting E2E dev server (env.sh + E2E_AUTH_RATE_LIMIT_BYPASS) ..."
  nohup bash "$DIR/dev-e2e.sh" >/tmp/jobsync-e2e-dev.log 2>&1 &
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
