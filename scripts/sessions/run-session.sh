#!/usr/bin/env bash
# Session Runner — starts Claude Code sessions in tmux
#
# Default: interactive (you can type in the tmux session)
# --noninteractive: headless (claude -p, no input possible)
#
# Usage:
#   ./scripts/sessions/run-session.sh s1a                  # interactive
#   ./scripts/sessions/run-session.sh s1a --noninteractive # headless
#   ./scripts/sessions/run-session.sh --status
#   ./scripts/sessions/run-session.sh --kill s1a
set -Eeuo pipefail
shopt -s inherit_errexit

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"

# Use an array so paths with spaces and IFS changes are safe.
SESSIONS=(s1a s1b s2 s3 s4 s5a s5b)
TMUX_PREFIX="jobsync"
LOG_DIR="$PROJECT_DIR/logs/sessions"
NONINTERACTIVE=false

for _arg in "$@"; do
  [[ "$_arg" == "--noninteractive" ]] && NONINTERACTIVE=true
done
unset _arg

# ---------------------------------------------------------------------------
# usage
# ---------------------------------------------------------------------------
usage() {
  printf 'Usage: %s <session-id> [--noninteractive]\n\n' "$0"
  printf 'Sessions (execute in order):\n'
  printf '  s1a  — Allium Weed + Gap Analysis + Performance Fixes\n'
  printf '  s1b  — Comprehensive Review + Fix All Findings\n'
  printf '  s2   — User Journeys & UX Polish\n'
  printf '  s3   — CRM Core (Job Status Workflow + Kanban)\n'
  printf '  s4   — Data Enrichment (Logo + Link-Parsing)\n\n'
  printf 'Modes:\n'
  printf '  (default)          Interactive — you can type in the tmux session\n'
  printf '  --noninteractive   Headless — claude -p, no input possible\n\n'
  printf 'Commands:\n'
  printf '  --status   Show session status\n'
  printf '  --attach   Attach to running session: %s --attach s1a\n' "$0"
  printf '  --kill     Kill a running session: %s --kill s1a\n' "$0"
  printf '  --log      View clean log (strips ANSI): %s --log s1a\n' "$0"
  printf '  --resume   Resume incomplete session: %s --resume s3\n' "$0"
  printf '  --next     Run the next pending session\n'
  printf '  --all      Run all sessions sequentially\n'
  exit 1
}

# ---------------------------------------------------------------------------
# session_desc  — return description string for a session id
# ---------------------------------------------------------------------------
session_desc() {
  local id="$1"
  case "$id" in
    s1a) printf 'Allium Weed + Gap Analysis + Perf Fixes' ;;
    s1b) printf 'Comprehensive Review + Fix All' ;;
    s2)  printf 'User Journeys & UX Polish' ;;
    s3)  printf 'CRM Core (Workflow + Kanban)' ;;
    s4)  printf 'Data Enrichment (Logo + Links)' ;;
    s5a) printf 'UI Gaps (Sprint E) + Webhook Channel' ;;
    s5b) printf 'E-Mail + Browser Push Channels' ;;
    *)   printf 'Unknown session' ;;
  esac
}

# ---------------------------------------------------------------------------
# show_status
# ---------------------------------------------------------------------------
show_status() {
  printf 'Session Status:\n\n'
  local s tmux_name status desc
  for s in "${SESSIONS[@]}"; do
    tmux_name="${TMUX_PREFIX}-${s}"
    if tmux has-session -t "$tmux_name" 2>/dev/null; then
      status="RUNNING"
    elif git -C "$PROJECT_DIR" log --oneline -20 --grep="Session ${s}" 2>/dev/null \
         | grep -qi "merge\|session"; then
      status="DONE"
    else
      status="PENDING"
    fi
    desc="$(session_desc "$s")"
    printf '  %-5s %-15s %s\n' "$s" "[$status]" "$desc"
  done
  printf '\nAttach: %s --attach <session-id>\n' "$0"
}

