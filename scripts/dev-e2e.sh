#!/usr/bin/env bash
# Start the Next.js dev server for E2E runs.
#
# Identical to dev.sh, but enables the auth rate-limit bypass so the Playwright
# suite (which re-logs-in on every run) does not trip the 5-per-15-min signin
# limit. The bypass is double-gated and prod-inert — see
# src/lib/auth/auth-rate-limit.ts. NEVER use this script for a production server.
source "$(dirname "$0")/env.sh"
source "$(dirname "$0")/lib-devserver.sh"
export E2E_AUTH_RATE_LIMIT_BYPASS=1

# One port per worktree. The main checkout keeps 3737; a linked worktree gets a
# port derived from its path, so two checkouts can run suites simultaneously
# instead of taking turns killing each other's server.
PORT="$(devserver_port)"
export PORT                       # package.json's dev script reads it
export E2E_BASE_URL="http://localhost:${PORT}"

# Advisory lock, held for the SERVER's lifetime rather than this script's.
# The descriptor survives the exec below, so the lock is released exactly when
# the server dies -- including when it is killed -- with no cleanup path anyone
# can forget. A message-passing handshake cannot give this: between "may I?"
# and the kill, the answer can stop being true.
#
# Degradation is deliberate: if the descriptor does not survive (a systemd
# version that closes it, say), the lock frees early and mechanism 2 is lost,
# while the per-worktree port and the cwd-scoped kill still hold. That is a
# weaker guarantee, not a broken one.
if ! devserver_lock_acquire "$PORT"; then
  echo "[dev-e2e] port ${PORT} is already claimed by: $(devserver_lock_describe "$PORT")" >&2
  echo "[dev-e2e] refusing to start a second server for the same worktree." >&2
  exit 75
fi

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
export NEXTAUTH_URL="$E2E_BASE_URL"

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
#   E2E_DEV_BUNDLER     turbopack | webpack             (default turbopack)
#
# The bundler is a knob for ONE measurement, described in
# docs/e2e-dev-server-restart-analysis.md. Next's dev watchdog restarts the
# server mid-run once the heap passes 80% of the cap, abandoning every request in
# flight with no response and no error; upstream reports say the webpack dev
# server does not grow per request the way Turbopack does. Whether that holds for
# THIS tree is the open question, and one measured run answers it.
#
# Two caveats it does not handle itself: the `.next` cache is bundler-specific
# and must not be shared (run `scripts/clean.sh` before switching), and the cold
# compile is slower, so raise `E2E_SERVER_WAIT` for that run.
DEV_BUNDLER="${E2E_DEV_BUNDLER:-turbopack}"
DEV_MEM_MAX="${E2E_DEV_MEM_MAX:-8G}"
E2E_DEV_CPU_QUOTA="${E2E_DEV_CPU_QUOTA-300%}"
export NODE_OPTIONS="--max-old-space-size=${DEV_NODE_HEAP} ${NODE_OPTIONS:-}"

#   E2E_DEV_HEAP_SNAPSHOT=1  arm SIGUSR2 to write a V8 heap snapshot
#
# The second measurement knob, and the one that can actually name the leak.
# Both bundlers grow the same way and both caps only choose which symptom to
# pay (see the addendum in docs/e2e-dev-server-restart-analysis.md), so the
# remaining question is WHICH structure retains ~34 KB per request. A snapshot
# pair taken at two heap sizes during one run answers it;
# tools/next-heap/snapshot-pair.py drives the signal and
# tools/next-heap/heap-classes.py diffs the two.
#
# Off by default and inert until signalled: arming it only installs V8's signal
# handler. Two things it is NOT free of, which is why it is not always on:
#
#  - Node's DEFAULT disposition for SIGUSR2 is to terminate the process. Arming
#    the flag replaces that, so a stray SIGUSR2 writes a file instead of killing
#    the server -- but it also means the ONLY safe way to send one is to a
#    process you have confirmed is armed.
#  - Writing the snapshot is stop-the-world for as long as it takes to serialise
#    the heap (tens of seconds at multi-GB). Every request in flight waits, and
#    Playwright's timeouts do not. A run taken with this on WILL report failures
#    that are the measurement, not the tree -- discard its results.
if [ "${E2E_DEV_HEAP_SNAPSHOT:-0}" = "1" ]; then
  export NODE_OPTIONS="--heapsnapshot-signal=SIGUSR2 ${NODE_OPTIONS}"
  echo "[dev-e2e] HEAP SNAPSHOT ARMED — SIGUSR2 writes a snapshot to the cwd."
  echo "[dev-e2e] MEASUREMENT MODE: the write is stop-the-world; discard this run's results."
fi

SCOPE_ARGS=(-p Description=jobsync-dev-e2e -p MemoryMax="$DEV_MEM_MAX" -p MemorySwapMax=0)
[ -n "${E2E_DEV_CPU_QUOTA:-}" ] && SCOPE_ARGS+=(-p CPUQuota="$E2E_DEV_CPU_QUOTA")

# Scoped to this worktree's port and working directory. `pkill -f "next dev"`
# matched a command line every checkout produces, so it reached into siblings.
devserver_stop "$PORT"

echo "[dev-e2e] port=${PORT} heap=${DEV_NODE_HEAP}MB mem-backstop=${DEV_MEM_MAX} cpu=${E2E_DEV_CPU_QUOTA:-uncapped}"

# `bun run dev` hardcodes `--turbopack` (package.json), so the webpack path calls
# next directly and keeps the port handling identical.
if [ "$DEV_BUNDLER" = "webpack" ]; then
  DEV_CMD=(bunx next dev -p "$PORT")
  echo "[dev-e2e] bundler=webpack — MEASUREMENT MODE, see docs/e2e-dev-server-restart-analysis.md"
else
  DEV_CMD=(bun run dev)
fi

# Unlike typecheck-safe.sh, a missing systemd scope must NOT abort: without a
# dev server there is no E2E run at all. Fall back to the heap cap alone.
# Probe with the SAME properties the real call uses ("${SCOPE_ARGS[@]}"). A
# subset lets the probe pass where the real invocation fails instantly, and here
# that surfaces as a useless "dev server not ready in 150s" AFTER the operator's
# server has already been killed. 0844cb37 fixed this in test.sh and
# test-e2e.sh and missed this file.
if systemd-run --user --scope "${SCOPE_ARGS[@]}" true 2>/dev/null; then
  echo "[dev-e2e] confined via systemd --user scope"
  exec systemd-run --user --scope "${SCOPE_ARGS[@]}" "${DEV_CMD[@]}"
elif systemd-run --scope "${SCOPE_ARGS[@]}" true 2>/dev/null; then
  echo "[dev-e2e] confined via systemd system scope"
  exec systemd-run --scope "${SCOPE_ARGS[@]}" "${DEV_CMD[@]}"
else
  echo "[dev-e2e] WARNING: no systemd transient scope — heap-capped but UNCONFINED."
  exec "${DEV_CMD[@]}"
fi
