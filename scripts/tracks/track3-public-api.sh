#!/usr/bin/env bash
# Track 3: Public API Foundation (C2) — REST API over existing server actions
#
# Usage: bash scripts/tracks/track3-public-api.sh [worktree_path]

set -euo pipefail
WORKTREE="${1:-$(pwd)}"
cd "$WORKTREE"

claude -p "$(cat <<'PROMPT'
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
This is an "Open Host Service" (DDD) — a deliberately designed API surface
that wraps the internal domain model for external consumers.

### Implementation Plan

1. **API Route Structure** (src/app/api/v1/):
   ```
   src/app/api/v1/
     jobs/
       route.ts          — GET (list), POST (create)
       [id]/route.ts     — GET, PATCH, DELETE
     automations/
       route.ts          — GET (list), POST (create)
       [id]/route.ts     — GET, PATCH, DELETE
       [id]/run/route.ts — POST (trigger run)
     staging/
       route.ts          — GET (list staged vacancies)
       [id]/route.ts     — GET, PATCH (promote/dismiss)
     profile/
       route.ts          — GET (current user profile)
   ```

2. **API Authentication** (API Key based):
   - Use existing ApiKey infrastructure from 0.4 Module Lifecycle
   - New middleware: `src/middleware.ts` extension for `/api/v1/*` routes
   - API Key in `Authorization: Bearer <key>` header OR `X-API-Key: <key>` header
   - Rate limiting per API key (separate from manual run rate limiter)

3. **Response Format** (consistent JSON envelope):
   ```json
   {
     "success": true,
     "data": { ... },
     "meta": { "total": 42, "page": 1, "perPage": 25 }
   }
   ```
   Error format:
   ```json
   {
     "success": false,
     "error": { "code": "NOT_FOUND", "message": "Job not found" }
   }
   ```

4. **Thin Route Handlers**:
   Each route handler is a thin wrapper over existing server actions:
   ```typescript
   // src/app/api/v1/jobs/route.ts
   import { getJobs } from "@/actions/job.actions";

   export async function GET(req: NextRequest) {
     const apiKey = validateApiKey(req);
     const result = await getJobs(apiKey.userId, params);
     return NextResponse.json({ success: true, data: result.data });
   }
   ```

5. **OpenAPI/Swagger Documentation**:
   - Auto-generate from Zod schemas (if available) or manual OpenAPI spec
   - Serve at /api/v1/docs (Swagger UI)
   - Or generate static docs

6. **API Key Management UI**:
   - Settings page section for managing API keys
   - Create/revoke keys
   - Show usage statistics

### Key Principles (from ROADMAP)
- Open Host Service: manually designed surface, NOT auto-generated from Prisma
- API Keys, not OAuth (simpler for self-hosted)
- Zod validation on all inputs
- Pagination on list endpoints
- Consistent error codes
- Rate limiting per key

## Process Requirements
- After EACH feature: run /comprehensive-review:full-review
- After each step: blind spot check
- Fix ALL findings autonomously
- Use /full-stack-orchestration:full-stack-feature for implementation
- Commit with logical grouping
- Security audit: OWASP API Top 10 specifically
- Tests: integration tests for each endpoint

## File Ownership (this track only)
- src/app/api/v1/ (NEW directory — all API routes)
- src/lib/api/ (NEW — API key validation, rate limiting, response helpers)
- src/middleware.ts (MODIFY — add /api/v1/* API key check)
- src/components/settings/ApiKeySettings.tsx (NEW or MODIFY existing)
- DO NOT modify: src/lib/scheduler/*, src/components/staging/*, src/hooks/*
PROMPT
)" --allowedTools "Edit,Write,Read,Bash,Glob,Grep,Agent"
