#!/usr/bin/env bash
# Flush the Next.js / Turbopack build + dev cache (.next/).
#
# Pure cache flush — does NOT stop or start the dev server. For the full
# stop -> flush -> restart cycle use scripts/restart.sh (which calls this script).
# Fixes "Internal Server Error" caused by corrupted .next/ manifests.
#
# Usage:
#   ./scripts/clean.sh         # remove .next/
#   ./scripts/clean.sh --all   # also remove node_modules/.cache/ (tool caches)
set -uo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Warn if a dev server is live — deleting .next out from under it causes errors
# until the next request recompiles. (restart.sh stops the server first, so this
# never fires there.)
if curl -fsS -o /dev/null http://localhost:3737/ 2>/dev/null; then
  echo "[clean] WARNING: dev server is up on :3737 — flushing .next under a live"
  echo "        server can cause errors. Restart it after, or use scripts/restart.sh."
fi

rm -rf "$PROJECT_DIR/.next"
echo "[clean] removed .next/"

if [ "${1:-}" = "--all" ]; then
  rm -rf "$PROJECT_DIR/node_modules/.cache"
  echo "[clean] removed node_modules/.cache/"
fi
