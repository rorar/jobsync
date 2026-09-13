#!/usr/bin/env bash
# Resource-confined `tsc --noEmit`. The cap protects the host regardless of its size;
# do not raise it just because a box LOOKS bigger -- see CLAUDE.md "resource discipline".
#
# A bare `npx tsc --noEmit` on this codebase can pin the host long enough that
# the session has to kill it. This wraps it the same way scripts/build-safe.sh
# wraps the production build: a systemd memory cgroup, plus nice/ionice/timeout,
# so an over-large check dies inside its own scope instead of starving the host.
#
# Caps are lower than build-safe's: tsc is heavy but lighter than a Next build.
#
# 2026-09-13: raised 4G->8G / heap 3072->6144 after a MEASURED, deliberate
# container resize (cgroupfs memory.max 16G->32G, memory.high 14G->28G, live,
# no swap either side). Not a guess-and-bump: verify current values with
# `cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.high` before touching
# these again -- the container is not the host, and `free -h` inside an LXC
# guest reports the HOST's memory, not this cgroup's (same class of gotcha as
# the documented `/proc/loadavg` one). The cap still exists to catch a leak as
# a bug signal, not to be resized on a hunch every time the box changes.
#
# Tunables (env vars):
#   TSC_MEM_MAX     cgroup memory cap              (default 8G)
#   TSC_NODE_HEAP   node --max-old-space-size, MB  (default 6144)
#   TSC_TIMEOUT     wall-clock cap, seconds        (default 600)
#   ALLOW_UNCONFINED  =1 -> run heap-capped + niced even without a cgroup
#
# Usage:
#   ./scripts/typecheck-safe.sh              # whole project
#   ./scripts/typecheck-safe.sh --pretty     # extra args are passed to tsc
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.." || exit 1

source "$(dirname "${BASH_SOURCE[0]}")/lib-runtime-guard.sh"
guard_host_load "typecheck-safe" || exit 75

MEM_MAX="${TSC_MEM_MAX:-8G}"
NODE_HEAP="${TSC_NODE_HEAP:-6144}"
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
report_exit "typecheck-safe" "$RC" "$TIMEOUT"
exit "$RC"
