# Handoff

## State
Session 2026-05-12c: IF-3 + IF-4 + Quick Wins. 5 commits on `main`. tsc clean, 228 test suites, 4458 tests green.

## Next
1. **Remaining IF findings:** IF-2 (Zod event payloads), IF-5 (errorCode in actionToResponse), IF-6 (CompanyCreated from Promoter), IF-7 (shared NotificationType constant), IF-8 (webhook GDPR allowlist)
2. **GDPR Sprint:** S1 Account Deletion, S2 Data Export/DSAR, S3 Strip PII from AI prompts
3. **S2 UX Polish:** `~/s2-ux-polish-session.md`
4. **Allium spec gaps from weed:** crm.allium needs Job-deletion cascade rules for Interview, JobContact, TaskTarget, NoteTarget (findings #3-#6). job-aggregate.allium DeleteJob rule needs CRM cascade targets.

## Context
- IF-3 DONE: 2 migrations (`add_crm_cascade_deletes`, `fix_polymorphic_target_cascade`). CrmInterview/JobContact → Cascade, TaskTarget/NoteTarget → Cascade (join rows), ActivityLog → SetNull, StagedVacancy → SetNull.
- IF-4 DONE: degradation.ts routes through `channelRouter.route()` instead of direct Prisma writes. All 4 channels now receive degradation alerts. Removed from `check-notification-writers.sh` allowlist.
- Quick Wins DONE: `retention_expired` own NotificationType, 2 missing i18n keys added, 7 hardcoded strings replaced, 21 dead keys removed, ROADMAP 5.4/5.9 updated.
- `follow_up_due` is NOT dead code (confirmed: cron → event → dispatcher → notification chain is wired).
- deleteJobById + API v1 DELETE unified: both rely on DB cascades, no manual cleanup.
- E2E cleanup has 9 CRM steps added (defense-in-depth).
- Merge still creates duplicate CrmTaskTarget/CrmNoteTarget rows (no dedup check) — pre-existing.
- `e2e/CONVENTIONS.md` still referenced in CLAUDE.md but doesn't exist on disk.
