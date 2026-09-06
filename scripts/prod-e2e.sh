#!/usr/bin/env bash
# Start a PRODUCTION Next.js server for E2E runs (`next start`).
#
# The counterpart to scripts/dev-e2e.sh, and it exists for one measured reason:
# `next dev` loads React's development Flight bundle, which installs a
# process-wide async_hooks hook and retains ~2,749 objects per request with no
# runtime opt-out (E2E-B42). Next's own watchdog then restarts the server
# mid-run — `start-server.js:233-243`, and note the enclosing `if (isDev)`:
# **the watchdog does not exist in a production server**. The restart that
# abandoned requests with no response, no error and no audit line is therefore
# gone here, not merely less likely.
#
# Deliberate differences from dev-e2e.sh, each of which is a property of the
# mode and not an oversight:
#
#   - NO E2E_AUTH_RATE_LIMIT_BYPASS. The bypass is double-gated on
#     `NODE_ENV !== "production"` (src/lib/auth/auth-rate-limit.ts:60-62) and is
#     inert here BY DESIGN; CLAUDE.md forbids setting it in production at all.
#     This script actively unsets it rather than passing it on, so nothing
#     downstream can read its presence as meaning anything. The suite fits
#     inside the real limit — 5 signins per 15 min per IP against 2 per run —
#     see e2e/global-setup.ts, which mints its session cookie instead of
#     signing in.
#   - A build is required BEFORE this runs; there is no compile-on-request.
#     scripts/e2e-prod-build.sh produces it, and this script refuses to start
#     without one rather than letting `next start` fail with a message that
#     names the server.
#   - Smaller budgets. A production server has no Turbopack, no dev Flight
#     bundle and no watchdog, so the dev defaults (3072 MB heap, 8 G cgroup)
#     are oversized for it. They stay CAPPED though — 1d819221 and c742d811
#     bound the dev server after it took the host down twice, and a production
#     server needs the same bound, merely a thriftier one.
#
# Tunables (env):
#   E2E_PROD_NODE_HEAP   node --max-old-space-size, MB  (default 2048)
#   E2E_PROD_MEM_MAX     cgroup memory backstop         (default 4G)
#   E2E_PROD_CPU_QUOTA   cgroup CPUQuota                (default 300%, "" = none)
#   NEXT_DIST_DIR        build directory                (default .next-e2e)
source "$(dirname "$0")/env.sh"
source "$(dirname "$0")/lib-devserver.sh"

# Say it, rather than relying on the double gate alone. An operator who exported
# this for a dev run and then started a production one would otherwise be left
# believing the bypass is active, and would misread the first 429 as a bug.
if [ -n "${E2E_AUTH_RATE_LIMIT_BYPASS:-}" ]; then
  echo "[prod-e2e] E2E_AUTH_RATE_LIMIT_BYPASS was set in this environment — unsetting it."
  echo "[prod-e2e] It is inert under NODE_ENV=production by design and must never be set there."
  unset E2E_AUTH_RATE_LIMIT_BYPASS
fi

export NODE_ENV=production
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-e2e}"

# Same port and same lock as the dev server, on purpose: one server per worktree
# whichever mode it is in. Two modes with two ports would let a stale dev server
# answer a production run's requests, and the failure would name neither.
PORT="$(devserver_port)"
export PORT
export E2E_BASE_URL="http://localhost:${PORT}"

if [ ! -f "${NEXT_DIST_DIR}/BUILD_ID" ]; then
  echo "[prod-e2e] ERROR: no production build at ${NEXT_DIST_DIR}/ (BUILD_ID absent)." >&2
  echo "[prod-e2e]        Build it first:  bash scripts/e2e-prod-build.sh" >&2
  echo "[prod-e2e]        scripts/test-e2e.sh does that for you under E2E_PROD=1." >&2
  exit 1
fi

# Advisory lock held for the SERVER's lifetime, exactly as in dev-e2e.sh: the
# descriptor survives the exec below, so it frees when the server dies, killed
# or not, with no cleanup path to forget.
if ! devserver_lock_acquire "$PORT"; then
  echo "[prod-e2e] port ${PORT} is already claimed by: $(devserver_lock_describe "$PORT")" >&2
  echo "[prod-e2e] refusing to start a second server for the same worktree." >&2
  exit 75
fi

# Pin the auth origin to the one Playwright drives. Same reasoning as
# dev-e2e.sh: `.env` on this machine carries a Tailscale NEXTAUTH_URL so the app
# is reachable from other devices, and the sign-out redirect is computed on the
# SERVER — setting it in the Playwright process would not reach it.
export NEXTAUTH_URL="$E2E_BASE_URL"

PROD_NODE_HEAP="${E2E_PROD_NODE_HEAP:-2048}"
PROD_MEM_MAX="${E2E_PROD_MEM_MAX:-4G}"
E2E_PROD_CPU_QUOTA="${E2E_PROD_CPU_QUOTA-300%}"
export NODE_OPTIONS="--max-old-space-size=${PROD_NODE_HEAP} ${NODE_OPTIONS:-}"

SCOPE_ARGS=(-p Description=jobsync-prod-e2e -p MemoryMax="$PROD_MEM_MAX" -p MemorySwapMax=0)
[ -n "${E2E_PROD_CPU_QUOTA:-}" ] && SCOPE_ARGS+=(-p CPUQuota="$E2E_PROD_CPU_QUOTA")

# Scoped to this worktree's port and cwd (devserver_is_ours recognises
# `next start` since this script existed — without that it refuses, prints
# "NOT ours", and the start below then fails on a port already in use).
devserver_stop "$PORT"

echo "[prod-e2e] port=${PORT} dist=${NEXT_DIST_DIR} heap=${PROD_NODE_HEAP}MB mem-backstop=${PROD_MEM_MAX} cpu=${E2E_PROD_CPU_QUOTA:-uncapped}"
echo "[prod-e2e] NODE_ENV=production — no dev Flight bundle, no memory watchdog, no auth bypass."

# `bunx next start`, not `bun run start`: package.json's start script has no
# `-p`, and `next start` defaults to 3000 when neither flag nor PORT says
# otherwise. Passing the port explicitly keeps this independent of whether a
# future package.json edit still honours the variable.
PROD_CMD=(bunx next start -p "$PORT")

# As in dev-e2e.sh, a missing systemd scope must NOT abort: without a server
# there is no E2E run at all. Probe with the SAME properties the real call uses,
# or the probe passes where the real invocation fails instantly.
if systemd-run --user --scope "${SCOPE_ARGS[@]}" true 2>/dev/null; then
  echo "[prod-e2e] confined via systemd --user scope"
  exec systemd-run --user --scope "${SCOPE_ARGS[@]}" "${PROD_CMD[@]}"
elif systemd-run --scope "${SCOPE_ARGS[@]}" true 2>/dev/null; then
  echo "[prod-e2e] confined via systemd system scope"
  exec systemd-run --scope "${SCOPE_ARGS[@]}" "${PROD_CMD[@]}"
else
  echo "[prod-e2e] WARNING: no systemd transient scope — heap-capped but UNCONFINED."
  exec "${PROD_CMD[@]}"
fi
