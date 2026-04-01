# ADR-019: Pre-Auth IP Rate Limiting and "use server" Export Security

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

A security audit identified two related vulnerability classes in the Public API and Next.js Server Action layers:

### Problem 1: Rate Limiting Bypass via Invalid API Keys

`withApiAuth` in `src/lib/api/with-api-auth.ts` originally performed API key authentication FIRST, then applied rate limiting ONLY after successful auth. Requests with invalid or missing API keys bypassed the rate limiter entirely. This enabled database-level denial-of-service attacks: an attacker could send unbounded requests with garbage API keys, each triggering a `findUnique` lookup on the `PublicApiKey` table. Since there was no pre-auth throttle, the database could be saturated without ever hitting the rate limit.

### Problem 2: Server Action IDOR via "use server" Exports

Next.js `"use server"` files expose ALL exported async functions as callable Server Actions from the browser. Functions like `getBlacklistEntriesForUser(userId)` that accept a raw `userId` parameter become IDOR vectors when exported from `"use server"` files -- any authenticated client can invoke them with arbitrary `userId` values via the `__next_action_` RPC mechanism. This was a subtler variant of the IDOR class documented in ADR-015, specific to the `"use server"` directive's implicit export behaviour.

### Problem 3: TypeScript Union Types Erased at Runtime

Server Action parameters typed as TypeScript union types (`matchType: "auto" | "ai" | "keyword"`, `TaskStatus`, `BulkActionType`) have no runtime validation. TypeScript types are erased at compile time, so a malicious client can submit any string value. Without explicit runtime checks, these values propagate into database queries and business logic unchecked.

## Decision

### Decision 1: Dual-Layer Rate Limiting (IP Pre-Auth + Key Post-Auth)

Added IP-based pre-auth rate limiting BEFORE the API key validation step in `withApiAuth`. The two layers are:

1. **IP-based (pre-auth, generous):** 120 requests/minute per IP address. Applied to ALL requests, including those with invalid or missing API keys. This prevents database-level DoS from unauthenticated traffic.
2. **Key-based (post-auth, strict):** 60 requests/minute per API key. Applied only after successful authentication. This prevents abuse from compromised or malicious API keys.

IP extraction uses the following fallback chain: `X-Forwarded-For` (first IP in the list) -> `X-Real-IP` -> `"unknown"`.

**Caveat:** `X-Forwarded-For` is forgeable when there is no trusted reverse proxy in front of the application. This is accepted for the current deployment model (self-hosted, single-instance). The deployment guide must document that a trusted reverse proxy (nginx, Caddy, Traefik) should set `X-Forwarded-For` and strip client-supplied values.

### Decision 2: "use server" Export Security Patterns

Two patterns are established for functions that accept a raw `userId` parameter:

#### Pattern A: Move to Server-Only Module

Functions that accept a raw `userId` and are ONLY called server-side (by the Runner, EventBus consumers, scheduler, or other server-only code) MUST live in a file guarded with `import "server-only"` at the top. They MUST NOT be in a `"use server"` file.

```ts
// src/lib/blacklist-query.ts
import "server-only";

export async function getBlacklistEntriesForUser(userId: string) {
  // Safe: this function is never exposed as a Server Action
}
```

#### Pattern B: Inline Auth Guard

If the function MUST remain in a `"use server"` file (because it is also called from client components), it MUST verify ownership by calling `getCurrentUser()` and comparing against the supplied `userId`:

```ts
"use server";

export async function getAutomationSettingsForUser(userId: string) {
  const user = await getCurrentUser();
  if (!user || user.id !== userId) return defaults;
  // ... proceed with query
}
```

#### Applied Changes

| Function | File | Pattern Applied |
|---|---|---|
| `getBlacklistEntriesForUser` | `src/lib/blacklist-query.ts` | A (moved to server-only) |
| `getAutomationSettingsForUser` | `src/actions/automation.actions.ts` | B (inline auth guard) |
| `getNotificationPreferencesForUser` | `src/actions/notification.actions.ts` | B (inline auth guard) |

### Decision 3: Runtime Validation for TypeScript Union Types

All Server Action parameters that use TypeScript union types MUST include explicit runtime validation before the value is used. The canonical pattern is an array-based membership check:

```ts
const VALID_MATCH_TYPES = ["auto", "ai", "keyword"] as const;

export async function updateMatchType(matchType: string) {
  if (!VALID_MATCH_TYPES.includes(matchType as any)) {
    return { success: false, error: "Invalid match type" };
  }
  // ... proceed
}
```

This applies to all server action boundaries where values cross the client-server trust boundary: `matchType`, `TaskStatus`, `BulkActionType`, and any future union-typed parameters.

### Alternatives Considered

- **Middleware-level IP rate limiting (Next.js middleware):** Rejected -- Next.js middleware runs at the edge and does not have access to the same in-memory rate limit state. Would require an external store (Redis), which conflicts with the self-hosted single-instance deployment model.
- **Removing userId from function signatures entirely:** Rejected -- some functions are legitimately called from both server-side code (where the caller already has the userId) and client components. Removing the parameter would require duplicating the function.
- **Zod schemas for all Server Action inputs:** Considered and partially adopted (API layer already uses Zod via `src/lib/api/schemas.ts`). For simple union types in server actions, the array membership check is lighter-weight and sufficient. Full Zod adoption for server actions is deferred.

## Consequences

### Positive
- Eliminates database-level DoS via unauthenticated API requests -- every IP is throttled before any database query runs
- Eliminates an entire class of IDOR vulnerabilities specific to Next.js `"use server"` export semantics
- Runtime union validation prevents type confusion attacks at server action boundaries
- The dual-layer rate limiting model is extensible -- additional layers (e.g., per-endpoint) can be added without restructuring
- The server-only vs. auth-guard pattern decision tree is simple: "Is it called from the client? If no, Pattern A. If yes, Pattern B."

### Negative
- IP-based rate limiting adds a small overhead to every API request (in-memory lookup, negligible)
- `X-Forwarded-For` reliance means the pre-auth layer is ineffective without a properly configured reverse proxy
- Developers must understand the difference between `"use server"` and `import "server-only"` -- a Next.js-specific nuance that is easy to get wrong
- Runtime union validation is manual and must be maintained in sync with TypeScript type definitions

### Risks
- New server actions could accidentally export userId-accepting functions from `"use server"` files if contributors are unaware of this ADR
- The `"unknown"` IP fallback means all requests without IP headers share a single rate limit bucket, which could cause false positives in unusual proxy configurations
- New TypeScript union types added to server action signatures could miss runtime validation if there is no compile-time enforcement (linting rule recommended for future)
