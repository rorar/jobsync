/**
 * Category-based transition wiring (Welle 4, F-AJ-09, Phase 3/5).
 *
 * Thin, DB-free adapters over the pure `status-categories` domain that the Job
 * aggregate's server actions call instead of the superseded value-keyed
 * `VALID_TRANSITIONS` / `isValidTransition` / `computeTransitionSideEffects`
 * machine (status-machine.ts). Validity and the applied side-effect now derive
 * from each status' CATEGORY kind, so a user-created custom status (whose `value`
 * is not in the old matrix) flows correctly.
 *
 * Both helpers take raw kind STRINGS (the DB stores `category.kind` as String)
 * and runtime-validate membership at the boundary (ADR-019) before use.
 *
 * Spec: specs/job-status.allium — rule TransitionJobStatus, CategoryOrderedTransition,
 * AppliedFlagDerivedFromCategory.
 */

import {
  categorySemanticsForKind,
  isStatusCategoryKind,
  isValidCategoryTransition,
  computeAppliedSideEffect,
  type AppliedSideEffect,
  type TransitionOptions,
} from "./status-categories";
import type { JobStatus } from "@/models/job.model";

/**
 * Is moving a job from a status in `fromKind` to a status in `toKind` a valid
 * transition? Forward/lateral by stage order, or bounded reopen from a closed
 * stage into the default (lead) stage. Unknown kinds are rejected (closed).
 *
 * `opts.sameStatus` signals the move re-selects the job's CURRENT status (not a
 * different one): then validity reduces to the stage's `allowsSelfTransition`
 * (interviewing multi-round, Welle 4 self-transition wiring) — see the domain
 * `isValidCategoryTransition`. Omit it for ordinary status-to-status moves.
 */
export function isValidCategoryTransitionByKind(
  fromKind: string,
  toKind: string,
  opts: TransitionOptions = {},
): boolean {
  if (!isStatusCategoryKind(fromKind) || !isStatusCategoryKind(toKind)) return false;
  return isValidCategoryTransition(
    categorySemanticsForKind(fromKind),
    categorySemanticsForKind(toKind),
    opts,
  );
}

/**
 * The Job side-effect (applied flag + first-entry appliedDate) when moving INTO a
 * status whose category is `toKind`. Empty for non-applied stages / unknown kinds.
 */
export function appliedSideEffectByKind(
  toKind: string,
  currentAppliedDate: Date | null,
): AppliedSideEffect {
  if (!isStatusCategoryKind(toKind)) return {};
  return computeAppliedSideEffect(categorySemanticsForKind(toKind), currentAppliedDate);
}

/**
 * Client-side transition check between two JobStatuses that carry their category
 * (Kanban drag highlight, mobile dropdown filter). Fails closed when either
 * status lacks category data.
 */
export function isValidStatusTransition(
  from: JobStatus | undefined | null,
  to: JobStatus | undefined | null,
): boolean {
  if (!from?.category || !to?.category) return false;
  // Re-selecting the SAME status row is valid only on a self-transition stage
  // (interviewing multi-round) — thread sameStatus so the Kanban drag highlight
  // / dropdown enable matches the server rule (Welle 4 self-transition wiring).
  const sameStatus = from.id === to.id;
  return isValidCategoryTransitionByKind(from.category.kind, to.category.kind, { sameStatus });
}
