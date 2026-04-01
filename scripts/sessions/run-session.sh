#!/usr/bin/env bash
set -euo pipefail

# Session Runner — starts Claude Code sessions in tmux
#
# Default: interactive (you can type in the tmux session)
# --noninteractive: headless (claude -p, no input possible)
#
# Usage:
#   ./scripts/sessions/run-session.sh s1a                 # interactive
#   ./scripts/sessions/run-session.sh s1a --noninteractive # headless
#   ./scripts/sessions/run-session.sh --status
#   ./scripts/sessions/run-session.sh --kill s1a

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

SESSIONS="s1a s1b s2 s3 s4"
TMUX_PREFIX="jobsync"
LOG_DIR="$PROJECT_DIR/logs/sessions"
NONINTERACTIVE=false

for arg in "$@"; do
    [ "$arg" = "--noninteractive" ] && NONINTERACTIVE=true
done

usage() {
    echo "Usage: $0 <session-id> [--noninteractive]"
    echo ""
    echo "Sessions (execute in order):"
    echo "  s1a  — Allium Weed + Gap Analysis + Performance Fixes"
    echo "  s1b  — Comprehensive Review + Fix All Findings"
    echo "  s2   — User Journeys & UX Polish"
    echo "  s3   — CRM Core (Job Status Workflow + Kanban)"
    echo "  s4   — Data Enrichment (Logo + Link-Parsing)"
    echo ""
    echo "Modes:"
    echo "  (default)          Interactive — you can type in the tmux session"
    echo "  --noninteractive   Headless — claude -p, no input possible"
    echo ""
    echo "Commands:"
    echo "  --status   Show session status"
    echo "  --attach   Attach to running session: $0 --attach s1a"
    echo "  --kill     Kill a running session: $0 --kill s1a"
    echo "  --next     Run the next pending session"
    echo "  --all      Run all sessions sequentially"
    exit 1
}

show_status() {
    echo "Session Status:"
    echo ""
    for s in $SESSIONS; do
        local TMUX_NAME="${TMUX_PREFIX}-${s}"
        if tmux has-session -t "$TMUX_NAME" 2>/dev/null; then
            STATUS="RUNNING"
        elif git -C "$PROJECT_DIR" log --oneline -20 --grep="Session ${s}" 2>/dev/null | grep -qi "merge\|session"; then
            STATUS="DONE"
        else
            STATUS="PENDING"
        fi
        case "$s" in
            s1a) DESC="Allium Weed + Gap Analysis + Perf Fixes" ;;
            s1b) DESC="Comprehensive Review + Fix All" ;;
            s2)  DESC="User Journeys & UX Polish" ;;
            s3)  DESC="CRM Core (Workflow + Kanban)" ;;
            s4)  DESC="Data Enrichment (Logo + Links)" ;;
        esac
        printf "  %-5s %-15s %s\n" "$s" "[$STATUS]" "$DESC"
    done
    echo ""
    echo "Attach: $0 --attach <session-id>"
}

next_session() {
    for s in $SESSIONS; do
        local TMUX_NAME="${TMUX_PREFIX}-${s}"
        tmux has-session -t "$TMUX_NAME" 2>/dev/null && continue
        git -C "$PROJECT_DIR" log --oneline -20 --grep="Session ${s}" 2>/dev/null | grep -qi "merge\|session" && continue
        echo "$s"
        return 0
    done
    echo ""
    return 1
}

