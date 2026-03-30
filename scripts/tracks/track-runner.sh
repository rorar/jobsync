#!/usr/bin/env bash
# Shared runner for all tracks — provides consistent claude invocation
# Automatically injects shared-process.md (PDCA cycle) into every prompt
#
# Usage: source scripts/tracks/track-runner.sh
# Then call: run_track "$WORKTREE" "$PROMPT" "$LOG_FILE"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_TURNS="${TRACK_MAX_TURNS:-200}"
MODEL="${TRACK_MODEL:-opus}"           # opus = Claude Opus 4.6 (best quality)

# Load shared process requirements (PDCA cycle)
SHARED_PROCESS=""
if [ -f "$SCRIPT_DIR/shared-process.md" ]; then
  SHARED_PROCESS="$(cat "$SCRIPT_DIR/shared-process.md")"
fi

run_track() {
  local worktree="$1"
  local track_prompt="$2"
  local log_file="${3:-/dev/stdout}"

  cd "$worktree"

  # Inject shared process into every track prompt
  local full_prompt="${track_prompt}

---

${SHARED_PROCESS}"

  echo "[track-runner] Starting in: $worktree"
  echo "[track-runner] Model: $MODEL"
  echo "[track-runner] Max turns: $MAX_TURNS"
  echo "[track-runner] Shared process: $([ -n "$SHARED_PROCESS" ] && echo 'injected' || echo 'NOT FOUND')"
  echo "[track-runner] Log: $log_file"
  echo "[track-runner] Timestamp: $(date -Iseconds)"

  claude \
    -p "$full_prompt" \
    --dangerously-skip-permissions \
    --output-format stream-json \
    --max-turns "$MAX_TURNS" \
    --model "$MODEL" \
    2>&1 | tee "$log_file"

  local exit_code=$?

  echo ""
  echo "[track-runner] Finished with exit code: $exit_code"
  echo "[track-runner] Timestamp: $(date -Iseconds)"

  # Extract summary from JSON log if available
  if [ -f "$log_file" ] && command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
tokens = 0
tool_uses = 0
errors = 0
for line in open('$log_file'):
    line = line.strip()
    if not line: continue
    try:
        obj = json.loads(line)
        if obj.get('type') == 'result':
            tokens = obj.get('total_tokens', 0)
            tool_uses = obj.get('tool_uses', 0)
        if obj.get('type') == 'error':
            errors += 1
    except: pass
print(f'[track-runner] Summary: {tokens} tokens, {tool_uses} tool uses, {errors} errors')
" 2>/dev/null || true
  fi

  return $exit_code
}
