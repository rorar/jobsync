#!/usr/bin/env bash
# Resource-confined `tsc --noEmit`. The cap protects the host regardless of its size;
# do not raise it to "fit" a bigger box -- see CLAUDE.md "resource discipline".
#
# A bare `npx tsc --noEmit` on this codebase can pin the host long enough that
# the session has to kill it. This wraps it the same way scripts/build-safe.sh
# wraps the production build: a systemd memory cgroup, plus nice/ionice/timeout,
# so an over-large check dies inside its own scope instead of starving the host.
#
# Caps are lower than build-safe's: tsc is heavy but lighter than a Next build.
#
# Tunables (env vars):
#   TSC_MEM_MAX     cgroup memory cap              (default 4G)
#   TSC_NODE_HEAP   node --max-old-space-size, MB  (default 3072)
#   TSC_TIMEOUT     wall-clock cap, seconds        (default 600)
#   ALLOW_UNCONFINED  =1 -> run heap-capped + niced even without a cgroup
#
# Usage:
#   ./scripts/typecheck-safe.sh              # whole project
#   ./scripts/typecheck-safe.sh --pretty     # extra args are passed to tsc
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.." || exit 1

MEM_MAX="${TSC_MEM_MAX:-4G}"
NODE_HEAP="${TSC_NODE_HEAP:-3072}"
TIMEOUT="${TSC_TIMEOUT:-600}"

WRAP=(timeout "$TIMEOUT" nice -n 19 ionice -c3
      env "NODE_OPTIONS=--max-old-space-size=${NODE_HEAP}"
      npx tsc --noEmit "$@")

echo "[typecheck-safe] mem=${MEM_MAX} swap=0 heap=${NODE_HEAP}MB timeout=${TIMEOUT}s"

if systemd-run --user --scope -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUWeight=50 true 2>/dev/null; then
  echo "[typecheck-safe] confined via systemd --user scope"
  systemd-run --user --scope -p Description=jobsync-typecheck \
    -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUWeight=50 \
    "${WRAP[@]}"
elif systemd-run --scope -p MemoryMax="$MEM_MAX" true 2>/dev/null; then
  echo "[typecheck-safe] confined via systemd system scope"
  systemd-run --scope -p Description=jobsync-typecheck \
    -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUWeight=50 \
    "${WRAP[@]}"
elif [ "${ALLOW_UNCONFINED:-}" = "1" ]; then
  echo "[typecheck-safe] WARNING: no systemd scope; heap-capped + niced but UNCONFINED."
  "${WRAP[@]}"
else
  echo "[typecheck-safe] ABORT: no systemd transient scope available."
  echo "                 Set ALLOW_UNCONFINED=1 to override, or run on a roomy host."
  exit 86
fi
RC=$?

# `timeout` reports 124, and a bare 124 next to a silent log looks exactly like a
# failed type check — it is not one. On 2026-09-02 this exact status was read as
# "typecheck failed" while the tree was clean; the run had simply been starved by
# six concurrent agents, and the same tree checked in 9 seconds once the host was
# idle. Say so, so nobody hunts a type error that does not exist.
if [ "$RC" -eq 124 ]; then
  echo
  echo "[typecheck-safe] TIMED OUT after ${TIMEOUT}s — this is NOT a type error."
  echo "                 tsc was killed before it could finish, so the tree is"
  echo "                 neither proven clean nor proven broken."
  echo "                 Check the machine first:  uptime && nproc"
  echo "                 A loaded host is the usual cause; re-run it alone before"
  echo "                 believing anything about the types. Raise the budget with"
  echo "                 TSC_TIMEOUT=<seconds> only once you know why it is slow."
fi
exit "$RC"
