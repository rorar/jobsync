#!/usr/bin/env bash
# Track 3: Public API Foundation (C2) — REST API over existing server actions
#
# Usage: bash scripts/tracks/track3-public-api.sh [worktree_path]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/track-runner.sh"

WORKTREE="${1:-$(pwd)}"
LOG_FILE="${2:-$WORKTREE/../track3-public-api.log}"

PROMPT="$(cat <<'PROMPT'
You are working on Sprint C Track 3 for the JobSync project.
Read CLAUDE.md and the project memories first.

## Context
ROADMAP 0.10 (Scheduler Coordination) + Sprint A + Sprint B are DONE (on main).
You are on a feature branch. All prior work is merged into your branch base.

Read the masterplan at /home/pascal/.claude/plans/open-architecture-masterplan.md for full context.
Read ROADMAP section 7.1 "Public API (REST — Open Host Service)" for the full spec.

## Your Track: C2 — Public API Foundation (ROADMAP 7.1 Phase 1)

### Feature Description
REST API exposing JobSync's existing server actions as HTTP endpoints.
"Open Host Service" (DDD) — deliberately designed API surface wrapping the internal domain.

### Implementation Plan

1. **API Route Structure** (src/app/api/v1/):
   - jobs/: GET (list), POST (create), [id]/ GET, PATCH, DELETE
   - automations/: GET, POST, [id]/ GET, PATCH, DELETE, [id]/run POST
   - staging/: GET (list), [id]/ GET, PATCH (promote/dismiss)
   - profile/: GET (current user)

2. **API Authentication** (API Key):
   - Use existing ApiKey infrastructure from Module Lifecycle
   - Authorization: Bearer <key> OR X-API-Key: <key>
   - Rate limiting per API key

3. **Response Format**:
   - Success: { success: true, data: {...}, meta: { total, page, perPage } }
   - Error: { success: false, error: { code, message } }

4. **Thin Route Handlers** over existing server actions

5. **Input Validation** with Zod schemas

6. **API Key Management UI** in Settings

### Key Principles
- Open Host Service: manually designed, NOT auto-generated from Prisma
- API Keys, not OAuth
- Zod validation on all inputs
- Pagination on list endpoints
- Consistent error codes

## Process Requirements
- After EACH feature: run /comprehensive-review:full-review
- After each step: blind spot check
- Fix ALL findings autonomously
- Use /full-stack-orchestration:full-stack-feature for implementation
- Security audit: OWASP API Top 10
- Tests: integration tests for each endpoint

## File Ownership (this track only)
- src/app/api/v1/ (NEW directory — all routes)
- src/lib/api/ (NEW — key validation, rate limiting, response helpers)
- src/middleware.ts (MODIFY — add /api/v1/* key check)
- src/components/settings/ApiKeySettings.tsx (NEW or MODIFY)
- DO NOT modify: src/lib/scheduler/*, src/components/staging/*, src/hooks/*
PROMPT
)"

run_track "$WORKTREE" "$PROMPT" "$LOG_FILE"
