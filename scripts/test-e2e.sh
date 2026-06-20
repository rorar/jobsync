#!/usr/bin/env bash
# Resource-aware E2E runner for low-RAM hosts (8 GB no-swap VM).
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
#   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH  chromium binary   (default NixOS path)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

source "$DIR/env.sh"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-/run/current-system/sw/bin/chromium}"
export E2E_LOGIN_TIMEOUT_MS="${E2E_LOGIN_TIMEOUT_MS:-90000}"
WORKERS="${E2E_WORKERS:-1}"
SERVER_WAIT="${E2E_SERVER_WAIT:-150}"
PORT=3737

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
echo "[test-e2e] dev server ready :${PORT} | workers=${WORKERS} loginTimeout=${E2E_LOGIN_TIMEOUT_MS}ms chromium=${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}"

# 2. Run Playwright gently (single worker + low CPU/IO priority on the 8 GB VM).
exec nice -n 10 ionice -c3 npx playwright test --workers="$WORKERS" "$@"
