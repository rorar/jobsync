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
} from "./status-categories";

/**
 * Is moving a job from a status in `fromKind` to a (different) status in `toKind`
 * a valid transition? Forward/lateral by stage order, or bounded reopen from a
 * closed stage into the default (lead) stage. Unknown kinds are rejected (closed).
 */
export function isValidCategoryTransitionByKind(fromKind: string, toKind: string): boolean {
  if (!isStatusCategoryKind(fromKind) || !isStatusCategoryKind(toKind)) return false;
  return isValidCategoryTransition(
    categorySemanticsForKind(fromKind),
    categorySemanticsForKind(toKind),
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
