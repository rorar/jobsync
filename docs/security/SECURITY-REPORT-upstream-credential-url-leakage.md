# Security Bug Report: Credential Exposure via URL Query Parameters

**Repository:** Gsync/jobsync
**Reporter:** @rorar
**Date:** 2026-03-31
**Severity:** CRITICAL
**CVSS 3.1 Score:** 9.1 (Critical) — AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N
**CWE:** CWE-598 (Use of GET Request Method With Sensitive Query Strings)

---

## Summary

The sign-in and sign-up forms in JobSync expose user credentials (email and password) as URL query parameters when the browser's native form submission is triggered instead of the JavaScript handler. This occurs during Next.js hydration gaps — the period between server-side HTML rendering and client-side JavaScript initialization.

The credentials appear in the browser's address bar as plaintext:
```
http://<host>:3737/signin?email=admin%40example.com&password=password123
```

## Root Cause

Both `SigninForm.tsx` and `SignupForm.tsx` render a `<form>` element without the `method="POST"` attribute:

**`src/components/auth/SigninForm.tsx` (line ~57):**
```tsx
<form onSubmit={form.handleSubmit(onSubmit)}>
```

**`src/components/auth/SignupForm.tsx` (line ~61):**
```tsx
<form onSubmit={form.handleSubmit(onSubmit)}>
```

The `onSubmit` handler relies on React Hook Form's `handleSubmit()`, which calls `event.preventDefault()` to prevent native browser submission. However, during the **hydration gap** — when Next.js has rendered the HTML on the server but the client-side JavaScript bundle has not yet loaded and attached event handlers — the form behaves as a standard HTML form.

The HTML specification defines the default form method as `GET` when no `method` attribute is specified ([HTML Living Standard §4.10.18.6](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attr-fs-method)). A `GET` submission encodes all form field values as URL query parameters.

## Trigger Conditions

The vulnerability is triggered when a user submits the form before JavaScript has fully loaded. This can happen due to:

1. **Slow network/device:** Large JavaScript bundle takes time to download and parse
2. **JavaScript disabled:** Users with NoScript or corporate JS policies
3. **Browser extensions:** Ad blockers or privacy extensions that delay/block scripts
4. **Fast form submission:** User types credentials and presses Enter before hydration completes
5. **JavaScript errors:** Any JS error during hydration prevents event handler attachment

## Impact

Once credentials appear in the URL, they are exposed through multiple vectors:

### Immediate Exposure
- **Browser address bar:** Password visible as plaintext in the URL bar
- **Browser history:** Credentials persisted permanently in browsing history
- **Browser sync:** Chrome/Firefox/Edge sync propagates the URL (with credentials) to all signed-in devices and cloud storage
- **URL bar autocomplete:** Future visits to the page suggest the credential-containing URL

### Server & Network Exposure
- **Server access logs:** Web servers (nginx, Apache, Caddy) log the full request URL including query parameters in access logs
- **Next.js dev server logs:** Development mode logs all requests to stdout
- **Proxy/firewall logs:** Corporate proxies, firewalls, and DPI systems log full GET URLs
- **No TLS (self-hosted):** JobSync is typically self-hosted on HTTP — credentials traverse the network in plaintext

### Referrer Leakage
- **Referer header:** Subsequent requests from the page leak the credential URL to any loaded resource (scripts, images, stylesheets, API calls)
- **No Referrer-Policy header:** The application does not set a `Referrer-Policy` header, relying on browser defaults

### Secondary Exploitation
- **Credential stuffing:** Harvested passwords enable attacks on external services (email, GitHub, job portals) due to password reuse
- **Account takeover:** Full access to job application data, stored API keys (OpenAI, DeepSeek, RapidAPI), automation configurations
- **API key persistence:** An attacker can create Public API keys that survive password changes

## Proof of Concept

1. Deploy JobSync and navigate to the sign-in page
2. Before the page fully loads (simulate by disabling JavaScript in browser DevTools), type credentials and press Enter
3. Observe the URL bar: `http://<host>/signin?email=user@example.com&password=secret`
4. Open browser history — the credential URL is permanently stored

Alternative PoC (no JS disable needed):
1. Open DevTools → Network → Throttle to "Slow 3G"
2. Hard refresh the sign-in page
3. Quickly type credentials and press Enter before the JS bundle loads
4. Observe credentials in URL

## Recommended Fix

### Minimum Fix (1 line per file)

Add `method="POST"` to both form elements:

**`src/components/auth/SigninForm.tsx`:**
```diff
- <form onSubmit={form.handleSubmit(onSubmit)}>
+ <form method="POST" action="" onSubmit={form.handleSubmit(onSubmit)}>
```

**`src/components/auth/SignupForm.tsx`:**
```diff
- <form onSubmit={form.handleSubmit(onSubmit)}>
+ <form method="POST" action="" onSubmit={form.handleSubmit(onSubmit)}>
```

With `method="POST"`, the native HTML fallback sends credentials in the request body instead of the URL. The `action=""` attribute ensures the form posts to the current page rather than an undefined endpoint.

### Defense-in-Depth (Recommended)

1. **Client-side URL sanitization:** Add a `useEffect` hook to strip credential parameters from the URL on mount:
```tsx
useEffect(() => {
  const url = new URL(window.location.href);
  if (url.searchParams.has("email") || url.searchParams.has("password")) {
    url.searchParams.delete("email");
    url.searchParams.delete("password");
    window.history.replaceState({}, "", url.pathname);
  }
}, []);
```

2. **Middleware URL sanitization:** Add middleware that redirects auth routes containing credential query parameters:
```typescript
// In middleware.ts — add "/signin" and "/signup" to the matcher
function sanitizeAuthUrl(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  const isAuthRoute = pathname === "/signin" || pathname === "/signup";
  if (isAuthRoute && (searchParams.has("email") || searchParams.has("password"))) {
    const cleanUrl = new URL(pathname, request.url);
    return NextResponse.redirect(cleanUrl, { status: 303 });
  }
  return null;
}
```

3. **Security headers:** Add `Referrer-Policy: strict-origin-when-cross-origin` to prevent credential leakage via Referer headers.

## Affected Versions

All versions of Gsync/jobsync as of 2026-03-31. The vulnerability has existed since the initial implementation of the credential-based authentication forms.

## References

- [CWE-598: Use of GET Request Method With Sensitive Query Strings](https://cwe.mitre.org/data/definitions/598.html)
- [OWASP: Information Exposure Through Query Strings in URL](https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url)
- [HTML Living Standard: Form Submission Algorithm](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#form-submission-algorithm)
- [Next.js Hydration Documentation](https://nextjs.org/docs/messages/react-hydration-error)
