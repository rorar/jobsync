# ADR-036: Per-user custom JobStatus with a fixed set of stage kinds

**Status:** Accepted
**Date:** 2026-06-13
**Context:** Welle 4 (Custom JobStatus XL — F-AJ-09, F-AJ-02, F-AJ-03)

## Context

The original `JobStatus` was a **global, system-seeded entity with a closed value
set** (`draft`/`applied`/`interview`/…) and a hardcoded `value → value` transition
matrix (`VALID_TRANSITIONS` in `status-machine.ts`). Users could not rename, add,
recolour or reorder statuses, and the Kanban derived its columns/colours/collapse
from hardcoded arrays (`STATUS_ORDER`, `STATUS_COLORS`, `COLLAPSED_BY_DEFAULT`).

Welle 4 makes statuses **user-customisable**. The core tension: arbitrary custom
statuses break every place that matched a status by a hardcoded value string
(applied-flag derivation, terminal-ness, transition validity, Kanban colour,
dashboard funnel, status-history colour). A fully free-form model (user-defined
categories with user-defined semantics) would make those guarantees impossible to
keep sound.

## Decision

**JobStatus becomes a per-user entity; its workflow semantics come from a FIXED set
of seven system "stage kinds", not from the status value.**

1. **Per-user `JobStatus`** (`@@unique([userId, value])`) + a new per-user
   `JobStatusCategory` (`@@unique([userId, kind])`). Each status belongs to exactly
   one category ("stage"). Users control a status' `label`, `value` (machine key,
   never renamed/shown), `sort_order`, `is_default`, and its category assignment;
   and a category's `label`/`colour`/`sort_order` presentation.

2. **Seven FIXED `StatusCategoryKind`s** — `lead | applied | interviewing | offer |
   won | lost | archived` — are the **semantic backbone**. Each kind carries
   immutable flags (`is_applied_stage`, `is_terminal`, `default_collapsed`,
   `allows_self_transition`) that are a pure function of the kind
   (`SemanticsMatchKind`). Users do NOT create kinds; they create statuses and
   assign each to a kind. This keeps applied/terminal/transition semantics sound
   across arbitrary custom statuses.

3. **Category-ordered transitions** replace the value matrix. Validity =
   forward/lateral (target stage `sort_order >= source`) OR a **bounded reopen**
   from a closed stage (`won`/`lost`/`archived`) into the default `lead` stage only.
   This is more permissive on forward jumps (e.g. `lead → won` is allowed) and
   tighter on reopen than the old matrix — intentional. Implemented as a DB-free
   leaf (`status-categories.ts` + `status-transition.ts`) consumed by every Job
   write path (server actions + public API).

4. **Applied flag is stored, derived from the stage** (`is_applied_stage`), not a
   value match. Set on first entry into any applied stage; `applied_date` is
   immutable thereafter and is never cleared by a later move out of an applied
   stage. The job form folds the former separate "applied" toggle into status
   selection (F-AJ-02): choosing an applied-stage status drives `applied`.

5. **Everything derives from the stage** — Kanban columns (ordered by
   `category.sort_order` then `status.sort_order`), colour (per-stage, via the
   `--stage-color` CSS custom property keyed by a finite colour-token name, never
   a per-value Tailwind map), default-collapse, the dashboard funnel (aggregated
   per progression kind), and status-history colour all read `category.kind`/
   `category.colour`. No code matches a status by a hardcoded value string.

## Alternatives considered

- **Keep the global enum + a per-user label override.** Rejected: doesn't let users
  add/remove statuses, and the transition matrix stays value-keyed.
- **Fully user-defined categories (user sets kinds + semantics).** Rejected for this
  wave: would require per-category applied/terminal/transition definitions and a
  far larger UI. Parked as an open question in `specs/job-status.allium`.
- **Per-status colour.** Rejected: colour is per-stage to match the Kanban-column
  mental model and avoid a per-row colour picker. A future presentation-only
  enhancement; needs no domain-model change.
- **Free (unvalidated) transitions / reopen-to-any-earlier-stage.** Rejected: drops
  the audit-relevant workflow guard. Bounded reopen keeps it while supporting custom
  stages.

## Consequences

- **Soundness preserved:** applied/terminal/Kanban semantics hold for any custom
  status because they read the fixed kind, not the value.
- **Migration:** a forward-only 3-step migration repoints all jobs + both history FK
  columns onto per-user statuses, backfills `applied`/`appliedDate` by stage, and
  drops the global rows (see `MigrateLegacyStatusesToPerUser`). `draft`/`saved`/`new`
  collapse to `bookmarked` (lead).
- **Dead code removed:** `status-machine.ts` + `validate-edit-transition.ts` (the
  value-keyed machine) are deleted.
- **~~Known limitation~~ (RESOLVED 2026-06-13):** the `allows_self_transition` flag
  (multi-round interviewing as a SAME-status re-selection) is now wired. `TransitionOptions`
  (`sameStatus`) is threaded through `isValidCategoryTransitionByKind` and the four status sites
  (`changeJobStatus`/`updateJob`/`updateKanbanOrder` + `api/v1/jobs/[id]/status`): re-selecting the
  current status on a self-transition stage (interviewing) logs a new round (history + event); every
  other stage's same-status re-selection stays a benign no-op. Moving between DIFFERENT statuses in
  the same stage (lateral) was already supported. The edit-form path is gated behind an explicit
  `logInterviewRound` toggle (shown only when re-selecting the current interviewing status) so an
  unrelated field edit never logs a phantom round; the dedicated status changer + public API carry
  intent inherently. See BACKLOG §Welle 4 for the full live-trigger list.

**Spec:** `specs/job-status.allium` (authoritative). `allium check` 0 errors,
`allium:weed` 0 drift.
