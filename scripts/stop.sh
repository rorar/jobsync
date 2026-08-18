#!/usr/bin/env bash
# Stop the Next.js dev server — and verify it actually stopped.
#
# Two defects this replaces (both bit us on 2026-08-18, when a dev server left
# running for 12 days held ~5GB / 31% of RAM and repeatedly starved the host):
#
#   1. `pkill -f "next dev"` matches only the WRAPPER process. The worker that
#      actually holds the memory rewrites its argv to "next-server (vX.Y.Z)",
#      so it never matched and was never killed. `restart.sh` already knew this;
#      `stop.sh` did not.
#   2. `pkill ... && echo "Stopped"` reports pkill's exit status, which means
#      "a signal was sent" — NOT "the process is gone". The old script printed
#      "Stopped" and freed port 3737 while both PIDs stayed alive.
#
# So: match both halves, escalate TERM -> KILL, and only claim success after
# confirming nothing matches any more. Exits non-zero if it cannot stop them,
# so callers (and CI) can tell a real stop from a wishful one.
set -uo pipefail

# ERE, as pgrep -f expects. Covers the `next dev` wrapper and the `next-server`
# worker, including Turbopack orphans.
PATTERN='next dev|next-server'

# Grace period before escalating to SIGKILL.
TERM_WAIT_SECONDS="${STOP_TERM_WAIT:-10}"

# `pgrep -f` matches the whole command line, so ANY process that merely mentions
# these strings matches too — including the shell running this script, an editor,
# or a grep. `pkill -f` would happily kill them (verified: a bash -c whose argv
# contained "next dev" was matched). So candidates are filtered by process NAME
# and signalled by PID, never by pattern.
alive() {
  local pid comm
  for pid in $(pgrep -f "$PATTERN" 2>/dev/null); do
    [[ "$pid" == "$$" || "$pid" == "$PPID" ]] && continue
    comm="$(ps -p "$pid" -o comm= 2>/dev/null)" || continue
    case "$comm" in
      node|node.js|next-server*) echo "$pid" ;;
    esac
  done
}

pids="$(alive)"
if [[ -z "$pids" ]]; then
  echo "Not running"
  exit 0
fi

echo "[stop] stopping: $(echo "$pids" | tr '\n' ' ')"
# shellcheck disable=SC2086 -- word splitting is intended: one PID per argument.
kill -TERM $pids 2>/dev/null || true

deadline=$(( $(date +%s) + TERM_WAIT_SECONDS ))
while [[ -n "$(alive)" && $(date +%s) -lt $deadline ]]; do
  sleep 0.5
done

survivors="$(alive)"
if [[ -n "$survivors" ]]; then
  echo "[stop] still alive after ${TERM_WAIT_SECONDS}s, sending SIGKILL"
  # shellcheck disable=SC2086
  kill -KILL $survivors 2>/dev/null || true
  sleep 1
fi

remaining="$(alive)"
if [[ -n "$remaining" ]]; then
  echo "[stop] FAILED — still running: $(echo "$remaining" | tr '\n' ' ')" >&2
  exit 1
fi

echo "Stopped"
