#!/usr/bin/env bash
# Build the production bundle that the E2E suite runs against.
#
# Why a production build exists for E2E at all: `next dev` loads React's
# DEVELOPMENT Flight bundle, which installs a process-wide async_hooks hook and
# retains ~2,749 objects per request with no runtime opt-out (E2E-B42, measured
# — docs/e2e-dev-server-restart-analysis.md, second addendum). Next's own
# watchdog then restarts the server mid-run, abandoning every request in flight
# with no response and no error. A production build does not load that bundle,
# so the cause is gone rather than the symptom rescheduled.
#
# The build is the recurring cost of that move, which is why this script exists
# separately from the runner: it decides whether a build is NEEDED, so a loop
# over one spec does not pay minutes per iteration.
#
#   E2E_PROD_BUILD   auto | always | never   (default auto)
#     auto    build when there is no build, or when a source file is newer
#     always  build unconditionally
#     never   refuse to build; fail if there is no usable build
#   NEXT_DIST_DIR    build output directory  (default .next-e2e)
#
# The output directory is deliberately NOT `.next`: the dev server's Turbopack
# cache lives there and the two pipelines write the same manifest filenames, so
# sharing one directory makes every mode switch silently invalidate the other's
# work. next.config.mjs reads NEXT_DIST_DIR, and it must be set identically for
# the build and for `next start` — scripts/prod-e2e.sh exports the same default.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

source "$DIR/lib-runtime-guard.sh"

export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-e2e}"
MODE="${E2E_PROD_BUILD:-auto}"
BUILD_ID="$NEXT_DIST_DIR/BUILD_ID"

case "$MODE" in
  auto|always|never) : ;;
  *)
    echo "[e2e-prod-build] ERROR: E2E_PROD_BUILD must be auto, always or never (got '$MODE')." >&2
    exit 2
    ;;
esac

# What makes a build stale.
#
# BUILD_ID is the marker rather than the directory, because it is written at the
# END of a successful build: a build killed by the cgroup or the timeout leaves a
# populated directory and no BUILD_ID, which must read as "no build" and not as
# "a build to compare against".
#
# `.env` is NOT in this list and that is a decision, not an omission. Next reads
# it at RUNTIME for `next start`, so changing DATABASE_URL or AUTH_SECRET does
# not need a rebuild.
#
# The exception is NEXT_PUBLIC_*, which is INLINED at build time. This repo
# declares exactly one, `NEXT_PUBLIC_ENABLE_MOCK_DATA` (`src/lib/constants.ts:71`,
# via `isMockDataEnabled`), and it is absent from `.env` here — so it is
# currently `undefined` in every build and changing it would be a deliberate act
# that can pass `E2E_PROD_BUILD=always`. If a second one appears, or if that one
# starts being set, add `.env` to this list; otherwise a build stays "fresh"
# across a change that is compiled into it.
STALENESS_INPUTS=(src public prisma/schema.prisma next.config.mjs package.json tsconfig.json)

first_newer_than_build() {
  local p
  for p in "${STALENESS_INPUTS[@]}"; do
    [ -e "$p" ] || continue
    # -print -quit: stop at the FIRST hit. This runs before every prod E2E run,
    # and walking all of src/ to completion to answer a yes/no question is waste.
    local hit
    hit="$(find "$p" -newer "$BUILD_ID" -print -quit 2>/dev/null)"
    [ -n "$hit" ] && { echo "$hit"; return 0; }
  done
  return 1
}

DECISION="skip"
REASON=""
if [ ! -f "$BUILD_ID" ]; then
  DECISION="build"
  REASON="no build at ${NEXT_DIST_DIR}/ (BUILD_ID absent)"
elif [ "$MODE" = "always" ]; then
  DECISION="build"
  REASON="E2E_PROD_BUILD=always"
elif [ "$MODE" = "auto" ]; then
  NEWER="$(first_newer_than_build)"
  if [ -n "$NEWER" ]; then
    DECISION="build"
    REASON="${NEWER} is newer than ${BUILD_ID}"
  else
    REASON="no source file is newer than ${BUILD_ID}"
  fi
else
  REASON="E2E_PROD_BUILD=never"
fi

if [ "$DECISION" = "build" ] && [ "$MODE" = "never" ]; then
  echo "[e2e-prod-build] ERROR: E2E_PROD_BUILD=never, but ${REASON}." >&2
  echo "[e2e-prod-build]        Run without that setting, or build once by hand:" >&2
  echo "[e2e-prod-build]        NEXT_DIST_DIR=${NEXT_DIST_DIR} bash scripts/build-safe.sh" >&2
  exit 1
fi

if [ "$DECISION" = "skip" ]; then
  echo "[e2e-prod-build] reusing ${NEXT_DIST_DIR}/ ($(cat "$BUILD_ID" 2>/dev/null)) — ${REASON}."
  report_exit "e2e-prod-build" 0
  exit 0
fi

echo "[e2e-prod-build] building into ${NEXT_DIST_DIR}/ — ${REASON}"

# build-safe.sh, never a bare `bun run build`: the wrapper puts the build in a
# 7 G memory cgroup so an over-large build is OOM-killed inside its own scope
# instead of taking the host with it (CLAUDE.md, resource discipline). It also
# runs the load guard and stops this worktree's server first, which a build must
# do anyway — `next build` and a live `next start` would otherwise be writing and
# reading the same directory.
bash "$DIR/build-safe.sh"
RC=$?

# A build wrapper that exits 0 without producing a BUILD_ID has not built
# anything, and the next step would fail with "Could not find a production
# build" — naming the server rather than the build. Check the artefact, not just
# the status.
if [ "$RC" = "0" ] && [ ! -f "$BUILD_ID" ]; then
  echo "[e2e-prod-build] ERROR: build-safe.sh exited 0 but ${BUILD_ID} does not exist." >&2
  echo "[e2e-prod-build]        Check that NEXT_DIST_DIR reached next.config.mjs." >&2
  RC=1
fi

report_exit "e2e-prod-build" "$RC"
exit "$RC"
