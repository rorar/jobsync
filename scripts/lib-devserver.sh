#!/usr/bin/env bash
# Dev-server ownership: which port is ours, whose process is that, may we kill it.
# SOURCE this, do not execute it.
#
# Three mechanisms, composed. Each covers what the one below it cannot:
#
#   1. A port per worktree. Two worktrees can no longer collide at all, so the
#      most common case needs no coordination.
#   2. An advisory lock per port. Two runs in the SAME worktree — two tmux
#      windows, a subagent and its orchestrator — see each other before one
#      kills the other's server. flock is atomic; asking over a message channel
#      is not: between "may I?" and the kill, the answer can stop being true.
#   3. Kill scoped to port AND working directory. The backstop for anything that
#      bypasses 1 and 2, and the fix for `pkill -f "next dev"`, which matches on
#      a command line every worktree shares.
#
# The incident behind all three: parallel subagents killed each other's dev
# server mid-run. The rule written after it ("agents must never stop the dev
# server") was recorded without its reason, so it also forbade reclaiming an
# ORPHANED server — on 2026-09-02 a `bun run dev` tree with PPID 1, its systemd
# scope already dead, held 4.3 GB and port 3737 with no run owning it.

DEVSERVER_BASE_PORT="${DEVSERVER_BASE_PORT:-3737}"

# The port this worktree uses.
#
# The MAIN checkout keeps the base port: it is in .env, in bookmarks, in muscle
# memory, and moving it would be a tax on the common case. Linked worktrees get
# a port derived from their path — deterministic, so it survives a restart and
# is the same for every tool that asks.
devserver_port() {
  if [ -n "${JOBSYNC_PORT:-}" ]; then
    echo "$JOBSYNC_PORT"
    return
  fi
  local gitdir commondir root
  gitdir="$(git rev-parse --git-dir 2>/dev/null)"
  commondir="$(git rev-parse --git-common-dir 2>/dev/null)"
  if [ -z "$gitdir" ] || [ "$gitdir" = "$commondir" ]; then
    echo "$DEVSERVER_BASE_PORT"        # main checkout, or not a repo at all
    return
  fi
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  # cksum, not $RANDOM and not a counter: the port must be a pure function of
  # the path, or two tools in the same worktree disagree about where to look.
  local h
  h=$(printf '%s' "$root" | cksum | cut -d' ' -f1)
  echo $(( DEVSERVER_BASE_PORT + 1 + (h % 49) ))
}

devserver_pid_on_port() {
  local port="$1" pid=""
  pid="$(ss -lptnH "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)"
  [ -z "$pid" ] && pid="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null | head -1)"
  echo "$pid"
}

devserver_cwd_of() {
  readlink "/proc/$1/cwd" 2>/dev/null
}

# Is this process ours — same worktree, and actually a dev server?
#
# Both halves are needed. Path alone would match a shell; command alone is what
# `pkill -f "next dev"` does, and every worktree produces the same string.
devserver_is_ours() {
  local pid="$1" root="${2:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
  [ -n "$pid" ] || return 1
  [ "$(devserver_cwd_of "$pid")" = "$root" ] || return 1
  local cmd
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)"
  case "$cmd" in
    *"next dev"*|*next-server*|*"bun run dev"*|*"next-router-worker"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Stop the dev server on `port`, but only the tree that belongs to this worktree.
#
# Killing the listener alone is not enough and looks like it worked: `next dev`
# supervises `next-server` and respawns it within seconds. That is why an
# earlier teardown appeared to leave a "new" server behind — it was the same
# supervisor, one child later.
devserver_stop() {
  local port="${1:-$(devserver_port)}"
  local root="${2:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
  local pid
  pid="$(devserver_pid_on_port "$port")"

  if [ -z "$pid" ]; then
    return 0
  fi
  if ! devserver_is_ours "$pid" "$root"; then
    echo "[devserver] :$port is held by pid $pid in $(devserver_cwd_of "$pid" || echo '?')" >&2
    echo "[devserver] NOT ours — leaving it alone." >&2
    return 1
  fi

  # Walk up to the supervisor: the topmost ancestor still recognisable as this
  # worktree's dev server. Killing that one stops the respawn.
  local tree="$pid" cur="$pid" parent
  while :; do
    parent="$(awk '{print $4}' "/proc/$cur/stat" 2>/dev/null)"
    [ -z "$parent" ] || [ "$parent" = "0" ] || [ "$parent" = "1" ] && break
    devserver_is_ours "$parent" "$root" || break
    tree="$parent $tree"
    cur="$parent"
  done
  # Children last so the supervisor cannot respawn what we just killed.
  local children
  children="$(pgrep -P "$pid" 2>/dev/null | tr '\n' ' ')"

  # shellcheck disable=SC2086
  kill -TERM $tree $children 2>/dev/null
  local waited=0
  while [ "$waited" -lt 8 ]; do
    [ -z "$(devserver_pid_on_port "$port")" ] && break
    sleep 1
    waited=$((waited + 1))
  done
  # shellcheck disable=SC2086
  kill -KILL $tree $children 2>/dev/null
  return 0
}

# --- Advisory lock -----------------------------------------------------------
#
# Held on fd 9. File descriptors survive exec, so a script that acquires the
# lock and then `exec`s the dev server hands the lock to the server process: it
# is released exactly when the server dies, including when it is killed, with no
# cleanup path to forget.

devserver_lock_file()  { echo "/tmp/jobsync-dev-${1:-$(devserver_port)}.lock"; }
devserver_lock_owner() { echo "/tmp/jobsync-dev-${1:-$(devserver_port)}.owner"; }

devserver_lock_acquire() {
  local port="${1:-$(devserver_port)}"
  local lock owner
  lock="$(devserver_lock_file "$port")"
  owner="$(devserver_lock_owner "$port")"
  exec 9>"$lock" || return 1
  if ! flock -n 9; then
    return 1
  fi
  printf 'pid=%s cwd=%s since=%s\n' "$$" "$PWD" "$(date -Is)" > "$owner"
  return 0
}

devserver_lock_describe() {
  local owner
  owner="$(devserver_lock_owner "${1:-$(devserver_port)}")"
  [ -f "$owner" ] && cat "$owner" || echo "unknown holder"
}
