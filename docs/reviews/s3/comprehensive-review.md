# S3 Comprehensive Code Review: CRM Core Implementation

**Date:** 2026-04-02
**Reviewer:** Claude Opus 4.6 (automated)
**Scope:** CRM Core (Status Machine, Kanban Board, Server Actions, Domain Events)

## Summary

The CRM Core implementation is structurally sound. The state machine is clean and well-specified, the server actions respect IDOR ownership, domain events are properly typed, and the Kanban UI has good accessibility foundations. The biggest issues are (1) a duplicated and divergent state machine between server and client, (2) missing `revalidatePath` calls in the new CRM actions, and (3) the `getStatusList` action lacking a userId filter on the shared `JobStatus` table.

**Findings:** 3 HIGH, 9 MEDIUM, 7 LOW

---

## Findings Table

| ID | Severity | Dimension | File:Line | Finding | Suggested Fix |
|----|----------|-----------|-----------|---------|---------------|
| CR-01 | **HIGH** | Architecture | `src/hooks/useKanbanState.ts:45-54` vs `src/lib/crm/status-machine.ts:22-33` | **Duplicated and divergent state machine.** `VALID_TRANSITIONS` is defined in both `status-machine.ts` (server source of truth) and `useKanbanState.ts` (client). The client copy differs: it includes `draft` with only `["applied", "archived"]` (missing `"rejected"`), while the server has `draft: ["applied", "archived", "rejected"]`. It also omits the `saved` legacy alias entirely. This means the client will allow drops that the server rejects (or vice versa for `draft -> rejected`), causing confusing error toasts. | Remove `VALID_TRANSITIONS` and `isValidTransition` from `useKanbanState.ts`. Instead, import from `@/lib/crm/status-machine` (that file has no server-only imports, so it is safe for client components). The `KanbanBoard.tsx` already imports `isValidTransition` from `useKanbanState` -- change the import source. |
| CR-02 | **HIGH** | Architecture | `src/hooks/useKanbanState.ts:14-23` vs `src/lib/crm/status-machine.ts:94-102` | **Duplicated and divergent STATUS_ORDER.** The client hook includes `"draft"` in position 2 (`["bookmarked", "draft", "applied", ...]`), while the server omits `"draft"` entirely. This means the Kanban Board may render a "draft" column that the server `getKanbanBoard` never populates, or the column ordering may differ depending on which constant is used. | Single source of truth: import `STATUS_ORDER` from `status-machine.ts` in both server and client. If `draft` columns should appear, add it to the server constant; otherwise remove it from the client. |
| CR-03 | **HIGH** | Security | `src/actions/job.actions.ts:14-26` | **`getStatusList` has no userId filter.** `prisma.jobStatus.findMany()` is called without any `where` clause. While `JobStatus` is a global lookup table (not user-scoped), this is the only action in the file that queries without userId. If JobStatus ever becomes user-scoped, this is a latent IDOR. More importantly, the action authenticates but never uses `user` -- dead code. Either remove the auth check (if truly public data) or add a comment explaining the design rationale. | Add a comment `// JobStatus is a system-wide lookup table, not user-scoped -- no userId filter needed`. Alternatively, if the auth check is intentional access gating, keep it but remove the unused `user` binding. |
| CR-04 | MEDIUM | Architecture | `src/actions/job.actions.ts:608-700`, `788-899` | **No `revalidatePath` after CRM mutations.** Both `changeJobStatus` and `updateKanbanOrder` modify the database but never call `revalidatePath`. The import is present on line 9 but commented out on line 415. Since the Kanban Board is client-side with manual refresh (`onRefresh`), this works today, but any server component that reads job data (dashboard stats, etc.) will show stale data after a status change until the next full navigation. | Add `revalidatePath("/dashboard/myjobs", "page")` and `revalidatePath("/dashboard", "page")` after successful mutations in `changeJobStatus` and `updateKanbanOrder`. |
| CR-05 | MEDIUM | Architecture | `src/hooks/useKanbanState.ts:26-42` vs `src/lib/crm/status-machine.ts:71-82` | **Duplicated STATUS_COLORS with different shapes.** `status-machine.ts` has simple string values (`"blue"`, `"red"`), while `useKanbanState.ts` has rich objects with `bg`, `border`, `text`, `darkBg`, `darkBorder`, `headerBg` Tailwind classes. These are two different things serving different purposes, but sharing the same name creates confusion. The `KanbanCard.tsx` imports `STATUS_COLORS` from the hook (line 10), and `StatusTransitionDialog.tsx` also imports from the hook (line 18). | Rename the server-side map to `STATUS_COLOR_NAMES` (simple identifiers) and keep the client-side `STATUS_COLORS` as-is for Tailwind classes, OR consolidate into one location. |
| CR-06 | MEDIUM | Security | `src/components/kanban/KanbanBoard.tsx:223-227` | **Undo bypasses state machine validation on the client.** The undo handler calls `changeJobStatus(job.id, fromStatus.id)` to reverse a transition. While the server validates this, the undo path does NOT check `isValidTransition` on the client before calling. If the original transition was `archived -> bookmarked`, the undo would be `bookmarked -> archived` which IS valid. But for `rejected -> bookmarked`, the undo would be `bookmarked -> rejected` which IS valid. However, for `interview -> interview` (self-transition), the undo would also be `interview -> interview` which IS valid. This appears safe for now because the server validates, but the UX is fragile -- the user sees no error feedback if the undo itself is an invalid reverse transition (the toast says "undo failed" generically). | No code fix strictly needed since the server validates. However, consider disabling the undo button for transitions where the reverse is not valid, or showing a more specific error message. |
| CR-07 | MEDIUM | Performance | `src/actions/job.actions.ts:707-781` | **`getKanbanBoard` fetches ALL user jobs unbounded.** There is no LIMIT on the `findMany` at line 718. A user with 10,000 jobs will load all of them into memory at once. This is acceptable in early stages but will degrade as users accumulate jobs. | Add a reasonable limit (e.g., 500 jobs) or paginate by status. Consider filtering out `archived` jobs by default (they are collapsed anyway). |
| CR-08 | MEDIUM | Performance | `src/actions/job.actions.ts:956-991` | **`getStatusDistribution` makes 2 queries when 1 suffices.** It calls `job.groupBy` then `jobStatus.findMany` separately. The status labels could be fetched in a single raw query or by joining. For SQLite this is minor, but the pattern is suboptimal. | Acceptable as-is for SQLite. For PostgreSQL migration, refactor to a single query with join. |
| CR-09 | MEDIUM | Architecture | `src/actions/job.actions.ts:996-1025` | **`getValidTransitions` uses dynamic import unnecessarily.** Line 1013: `const { getValidTargets } = await import("@/lib/crm/status-machine");` -- but `isValidTransition` from the same module is already statically imported at line 11. This looks like a leftover from an earlier iteration. | Replace with static import. `getValidTargets` is already available since `status-machine.ts` is imported at the top of the file (though only `isValidTransition`, `computeTransitionSideEffects`, `STATUS_ORDER`, `COLLAPSED_BY_DEFAULT` are imported). Add `getValidTargets` to the existing import at line 11. |
| CR-10 | MEDIUM | Best Practices | `src/components/kanban/StatusTransitionDialog.tsx:92-100` | **No max-length on transition note textarea.** The `<Textarea>` has no `maxLength` attribute. A user could submit an arbitrarily long note string. The server does not validate note length either -- it passes `note ?? null` directly to Prisma. The `note` column in the schema is `String?` which in SQLite is unbounded. | Add `maxLength={500}` to the Textarea and server-side validation in `changeJobStatus`: `if (note && note.length > 500) return error`. |
| CR-11 | MEDIUM | Best Practices | `src/components/kanban/KanbanColumn.tsx:108-112` | **Incorrect ARIA roles.** The card list container uses `role="listbox"` but the children (`KanbanCard`) do not have `role="option"`. A `listbox` requires `option` children per WAI-ARIA spec. Since the cards are sortable/draggable items, `role="list"` with `role="listitem"` would be more appropriate, or remove the role entirely since dnd-kit manages its own ARIA. | Change `role="listbox"` to `role="list"` and add `role="listitem"` to the card wrapper in `KanbanCard`, or remove the explicit role and let dnd-kit handle ARIA semantics. |
| CR-12 | MEDIUM | Testing | `e2e/crud/kanban.spec.ts:59-62` | **E2E test uses `waitForTimeout` instead of assertions.** Line 59: `await page.waitForTimeout(1000)` after creating a job. This is a flaky pattern. The Playwright conventions file (`e2e/CONVENTIONS.md`) likely warns against this. | Replace with `await expectToast(page, /created/i)` or `await page.waitForSelector(...)` for the specific DOM change. |
| CR-13 | LOW | Architecture | `src/actions/job.actions.ts:554-601` | **Interface types defined in action file.** `KanbanColumn`, `KanbanJob`, `KanbanBoard`, `StatusDistribution`, `StatusHistoryEntry` are defined inline in `job.actions.ts` (a `"use server"` file). While not a security issue (they are types, not exported functions), this clutters the aggregate repository. | Move these types to `src/models/kanban.model.ts` or `src/lib/crm/types.ts` and import them. |
| CR-14 | LOW | Best Practices | `src/components/kanban/KanbanBoard.tsx:59-66` vs `src/components/kanban/KanbanCard.tsx:62-66` | **String template class concatenation instead of `cn()`.** Both components build className strings with template literals and conditional expressions. The project has `cn()` from `@/lib/utils` which handles conditional classes more cleanly. | Refactor to use `cn()` for conditional Tailwind classes. |
| CR-15 | LOW | Best Practices | `src/hooks/useKanbanState.ts:165-176` | **`setUndoWithTimeout` has a stale closure risk.** The `undoState` dependency means each new undo state recreates the callback, which is correct, but the `clearTimeout` on line 168 accesses the previous `undoState` via closure. If React batches state updates, the timeout from a rapid double-transition could leak. Using a ref for the timeout would be more robust. | Store the timeout in a `useRef` instead of in the state object. |
| CR-16 | LOW | Best Practices | `src/components/kanban/KanbanBoard.tsx:212-216` | **Manual string interpolation for i18n.** Multiple places use `.replace("{from}", ...).replace("{to}", ...)` instead of a proper interpolation helper. This is error-prone and not type-safe. | Acceptable for now. If the project adds a proper interpolation function (e.g., via LinguiJS migration), refactor these call sites. |
| CR-17 | LOW | Testing | `e2e/crud/kanban.spec.ts:136-152` | **Transition dialog E2E test is effectively a no-op on desktop.** The test checks `if (viewport.width < 768)` and does nothing on desktop. Since Playwright defaults to a desktop viewport, this test always passes trivially. | Add a desktop-specific test that drag-and-drops a card between columns to trigger the transition dialog. |
| CR-18 | LOW | Best Practices | `src/components/kanban/KanbanEmptyState.tsx:15` | **Empty state has no description text.** The component only shows a title ("Add your first job to start tracking") but no descriptive paragraph. The i18n key `jobs.kanbanEmptyBoard` exists but could be supplemented with a subtitle explaining the Kanban board. | Minor UX polish -- add a subtitle like "Drag and drop jobs between columns to track your progress". |
| CR-19 | LOW | Architecture | `src/actions/job.actions.ts:423-473` | **Old `updateJobStatus` still exists alongside new `changeJobStatus`.** The old function does NOT validate transitions, does NOT create history entries, and does NOT emit domain events. `JobsContainer.tsx` line 170 still calls `updateJobStatus`. This means status changes from the table view bypass the state machine entirely. | This is likely intentional for backward compatibility during the transition, but should be migrated. All callers of `updateJobStatus` should switch to `changeJobStatus`, and `updateJobStatus` should be deprecated/removed. |

