#!/usr/bin/env bash
# Sprint C: Run 3 parallel development tracks
# Each track runs in an isolated git worktree with its own Claude session.
#
# Usage: bash scripts/tracks/run-all-tracks.sh
#
# Prerequisites:
#   - claude CLI installed and authenticated
#   - Current branch is clean (no uncommitted changes)
#   - Node.js + bun available

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TRACKS_DIR="$PROJECT_DIR/.tracks"

echo "=== Sprint C: Parallel Track Orchestrator ==="
echo "Project: $PROJECT_DIR"
echo ""

# Ensure clean working tree
if ! git -C "$PROJECT_DIR" diff --quiet HEAD 2>/dev/null; then
  echo "ERROR: Working tree has uncommitted changes. Commit or stash first."
  exit 1
fi

MAIN_BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD)
echo "Base branch: $MAIN_BRANCH"

# Create worktree directory
mkdir -p "$TRACKS_DIR"

# Track definitions
declare -A TRACKS=(
  ["track1-blacklist-caching"]="feature/sprint-c-blacklist-caching"
  ["track2-jobdeck"]="feature/sprint-c-jobdeck"
  ["track3-public-api"]="feature/sprint-c-public-api"
)

# Create worktrees and branches
for track in "${!TRACKS[@]}"; do
  branch="${TRACKS[$track]}"
  worktree="$TRACKS_DIR/$track"

  if [ -d "$worktree" ]; then
    echo "Worktree $track already exists, removing..."
    git -C "$PROJECT_DIR" worktree remove "$worktree" --force 2>/dev/null || true
  fi

  echo "Creating worktree: $track → $branch"
  git -C "$PROJECT_DIR" worktree add -b "$branch" "$worktree" "$MAIN_BRANCH"
done

echo ""
echo "=== Starting 3 parallel Claude sessions ==="
echo ""

# Start all tracks in parallel
pids=()

for track in "${!TRACKS[@]}"; do
  worktree="$TRACKS_DIR/$track"
  script="$SCRIPT_DIR/${track}.sh"
  log="$TRACKS_DIR/${track}.log"

  if [ ! -f "$script" ]; then
    echo "WARNING: Script $script not found, skipping $track"
    continue
  fi

  echo "Starting $track (log: $log)"
  bash "$script" "$worktree" > "$log" 2>&1 &
  pids+=($!)
done

echo ""
echo "All tracks started. PIDs: ${pids[*]}"
echo "Waiting for completion..."
echo ""

# Wait for all tracks
failed=0
for i in "${!pids[@]}"; do
  pid=${pids[$i]}
  track=$(echo "${!TRACKS[@]}" | tr ' ' '\n' | sed -n "$((i+1))p")
  if wait "$pid"; then
    echo "✓ $track completed successfully"
  else
    echo "✗ $track FAILED (exit code: $?)"
    failed=$((failed + 1))
  fi
done

echo ""
if [ $failed -eq 0 ]; then
  echo "=== All tracks completed successfully ==="
  echo ""
  echo "Next steps:"
  echo "  1. Review each branch:"
  for track in "${!TRACKS[@]}"; do
    echo "     git log ${TRACKS[$track]}...$MAIN_BRANCH --oneline"
  done
  echo "  2. Merge branches:"
  for track in "${!TRACKS[@]}"; do
    echo "     git merge ${TRACKS[$track]}"
  done
  echo "  3. Clean up worktrees:"
  echo "     git worktree prune"
else
  echo "=== $failed track(s) FAILED ==="
  echo "Check logs in $TRACKS_DIR/*.log"
fi
