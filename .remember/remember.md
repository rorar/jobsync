# Handoff

## State
Completed PERF-3: DispatchContext refactoring. Commit `44340d4`. All channel infrastructure pre-fetched in 6 parallel Prisma queries instead of 11-13 sequential. isAvailable() removed from NotificationChannel interface. 220 test suites, 4215 tests green, build clean.

## Next
1. Write `specs/crm.allium` — JobSync's OWN CRM spec using all 4 reference specs as input (step 1 in `project_crm_planning.md`)
2. S2 (UX Journeys) + S3 (CRM Core) staged prompts still open
3. PERF-4 (SMTP connection pooling) — now benefits from DispatchContext (ctx.smtp delivered once)

## Context
- `invalidateAvailability()` is now a no-op — method signature kept for action file callers
- `resolveVapidSubject()` still exists in `src/lib/push/vapid.ts` — used by `sendTestPush()` which operates outside the dispatch pipeline
- enforced-writer has optional `locale` param — degradation.ts still self-resolves (no DispatchContext available there)
- Allium spec updated with DispatchContext value type + ContextPerDispatch + ChannelContextIsolation invariants
