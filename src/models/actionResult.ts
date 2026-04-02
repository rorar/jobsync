/**
 * Shared return type for server actions that follow the success/data pattern.
 *
 * Usage:
 *   export async function myAction(): Promise<ActionResult<MyData>> {
 *     return { success: true, data: myData };
 *   }
 *
 * NOTE: Not all server actions use this pattern:
 * - Pattern C functions (dashboard) return custom shapes
 * See specs/action-result.allium for the full classification.
 */
/**
 * Error codes for programmatic handling of server action failures.
 * The error MESSAGE should be a generic i18n key; the errorCode is for code-level branching.
 */
export type ActionErrorCode =
  | "DUPLICATE_ENTRY"
  | "NOT_FOUND"
  | "REFERENCE_ERROR"
  | "INVALID_TRANSITION"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  total?: number;
  message?: string;
  errorCode?: ActionErrorCode;
}
