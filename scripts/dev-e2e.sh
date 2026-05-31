#!/usr/bin/env bash
# Start the Next.js dev server for E2E runs.
#
# Identical to dev.sh, but enables the auth rate-limit bypass so the Playwright
# suite (which re-logs-in on every run) does not trip the 5-per-15-min signin
# limit. The bypass is double-gated and prod-inert — see
# src/lib/auth/auth-rate-limit.ts. NEVER use this script for a production server.
source "$(dirname "$0")/env.sh"
export E2E_AUTH_RATE_LIMIT_BYPASS=1
pkill -f "next dev" 2>/dev/null
sleep 1
exec bun run dev
