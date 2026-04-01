#!/usr/bin/env bash
set -euo pipefail

# Session Runner — starts Claude Code sessions in tmux
# Usage: ./scripts/sessions/run-session.sh <session-id>
# Example: ./scripts/sessions/run-session.sh s1a

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

SESSIONS="s1a s1b s2 s3 s4"
TMUX_PREFIX="jobsync"

usage() {
    echo "Usage: $0 <session-id|command>"
    echo ""
    echo "Sessions (execute in order):"
    echo "  s1a  — Allium Weed + Gap Analysis + Performance Fixes"
    echo "  s1b  — Comprehensive Review + Fix All Findings"
    echo "  s2   — User Journeys & UX Polish"
    echo "  s3   — CRM Core (Job Status Workflow + Kanban)"
    echo "  s4   — Data Enrichment (Logo + Link-Parsing)"
    echo ""
    echo "Commands:"
    echo "  --status   Show session status (done/in-progress/pending)"
    echo "  --attach   Attach to a running session: $0 --attach s1a"
    echo "  --all      Run all remaining sessions sequentially in one tmux session"
    echo "  --next     Run the next pending session"
    exit 1
}

show_status() {
    echo "Session Status:"
    echo ""
    for s in $SESSIONS; do
        local PROMPT_FILE="$SCRIPT_DIR/${s}-prompt.md"
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
        if tmux has-session -t "$TMUX_NAME" 2>/dev/null; then
            continue  # running
        fi
        if git -C "$PROJECT_DIR" log --oneline -20 --grep="Session ${s}" 2>/dev/null | grep -qi "merge\|session"; then
            continue  # done
        fi
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
        echo "Session $SESSION_ID is already running in tmux."
        echo "Attach: tmux attach -t $TMUX_NAME"
        exit 0
    fi

    echo "Starting Session $SESSION_ID in tmux session '$TMUX_NAME'..."
    echo "Prompt: $PROMPT_FILE ($(wc -l < "$PROMPT_FILE") lines)"
    echo ""

    # Write a tiny launcher script to avoid quoting hell in tmux
    local LOG_DIR="$PROJECT_DIR/logs/sessions"
    local LOG_FILE="$LOG_DIR/${SESSION_ID}-\$(date +%Y%m%d-%H%M%S).log"
    local LAUNCHER="/tmp/jobsync-session-${SESSION_ID}.sh"
    cat > "$LAUNCHER" <<LAUNCHER_EOF
#!/usr/bin/env bash
cd "$PROJECT_DIR"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/${SESSION_ID}-\$(date +%Y%m%d-%H%M%S).log"
echo "Logging to: \$LOG_FILE"
echo ""
script -q -c "cat '$PROMPT_FILE' | claude -p --dangerously-skip-permissions --effort max --verbose" "\$LOG_FILE"
echo ""
echo "Session $SESSION_ID finished. Log: \$LOG_FILE"
echo "Press Enter to close."
read
LAUNCHER_EOF
    chmod +x "$LAUNCHER"

    tmux new-session -d -s "$TMUX_NAME" "$LAUNCHER"

    echo "tmux session '$TMUX_NAME' started."
    echo "Log: $LOG_DIR/${SESSION_ID}-*.log"
    echo ""
    echo "  Attach:  tmux attach -t $TMUX_NAME"
    echo "  Detach:  Ctrl+B, D (inside tmux)"
    echo "  Status:  $0 --status"
}

run_all() {
    local TMUX_NAME="${TMUX_PREFIX}-all"

    if tmux has-session -t "$TMUX_NAME" 2>/dev/null; then
        echo "Sequential run already active in tmux session '$TMUX_NAME'."
        echo "Attach: tmux attach -t $TMUX_NAME"
        exit 0
    fi

    # Write a launcher script to avoid quoting hell in tmux
    local LAUNCHER="/tmp/jobsync-session-all.sh"
    cat > "$LAUNCHER" <<LAUNCHER_EOF
#!/usr/bin/env bash
cd "$PROJECT_DIR"
LAUNCHER_EOF

    for s in $SESSIONS; do
        local PROMPT_FILE="$SCRIPT_DIR/${s}-prompt.md"
        cat >> "$LAUNCHER" <<LAUNCHER_EOF
echo '=========================================='
echo '  Session: $s'
echo '=========================================='
cat '$PROMPT_FILE' | claude -p --dangerously-skip-permissions --effort max --verbose
echo ''
echo 'Session $s finished.'
echo ''
LAUNCHER_EOF
    done

    cat >> "$LAUNCHER" <<'LAUNCHER_EOF'
echo 'All sessions completed. Press Enter to close.'
read
LAUNCHER_EOF
    chmod +x "$LAUNCHER"

    tmux new-session -d -s "$TMUX_NAME" "$LAUNCHER"

    echo "Sequential run started in tmux session '$TMUX_NAME'."
    echo ""
    echo "  Attach:  tmux attach -t $TMUX_NAME"
    echo "  Detach:  Ctrl+B, D"
}

# Parse arguments
if [ $# -eq 0 ]; then
    usage
fi

case "$1" in
    --status)
        show_status
        ;;
    --attach)
        if [ $# -lt 2 ]; then
            echo "Usage: $0 --attach <session-id>"
            exit 1
        fi
        tmux attach -t "${TMUX_PREFIX}-${2}"
        ;;
    --next)
        NEXT=$(next_session)
        if [ -z "$NEXT" ]; then
            echo "All sessions completed!"
            exit 0
        fi
        echo "Next session: $NEXT"
        run_session "$NEXT"
        ;;
    --all)
        run_all
        ;;
    s1a|s1b|s2|s3|s4)
        run_session "$1"
        ;;
    *)
        echo "Unknown: $1"
        usage
        ;;
esac