---

## Dimension Summaries

### 1. Architecture (DDD, Aggregate Boundaries)

**Verdict: Good with one structural flaw.**

- `JobStatusHistory` correctly lives within the Job Aggregate boundary -- it is created atomically inside a `$transaction` alongside the job update (lines 653-681).
- Server actions are properly scoped to `job.actions.ts` (the Job Aggregate repository).
- The `JobStatusChanged` domain event is properly typed via `EventPayloadMap` and published AFTER the transaction commits (eventual consistency pattern).
- The Kanban Board respects the view-over-data pattern -- it reads via `getKanbanBoard` and never directly mutates job state.
- **Structural flaw (CR-01, CR-02):** The state machine is duplicated between server and client with divergent values. This violates DRY and will cause client/server disagreements.

### 2. Security (IDOR, Ownership)

**Verdict: Solid.**

- All Prisma queries in the new CRM actions include `userId: user.id` in the `where` clause.
- `changeJobStatus` (line 620): `findFirst({ where: { id: jobId, userId: user.id } })` -- correct.
- `updateKanbanOrder` (line 801): Same pattern -- correct.
- `getJobStatusHistory` (line 916-918): Pre-flight ownership check before querying history -- correct.
- `getStatusDistribution` (line 963): `groupBy` with `where: { userId: user.id }` -- correct.
- All mutations re-check ownership inside the transaction (`where: { id: jobId, userId: user.id }`) -- defense in depth.
- No `"use server"` export issues -- all exported functions call `getCurrentUser()` first.

