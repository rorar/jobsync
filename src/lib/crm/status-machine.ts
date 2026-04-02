/**
 * CRM Status Machine — Job Status Workflow
 *
 * Defines the state machine for valid job status transitions,
 * status colors for UI, and column ordering for the Kanban board.
 *
 * Spec: specs/crm-workflow.allium (state_machine JobStatusTransitions)
 * Owner: Job Aggregate (src/actions/job.actions.ts)
 */

// ---------------------------------------------------------------------------
// Valid Transitions (State Machine)
// ---------------------------------------------------------------------------

/**
 * Map of status value → array of valid target status values.
 * Any transition NOT listed here is REJECTED by the system.
 * Exception: initial status on job creation (no previous status).
 *
 * Spec: specs/crm-workflow.allium (state_machine JobStatusTransitions)
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  bookmarked: ["applied", "archived", "rejected"],
  applied: ["interview", "rejected", "archived"],
  interview: ["offer", "rejected", "archived", "interview"],
  offer: ["accepted", "rejected", "archived"],
  accepted: ["archived"],
  rejected: ["bookmarked", "archived"],
  archived: ["bookmarked"],
  // Legacy status values — map to same transitions as their replacements
  saved: ["applied", "archived", "rejected"],
  draft: ["applied", "archived", "rejected"],
};

/**
 * Validate whether a status transition is allowed by the state machine.
 *
 * @param fromValue - Current status value (e.g., "bookmarked")
 * @param toValue - Target status value (e.g., "applied")
 * @returns true if the transition is valid
 */
export function isValidTransition(fromValue: string, toValue: string): boolean {
  // Self-transition only allowed for interview
  if (fromValue === toValue && fromValue !== "interview") {
    return false;
  }
  const allowed = VALID_TRANSITIONS[fromValue];
  if (!allowed) return false;
  return allowed.includes(toValue);
}

/**
 * Get the list of valid target statuses for a given source status.
 * Useful for UI to show only valid drop targets or dropdown options.
 *
 * @param fromValue - Current status value
 * @returns Array of valid target status values
 */
export function getValidTargets(fromValue: string): string[] {
  return VALID_TRANSITIONS[fromValue] ?? [];
}

// ---------------------------------------------------------------------------
// Status Colors (UI Consistency)
// ---------------------------------------------------------------------------

/**
 * Map of status value → color name for consistent UI rendering.
 * Used by Kanban columns, status badges, and charts.
 */
export const STATUS_COLORS: Record<string, string> = {
  bookmarked: "blue",
  applied: "indigo",
  interview: "purple",
  offer: "green",
  accepted: "emerald",
  rejected: "red",
  archived: "gray",
  // Legacy
  saved: "blue",
  draft: "blue",
};

// ---------------------------------------------------------------------------
// Status Order (Kanban Column Ordering)
// ---------------------------------------------------------------------------

/**
 * Ordered list of status values for Kanban column display.
 * Follows the natural workflow progression left-to-right.
 *
 * Spec: specs/crm-workflow.allium (rule GetKanbanBoard — column order)
 */
export const STATUS_ORDER: string[] = [
  "bookmarked",
  "applied",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "archived",
];

/**
 * Statuses that are collapsed by default in the Kanban board.
 *
 * Spec: specs/crm-workflow.allium (rule GetKanbanBoard — isCollapsed)
 */
export const COLLAPSED_BY_DEFAULT: string[] = ["rejected", "archived"];

// ---------------------------------------------------------------------------
// Side Effects (Status Transition)
// ---------------------------------------------------------------------------

/**
 * Compute side-effect data for a job update based on the target status value.
 * Used by changeJobStatus and updateKanbanOrder.
 *
 * Spec: specs/crm-workflow.allium (rule TransitionJobStatus — ensures)
 *
 * @param newStatusValue - The target status value
 * @param currentAppliedDate - The current appliedDate on the job (null if never set)
 * @returns Partial job data to merge into the update
 */
export function computeTransitionSideEffects(
  newStatusValue: string,
  currentAppliedDate: Date | null,
): Record<string, unknown> {
  switch (newStatusValue) {
    case "applied":
      return {
        applied: true,
        // appliedDate is set only on first transition to "applied" (immutability invariant)
        ...(currentAppliedDate === null ? { appliedDate: new Date() } : {}),
      };
    case "interview":
      return {
        applied: true,
        // Interviews imply an application was submitted — backfill flag
      };
    default:
      return {};
  }
}
