# Handoff

## State
Session 2026-05-15 COMPLETE. 5 commits on `main` (`494079a`..`2b6b638`). 235 suites, 4608 tests, 51 migrations. Build green. GDPR Sprint Phase 1 (S2/S3/S4) fully implemented.

## Next
1. **HIGH Domain Expert:** G9 (ContactDeleted no CRM logger, 30min), G10 (0 CRM fixtures, ½ day), G7 (8 hardcoded English strings, 30min). See `docs/open-items-2026-05-13.md`.
2. **S2 UX Polish:** `~/s2-ux-polish-session.md` — 19 features, 52+ components.
3. **Allium V3 Overhaul:** `notification-dispatch.allium` (160 errors), `scheduler-coordination.allium` (97 errors). 1-2h with `/allium:tend`.

## Context
- Session 2026-05-13: Sprint C + IF-2/5/6/7/8 + 2× comprehensive review (32 findings, all fixed). 14 commits (`0b186e5`..`9532b96`), 231 suites, 4569 tests.
- IF-2: 29 Zod schemas with `satisfies z.ZodType<X>`, 20 consumer casts→safeParsePayload, 7 typed emits, EventPayloadSchemas registry.
- S1 (this session): Migration `20260513170926_s1_account_deletion_cascades` adds Cascade to all 37 User FKs. `deleteAccount()` in `src/actions/account.actions.ts` uses explicit delete order (resume chain → automations → jobs → user) to handle cross-model Restrict FKs. UI in `AccountDeletionSettings.tsx` with typed "DELETE" confirmation.
- Flashlight found Job→Company/JobTitle Restrict ordering risk — fixed by explicit `tx.job.deleteMany()` before `tx.user.delete()`.
- Allium specs NOT updated — pre-existing V3 parse errors: `notification-dispatch.allium` (160), `scheduler-coordination.allium` (97). Deferred, 1-2h with `/allium:tend`.
- Pre-existing: merge creates duplicate CrmTaskTarget/CrmNoteTarget rows, `e2e/CONVENTIONS.md` doesn't exist on disk.
- S2 (this session): `exportUserData()` in `src/lib/export/collect-user-data.ts` queries 28+ models with explicit select (encrypted excluded). ZIP via archiver (`src/app/api/users/export/route.ts`). Rate limit 1/h (`src/lib/export-rate-limit.ts`). metadata.json with GDPR Art. 15 fields. UI in `DataExportSettings.tsx`.
- S3 (this session): `isLocal` on AiManifest. `convertResumeToText()` strips Name/Email/Phone/Address → placeholders for cloud providers. `stripEmailPhonePatterns()` regex for job descriptions. TEXT_LIMITS activated. Fail-safe: strip by default.
- S4 (this session): `retention-cron.ts` with 7 rules daily 03:30. Notifications 30d, EnrichmentResult expired, EnrichmentLog 90d, StagedVacancy 30d multi-user, AdminAuditLog 365d archive, CrmActivityLog 1095d, LogoAsset orphans.
- Allium spec: `specs/gdpr-data-rights.allium` — 9 rules, 3 invariants, 3 open questions.
