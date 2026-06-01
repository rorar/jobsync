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
  | "STALE_STATE"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

import type { TranslationKeyStrict } from "@/i18n/dictionaries";

export interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  total?: number;
  /**
   * User-facing outcome message, expressed as an i18n key (IF-5).
   *
   * Typed as the strict i18n-key union — NOT bare `string` — so producers cannot
   * smuggle hardcoded English (a GDPR-irrelevant but locale-breaking foot-gun:
   * such strings reached toasts untranslated). Consumers translate it with
   * `t(result.message)`. For messages needing interpolation, emit a key here and
   * carry the dynamic values out-of-band (see `data`) — the key stays static.
   */
  message?: TranslationKeyStrict;
  /**
   * Interpolation values for `message` (IF-5). Lets a producer emit a STATIC
   * i18n key plus its dynamic placeholders (e.g. `{ count }`) instead of
   * pre-baking an English sentence into `message` — the same late-binding
   * pattern used by notification `titleParams`. Consumers interpolate with
   * `t(message)` + these params. Replaces the former `message`-overload hack
   * (the `performanceWarning:<count>` prefix convention).
   */
  messageParams?: Record<string, string | number>;
  errorCode?: ActionErrorCode;
}
