# ADR-022: Error Status Inference via String Heuristics

**Date:** 2026-04-02
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

`actionToResponse()` in `src/lib/api/response.ts` converts `ActionResult<T>` server action responses to HTTP responses for the Public API v1. When an `ActionResult` indicates failure, the error message must be mapped to an appropriate HTTP status code (400, 401, 404, 409, 500).

The `ActionResult<T>` type carries a `message` string but no structured error code. After the i18n migration (see ADR-001), error messages transitioned from English strings (e.g., `"Job not found"`) to i18n keys (e.g., `"api.notFound"`, `"blacklist.entryNotFound"`). The `inferErrorStatus()` function uses pattern-matching on the message text to derive HTTP status codes.

This function currently matches both legacy English patterns and camelCase i18n key patterns:

```ts
function inferErrorStatus(message: string): number {
  const lower = message.toLowerCase();

  // i18n key patterns
  if (lower.includes("notauthenticated") || lower.includes("notauthorized")) return 401;
  if (lower.includes("notfound") || lower.includes("entrynotfound")) return 404;
  if (lower.includes("invalid") || lower.includes("required")) return 400;
  if (lower.includes("alreadyexists") || lower.includes("duplicate")) return 409;

  // Legacy English patterns
  if (lower.includes("not authenticated")) return 401;
  if (lower.includes("not found")) return 404;

  return 500;
}
```

## Decision

Accept string heuristics as an interim solution. The function matches both legacy English patterns and camelCase i18n key patterns in `inferErrorStatus()`.

### Why This Is Acceptable

1. **`actionToResponse()` is a safety net, not the primary path.** Phase 1 API v1 routes use explicit `errorResponse(message, status)` calls with hardcoded status codes for their error paths. `actionToResponse()` is used primarily for success responses. The heuristic only fires when a server action returns an unexpected error that the route handler did not explicitly catch.

2. **i18n keys follow predictable naming conventions.** The i18n key convention uses camelCase with status-indicative words: `notAuthenticated`, `notFound`, `alreadyExists`, `invalid*`. This makes pattern matching reliable for the expected key vocabulary.

3. **The 500 fallback is safe.** Unknown messages default to HTTP 500, which triggers error sanitization (generic message returned to the client, raw message logged server-side). This prevents information leakage when an unexpected error message does not match any pattern.

4. **Test coverage validates the mapping.** Eight tests verify that both i18n key patterns and legacy English patterns map to the correct HTTP status codes.

### The Correct Long-Term Solution

Adding a structured `errorCode` field to `ActionResult<T>` would replace heuristics with explicit mapping:

```ts
type ActionResult<T> = {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: "NOT_FOUND" | "NOT_AUTHENTICATED" | "VALIDATION" | "CONFLICT";
};
```

This is deferred because it requires updating approximately 80 server action callsites that currently return `{ success: false, message: "..." }`. The effort-to-risk ratio does not justify it while the heuristic works correctly for the known key vocabulary.

### Alternatives Considered

- **Structured `errorCode` field on `ActionResult`:** Correct solution but deferred (see above). Approximately 80 callsites need modification.
- **Map of exact i18n key to status code:** More precise than substring matching but brittle -- every new i18n key would need an explicit entry. The current pattern-based approach handles new keys automatically if they follow the naming convention.
- **Throw typed exceptions instead of returning `ActionResult`:** Would require a fundamentally different error handling pattern across all server actions. Inconsistent with the project's `ActionResult` convention (see ADR-002).

## Consequences

### Positive
- Existing API v1 routes work correctly today without changes to the 80+ server action callsites
- The dual-pattern matching (i18n keys + legacy English) provides backwards compatibility during the i18n migration
- The 500 fallback ensures unknown errors are safely sanitized rather than leaked

### Negative
- String heuristics are inherently fragile -- a new i18n key like `"api.forbidden"` would fall through to 500 instead of mapping to 403, because the word "forbidden" is not in the current pattern list
- Two layers of patterns (i18n keys and legacy English) increase maintenance surface
- The mapping is implicit -- a developer reading `return { success: false, message: t("api.notFound") }` cannot easily trace that this becomes HTTP 404 without reading `inferErrorStatus()`

### Risks
- **New i18n keys MUST follow the naming convention** (camelCase with status-indicative words like `notFound`, `notAuthenticated`, `invalid`, `alreadyExists`). Keys that deviate from this convention will silently fall through to HTTP 500. This constraint is now documented in CLAUDE.md.
- **False positives from substring matching:** A key like `"jobs.invalidFilterNotFound"` could match both `"invalid"` (400) and `"notfound"` (404). The current implementation returns the first match (400), which may not be the intended status. This has not occurred in practice but is a structural risk.
- When `ActionResult` gets a structured `errorCode` field, `inferErrorStatus` should be simplified to a switch on error codes and the string heuristics removed.
