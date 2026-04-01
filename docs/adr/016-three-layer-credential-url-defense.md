# ADR-016: Three-Layer Credential URL Defense

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The sign-in and sign-up forms lacked an explicit `method="POST"` attribute. During Next.js hydration gaps -- the brief window between server-rendered HTML delivery and client-side JavaScript initialization -- the browser treats forms as `method="GET"` by default. A form submission during this window encodes credentials (email, password) as URL query parameters:

```
/signin?email=user@example.com&password=secret123
```

This exposes credentials in browser history, server access logs, Referer headers, and URL bar autocomplete suggestions. The hydration gap is unavoidable in server-rendered React applications and cannot be eliminated, only mitigated.

## Decision

Implement a three-layer defense-in-depth strategy. No single layer is trusted to be sufficient; each layer independently prevents credential URL exposure.

### Layer 1: Form Attribute (Preventive)

All authentication forms explicitly declare `method="POST"` and `action=""`:

```tsx
<form method="POST" action="" onSubmit={handleSubmit}>
```

This ensures the browser never falls back to GET, even before hydration completes. The `action=""` prevents the form from navigating away on native submission.

### Layer 2: Client-Side Cleanup (Detective)

A `useEffect` hook on authentication pages strips credential parameters from the URL immediately on mount:

```ts
useEffect(() => {
  const url = new URL(window.location.href);
  if (url.searchParams.has("email") || url.searchParams.has("password")) {
    url.searchParams.delete("email");
    url.searchParams.delete("password");
    window.history.replaceState({}, "", url.toString());
  }
}, []);
```

This catches any edge case where Layer 1 fails (e.g., a future form refactor accidentally drops the attribute).

### Layer 3: Middleware Redirect (Backstop)

Next.js middleware detects credential parameters on `/signin` and `/signup` routes and issues a `303 See Other` redirect to the clean URL. Additionally, the middleware sets:

- `Referrer-Policy: no-referrer` on authentication routes
- Standard security headers (`X-Content-Type-Options`, `X-Frame-Options`)

The 303 redirect forces the browser to issue a GET to the clean URL, ensuring the credential-bearing URL is never stored in navigation history.

### Alternatives Considered

- **Form attribute only**: Insufficient -- a single missing attribute exposes credentials. No defense-in-depth.
- **JavaScript-only prevention**: Fails during the hydration gap, which is precisely when the vulnerability occurs.
- **CSP-based mitigation**: Content Security Policy cannot prevent form GET submissions.

## Consequences

### Positive
- Single point of failure eliminated -- any one layer can fail and the other two still protect credentials
- Middleware layer protects even if client JavaScript is disabled or blocked
- Referrer-Policy prevents credential leakage to third-party resources
- Pattern is reusable for any future forms that handle sensitive data

### Negative
- Three layers add implementation complexity for what appears to be a simple form
- Middleware redirect adds one extra round-trip in the failure case (negligible in practice)
- Developers must maintain awareness of all three layers when modifying auth forms

### Risks
- Future auth form implementations might not replicate all three layers if this ADR is not consulted
- The `useEffect` cleanup runs after paint, so a brief flash of the credential URL is possible in the address bar before `replaceState` executes
