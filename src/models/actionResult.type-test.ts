/**
 * Type-level test for IF-5 — `ActionResult.message` is a strict i18n-key union.
 *
 * Enforced by the `next build` tsc pass (this file is in `tsconfig.include`).
 * It has no runtime behaviour and is intentionally not imported anywhere.
 *
 * Regression guard: if `message` is ever reverted to bare `string`, the
 * `@ts-expect-error` directives below become *unused*, which tsc reports as an
 * error ("Unused '@ts-expect-error' directive") — failing the build. So this
 * fixture fails loudly in BOTH directions (too loose AND missing key).
 */
import type { ActionResult } from "./actionResult";

// ── ALLOWED: real translation keys from real namespaces ──────────────
const okKey: ActionResult = { success: true, message: "jobs.title" };
const okErrKey: ActionResult<number> = {
  success: false,
  message: "crm.errors.companyNotFound",
};
const okNoMessage: ActionResult = { success: true };

// ── REJECTED: arbitrary, non-i18n-key strings must be compile errors ──
// @ts-expect-error - bare English sentence is not a translation key (IF-5)
const badSentence: ActionResult = { success: false, message: "Activity not found" };
// @ts-expect-error - a plausible-looking but non-existent key is rejected too
const badFakeKey: ActionResult = { success: false, message: "jobs.totallyMadeUpKey" };
// @ts-expect-error - dotless token is not a namespaced key
const badToken: ActionResult = { success: false, message: "notakey" };

// Reference the bindings so noUnusedLocals (if enabled) stays quiet.
void okKey;
void okErrKey;
void okNoMessage;
void badSentence;
void badFakeKey;
void badToken;