### 3. Performance

**Verdict: Acceptable for current scale, one concern for growth.**

- `getKanbanBoard` uses a single query for all jobs plus one query for statuses (2 total) -- no N+1.
- `getStatusDistribution` uses `groupBy` which is efficient.
- **Growth concern (CR-07):** The Kanban board loads ALL user jobs with no limit. For power users with thousands of jobs, this will degrade. The `@@index([userId, statusId, sortOrder])` index will help the query but not the transfer/rendering.
- The `sortOrder: Float` strategy with midpoint insertion works well for drag-and-drop reordering.

### 4. Testing

**Verdict: Good unit coverage, weak E2E coverage.**

- `status-machine.spec.ts`: Excellent coverage -- all valid transitions, all invalid transitions, self-transitions, legacy statuses, side effects. 20 test cases.
- `crm-actions.spec.ts`: Good coverage of all 6 new server actions, including auth checks, NOT_FOUND cases, invalid transitions, side effects, and event publishing. 15 test cases.
- `kanban.spec.ts` (E2E): Basic coverage -- view toggle, column display, view mode persistence, keyboard nav. However, no drag-and-drop E2E test and the transition dialog test (CR-17) is effectively a no-op on desktop.
- **Missing:** No component tests for `KanbanCard`, `KanbanColumn`, `StatusTransitionDialog`, or `useKanbanState` hook.

