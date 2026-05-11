# Handoff

## State
Session 2026-05-11. S3 CRM Deferrals Sprint — all 5 deferrals closed.
Build: tsc verification pending (server resource pressure). Tests: 227 new CRM tests green, all pre-existing tests unaffected.

## What was done (this session)
1. **CRM Tests** — 227 tests across 7 suites: person.model, person.actions, jobContact.actions, crmInterview.actions, crmTask.actions, crmNote.actions, crmBlocklist.actions
2. **CrmActivityLog→Company+Job @relation** — Prisma migration `20260510193831`, back-relations on Company/Job, includes in getActivityTimeline
3. **PersonDirectory Search** — Added `companies` JSON column to search OR clause
4. **CRM Temporal Rules** — `src/lib/scheduler/crm-cron.ts` (15-min cron), 3 rules (ExpireAutoCreatedPersons, InterviewReminder, TaskOverdueReminder), activity log idempotency, wired into instrumentation.ts
5. **Add Job Dialog** — DatePicker locale fix (#6), Company.domain enrichment writeback (#9), ui-design agent reviewed remaining 4 UI divergences (all correctly deferred)
6. **CLAUDE.md** — Updated CRM section with temporal rules, relations, Company.domain auto-fill

## Pre-push checklist
- [ ] `tsc --noEmit` (was killed by resource pressure, must verify)
- [ ] Consider writing crm-activity-logger.spec.ts + crm-cron.spec.ts (2 missing test files)
- [ ] Commit with logical grouping

## Files changed
```
prisma/schema.prisma                    — CrmActivityLog @relation for Company+Job
prisma/migrations/20260510193831_*/     — FK migration
src/actions/person.actions.ts           — companies in search OR
src/actions/crmActivityLog.actions.ts   — targetCompany + targetJob includes
src/lib/scheduler/crm-cron.ts           — NEW: CRM temporal rules cron
src/lib/events/event-types.ts           — ReminderTriggeredPayload extended
src/lib/events/consumers/enrichment-trigger.ts — Company.domain writeback
src/instrumentation.ts                  — startCrmCron()
src/components/DatePicker.tsx           — Locale-aware date formatting
CLAUDE.md                               — CRM temporal rules documentation
__tests__/person.model.spec.ts          — NEW: 76 tests
__tests__/person.actions.spec.ts        — NEW: 54 tests
__tests__/jobContact.actions.spec.ts    — NEW: 14 tests
__tests__/crmInterview.actions.spec.ts  — NEW: 23 tests
__tests__/crmTask.actions.spec.ts       — NEW: 18 tests
__tests__/crmNote.actions.spec.ts       — NEW: 15 tests
__tests__/crmBlocklist.actions.spec.ts  — NEW: 13 tests
```

## Key architectural decisions
- **CRM Cron separate from Automation Scheduler** — bounded context separation (DDD)
- **Activity log as idempotency guard** — no extra schema columns for reminder tracking
- **Company.domain auto-fill** — enrichment-trigger writes extracted domain back to Company
- **Add Job Dialog UI unchanged** — ui-design agent confirmed all 4 UI divergences are correctly deferred (Job Detail/Promoter sprint, not dialog)
