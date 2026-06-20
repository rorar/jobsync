#!/usr/bin/env bash
# Restart dev server with a clean build cache.
# Fixes "Internal Server Error" caused by corrupted .next/ manifests.
#
# Usage: ./scripts/restart.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/env.sh"

echo "[restart] Stopping dev server..."
pkill -f "next dev" 2>/dev/null
sleep 1
# Force-kill stragglers (Turbopack can leave orphan processes)
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null

echo "[restart] Flushing build cache..."
bash "$SCRIPT_DIR/clean.sh"

echo "[restart] Starting dev server..."
exec bun run dev
