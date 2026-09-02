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
DEVSERVER_PORT_SPAN="${DEVSERVER_PORT_SPAN:-200}"

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
  #
  # A hash over a finite span collides, and a collision here is worse than a
  # random port would be: two worktrees claim one port, the second one's lock
  # acquisition fails, and the message says the port is held by "this worktree"
  # when it is held by a different one. Nothing in that diagnostic points at the
  # collision. So resolve it deterministically instead: walk the worktrees in
  # path order and let the earlier one keep the contested slot.
  #
  # The cost is that ADDING a worktree can move a later one's port. That is
  # visible (the wrapper prints the port it bound) and beats two checkouts
  # silently fighting over one.
  local -a linked=()
  local line r first=1
  while read -r line; do
    case "$line" in
      "worktree "*)
        r="${line#worktree }"
        if [ "$first" = 1 ]; then first=0; else linked+=("$r"); fi
        ;;
    esac
  done < <(git worktree list --porcelain 2>/dev/null)

  if [ ${#linked[@]} -eq 0 ]; then
    echo $(( DEVSERVER_BASE_PORT + 1 + ($(printf '%s' "$root" | cksum | cut -d' ' -f1) % DEVSERVER_PORT_SPAN) ))
    return
  fi

  local -A taken=()
  local candidate slot chosen=""
  while IFS= read -r candidate; do
    slot=$(( $(printf '%s' "$candidate" | cksum | cut -d' ' -f1) % DEVSERVER_PORT_SPAN ))
    while [ -n "${taken[$slot]:-}" ]; do
      slot=$(( (slot + 1) % DEVSERVER_PORT_SPAN ))
    done
    taken[$slot]="$candidate"
    [ "$candidate" = "$root" ] && chosen="$slot"
  done < <(printf '%s\n' "${linked[@]}" | sort)

  # Not in the list (a detached checkout, or git unavailable): fall back to the
  # bare hash rather than guessing.
  [ -z "$chosen" ] && chosen=$(( $(printf '%s' "$root" | cksum | cut -d' ' -f1) % DEVSERVER_PORT_SPAN ))
  echo $(( DEVSERVER_BASE_PORT + 1 + chosen ))
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

  # Wait for the PROCESSES to be gone, not for the port to be free.
  #
  # Those are different moments, and the difference is a real failure: the port
  # frees when the LISTENER dies, while the port lock is held by the tree ROOT,
  # which outlives it by a beat. Waiting on the port returned while the root was
  # still alive holding the lock, so the very next `dev-e2e.sh` was refused --
  # and the wrapper then waited 150 s for a server that was never going to start.
  local waited=0 remaining
  while [ "$waited" -lt 10 ]; do
    remaining=""
    for p in $tree $children; do
      kill -0 "$p" 2>/dev/null && remaining="$remaining $p"
    done
    [ -z "$remaining" ] && break
    sleep 1
    waited=$((waited + 1))
  done
  # shellcheck disable=SC2086
  kill -KILL $tree $children 2>/dev/null
  sleep 1
  return 0
}

# Wait until the port lock can actually be taken.
#
# The direct check of the precondition a start depends on, rather than a proxy
# for it. Returns non-zero on timeout so the caller can say WHY it gave up.
devserver_wait_lock_free() {
  local port="${1:-$(devserver_port)}" secs="${2:-10}" waited=0
  local lock; lock="$(devserver_lock_file "$port")"
  while [ "$waited" -lt "$secs" ]; do
    if ( exec 8>"$lock"; flock -n 8 ) 2>/dev/null; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
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
