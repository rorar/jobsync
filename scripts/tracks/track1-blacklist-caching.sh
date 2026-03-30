#!/usr/bin/env bash
# Track 1: Company Blacklist (C3) → Response Caching Stufe 1 (C4)
# Sequential within track because both modify runner.ts
#
# Usage: bash scripts/tracks/track1-blacklist-caching.sh [worktree_path]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/track-runner.sh"

WORKTREE="${1:-$(pwd)}"
LOG_FILE="${2:-$WORKTREE/../track1-blacklist-caching.log}"

PROMPT="$(cat <<'PROMPT'
You are working on Sprint C Track 1 for the JobSync project.
Read CLAUDE.md and the project memories first.

## Context
ROADMAP 0.10 (Scheduler Coordination) + Sprint A + Sprint B are DONE (on main).
You are on a feature branch. All prior work is merged into your branch base.

Read the masterplan at /home/pascal/.claude/plans/open-architecture-masterplan.md for full context.

## Your Track: C3 (Company Blacklist) → C4 (Response Caching Stufe 1)

### C3: Company Blacklist (ROADMAP 2.15)
Implement company blacklisting:
1. Prisma model: CompanyBlacklist (userId, pattern, matchType, reason)
2. Server actions: CRUD + isBlacklisted() check
3. Runner integration: filter blacklisted companies BEFORE saving StagedVacancy
4. Settings UI: BlacklistSettings component with add/remove/list
5. Quick-blacklist action on StagedVacancyCard dropdown
6. i18n: all strings in 4 locales (en, de, fr, es)
7. Tests: unit + component tests
8. Allium spec: extend vacancy-pipeline.allium with blacklist rules

### C4: Response Caching Stufe 1 (ROADMAP 0.9)
After C3 is done, implement in-memory caching:
1. Cache layer: src/lib/connector/cache.ts (LRU with TTL)
2. Manifest extension: cachePolicy on ModuleManifest
3. Runner integration: use RunOptions.bypassCache (scheduler=true, manual=false)
4. HTTP cache headers on /api/esco/* and /api/eures/* proxy routes
5. Cache-Key strategy: {module}:{operation}:{params}:{locale}
6. Tests for cache hit/miss/TTL/bypass
7. Read ROADMAP section 0.9 for full spec

## Process Requirements
- After EACH feature: run /comprehensive-review:full-review
- After each step: blind spot check "Woran haben wir nicht gedacht?"
- Fix ALL findings autonomously
- Use /full-stack-orchestration:full-stack-feature for implementation
- Commit with logical grouping, conventional commits
- All UI strings in 4 locales
- Tests required for all new code

## CRITICAL: Parallel Track Safety Rules
- i18n: Create NEW file src/i18n/dictionaries/blacklist.ts for ALL blacklist keys. Do NOT add keys to automations.ts or staging.ts.
- Prisma: Modify schema.prisma but do NOT run prisma migrate dev. Migration runs on main after merge.
- Dependencies: If adding npm packages (e.g., lru-cache), run bun add and commit package.json + bun.lockb.
- StagingContainer: You may add an onBlockCompany callback prop but do NOT restructure the component layout (Track 2 does that).

## File Ownership (this track only)
- prisma/schema.prisma (CompanyBlacklist model + CacheEntry if needed)
- src/actions/companyBlacklist.actions.ts (NEW)
- src/models/companyBlacklist.model.ts (NEW)
- src/lib/connector/job-discovery/runner.ts (blacklist filter + bypassCache usage)
- src/lib/connector/cache.ts (NEW)
- src/lib/connector/manifest.ts (cachePolicy extension)
- src/components/settings/CompanyBlacklistSettings.tsx (NEW)
- src/components/staging/StagedVacancyCard.tsx (add "Block company" action)
- src/i18n/dictionaries/blacklist.ts (NEW — own namespace, no conflicts)
- src/app/api/esco/* and src/app/api/eures/* (cache headers)
- DO NOT modify: src/lib/scheduler/*, src/hooks/*, src/components/scheduler/*, src/i18n/dictionaries/automations.ts
PROMPT
)"

run_track "$WORKTREE" "$PROMPT" "$LOG_FILE"
