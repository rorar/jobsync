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
source "$SCRIPT_DIR/lib-devserver.sh"

# One port per worktree, so a second checkout does not fight this one for 3737.
PORT="$(devserver_port)"
export PORT

if ! bash "$SCRIPT_DIR/stop.sh"; then
  echo "[dev] refusing to start: could not stop the running dev server" >&2
  echo "[dev] check for a stuck process on port ${PORT} before retrying" >&2
  exit 1
fi

# Claim the port, so an ordinary development server is visible to the E2E
# wrapper instead of being discovered only after it has taken the lock and
# found the port occupied. Held on a descriptor that survives the exec below,
# so it belongs to the server and frees when the server dies.
if ! devserver_lock_acquire "$PORT"; then
  echo "[dev] port ${PORT} is claimed by: $(devserver_lock_describe "$PORT")" >&2
  exit 75
fi

echo "[dev] starting on port ${PORT}"
exec bun run dev
