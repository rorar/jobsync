#!/usr/bin/env bash
# Start the Next.js dev server for E2E runs.
#
# Identical to dev.sh, but enables the auth rate-limit bypass so the Playwright
# suite (which re-logs-in on every run) does not trip the 5-per-15-min signin
# limit. The bypass is double-gated and prod-inert — see
# src/lib/auth/auth-rate-limit.ts. NEVER use this script for a production server.
source "$(dirname "$0")/env.sh"
export E2E_AUTH_RATE_LIMIT_BYPASS=1

# Pin the auth origin to the one Playwright drives.
#
# `.env` on this machine carries the Tailscale address
# (NEXTAUTH_URL=http://100.76.113.93:3737) so the app is reachable from other
# devices. Header.tsx's sign-out server action builds its redirect from
# AUTH_URL ?? NEXTAUTH_URL, so with the .env value the logout in
# e2e/smoke/signin.spec.ts redirects to a DIFFERENT ORIGIN than the one the
# test is on — the session cookie does not travel, and the test sees whatever
# that other origin renders instead of "Welcome back".
#
# A real process env var wins over a .env entry in Next.js, so exporting here
# is enough. Setting it in the Playwright process (as the run command does) is
# NOT — the redirect is computed on the SERVER.
export NEXTAUTH_URL="${E2E_BASE_URL:-http://localhost:3737}"

pkill -f "next dev" 2>/dev/null
sleep 1
exec bun run dev