### 5. Best Practices

**Verdict: Good with minor issues.**

- TypeScript strictness: No `any` casts in the new code (the `any` casts are in pre-existing code like `JobsContainer.tsx` line 116).
- i18n completeness: All 4 locales (EN, DE, FR, ES) have complete translations for all Kanban-related keys (50+ keys per locale). Verified.
- Accessibility: Good foundations -- `role="region"` on board, `aria-label` on columns, `aria-hidden` on decorative icons, `focus-visible` ring styles on interactive elements, dnd-kit screen reader announcements, motion-reduce respecting `animate-pulse` and `transition-none`. One ARIA issue (CR-11).
- Dark mode: Properly handled via `dark:` variants in `STATUS_COLORS` and component classes.
- `motion-reduce`: Present on skeleton animations (line 309), drag overlay scale (line 64), and column transitions (line 75). Good coverage.

---

## Action Items (Priority Order)

1. **Fix CR-01 + CR-02 (HIGH):** Eliminate duplicated state machine from `useKanbanState.ts`. Import from `@/lib/crm/status-machine.ts`.
2. **Fix CR-03 (HIGH):** Add comment to `getStatusList` explaining why no userId filter, or remove dead auth code.
3. **Fix CR-19 (MEDIUM, deferred):** Plan migration from `updateJobStatus` to `changeJobStatus` in table view.
4. **Fix CR-04 (MEDIUM):** Add `revalidatePath` calls to CRM mutation actions.
5. **Fix CR-09 (MEDIUM):** Replace dynamic import with static import for `getValidTargets`.
6. **Fix CR-10 (MEDIUM):** Add max-length validation on transition notes.
7. **Fix CR-11 (MEDIUM):** Fix ARIA role mismatch in `KanbanColumn`.
8. **Fix CR-12 (MEDIUM):** Replace `waitForTimeout` in E2E test with proper assertions.
