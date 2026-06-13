# Welle 4 — Design Review Findings (pre-Phase-2)

Consolidated from 3 analyses on `specs/job-status.allium` (2026-06-13): edge-case,
flashlight/blind-spot, UCD. Two load-bearing claims independently verified against code.
All resolved findings are now folded into the spec as rules/guidance/invariants. This
file is the Phase-2 worklist (file:line touchpoints the spec can't carry inline).

## Decisions taken (autonomous, recommended options)
- **Transitions:** category-ordered + **bounded reopen** (forward/lateral; reopen from a
  closed stage only into the default/`lead` stage). Not "reopen anywhere", not "free".
- **applied flag:** **stored + migration-backfill + recompute** on stage-change (not pure derivation).
- **Colour:** **per-stage** (category level). Per-status colour deferred.
- **UI term:** "stage" (not "category"). Status mgmt lives in **Settings → new "Statuses" section** + a Kanban "manage" entry point.

## Verified-real correctness gaps → Phase-2 MUST-FIX
1. **CRIT IDOR** — `jobStatus.findFirst({where:{id}})` no userId: `src/app/api/v1/jobs/[id]/status/route.ts:52`, `src/actions/job.actions.ts:891` (+ `:567` updateJob, `:1115` updateKanbanOrder, `:387` createJob). Add userId to every status lookup.
2. **CRIT FK RESTRICT** — `Job.statusId` + `JobStatusHistory.newStatusId` are ON DELETE RESTRICT (Prisma default required FK; `previousStatusId` SET NULL). DeleteUnused must also check no history `new_status` ref; reassign must repoint BOTH history FK cols + Job.statusId in one tx.
3. **CRIT signup seed** — `src/actions/auth.actions.ts:~58` global `jobStatus.upsert({where:{value}})` → rewrite to per-user seed (else new users get 0 statuses).
4. **CRIT default resolvers** — `src/lib/connector/job-discovery/promoter.ts:~421` + `reference-data.ts:~158` `getDefaultJobStatus()` user-blind, self-create global rows. Take+use userId.
5. **HIGH API default** — `src/app/api/v1/jobs/route.ts:130` + `src/lib/api/helpers.ts` resolveStatus `?? "draft"` → use user's is_default (draft retired).
6. **HIGH applied backfill** — migration must set applied=true for jobs whose new stage is_applied_stage (old logic missed offer/accepted), appliedDate from earliest applied history.
7. **HIGH semantic anchors via category.kind** — `src/lib/scheduler/retention-cron.ts:273` (`"rejected"`→kind=lost), `src/components/myjobs/JobDetails.tsx:107/113`, `MyJobsTable.tsx:134/140`, `src/components/dashboard/StatusFunnelWidget.tsx:26-50` (hardcoded 5-step funnel).
8. **HIGH hardcoded colour maps** — `src/hooks/useKanbanState.ts:91,228` STATUS_COLORS + `?? .draft` fallback; `src/components/crm/StatusHistoryTimeline.tsx:29-51` color switch; `KanbanCard.tsx:28`, `StatusTransitionDialog.tsx:59-60`, `KanbanBoard.tsx:75` `?? "draft"`. Replace with CSS-var from stage colour.
9. **HIGH DB constraints** — `@@unique([userId,value])` JobStatus, `@@unique([userId,kind])` JobStatusCategory; atomic SetDefault; seed upsert (race).
10. **MED migration ordering** — add userId col → seed → repoint ALL jobs+BOTH history cols ALL users → drop global value-unique → add composite unique + NOT NULL → drop global rows. PRAGMA defer_foreign_keys (cf. migration 20260513170926). Unmapped `"new"`→bookmarked. Forward-only + backup.

## Status-machine core (the obvious layer)
`src/lib/crm/status-machine.ts` (VALID_TRANSITIONS, STATUS_ORDER, STATUS_COLOR_NAMES, COLLAPSED_BY_DEFAULT, computeTransitionSideEffects), `src/lib/crm/validate-edit-transition.ts`, `prisma/schema.prisma` (JobStatus +userId/category/sortOrder/isDefault; new JobStatusCategory), `prisma/seed.ts`, `src/models/job.model.ts`.

## UCD (drives the UI build)
- C-1 stage-change silently flips applied/terminal → **impact warning** before confirm (now in RenameJobStatus guidance + recompute).
- Mgmt UI: reuse EnrichmentModuleSettings/WebhookSettings card patterns; BaseCombobox grouped-by-stage for picker; dnd-kit (already in KanbanBoard) for reorder + **up/down keyboard fallback**.
- F-AJ-02 applied-merge: group ComboBox by stage, surface "marks applied" inline, drop the separate `applied` Switch in AddJob (becomes derived/read-only), appliedDate overridable.
- Delete-in-use: jobs=0 → AlertDialog; jobs>0 → Dialog "Move N jobs and delete" + reassign ComboBox (reuse the picker).
- a11y: colour never sole differentiator; 44px targets; aria-live (carry EuresLanguageCombobox pattern).
- Soft cap ~12 statuses (config.soft_status_count_warning) + category-level Kanban collapse.
- `value` never shown in UI.

## Test/doc blast radius
`__tests__/validate-edit-transition.spec.ts` (30 hardcoded edges — keep as default-set regression OR parameterize), e2e `job-crud` (status-label selectors silently break — memory: jest doesn't run e2e/), StatusHistoryTimeline color asserts. i18n `getStatusLabel()` fallback already correct (custom labels → status.label), no change.

## Phase-2 migration plan (Step 2 — NEXT, destructive: verify on DB copy first)

Schema (`prisma/schema.prisma`) is **edited + `prisma validate` clean but NOT migrated**
(working tree, uncommitted): JobStatus gains userId/categoryId/sortOrder/isDefault +
`@@unique([userId,value])`; new JobStatusCategory model `@@unique([userId,kind])`;
User gains both relations. Old `value @unique` dropped. Required FKs can't go straight
onto existing rows → **3-step migration**:

1. **Migration A (additive/nullable, applies cleanly):** create JobStatusCategory; add
   JobStatus.userId(NULL)/categoryId(NULL)/sortOrder(default 0)/isDefault(default false);
   keep old `value @unique` for now.
2. **Data migration (TS, idempotent, TDD with mocked prisma — write logic first):**
   per user → upsert 7 categories (CATEGORY_SEED) + seed statuses (DEFAULT_STATUS_SEED,
   mapping existing global statuses by LEGACY_VALUE_TO_SEED_VALUE) → repoint jobs +
   BOTH JobStatusHistory FK cols → backfill applied/appliedDate (offer/won jobs).
   Idempotent on the repoint (repoint any job whose statusId ∉ user's set), independent
   of a categories-exist guard.
3. **Migration B (finalize):** drop global `value @unique`; add `@@unique([userId,value])`
   + `@@unique([userId,kind])`; set userId/categoryId NOT NULL; delete leftover global
   JobStatus rows (userId IS NULL) — AFTER all repoints (FK RESTRICT). PRAGMA
   defer_foreign_keys (cf. migration 20260513170926). Forward-only; backup first.

Verify the whole chain against a **copy of dev.db** before applying to the real one
(plan Task 2.5). Then Step 3 = `src/actions/jobStatus.actions.ts` (the Repository) +
the IDOR/seed/default-resolver fixes (gaps 1–5,7 above).

## Still-open (parked) questions
category-flag editability; user-creatable kinds. (per-status colour, free-transitions, expired-placement now RESOLVED in spec.)
