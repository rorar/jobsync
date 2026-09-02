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
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-devserver.sh"

# Scope: THIS worktree only.
#
# The matching below was correct about which processes are dev servers and
# wrong about whose they are. `next dev` and `next-server` produce the same
# command line in every checkout, so a stop here reached into a sibling
# worktree and killed a server three minutes into someone else's suite -- the
# incident that produced the "agents must never stop the dev server" rule.
# Ownership is the working directory, which /proc knows and a command line
# cannot express. STOP_ALL_WORKTREES=1 restores the old machine-wide sweep for
# the case where you really are cleaning up after everything.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCOPE_ALL="${STOP_ALL_WORKTREES:-0}"

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
      node|node.js|next-server*) ;;
      *) continue ;;
    esac
    if [[ "$SCOPE_ALL" != "1" && "$(readlink "/proc/$pid/cwd" 2>/dev/null)" != "$REPO_ROOT" ]]; then
      continue
    fi
    echo "$pid"
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
