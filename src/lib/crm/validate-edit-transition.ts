/**
 * Standalone transition validation for the edit form path (updateJob).
 *
 * This duplicates the VALID_TRANSITIONS map from status-machine.ts intentionally
 * so that the edit form has its own enforcement boundary. Any future changes to
 * the canonical state machine MUST be mirrored here.
 *
 * Spec: specs/crm-workflow.allium (state_machine JobStatusTransitions)
 */

const VALID_TRANSITIONS: Record<string, string[]> = {
  bookmarked: ["applied", "archived", "rejected"],
  applied: ["interview", "rejected", "archived"],
  interview: ["offer", "rejected", "archived", "interview"],
  offer: ["accepted", "rejected", "archived"],
  accepted: ["archived"],
  rejected: ["bookmarked", "archived"],
  archived: ["bookmarked"],
  saved: ["applied", "archived", "rejected"],
  draft: ["applied", "archived", "rejected"],
};

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
