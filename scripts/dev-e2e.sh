#!/usr/bin/env bash
# Start the Next.js dev server for E2E runs.
#
# Identical to dev.sh, but enables the auth rate-limit bypass so the Playwright
# suite (which re-logs-in on every run) does not trip the 5-per-15-min signin
# limit. The bypass is double-gated and prod-inert — see
# src/lib/auth/auth-rate-limit.ts. NEVER use this script for a production server.
source "$(dirname "$0")/env.sh"
export E2E_AUTH_RATE_LIMIT_BYPASS=1

# Pin the auth origin to the one Playwright drives.
#
# `.env` on this machine carries the Tailscale address
# (NEXTAUTH_URL=http://100.76.113.93:3737) so the app is reachable from other
# devices. Header.tsx's sign-out server action builds its redirect from
# AUTH_URL ?? NEXTAUTH_URL, so with the .env value the logout in
# e2e/smoke/signin.spec.ts redirects to a DIFFERENT ORIGIN than the one the
# test is on — the session cookie does not travel, and the test sees whatever
# that other origin renders instead of "Welcome back".
#
# A real process env var wins over a .env entry in Next.js, so exporting here
# is enough. Setting it in the Playwright process (as the run command does) is
# NOT — the redirect is computed on the SERVER.
export NEXTAUTH_URL="${E2E_BASE_URL:-http://localhost:3737}"

# Bound the dev server's memory.
#
# An unconfined `next dev` under E2E traffic reaches ~7.7 GB RSS in about an
# hour on this host, and that is what preceded the runner hang recorded in
# E2E-FIX-NOTES.md (finding I): both node processes at 0 % CPU, no timeout
# firing, killed by hand.
#
# The heap cap is the primary lever, not the cgroup. `next dev` is a Node
# process, so --max-old-space-size makes V8 collect harder instead of growing;
# a cgroup limit alone would leave the heap just as large and make the kernel
# stall on reclaim instead — this host has no swap, so throttling anonymous
# memory buys nothing. The cgroup is only a backstop for Turbopack's native
# (non-V8) allocations.
#
# CPU IS capped, as of 2026-09-01, and that is a deliberate trade against
# measurement fidelity. This process is the application under test, so
# throttling it does distort the timings the suite measures — the earlier
# version of this comment said that was reason enough to leave it uncapped.
# Practice disagreed: on 2026-09-01 the operator had to kill this server twice
# because the host became unusable, and a cold Turbopack compile at 174 % CPU
# was the largest single contributor to load averages above 40. A suite that
# cannot finish measures nothing at all, so stability wins.
#
# 300 % of 5 cores leaves two for the Playwright worker and the system. The
# observed cold-compile peak was 174 %, so the cap does not bind in normal
# operation — it only stops a runaway. Raise it if cold compiles start hitting
# the 150 s readiness wait in test-e2e.sh; set it to "" to restore the old
# uncapped behaviour when you specifically need undistorted timings.
#
# Tunables (env vars):
#   E2E_DEV_NODE_HEAP   node --max-old-space-size, MB  (default 3072)
#   E2E_DEV_MEM_MAX     cgroup memory backstop         (default 8G)
#   E2E_DEV_CPU_QUOTA   cgroup CPUQuota                (default 300%, "" = none)
DEV_NODE_HEAP="${E2E_DEV_NODE_HEAP:-3072}"
DEV_MEM_MAX="${E2E_DEV_MEM_MAX:-8G}"
E2E_DEV_CPU_QUOTA="${E2E_DEV_CPU_QUOTA-300%}"
export NODE_OPTIONS="--max-old-space-size=${DEV_NODE_HEAP} ${NODE_OPTIONS:-}"

SCOPE_ARGS=(-p Description=jobsync-dev-e2e -p MemoryMax="$DEV_MEM_MAX" -p MemorySwapMax=0)
[ -n "${E2E_DEV_CPU_QUOTA:-}" ] && SCOPE_ARGS+=(-p CPUQuota="$E2E_DEV_CPU_QUOTA")

pkill -f "next dev" 2>/dev/null
sleep 1

echo "[dev-e2e] heap=${DEV_NODE_HEAP}MB mem-backstop=${DEV_MEM_MAX} cpu=${E2E_DEV_CPU_QUOTA:-uncapped}"

# Unlike typecheck-safe.sh, a missing systemd scope must NOT abort: without a
# dev server there is no E2E run at all. Fall back to the heap cap alone.
if systemd-run --user --scope -p MemoryMax="$DEV_MEM_MAX" true 2>/dev/null; then
  echo "[dev-e2e] confined via systemd --user scope"
  exec systemd-run --user --scope "${SCOPE_ARGS[@]}" bun run dev
elif systemd-run --scope -p MemoryMax="$DEV_MEM_MAX" true 2>/dev/null; then
  echo "[dev-e2e] confined via systemd system scope"
  exec systemd-run --scope "${SCOPE_ARGS[@]}" bun run dev
else
  echo "[dev-e2e] WARNING: no systemd transient scope — heap-capped but UNCONFINED."
  exec bun run dev
fi