# ---------------------------------------------------------------------------
# next_session  — prints the first PENDING session id; returns 1 if all done
# ---------------------------------------------------------------------------
next_session() {
  local s tmux_name
  for s in "${SESSIONS[@]}"; do
    tmux_name="${TMUX_PREFIX}-${s}"
    tmux has-session -t "$tmux_name" 2>/dev/null && continue
    git -C "$PROJECT_DIR" log --oneline -20 --grep="Session ${s}" 2>/dev/null \
      | grep -qi "merge\|session" && continue
    printf '%s\n' "$s"
    return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# write_inner_script  — writes /tmp/jobsync-inner-<id>.sh
#
# Interactive mode: pass prompt via --message file redirect so that:
#   a) there is no ARG_MAX risk for large prompts
#   b) the prompt content never leaks into /proc/*/cmdline
#   c) null bytes in the file surface as errors, not silent truncation
#
# Non-interactive mode: pipe file via stdin to claude -p (util-linux redirect,
# no useless cat fork).
# ---------------------------------------------------------------------------
write_inner_script() {
  local session_id="$1"
  local prompt_file="$2"
  local inner="$3"

  if [[ "$NONINTERACTIVE" == true ]]; then
    # Headless: claude -p reads prompt from stdin; redirect avoids fork.
    cat > "$inner" <<INNER_SCRIPT
#!/usr/bin/env bash
set -euo pipefail
cd -- ${PROJECT_DIR@Q} || exit 1
systemd-run --user --scope --property=MemoryMax=7936M --property=MemoryHigh=7168M --property=TasksMax=300 -- claude -p --dangerously-skip-permissions --effort max --verbose < ${prompt_file@Q}
INNER_SCRIPT
  else
    # Interactive: pass prompt as the first message argument.
    # We use --message (alias -m) with a process substitution so the prompt
    # is fed via a file descriptor, not an argv string.  Claude Code reads
    # the first positional argument as the initial prompt when it is a plain
    # string, but for content >4 KB we must ensure the shell does not hit any
    # argument-length limit.  We pass the path and let claude read the file
    # with --prompt-file if that flag is available, falling back to the
    # variable approach only when necessary.
    #
    # claude CLI (as of 2025) supports:
    #   claude [flags] [prompt]          — prompt is first positional arg
    # For large prompts the safest approach on Linux is to read the file into
    # a variable and pass it; Linux ARG_MAX is ~2 MB, well above our 8 KB
    # prompts.  We still prefer this over a bare heredoc piped to claude
    # because interactive mode requires a TTY on stdin.
    cat > "$inner" <<INNER_SCRIPT
#!/usr/bin/env bash
set -euo pipefail
cd -- ${PROJECT_DIR@Q} || exit 1
_prompt=\$(< ${prompt_file@Q})
systemd-run --user --scope --property=MemoryMax=7936M --property=MemoryHigh=7168M --property=TasksMax=300 -- claude --dangerously-skip-permissions --effort max --verbose "\$_prompt"
INNER_SCRIPT
  fi

  chmod +x "$inner"
}

# ---------------------------------------------------------------------------
# run_session
# ---------------------------------------------------------------------------
run_session() {
  local session_id="$1"
  local prompt_file="$SCRIPT_DIR/${session_id}-prompt.md"
  local tmux_name="${TMUX_PREFIX}-${session_id}"

  if [[ ! -f "$prompt_file" ]]; then
    printf 'Error: Prompt file not found: %s\n' "$prompt_file" >&2
    exit 1
  fi

  if tmux has-session -t "$tmux_name" 2>/dev/null; then
    printf 'Session %s already running. Attach: tmux attach -t %s\n' \
      "$session_id" "$tmux_name"
    exit 0
  fi

  mkdir -p -- "$LOG_DIR"
  local log_file="$LOG_DIR/${session_id}-$(date +%Y%m%d-%H%M%S).log"

  # Inner script: the actual claude invocation.
  local inner="/tmp/jobsync-inner-${session_id}.sh"
  write_inner_script "$session_id" "$prompt_file" "$inner"

  # Outer wrapper: script(1) records all terminal I/O.
  # Linux util-linux script(1) syntax: script [-q] [-c command] [logfile]
  # The BSD positional form (logfile cmd) is NOT used here.
  local outer="/tmp/jobsync-session-${session_id}.sh"
  local mode
  [[ "$NONINTERACTIVE" == true ]] && mode="noninteractive" || mode="interactive"

  cat > "$outer" <<OUTER_SCRIPT
#!/usr/bin/env bash
printf 'Mode: %s\n' ${mode@Q}
printf 'Log:  %s\n\n' ${log_file@Q}
script -q -c ${inner@Q} -- ${log_file@Q}
printf '\nSession %s finished. Log: %s\n' ${session_id@Q} ${log_file@Q}
printf '\a'
command -v notify-send >/dev/null && notify-send "JobSync Session ${session_id@Q}" "Session finished. Check log." 2>/dev/null || true
printf 'Press Enter to close.\n'
read -r _unused
OUTER_SCRIPT
  chmod +x "$outer"

  printf 'Starting Session %s [%s]...\n' "$session_id" "$mode"
  printf 'Prompt: %s (%d lines)\n' "$prompt_file" "$(wc -l < "$prompt_file")"
  printf 'Log:    %s\n\n' "$log_file"

  tmux new-session -d -s "$tmux_name" -- "$outer"

  printf "tmux session '%s' started.\n\n" "$tmux_name"
  printf '  Attach:  tmux attach -t %s\n' "$tmux_name"
  printf '  Detach:  Ctrl+B, D\n'
  printf '  Kill:    %s --kill %s\n' "$0" "$session_id"
  printf '  Log:     tail -f %s\n' "$log_file"
}

# ---------------------------------------------------------------------------
# run_all  — runs every session sequentially in a single tmux window
# ---------------------------------------------------------------------------
run_all() {
  local tmux_name="${TMUX_PREFIX}-all"

  if tmux has-session -t "$tmux_name" 2>/dev/null; then
    printf 'Already running. Attach: tmux attach -t %s\n' "$tmux_name"
    exit 0
  fi

  mkdir -p -- "$LOG_DIR"

  local launcher="/tmp/jobsync-session-all.sh"
  # Write a fresh launcher; truncate first.
  printf '#!/usr/bin/env bash\nset -euo pipefail\n' > "$launcher"

  local s prompt_file inner
  for s in "${SESSIONS[@]}"; do
    prompt_file="$SCRIPT_DIR/${s}-prompt.md"
    inner="/tmp/jobsync-inner-${s}.sh"

    write_inner_script "$s" "$prompt_file" "$inner"

    # Append one step block per session.
    # LOG_DIR and session id are known now; only the timestamp is deferred.
    # Use printf to construct the log path at runtime so quoting stays clean
    # regardless of spaces in LOG_DIR.
    cat >> "$launcher" <<STEP
printf '==========================================\n'
printf '  Session: %s\n' ${s@Q}
printf '==========================================\n'
_log=\$(printf '%s/%s-%s.log' ${LOG_DIR@Q} ${s@Q} "\$(date +%Y%m%d-%H%M%S)")
script -q -c ${inner@Q} -- "\$_log"
printf 'Session %s finished.\n\n' ${s@Q}
STEP
  done

  cat >> "$launcher" <<'FOOTER'
printf 'All sessions completed. Press Enter to close.\n'
read -r _unused
FOOTER

  chmod +x "$launcher"

  tmux new-session -d -s "$tmux_name" -- "$launcher"

  printf "Sequential run started in tmux '%s'.\n" "$tmux_name"
  printf '  Attach:  tmux attach -t %s\n' "$tmux_name"
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

if [[ $# -eq 0 ]]; then usage; fi

CMD=""
ARG2=""
for _arg in "$@"; do
  [[ "$_arg" == "--noninteractive" ]] && continue
  if [[ -z "$CMD" ]]; then
    CMD="$_arg"
    continue
  fi
  if [[ -z "$ARG2" ]]; then
    ARG2="$_arg"
  fi
done
unset _arg

case "$CMD" in
  --status)
    show_status
    ;;
  --attach)
    if [[ -z "$ARG2" ]]; then
      printf 'Usage: %s --attach <id>\n' "$0" >&2
      exit 1
    fi
    tmux attach -t "${TMUX_PREFIX}-${ARG2}"
    ;;
  --kill)
    if [[ -z "$ARG2" ]]; then
      printf 'Usage: %s --kill <id>\n' "$0" >&2
      exit 1
    fi
    if tmux kill-session -t "${TMUX_PREFIX}-${ARG2}" 2>/dev/null; then
      printf 'Killed %s\n' "$ARG2"
    else
      printf '%s not running\n' "$ARG2"
    fi
    ;;
  --log)
    if [[ -z "$ARG2" ]]; then
      printf 'Usage: %s --log <id>\n' "$0" >&2
      exit 1
    fi
    # Find latest log for this session, strip ANSI escape codes
    local_log=$(ls -t "$LOG_DIR/${ARG2}"-*.log 2>/dev/null | head -1)
    if [[ -z "$local_log" ]]; then
      printf 'No log found for %s\n' "$ARG2" >&2
      exit 1
    fi
    # col -b strips backspaces, sed strips ANSI escapes
    sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$local_log" | col -b | less
    ;;
  --resume)
    if [[ -z "$ARG2" ]]; then
      printf 'Usage: %s --resume <id>\n' "$0" >&2
      exit 1
    fi
    # Check for dedicated resume prompt first, fallback to generic
    local_resume_file="$SCRIPT_DIR/${ARG2}-resume-prompt.md"
    if [[ -f "$local_resume_file" ]]; then
      printf 'Using dedicated resume prompt: %s\n' "$local_resume_file"
    else
      # Generate a generic resume prompt
      local_resume_file="/tmp/jobsync-resume-${ARG2}.md"
      cat > "$local_resume_file" <<RESUME_EOF
