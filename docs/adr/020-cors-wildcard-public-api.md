# ADR-020: CORS Wildcard on Public API v1

**Date:** 2026-04-02
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The Public API v1 (`/api/v1/*`) uses `Access-Control-Allow-Origin: *` (wildcard CORS) in `src/lib/api/with-api-auth.ts`. During a security review, the question arose whether wildcard CORS introduces CSRF risk for authenticated API endpoints.

API consumers include external automation platforms (n8n), custom scripts, and browser extensions. These consumers make cross-origin requests and cannot function with restrictive origin-based CORS policies.

## Decision

Wildcard CORS (`Access-Control-Allow-Origin: *`) is intentional and safe for `/api/v1/*` endpoints.

### Rationale

Authentication on Public API v1 uses **API keys** transmitted via `Authorization: Bearer pk_live_...` or `X-API-Key` headers. No cookie-based session authentication is used on these endpoints. CSRF attacks exploit the browser's automatic inclusion of cookies on cross-origin requests -- since no cookies are involved in API v1 auth, CSRF is not applicable.

The `CORS_HEADERS` constant in `with-api-auth.ts` explicitly documents this reasoning:

```
CORS: Uses Access-Control-Allow-Origin: * because auth is via API key
(not cookies), so wildcard is safe. External consumers (n8n, browser
extensions, scripts) need cross-origin access.
```

### Scope

- **Public API v1 (`/api/v1/*`):** Wildcard CORS via `withApiAuth()` wrapper
- **Internal API routes (`/api/*` without `/v1/`):** Do NOT use wildcard CORS. These routes rely on NextAuth session cookies and are subject to same-origin restrictions enforced by the browser and Next.js middleware

### Alternatives Considered

- **Configurable allowlist of origins:** Rejected -- self-hosted users cannot predict which origins will call their API (n8n instances, custom dashboards, CLI tools). An allowlist would require configuration that most users would set to `*` anyway.
- **No CORS headers (rely on server-side consumers only):** Rejected -- browser extensions and browser-based automation UIs are legitimate API consumers and require CORS headers.

## Consequences

### Positive
- External consumers (n8n, browser extensions, scripts, SPAs) can call the API without CORS errors
- No configuration burden on self-hosted users
- The security model is simple: API keys are the sole authentication mechanism for v1 endpoints

### Negative
- Any website can make requests to a user's JobSync API v1 if it obtains an API key -- but API key secrecy is the user's responsibility regardless of CORS policy
- The inline comment in `with-api-auth.ts` is the only documentation of this constraint (now supplemented by this ADR)

### Risks
- **Critical constraint:** If cookie-based or session-based authentication is ever added to `/api/v1/*` endpoints (e.g., the Phase 2 AsyncLocalStorage bridge for server action reuse), CORS MUST be changed from wildcard to an explicit origin allowlist. Wildcard CORS combined with cookie credentials is a textbook CSRF vulnerability. The `credentials: "include"` fetch option combined with `Access-Control-Allow-Origin: *` is blocked by browsers, but `Access-Control-Allow-Credentials: true` with a reflected origin would reintroduce the risk.
- Contributors adding new `/api/v1/*` routes must use `withApiAuth()` (which applies the wildcard CORS headers). Routes that bypass this wrapper and implement their own CORS policy could introduce inconsistencies.
