#!/usr/bin/env bash
# Shared runner for all tracks — provides consistent claude invocation
# Automatically injects shared-process.md (PDCA cycle) into every prompt
#
# Usage: source scripts/tracks/track-runner.sh
# Then call: run_track "$WORKTREE" "$PROMPT" "$LOG_FILE"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_TURNS="${TRACK_MAX_TURNS:-200}"
MODEL="${TRACK_MODEL:-opus}"

# Load shared process requirements (PDCA cycle)
SHARED_PROCESS=""
if [ -f "$SCRIPT_DIR/shared-process.md" ]; then
  SHARED_PROCESS="$(cat "$SCRIPT_DIR/shared-process.md")"
fi

run_track() {
  local worktree="$1"
  local track_prompt="$2"
  local log_file="${3:-}"

  cd "$worktree"

  # Ensure worktree has dependencies + Prisma client
  # Git worktrees don't copy node_modules — install if missing
  if [ ! -d "node_modules" ]; then
    echo "[track-runner] Installing dependencies (node_modules missing)..."
    bun install --frozen-lockfile 2>/dev/null || bun install
  fi
  if [ ! -d "node_modules/.prisma/client" ]; then
    echo "[track-runner] Generating Prisma client..."
    bash scripts/prisma-generate.sh 2>/dev/null || npx prisma generate
  fi

  # Inject shared process into every track prompt
  local full_prompt="${track_prompt}

---

${SHARED_PROCESS}"

  echo "[track-runner] Starting in: $worktree"
  echo "[track-runner] Model: $MODEL"
  echo "[track-runner] Max turns: $MAX_TURNS"
  echo "[track-runner] Shared process: $([ -n "$SHARED_PROCESS" ] && echo 'injected' || echo 'NOT FOUND')"
  echo "[track-runner] Log: ${log_file:-stdout}"
  echo "[track-runner] Timestamp: $(date -Iseconds)"

  # Ensure log directory exists
  if [ -n "$log_file" ]; then
    mkdir -p "$(dirname "$log_file")"
  fi

  # Build claude command
  # Note: --output-format stream-json requires --verbose with -p
  local claude_cmd=(
    claude
    -p "$full_prompt"
    --dangerously-skip-permissions
    --verbose
    --output-format stream-json
    --max-turns "$MAX_TURNS"
    --model "$MODEL"
  )

  if [ -n "$log_file" ]; then
    "${claude_cmd[@]}" 2>&1 | tee "$log_file"
  else
    "${claude_cmd[@]}" 2>&1
  fi

  local exit_code=$?

  echo ""
  echo "[track-runner] Finished with exit code: $exit_code"
  echo "[track-runner] Timestamp: $(date -Iseconds)"

  # Extract summary from JSON log if available
  if [ -n "$log_file" ] && [ -f "$log_file" ] && command -v python3 &>/dev/null; then
    python3 -c "
import json
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
