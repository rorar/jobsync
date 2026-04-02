# Review Scope

## Target

Comprehensive 5-dimension review of all Sprint A+B+C code (34 files, ~7465 lines). Session S1b of the staged sprint verification process.

## Files

### Sprint A (Architecture Debt — 10 files)
- `src/app/dashboard/automations/[id]/page.tsx` (514 lines)
- `src/components/automations/RunStatusBadge.tsx` (73 lines)
- `src/i18n/dictionaries/automations.ts` (1498 lines)
- `src/lib/connector/degradation.ts` (281 lines)
- `src/lib/constants.ts` (132 lines)
- `src/lib/events/consumers/degradation-coordinator.ts` (20 lines)
- `src/lib/events/consumers/index.ts` (29 lines)
- `src/lib/events/event-types.ts` (198 lines)
- `src/lib/scheduler/run-coordinator.ts` (434 lines)
- `src/lib/scheduler/types.ts` (101 lines)

### Sprint B (UX/UI Gaps — 8 files)
- `src/components/scheduler/SchedulerStatusBar.tsx` (151 lines)
- `src/components/scheduler/RunProgressPanel.tsx` (159 lines)
- `src/components/staging/StagingContainer.tsx` (496 lines)
- `src/components/automations/AutomationList.tsx` (328 lines)
- `src/components/automations/ModuleBusyBanner.tsx` (42 lines)
- `src/components/automations/RunHistoryList.tsx` (170 lines)
- `src/app/api/scheduler/status/route.ts` (128 lines)
- `src/hooks/use-scheduler-status.ts` (197 lines)

### Sprint C Track 1 (Blacklist + Caching — 3 files)
- `src/actions/companyBlacklist.actions.ts` (134 lines)
- `src/components/settings/CompanyBlacklistSettings.tsx` (189 lines)
- `src/lib/connector/cache.ts` (295 lines)

### Sprint C Track 2 (JobDeck — 3 files)
- `src/components/staging/DeckCard.tsx` (192 lines)
- `src/components/staging/DeckView.tsx` (313 lines)
- `src/components/staging/ViewModeToggle.tsx` (67 lines)

### Sprint C Track 3 (Public API — 10 files)
- `src/lib/api/auth.ts` (93 lines)
- `src/lib/api/rate-limit.ts` (122 lines)
- `src/lib/api/response.ts` (152 lines)
- `src/lib/api/with-api-auth.ts` (116 lines)
- `src/lib/api/schemas.ts` (45 lines)
- `src/app/api/v1/jobs/route.ts` (220 lines)
- `src/app/api/v1/jobs/[id]/route.ts` (202 lines)
- `src/app/api/v1/jobs/[id]/notes/route.ts` (88 lines)
- `src/actions/publicApiKey.actions.ts` (187 lines)
- `src/components/settings/PublicApiKeySettings.tsx` (449 lines)

## Flags

- Security Focus: yes (ADR-015 IDOR, ADR-019 "use server", rate limiting)
- Performance Critical: yes (unbounded queries, N+1, caching)
- Strict Mode: yes (zero tolerance policy)
- Framework: Next.js 15 + Prisma + Shadcn UI

## Key Security Rules (from CLAUDE.md + ADRs)

- All Prisma reads/writes MUST include userId in where clause (IDOR — ADR-015)
- Functions accepting raw userId MUST NOT be in "use server" files (ADR-019)
- ALL /api/v1/* routes MUST use withApiAuth() wrapper
- File.filePath never in responses
- Error sanitization: 500 errors return generic message
- UUID validation on all route params
- Pre-auth IP rate limiting before API key validation (ADR-019)

## Review Dimensions

1. Architecture — Aggregate boundaries, DDD patterns, ACL compliance, event structure
2. Security — IDOR ownership, "use server" exports, rate limiting, credential handling
3. Performance — Unbounded queries, N+1, caching effectiveness, memory leaks
4. Testing — Missing tests, untested edge cases, test quality
5. Best Practices — TypeScript strictness, error handling, code quality, naming
