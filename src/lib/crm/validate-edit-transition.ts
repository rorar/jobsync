/**
 * Edit-form transition validation for updateJob.
 *
 * Imports the canonical VALID_TRANSITIONS from status-machine.ts (single
 * source of truth). The previous copy diverged once (missing `expired`) —
 * importing eliminates the sync-discipline requirement entirely.
 *
 * Spec: specs/crm-workflow.allium (state_machine JobStatusTransitions)
 */

import { VALID_TRANSITIONS } from "./status-machine";

/**
 * Check whether a status transition is valid according to the state machine.
 * Used by updateJob to enforce transitions via the edit form.
 */
export function isEditTransitionValid(fromValue: string, toValue: string): boolean {
  if (fromValue === toValue && fromValue !== "interview") {
    return false;
  }
  const allowed = VALID_TRANSITIONS[fromValue];
  if (!allowed) return false;
  return allowed.includes(toValue);
}
