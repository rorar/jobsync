#!/usr/bin/env bash
# Resource-confined production build for low-RAM hosts (e.g. an 8 GB no-swap VM).
#
# Wraps scripts/build.sh in a systemd memory cgroup so an over-large build is
# OOM-killed INSIDE its own scope instead of swap-deathing the host. On hosts
# with plenty of RAM or in CI, run scripts/build.sh directly — this wrapper is
# only for constrained machines.
#
# Tunables (env vars):
#   BUILD_MEM_MAX     cgroup memory cap              (default 7G)
#   BUILD_NODE_HEAP   node --max-old-space-size, MB  (default 6144)
#   BUILD_TIMEOUT     wall-clock cap, seconds        (default 900)
#   ALLOW_UNCONFINED  =1 -> run heap-capped + niced even without a cgroup
#                          (default: abort rather than risk a host hang)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MEM_MAX="${BUILD_MEM_MAX:-7G}"
NODE_HEAP="${BUILD_NODE_HEAP:-6144}"
TIMEOUT="${BUILD_TIMEOUT:-900}"

# Free RAM so the confined build runs alone.
lsof -ti:3737 2>/dev/null | xargs -r kill 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null

# build.sh sources env.sh (Prisma engines) + execs `bun run build`; NODE_OPTIONS
# is inherited through env, the wall-clock/priority wrappers apply to that process.
WRAP=(timeout "$TIMEOUT" nice -n 19 ionice -c3
      env "NODE_OPTIONS=--max-old-space-size=${NODE_HEAP}" NEXT_TELEMETRY_DISABLED=1
      bash "$DIR/build.sh")

echo "[build-safe] mem=${MEM_MAX} swap=0 heap=${NODE_HEAP}MB timeout=${TIMEOUT}s"

if systemd-run --user --scope -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUWeight=50 true 2>/dev/null; then
  echo "[build-safe] confined via systemd --user scope"
  exec systemd-run --user --scope -p Description=jobsync-build \
    -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUWeight=50 \
    "${WRAP[@]}"
elif systemd-run --scope -p MemoryMax="$MEM_MAX" true 2>/dev/null; then
  echo "[build-safe] confined via systemd system scope"
  exec systemd-run --scope -p Description=jobsync-build \
    -p MemoryMax="$MEM_MAX" -p MemorySwapMax=0 -p CPUWeight=50 \
    "${WRAP[@]}"
elif [ "${ALLOW_UNCONFINED:-}" = "1" ]; then
  echo "[build-safe] WARNING: no systemd scope; running heap-capped + niced but UNCONFINED (host hang possible)."
  exec "${WRAP[@]}"
else
  echo "[build-safe] ABORT: no systemd transient scope available."
  echo "             An unconfined build can swap-death a low-RAM host."
  echo "             Use scripts/build.sh on a roomy host/CI, or set ALLOW_UNCONFINED=1 to override."
  exit 86
fi
