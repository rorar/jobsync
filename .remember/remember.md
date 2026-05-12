# Handoff

## State
S3 CRM fully done across 2 sessions (2026-05-10 + 2026-05-12). All pushed to `main`. 265 CRM tests green, tsc clean. 30+ CRM commits total. All deferred items documented in `~/.claude/projects/-home-pascal/memory/project_deferred_sprints_for_future_sessions.md`. Additionally: 9-agent domain expert analysis complete (3 rounds). 24+ findings (3 CRITICAL, 7 HIGH, 12+ MEDIUM). Full report: `docs/session-2026-05-12-domain-expert-analysis.md`. Domain mapping: `.domain-experts/domains.json`. No code changes from analysis — analysis only session. GDPR audit completed (8 domains, 60 checks, 22 FAIL / 20 PARTIAL / 13 PASS). Report: `docs/gdpr-audit-report.md`.

## Next
1. **P0 CRITICAL fixes:** G1 (4 status-change paths bypass event bus — `updateJob` L429, API v1 status, API v1 POST /jobs, `promoter.ts` L158), G2 (anonymizePerson GDPR — add `crmInterview.updateMany` to transaction in `person.actions.ts:363` + scrub `CrmActivityLog.details`/`linkedRecordName`), G2b (AI degradation bypass — wire `handleAuthFailure` into `openai/index.ts:35` + `deepseek/index.ts:35`), Env-var startup checks in `instrumentation.ts` (ENCRYPTION_KEY, AUTH_SECRET, ADMIN_USER_IDS)
2. **P1 Quick wins:** G5 (`discoveryStatus`→`status === "staged"` in `[id]/page.tsx:222` + DiscoveredJob cast → `StagedVacancyWithAutomation[]`), G8 (add `logo_dev` to `apiKey.model.ts` + `apiKey.schema.ts`), deleteJobById test (add `jobContact: { deleteMany: jest.fn() }` to mock + `$transaction` impl), extractDomain Unicode (`.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` in `domain-extractor.ts:26-27`), retention_expired semantics (10 files, 30 min), 2 missing i18n keys (`crm.errors.companyNotFound`, `crm.errors.multiplePrimaryCompanies`), CRM cleanup in `e2e/cleanup-stale-data.ts` (8 new steps after Step 3)
3. **Quick fixes from prior session (~30 min total):** crm-cron.ts globalThis guard + Promise.allSettled, ROADMAP 5.4+5.9 text, `retention_expired` own NotificationType
4. **GDPR Sprint (from audit):** S1 Account Deletion (31 FK cascades + deleteAccount action), S2 Data Export/DSAR, S3 Strip PII from AI prompts, S5 Fix anonymizePerson 6 cascade gaps. See `docs/gdpr-audit-report.md` Priority Fix Roadmap.
5. **S2 UX Polish:** Prompt at `~/s2-ux-polish-session.md` — 19 features, 52+ components, zero-tolerance UX audit
6. **Schnittstellen-Analyse:** Respawne Domain Experts mit domains.json, sende Interface-Fragility-Query an alle 9. Nicht in dieser Session gemacht.
7. Full open items list: `docs/session-2026-05-12-open-items.md` (23 items, categorized)
8. Next session prompt: `docs/next-session-prompt.md`

## Context
- Domain Expert Pattern: 9 named agents cover full codebase. Setup in `project_domain_expert_pattern.md`. Domain mapping reusable via `.domain-experts/domains.json` (respawn with drift-check).
- GDPR cascade gaps: `CrmInterview.personId` not detached + `CrmActivityLog.details`/`linkedRecordName` may retain person names
- Merge creates duplicate CrmTaskTarget/CrmNoteTarget rows (no dedup check)
- CRM E2E cleanup order: ActivityLog→JobContact→CrmInterview→CrmNote→CrmTask→Person→CrmBlocklist→ConnectedAccount (insert after existing Step 3, before Step 4). `CrmInterview` has NO onDelete:Cascade → blocks Job deletion.
- 7 hardcoded English strings in CRM UI (InterviewsPageClient 4x, CrmTasksPageClient 1x, PersonDetailClient 2x incl "GDPR" CardTitle)
- 21 dead/pre-provisioned i18n keys in crm.ts (blocklist UI 9, notes CRUD 7, merge UI 3, misc 2)
- Env-var startup: AUTH_SECRET only Docker, ENCRYPTION_KEY never, ADMIN_USER_IDS never. Fix: `instrumentation.ts`
- `retention_expired` fix touches 10 files. `follow_up_due` reason: dead code in type union
- Consumer tests: use real eventBus + mocked Prisma (pattern from `degradation-coordinator.spec.ts`). Cron tests need real SQLite.
- `crm-cron.ts` direct ActivityLog writes stay (idempotency guards) — only action-file writes use consumer.
- 1 pre-existing test failure: `job.actions.spec.ts` deleteJobById — mock missing `jobContact` + `$transaction` impl.
- `e2e/CONVENTIONS.md` referenced in CLAUDE.md but doesn't exist on disk.
- API v1 DELETE route deletes interviews, internal `deleteJobById` deletes jobContacts — divergent cascades (G23).
- Server resource-sensitive: stop dev server before builds/tsc, single-worker tests.
