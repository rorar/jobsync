#!/usr/bin/env bash
# Restart dev server with a clean build cache.
# Fixes "Internal Server Error" caused by corrupted .next/ manifests.
#
# Usage: ./scripts/restart.sh
source "$(dirname "$0")/env.sh"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[restart] Stopping dev server..."
pkill -f "next dev" 2>/dev/null
sleep 1
# Force-kill stragglers (Turbopack can leave orphan processes)
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null

echo "[restart] Clearing .next/ build cache..."
rm -rf "$PROJECT_DIR/.next"

echo "[restart] Starting dev server..."
exec bun run dev