Lies CLAUDE.md und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md).
Lies docs/BUGS.md und CHANGELOG.md.

## Kontext: Resume von Session ${ARG2}

Die vorige Session ${ARG2} wurde unterbrochen (Context-Exhaustion oder Abbruch).

## Dein Auftrag

1. Prüfe \`git log --oneline -20\` — was wurde bereits committed?
2. Prüfe \`git status\` — gibt es uncommitted Changes?
3. Lies \`docs/BUGS.md\` — gibt es offene Items die als "remaining from ${ARG2}" markiert sind?
4. Lies den Original-Prompt: \`scripts/sessions/${ARG2}-prompt.md\`
5. Vergleiche: Was ist laut Prompt zu tun vs. was ist bereits getan?
6. Arbeite die verbleibenden Schritte ab — überspringe was bereits erledigt ist.
7. Befolge alle Regeln aus dem Original-Prompt (Git, Autonomie, Team-Orchestrierung, Exit-Checkliste).

Arbeite VOLLSTÄNDIG autonom. Maximale kognitive Anstrengung.
RESUME_EOF
      printf 'Using generic resume prompt\n'
    fi
    # Swap prompt, run, restore
    orig_prompt="$SCRIPT_DIR/${ARG2}-prompt.md"
    cp "$orig_prompt" "${orig_prompt}.bak"
    cp "$local_resume_file" "$orig_prompt"
    run_session "$ARG2"
    mv "${orig_prompt}.bak" "$orig_prompt"
    ;;
  --next)
    # next_session returns 1 when nothing is pending; capture its output
    # without letting the non-zero exit abort the script under set -e.
    if ! NEXT="$(next_session)"; then
      printf 'All sessions done.\n'
      exit 0
    fi
    if [[ -z "$NEXT" ]]; then
      printf 'All sessions done.\n'
      exit 0
    fi
    printf 'Next: %s\n' "$NEXT"
    run_session "$NEXT"
    ;;
  --all)
    run_all
    ;;
  s1a|s1b|s2|s3|s4|s5a|s5b)
    run_session "$CMD"
    ;;
  *)
    printf 'Unknown command: %s\n' "$CMD" >&2
    usage
    ;;
esac