run_session() {
    local SESSION_ID="$1"
    local PROMPT_FILE="$SCRIPT_DIR/${SESSION_ID}-prompt.md"
    local TMUX_NAME="${TMUX_PREFIX}-${SESSION_ID}"

    if [ ! -f "$PROMPT_FILE" ]; then
        echo "Error: Prompt file not found: $PROMPT_FILE"
        exit 1
    fi

    if tmux has-session -t "$TMUX_NAME" 2>/dev/null; then
        echo "Session $SESSION_ID already running. Attach: tmux attach -t $TMUX_NAME"
        exit 0
    fi

    mkdir -p "$LOG_DIR"
    local LOG_FILE="$LOG_DIR/${SESSION_ID}-$(date +%Y%m%d-%H%M%S).log"

    # Inner script: runs claude (separate file so script(1) can wrap it)
    local INNER="/tmp/jobsync-inner-${SESSION_ID}.sh"

    if [ "$NONINTERACTIVE" = true ]; then
        # Headless: pipe prompt via stdin, claude -p exits when done
        cat > "$INNER" <<EOF
#!/usr/bin/env bash
cd '$PROJECT_DIR'
cat '$PROMPT_FILE' | claude -p --dangerously-skip-permissions --effort max --verbose
EOF
    else
        # Interactive: prompt as first message, claude stays open for input
        cat > "$INNER" <<EOF
#!/usr/bin/env bash
cd '$PROJECT_DIR'
PROMPT=\$(cat '$PROMPT_FILE')
claude --dangerously-skip-permissions --effort max --verbose "\$PROMPT"
EOF
    fi
    chmod +x "$INNER"

    # Outer wrapper: script(1) records all terminal I/O to log file
    local OUTER="/tmp/jobsync-session-${SESSION_ID}.sh"
    cat > "$OUTER" <<EOF
#!/usr/bin/env bash
echo "Mode: $([ "$NONINTERACTIVE" = true ] && echo "noninteractive" || echo "interactive")"
echo "Log:  $LOG_FILE"
echo ""
script -q '$LOG_FILE' '$INNER'
echo ""
echo "Session $SESSION_ID finished. Log: $LOG_FILE"
echo "Press Enter to close."
read
EOF
    chmod +x "$OUTER"

    local MODE="interactive"
    [ "$NONINTERACTIVE" = true ] && MODE="noninteractive"

    echo "Starting Session $SESSION_ID [$MODE]..."
    echo "Prompt: $PROMPT_FILE ($(wc -l < "$PROMPT_FILE") lines)"
    echo "Log:    $LOG_FILE"
    echo ""

    tmux new-session -d -s "$TMUX_NAME" "$OUTER"

    echo "tmux session '$TMUX_NAME' started."
    echo ""
    echo "  Attach:  tmux attach -t $TMUX_NAME"
    echo "  Detach:  Ctrl+B, D"
    echo "  Kill:    $0 --kill $SESSION_ID"
    echo "  Log:     tail -f '$LOG_FILE'"
}

run_all() {
    local TMUX_NAME="${TMUX_PREFIX}-all"

    if tmux has-session -t "$TMUX_NAME" 2>/dev/null; then
        echo "Already running. Attach: tmux attach -t $TMUX_NAME"
        exit 0
    fi

    mkdir -p "$LOG_DIR"
    local LAUNCHER="/tmp/jobsync-session-all.sh"
    cat > "$LAUNCHER" <<'HEADER'
#!/usr/bin/env bash
HEADER

    for s in $SESSIONS; do
        local PROMPT_FILE="$SCRIPT_DIR/${s}-prompt.md"
        local INNER="/tmp/jobsync-inner-${s}.sh"

        if [ "$NONINTERACTIVE" = true ]; then
            cat > "$INNER" <<EOF
#!/usr/bin/env bash
cd '$PROJECT_DIR'
cat '$PROMPT_FILE' | claude -p --dangerously-skip-permissions --effort max --verbose
EOF
        else
            cat > "$INNER" <<EOF
#!/usr/bin/env bash
cd '$PROJECT_DIR'
PROMPT=\$(cat '$PROMPT_FILE')
claude --dangerously-skip-permissions --effort max --verbose "\$PROMPT"
EOF
        fi
        chmod +x "$INNER"

        cat >> "$LAUNCHER" <<STEP
echo '=========================================='
echo '  Session: $s'
echo '=========================================='
LOG_FILE='$LOG_DIR/${s}-\$(date +%Y%m%d-%H%M%S).log'
script -q "\$LOG_FILE" '$INNER'
echo "Session $s finished."
echo ''
STEP
    done

    cat >> "$LAUNCHER" <<'FOOTER'
echo 'All sessions completed. Press Enter to close.'
read
FOOTER
    chmod +x "$LAUNCHER"

    tmux new-session -d -s "$TMUX_NAME" "$LAUNCHER"

    echo "Sequential run started in tmux '$TMUX_NAME'."
    echo "  Attach:  tmux attach -t $TMUX_NAME"
}

# --- Argument parsing ---

if [ $# -eq 0 ]; then usage; fi

CMD=""
ARG2=""
for arg in "$@"; do
    [ "$arg" = "--noninteractive" ] && continue
    [ -z "$CMD" ] && CMD="$arg" && continue
    [ -z "$ARG2" ] && ARG2="$arg"
done

case "$CMD" in
    --status)  show_status ;;
    --attach)  [ -z "$ARG2" ] && { echo "Usage: $0 --attach <id>"; exit 1; }; tmux attach -t "${TMUX_PREFIX}-${ARG2}" ;;
    --kill)    [ -z "$ARG2" ] && { echo "Usage: $0 --kill <id>"; exit 1; }; tmux kill-session -t "${TMUX_PREFIX}-${ARG2}" 2>/dev/null && echo "Killed ${ARG2}" || echo "${ARG2} not running" ;;
    --next)    NEXT=$(next_session); [ -z "$NEXT" ] && { echo "All done!"; exit 0; }; echo "Next: $NEXT"; run_session "$NEXT" ;;
    --all)     run_all ;;
    s1a|s1b|s2|s3|s4) run_session "$CMD" ;;
    *)         echo "Unknown: $CMD"; usage ;;
esac
