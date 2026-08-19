#!/usr/bin/env bash
# Start Next.js dev server.
#
# Stops any running server FIRST, via stop.sh. This used to be an inline
# `pkill -f "next dev"`, which matched only the WRAPPER process and left the
# `next-server` worker — the half that actually holds the memory — alive. So
# every restart orphaned another worker, and nothing ever reaped them: that is
# how a dev server ended up running for 12 days holding ~5GB / 31% of RAM and
# repeatedly starving the host (2026-08-18).
#
# One implementation of "stop the dev server", in stop.sh, which verifies the
# processes are actually gone instead of trusting pkill's exit status.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/env.sh"

if ! bash "$SCRIPT_DIR/stop.sh"; then
  echo "[dev] refusing to start: could not stop the running dev server" >&2
  echo "[dev] check for a stuck process on port 3737 before retrying" >&2
  exit 1
fi

exec bun run dev
