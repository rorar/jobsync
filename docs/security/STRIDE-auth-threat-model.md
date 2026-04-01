# STRIDE Threat Model: JobSync Authentication System

**Date:** 2026-03-31
**Analyst:** Security Audit (DevSecOps)
**Scope:** Authentication forms, credential handling, session management
**System:** JobSync -- Next.js 15, NextAuth v5, React Hook Form, Zod, bcrypt, JWT sessions
**Deployment:** Self-hosted on local network (100.99.113.93:3737, HTTP)

---

## Executive Summary

A critical vulnerability exists in the JobSync authentication system: both the sign-in and sign-up forms lack `method="POST"` on their `<form>` elements. During the Next.js hydration gap (the window between server-side HTML rendering and client-side JavaScript activation), a user submitting the form triggers the browser's native HTML form behavior, which defaults to `GET`. This encodes credentials -- including plaintext passwords -- directly into the URL query string.

This primary vulnerability, combined with the absence of HTTPS enforcement, minimal brute-force protection, and limited middleware coverage, creates a systemic credential exposure risk across multiple attack surfaces.

**Overall Risk Rating: CRITICAL**

---

## System Architecture Under Analysis

### Components

| Component | File | Role |
|---|---|---|
| Sign-In Form | `src/components/auth/SigninForm.tsx` (line 57) | Client-side form, `"use client"` directive |
| Sign-Up Form | `src/components/auth/SignupForm.tsx` (line 61) | Client-side form, `"use client"` directive |
| Auth Actions | `src/actions/auth.actions.ts` | Server Action: `authenticate()` with 1s delay, `signup()` |
| Auth Config | `src/auth.config.ts` | NextAuth config: JWT callbacks, `/dashboard` protection |
| Auth Core | `src/auth.ts` | Credentials provider, bcrypt verification, Zod validation |
| Middleware | `src/middleware.ts` | Auth middleware, CORS, matcher limited to `/dashboard/*` |
| Next Config | `next.config.mjs` | Standalone output, no security headers |
| NextAuth Route | `src/app/api/auth/[...nextauth]/route.ts` | `GET` + `POST` handler export |
| Auth Card | `src/components/auth/AuthCard.tsx` | Parent component rendering forms |
| Sign-In Page | `src/app/(auth)/signin/page.tsx` | Server component page |
| Sign-Up Page | `src/app/(auth)/signup/page.tsx` | Server component page |

### Data Flow (Normal Operation)

```
User -> Browser -> [JS loaded] -> React Hook Form -> onSubmit(data)
  -> Server Action authenticate() -> 1s delay -> signIn("credentials", {redirect:false})
  -> NextAuth Credentials provider -> Zod parse -> getUser(email) -> bcrypt.compare()
  -> JWT token -> Session cookie -> router.push("/dashboard")
```

### Data Flow (Vulnerability -- Pre-Hydration Submission)

```
User -> Browser -> [JS NOT YET loaded / hydration gap] -> Native HTML form submit
  -> GET /signin?email=admin%40example.com&password=password123
  -> URL visible in address bar, logged by server, cached by browser
  -> Page reloads, form re-renders (credentials in URL persist)
```

---

## Primary Vulnerability: Missing `method="POST"`

### Root Cause

Both form components use React Hook Form with `onSubmit` handlers but omit the HTML `method` attribute:

**SigninForm.tsx, line 56-58:**
```tsx
<form
  onSubmit={form.handleSubmit(onSubmit)}
  // no method="POST" attribute
>
```

**SignupForm.tsx, line 61:**
```tsx
<form onSubmit={form.handleSubmit(onSubmit)}>
```

Per the HTML specification (https://html.spec.whatwg.org/multipage/form-submission.html), when no `method` attribute is present, the browser defaults to `GET`. The `onSubmit` JavaScript handler only works after Next.js hydration completes. During the hydration gap, the browser falls back to native behavior.

### Hydration Gap Window

The hydration gap is the time between:
1. **Server-side rendered HTML arriving in the browser** (form is visible and interactive to the user)
2. **Next.js client-side JavaScript finishing hydration** (React event handlers become active)

This window varies depending on:
- Network speed (especially on slow connections: 2G/3G, congested LAN)
- JavaScript bundle size (Next.js 15 + React Hook Form + Zod + shadcn/ui)
- Device CPU (older phones, tablets, low-power devices)
- Browser cache state (first visit vs. cached)

Typical window: **200ms to 3+ seconds**. On a slow network with cold cache, this can exceed 5 seconds.

### Trigger Conditions

1. User loads `/signin` or `/signup`
2. User types email and password before JS hydration completes
3. User presses Enter or clicks the submit button
4. Browser executes native form GET submission
5. Credentials appear in URL: `/signin?email=...&password=...`

---

## STRIDE Analysis

### S -- Spoofing

#### S1: Credential Theft Enables Account Impersonation

| Attribute | Value |
|---|---|
| **Threat ID** | S1 |
| **Description** | An attacker who obtains credentials leaked via the URL query string (browser history, server logs, proxy logs, Referer headers, screen observation) can authenticate as the victim user. The `authenticate()` Server Action accepts email + password via `FormData`; there is no second factor, device binding, or session fingerprinting to prevent credential reuse from a different machine. |
| **Attack Vector** | Attacker accesses any credential leak surface (see I1-I8 below), then submits a standard sign-in request with the stolen credentials. |
| **Impact** | **Critical** -- Full account takeover. Attacker gains access to all job applications, resumes, profile data, automations, API keys, and any stored personal information. |
| **Likelihood** | **High** -- The leak surfaces are numerous and persistent (browser history is never automatically cleared). Self-hosted deployment on a local network increases shared-device risk. |
| **Risk Score** | **16** (Critical x High = 4 x 4) |
| **Affected Assets** | User accounts, personal data, job applications, resumes, API keys |
| **Mitigation** | (1) Add `method="POST"` to both form elements. (2) Add `action=""` to prevent any URL-based fallback. (3) Implement MFA/2FA. (4) Add device fingerprinting or session binding. (5) Implement login notification emails. |

#### S2: Credential Stuffing via Leaked Credentials

| Attribute | Value |
|---|---|
| **Threat ID** | S2 |
| **Description** | Leaked credentials from URL exposure may be reused on other services where the user has the same password. The signup form minimum password requirement is only 6 characters (`signupForm.schema.ts` line 19), and there is no password strength meter, no dictionary check, and no check against known-breached passwords (e.g., HaveIBeenPwned). |
| **Impact** | **High** -- Compromise extends beyond JobSync to the user's broader online identity. |
| **Likelihood** | **Medium** -- Depends on user password reuse habits, which are statistically common (~65% of users reuse passwords). |
| **Risk Score** | **12** (High x Medium = 3 x 3) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Enforce stronger password policies (12+ chars, complexity). (3) Integrate HaveIBeenPwned API for breached password detection. (4) Add password strength indicator in UI. |

---

### T -- Tampering

#### T1: URL Credential Replay and Modification

| Attribute | Value |
|---|---|
| **Threat ID** | T1 |
| **Description** | When credentials appear in the URL, they can be intercepted and modified in transit. Since the deployment runs over plain HTTP (no TLS), a network-level attacker (ARP spoofing, rogue DHCP, compromised router) can perform MITM to capture and modify URL-encoded credentials before they reach the server. Unlike POST body data, URL parameters are visible at every network hop. |
| **Attack Vector** | Network-level MITM on the local network (100.99.113.93:3737 over HTTP). Attacker modifies the `email` parameter to redirect the authentication check to a different account, or modifies the response to inject malicious content. |
| **Impact** | **High** -- Credential interception and potential session hijacking. |
| **Likelihood** | **High** -- Plain HTTP on a LAN means every router, switch, and device on the network segment can see URL parameters in cleartext. Even properly segmented networks are vulnerable to ARP poisoning. |
| **Risk Score** | **16** (High x High = 4 x 4) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Enforce HTTPS with valid certificates (even for local deployment, use mTLS or a local CA). (3) Set `HSTS` headers. (4) Configure NextAuth `secureCookies: true` when HTTPS is enabled. |

#### T2: Session Token Exposure via HTTP

| Attribute | Value |
|---|---|
| **Threat ID** | T2 |
| **Description** | NextAuth session cookies (`next-auth.session-token`) are transmitted over plain HTTP. Without the `Secure` flag (which requires HTTPS), cookies can be intercepted and replayed by any network observer. The `signIn("credentials", { redirect: false })` pattern in `auth.actions.ts` line 61-63 returns the session to the client, which then performs a client-side `router.push("/dashboard")`. |
| **Impact** | **High** -- Session hijacking without needing the user's password. |
| **Likelihood** | **High** -- HTTP deployment on shared network. |
| **Risk Score** | **16** (High x High = 4 x 4) |
| **Mitigation** | (1) Enforce HTTPS. (2) Set `Secure` and `HttpOnly` flags on all session cookies. (3) Implement session rotation on privilege changes. (4) Add IP binding or fingerprinting to sessions. |

---

### R -- Repudiation

#### R1: No Audit Trail for Credential Exposure Events

| Attribute | Value |
|---|---|
| **Threat ID** | R1 |
| **Description** | When credentials leak via URL query parameters, there is no server-side logging mechanism that specifically captures or flags this event. The `authenticate()` function in `auth.actions.ts` only logs generic errors (`error instanceof AuthError`). There is no structured audit log for: (a) successful authentications, (b) failed authentication attempts with source IP, (c) detection of credentials in URL parameters, (d) anomalous login patterns. A user cannot prove their credentials were exposed, and an administrator cannot determine when or how a compromise occurred. |
| **Impact** | **Medium** -- Inability to perform forensics after a breach. No accountability trail. |
| **Likelihood** | **High** -- Logging is completely absent for authentication events; any credential exposure will go undetected. |
| **Risk Score** | **12** (Medium x High = 3 x 4) |
| **Mitigation** | (1) Implement structured authentication audit logging (timestamp, IP, user-agent, success/failure, auth method). (2) Add server-side detection for credentials in query strings (middleware that strips and logs). (3) Implement alerting for suspicious login patterns. (4) Store audit logs in a tamper-evident format. |

#### R2: User Deniability of Leaked Sessions

| Attribute | Value |
|---|---|
| **Threat ID** | R2 |
| **Description** | Without session tracking (active sessions list, login history, device registry), a user can deny that actions performed under their account were authorized. Conversely, a legitimate user whose credentials leaked cannot prove that malicious actions were performed by an attacker rather than themselves. The `auth.config.ts` callbacks only extract `token.id` and `token.sub` -- no IP, device, or timestamp metadata is stored in the session. |
| **Impact** | **Medium** -- Disputes about account actions cannot be resolved with evidence. |
| **Likelihood** | **Medium** -- Relevant when credential exposure leads to unauthorized actions. |
| **Risk Score** | **9** (Medium x Medium = 3 x 3) |
| **Mitigation** | (1) Add login history with IP, user-agent, timestamp. (2) Implement active session management (view/revoke). (3) Add device trust/registration. (4) Log all state-changing operations with authenticated user context. |

---

### I -- Information Disclosure

This is the primary STRIDE category for the vulnerability. The missing `method="POST"` creates **eight distinct credential leak vectors**.

#### I1: Browser History Persistence

| Attribute | Value |
|---|---|
| **Threat ID** | I1 |
| **Description** | When form submission defaults to GET, the full URL including `?email=...&password=...` is permanently stored in the browser's history database. This history persists across browser restarts, is synced to cloud accounts (Chrome Sync, Firefox Sync, Safari iCloud), and appears in the address bar autocomplete suggestions. On a self-hosted homelab deployment where devices may be shared among household members, this is especially dangerous. |
| **Attack Vector** | (a) Another user of the same browser/device opens history. (b) Cloud-synced history exposes credentials on all synced devices. (c) Address bar autocomplete reveals the URL when typing the site address. (d) Malware/forensic tools extract browser history databases. |
| **Impact** | **Critical** -- Plaintext password stored indefinitely in an easily accessible location. |
| **Likelihood** | **Critical** -- Occurs every time the vulnerability is triggered. Browser history is the most persistent and accessible leak surface. |
| **Risk Score** | **16** (Critical x Critical = 4 x 4) |
| **Mitigation** | (1) Add `method="POST"` to forms (primary fix). (2) Implement server-side middleware to detect and redirect requests with credentials in query strings, stripping the parameters. (3) Set `Referrer-Policy: no-referrer` on auth pages. |

#### I2: Web Server Access Logs

| Attribute | Value |
|---|---|
| **Threat ID** | I2 |
| **Description** | Web servers (Next.js standalone, nginx/reverse proxy if present, Node.js) log the full request URL including query parameters in access logs by default. The Common Log Format and Combined Log Format both include the full request URI. Credentials submitted via GET will appear as: `GET /signin?email=admin%40example.com&password=password123 HTTP/1.1 200`. These logs are stored on disk, often with permissive file permissions, retained for extended periods, and may be shipped to centralized log aggregation systems. |
| **Impact** | **Critical** -- Plaintext passwords in server logs accessible to anyone with server access or log pipeline access. |
| **Likelihood** | **Critical** -- All HTTP servers log request URIs by default. |
| **Risk Score** | **16** (Critical x Critical = 4 x 4) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Add middleware to strip credentials from query strings before they reach the application logger. (3) Configure log sanitization to redact sensitive query parameters. (4) Restrict log file permissions. (5) Implement log rotation with secure deletion. |

#### I3: HTTP Referer Header Leakage

| Attribute | Value |
|---|---|
| **Threat ID** | I3 |
| **Description** | After a GET-based form submission, the full URL (including credentials in query parameters) becomes the page's current URL. Any subsequent navigation to an external resource -- including images, scripts, fonts, analytics, or link clicks -- sends the `Referer` header containing the full URL with credentials to the external server. The application has no `Referrer-Policy` header configured (confirmed: no CSP, HSTS, or Referrer-Policy headers anywhere in `middleware.ts` or `next.config.mjs`). The default browser behavior is `strict-origin-when-cross-origin`, which still sends the full URL for same-origin requests and the origin for cross-origin. However, if any same-origin sub-resource request is made (images, API calls, internal navigation), the full URL with credentials is transmitted. |
| **Impact** | **High** -- Credentials transmitted to any server receiving Referer headers. |
| **Likelihood** | **High** -- Auth pages load fonts, framework chunks, and same-origin assets. |
| **Risk Score** | **16** (High x High = 4 x 4) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Add `Referrer-Policy: no-referrer` header globally and specifically on auth pages. (3) Add `<meta name="referrer" content="no-referrer">` as defense in depth on auth pages. |

#### I4: Network-Level Interception (No HTTPS)

| Attribute | Value |
|---|---|
| **Threat ID** | I4 |
| **Description** | The deployment runs on plain HTTP (`http://100.99.113.93:3737`). The `.env.example` shows `NEXTAUTH_URL=http://localhost:3737` with no HTTPS configuration. URL query parameters are transmitted in cleartext over the network. Unlike POST bodies (which are also cleartext over HTTP but less likely to be logged by intermediate systems), URL parameters appear in: (a) DNS queries (full URL path sometimes logged by DNS resolvers), (b) Proxy access logs at every network hop, (c) Router/firewall logs, (d) ISP deep packet inspection, (e) Network monitoring tools (Wireshark, tcpdump). |
| **Impact** | **Critical** -- Credentials visible to any network observer between client and server. |
| **Likelihood** | **High** -- The application is explicitly designed for network access (LAN IP, `ALLOWED_DEV_ORIGINS` supports remote hosts). No TLS anywhere in the stack. |
| **Risk Score** | **16** (Critical x High = 4 x 4) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Enforce HTTPS even for local deployment (use Let's Encrypt, Tailscale HTTPS, or a local CA). (3) Add HSTS headers. (4) Redirect all HTTP to HTTPS. (5) Set `NEXTAUTH_URL` to an `https://` URL. |

#### I5: Proxy and CDN Log Exposure

| Attribute | Value |
|---|---|
| **Threat ID** | I5 |
| **Description** | If a reverse proxy (nginx, Caddy, Traefik), load balancer, or CDN sits in front of the application, each layer logs the full request URI including query parameters. Even transparent proxies (corporate firewalls, ISP interceptors) log URLs. The `ALLOWED_DEV_ORIGINS` configuration in `.env.example` and the CORS handling in `middleware.ts` indicate the application is accessed across network boundaries, increasing the number of intermediate systems that may log URLs. |
| **Impact** | **High** -- Credential persistence in infrastructure logs beyond the application's control. |
| **Likelihood** | **Medium** -- Depends on deployment topology. Homelab setups often include reverse proxies (nginx, Caddy for LAN routing). |
| **Risk Score** | **12** (High x Medium = 3 x 3) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Configure proxy log sanitization to redact query parameters on auth routes. (3) Minimize URL logging at each network layer. |

#### I6: Screen-Based Credential Exposure

| Attribute | Value |
|---|---|
| **Threat ID** | I6 |
| **Description** | When credentials appear in the URL bar after a GET submission, they are visible via: (a) **Shoulder surfing** -- anyone physically present can read the URL bar. (b) **Screen sharing** -- in video calls (Zoom, Teams, Meet), the URL bar is visible to all participants. (c) **Screenshots and screen recordings** -- credentials captured in screenshots are shared, stored in cloud photo libraries, or indexed by search. (d) **Accessibility tools** -- screen readers may announce the URL content. For a self-hosted homelab application accessed in a home environment, screen visibility to household members is a realistic concern. |
| **Impact** | **High** -- Direct visual credential exposure requiring no technical skill to exploit. |
| **Likelihood** | **Medium** -- Depends on user environment and habits. Screen sharing during remote work is extremely common. |
| **Risk Score** | **12** (High x Medium = 3 x 3) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Even after the fix, ensure error redirects never include sensitive parameters. (3) Consider URL sanitization on the client side for defense in depth. |

#### I7: Browser Autofill and URL Suggestion Leakage

| Attribute | Value |
|---|---|
| **Threat ID** | I7 |
| **Description** | Modern browsers index URLs for the omnibox/address bar suggestions. After a GET submission with credentials, typing partial URLs (e.g., "job" or "sign") in the address bar will surface the full credential-bearing URL as a suggestion. This suggestion persists until explicitly deleted and may sync across devices via browser profile sync. The `autoComplete="email"` and `autoComplete="current-password"` attributes on the form inputs (lines 72-73 of `SigninForm.tsx`) are correct for POST forms but do not prevent URL-level autocomplete for GET-submitted URLs. |
| **Impact** | **Medium** -- Credentials surface in unexpected contexts during normal browsing. |
| **Likelihood** | **High** -- Browser URL suggestion is an automatic, passive process. |
| **Risk Score** | **12** (Medium x High = 3 x 4) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Add `autocomplete="off"` on the form element itself (in addition to field-level autocomplete attributes). |

#### I8: Credentials in Error/Debug Output

| Attribute | Value |
|---|---|
| **Threat ID** | I8 |
| **Description** | When the GET form submission arrives at the Next.js server, the URL with credentials may appear in: (a) Next.js development mode error overlays (the error page shows the full URL). (b) `DEBUG_LOGGING=true` (default in `.env.example`, line 36) may cause URL logging in debug output. (c) Error tracking services (if added in the future -- Sentry, DataDog, etc.) capture full request URLs by default. (d) The `console.error("Failed to fetch user:", error)` in `auth.ts` line 16 may include request context. |
| **Impact** | **Medium** -- Credentials in debug output accessible to developers and monitoring systems. |
| **Likelihood** | **Medium** -- Development mode is likely the primary usage mode for a self-hosted application. |
| **Risk Score** | **9** (Medium x Medium = 3 x 3) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Sanitize URLs in all error handlers and debug output. (3) Configure error tracking to redact query parameters. |

---

### D -- Denial of Service

#### D1: Targeted Account Lockout via Exposed Credentials

| Attribute | Value |
|---|---|
| **Threat ID** | D1 |
| **Description** | While the current system lacks account lockout (the `authenticate()` function only imposes a random 0-1000ms delay via `delay(1000)` -- see `utils/delay.ts` which generates `Math.floor(Math.random() * (1000 - 500 + 1))`), if lockout is implemented in the future without fixing the credential exposure, an attacker who discovers leaked credentials could intentionally trigger lockout by submitting repeated failed attempts with slightly modified passwords, locking the legitimate user out of their account. |
| **Impact** | **Medium** -- User unable to access their account. |
| **Likelihood** | **Low** -- Current system has no lockout mechanism, but this becomes relevant if one is added. |
| **Risk Score** | **4** (Medium x Low = 3 x 1) |
| **Mitigation** | (1) Fix the primary form vulnerability first. (2) When implementing lockout, use progressive delays (exponential backoff) rather than hard lockout. (3) Implement CAPTCHA after N failed attempts. (4) Use account lockout with automatic unlock after a cooldown period. |

#### D2: Brute Force Amplification via Minimal Rate Limiting

| Attribute | Value |
|---|---|
| **Threat ID** | D2 |
| **Description** | The `authenticate()` function in `auth.actions.ts` uses `await delay(1000)` as its only brute-force protection. The `delay()` utility (`utils/delay.ts`) generates a random delay between 0ms and 1000ms (not a fixed 1 second). There is: (a) No per-IP rate limiting on auth endpoints. (b) No per-account rate limiting. (c) No exponential backoff after failed attempts. (d) No CAPTCHA integration. (e) No account lockout after N failures. (f) The middleware matcher (line 48-49 of `middleware.ts`) only protects `/dashboard` and `/dashboard/:path*` -- the auth endpoints `/signin`, `/signup`, and `/api/auth/*` are completely unprotected by middleware. An attacker can attempt approximately 1-2 passwords per second per connection, with unlimited parallel connections. |
| **Impact** | **High** -- Successful brute force leads to account compromise. |
| **Likelihood** | **High** -- Minimal barrier to automated attacks. The signin validation schema only requires `password.min(1)` (line 16 of `signinForm.schema.ts`), meaning short passwords are accepted. |
| **Risk Score** | **16** (High x High = 4 x 4) |
| **Mitigation** | (1) Implement per-IP rate limiting on auth routes (e.g., 5 attempts per minute). (2) Add per-account rate limiting with exponential backoff (1s, 2s, 4s, 8s, ...). (3) Add CAPTCHA after 3 failed attempts. (4) Extend middleware matcher to cover auth routes. (5) Implement temporary account lockout (15 min) after 10 failures. (6) Log all failed attempts with IP and timestamp for threat detection. |

#### D3: Resource Exhaustion via Signup Endpoint

| Attribute | Value |
|---|---|
| **Threat ID** | D3 |
| **Description** | The `signup()` function creates a new user, job sources (`createMany`), and job statuses (`upsert` in a loop) for every registration. There is no CAPTCHA, no email verification, and no rate limiting on the signup endpoint. An attacker can automate user creation to exhaust database storage (SQLite), create excessive Prisma records, and degrade system performance. |
| **Impact** | **Medium** -- Database bloat and potential application slowdown. |
| **Likelihood** | **Medium** -- Automated signup is trivial without CAPTCHA. |
| **Risk Score** | **9** (Medium x Medium = 3 x 3) |
| **Mitigation** | (1) Add rate limiting to signup endpoint. (2) Implement email verification before account activation. (3) Add CAPTCHA to signup form. (4) Monitor database size and set alerts. |

---

### E -- Elevation of Privilege

#### E1: Admin/Owner Credential Exposure Grants Full System Access

| Attribute | Value |
|---|---|
| **Threat ID** | E1 |
| **Description** | The application does not implement role-based access control (RBAC) -- the `User` model and session type (`auth.config.ts` lines 6-11) only contain `id`, `name`, and `email`, with no role field. However, in a self-hosted single-user or small-team deployment, the first user or system owner effectively has administrative access to all data: all automations, API keys (stored encrypted via `ENCRYPTION_KEY`), profile information, job applications, and system configuration. If the owner's credentials leak via URL exposure, the attacker gains full control of the system including: (a) Access to all stored API keys (OpenAI, DeepSeek, RapidAPI). (b) Ability to create/modify/delete all automations. (c) Access to all personal data (resumes, job applications, contacts). (d) Access to Public API key management (create keys for persistent access). (e) Ability to modify system settings. |
| **Impact** | **Critical** -- Complete system compromise including access to external service API keys. |
| **Likelihood** | **Medium** -- The system owner is the most likely person to sign in, making their credentials the most likely to be exposed. |
| **Risk Score** | **12** (Critical x Medium = 4 x 3) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Implement RBAC with distinct admin and user roles. (3) Require re-authentication for sensitive operations (API key creation, settings changes). (4) Implement session timeout for administrative actions. (5) Add MFA for privileged accounts. |

#### E2: Persistent Access via Public API Key Creation

| Attribute | Value |
|---|---|
| **Threat ID** | E2 |
| **Description** | An attacker who gains access via leaked credentials can navigate to Settings and create Public API keys (`src/components/settings/PublicApiKeySettings.tsx`). These API keys (`pk_live_...`) provide persistent access to the Public API v1 (`/api/v1/*`) that survives password changes, session revocation, and cookie clearing. The keys are SHA-256 hashed in storage but the plaintext is shown once on creation. The attacker can: (a) Create API keys silently (up to 10 per user). (b) Use keys for ongoing data exfiltration via `/api/v1/jobs`, `/api/v1/jobs/:id/notes`. (c) Maintain access even after the user changes their password. |
| **Impact** | **Critical** -- Persistent backdoor access surviving credential rotation. |
| **Likelihood** | **Medium** -- Requires initial account compromise (via any S/I category threat). |
| **Risk Score** | **12** (Critical x Medium = 4 x 3) |
| **Mitigation** | (1) Fix the primary form vulnerability. (2) Require current password confirmation for API key creation. (3) Implement API key usage audit logging. (4) Automatically revoke all API keys when password is changed. (5) Add notification when new API keys are created. (6) Implement key usage anomaly detection. |

#### E3: Middleware Bypass -- Auth Routes Unprotected

| Attribute | Value |
|---|---|
| **Threat ID** | E3 |
| **Description** | The middleware matcher in `middleware.ts` lines 46-50 is explicitly limited to `/dashboard` and `/dashboard/:path*`. This means: (a) `/signin` and `/signup` are not covered by any middleware. (b) `/api/auth/*` (NextAuth routes) are not covered. (c) No security headers (CSP, HSTS, X-Frame-Options) are applied to auth pages. (d) No rate limiting is enforced at the middleware layer for auth routes. (e) The CORS logic in middleware only runs for dashboard routes. While the NextAuth `authorized` callback handles session-based redirects, it does not provide the security controls that middleware-level protection would offer (rate limiting, header injection, request sanitization). |
| **Impact** | **High** -- Auth routes lack defense-in-depth protections. |
| **Likelihood** | **High** -- The middleware exclusion is by design (commented-out broad matcher on line 47), meaning auth routes have never been protected. |
| **Risk Score** | **16** (High x High = 4 x 4) |
| **Mitigation** | (1) Expand middleware matcher to include auth routes: `"/((?!_next/static|_next/image|favicon.ico|flags).*)"`. (2) Add rate limiting for `/signin`, `/signup`, `/api/auth/*` in middleware. (3) Apply security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) to all routes. (4) Add credential-in-URL detection and stripping in middleware. |

---

## Risk Summary Matrix

| ID | Category | Threat | Impact | Likelihood | Score | Priority |
|----|----------|--------|--------|------------|-------|----------|
| I1 | Info Disclosure | Browser history persistence | Critical | Critical | **16** | P0 |
| I2 | Info Disclosure | Server access log exposure | Critical | Critical | **16** | P0 |
| I4 | Info Disclosure | Network interception (no HTTPS) | Critical | High | **16** | P0 |
| S1 | Spoofing | Account impersonation via leaked creds | Critical | High | **16** | P0 |
| T1 | Tampering | URL credential replay/modification | High | High | **16** | P0 |
| T2 | Tampering | Session token interception (HTTP) | High | High | **16** | P0 |
| D2 | Denial of Service | Brute force (minimal rate limiting) | High | High | **16** | P0 |
| E3 | Elev. of Privilege | Middleware bypass on auth routes | High | High | **16** | P0 |
| I3 | Info Disclosure | Referer header leakage | High | High | **16** | P1 |
| S2 | Spoofing | Credential stuffing (cross-service) | High | Medium | **12** | P1 |
| R1 | Repudiation | No audit trail for auth events | Medium | High | **12** | P1 |
| I5 | Info Disclosure | Proxy/CDN log exposure | High | Medium | **12** | P1 |
| I6 | Info Disclosure | Screen-based credential exposure | High | Medium | **12** | P1 |
| I7 | Info Disclosure | Browser autofill/URL suggestions | Medium | High | **12** | P1 |
| E1 | Elev. of Privilege | Admin credential exposure | Critical | Medium | **12** | P1 |
| E2 | Elev. of Privilege | Persistent API key backdoor | Critical | Medium | **12** | P1 |
| R2 | Repudiation | User deniability of leaked sessions | Medium | Medium | **9** | P2 |
| I8 | Info Disclosure | Debug/error output exposure | Medium | Medium | **9** | P2 |
| D3 | Denial of Service | Signup resource exhaustion | Medium | Medium | **9** | P2 |
| D1 | Denial of Service | Targeted account lockout | Medium | Low | **4** | P3 |

**8 threats at maximum risk score (16). 0 threats below medium.**

---

## Attack Tree: Primary Vulnerability Exploitation

```
[GOAL] Obtain user credentials
|
+-- [1] Exploit Missing method="POST" (hydration gap)
|   |
|   +-- [1.1] Wait for user to submit before JS hydrates
|   |   +-- Credentials appear in URL query string
|   |       |
|   |       +-- [1.1.1] Extract from browser history (I1)
|   |       +-- [1.1.2] Extract from server access logs (I2)
|   |       +-- [1.1.3] Capture via Referer header (I3)
|   |       +-- [1.1.4] Intercept on network (I4, no HTTPS)
|   |       +-- [1.1.5] Read from proxy/infra logs (I5)
|   |       +-- [1.1.6] Observe on screen (I6)
|   |       +-- [1.1.7] Find in URL bar suggestions (I7)
|   |       +-- [1.1.8] Find in error/debug output (I8)
|   |
|   +-- [1.2] Force hydration delay (advanced)
|       +-- Network throttling
|       +-- CPU exhaustion on target device
|       +-- Large JS bundle injection (supply chain)
|
+-- [2] Brute force (D2, weak rate limiting)
|   +-- Parallel connections, 1-2 attempts/sec/conn
|   +-- No lockout, no CAPTCHA, no IP blocking
|
+-- [3] Use obtained credentials
    |
    +-- [3.1] Impersonate user (S1)
    +-- [3.2] Create persistent API keys (E2)
    +-- [3.3] Exfiltrate data (jobs, resumes, API keys)
    +-- [3.4] Stuff credentials on other services (S2)
```

---

## Recommended Mitigations by Priority

### P0 -- Immediate (Fix Within 24 Hours)

#### M1: Add `method="POST"` and `action` to Auth Forms

**Files:**
- `/home/pascal/projekte/jobsync/src/components/auth/SigninForm.tsx` (line 56-58)
- `/home/pascal/projekte/jobsync/src/components/auth/SignupForm.tsx` (line 61)

**Change:**
```tsx
// BEFORE (both forms):
<form onSubmit={form.handleSubmit(onSubmit)}>

// AFTER:
<form method="POST" action="" onSubmit={form.handleSubmit(onSubmit)}>
```

The `method="POST"` ensures that even during the hydration gap, credentials are sent in the request body, not the URL. The `action=""` ensures the form submits to the current page (same-origin) rather than any potentially injected target.

**Addresses:** S1, S2, T1, I1-I8, E1, E2

#### M2: Add Credential-in-URL Detection Middleware

Add middleware logic that detects credentials in query strings and strips them with a redirect:

```typescript
// In middleware.ts, before auth handler:
if (request.nextUrl.searchParams.has('password')) {
  const cleanUrl = new URL(request.nextUrl.pathname, request.url);
  return NextResponse.redirect(cleanUrl, { status: 302 });
}
```

**Addresses:** I1, I2, I3, I5, I7, I8

#### M3: Add Security Headers via Middleware

Expand middleware to apply security headers on all routes:

```
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

When HTTPS is enabled, add:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

**Addresses:** I3, T2, E3

#### M4: Expand Middleware Matcher

```typescript
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|flags|api/auth).*)",
  ],
};
```

Or explicitly add auth routes:

```typescript
matcher: [
  "/dashboard",
  "/dashboard/:path*",
  "/signin",
  "/signup",
],
```

**Addresses:** E3, D2

### P1 -- Short Term (Fix Within 1-2 Weeks)

#### M5: Implement Auth Route Rate Limiting

Add per-IP rate limiting for `/signin`, `/signup`, and `/api/auth/callback/credentials`:
- 5 failed attempts per IP per 15 minutes
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s
- CAPTCHA trigger after 3 failed attempts
- Temporary IP block after 20 failed attempts in 1 hour

**Addresses:** D2, D3

#### M6: Implement Authentication Audit Logging

Log all authentication events in a structured format:
- Timestamp, IP, user-agent, email (hashed), success/failure
- Failed attempt counter per account
- Anomaly detection (new IP, new device, unusual time)

**Addresses:** R1, R2

#### M7: Enforce HTTPS

Even for local/homelab deployment:
- Use Tailscale HTTPS (automatic certificates for Tailscale IPs)
- Or use a local CA with mkcert
- Or use Caddy as reverse proxy (automatic HTTPS)
- Update `NEXTAUTH_URL` to `https://...`
- Enable `secureCookies` in NextAuth config

**Addresses:** I4, T1, T2

#### M8: Strengthen Password Policy

- Minimum 12 characters
- Integration with HaveIBeenPwned API (k-anonymity model)
- Password strength meter in UI
- Block common passwords (top 10,000 list)

**Addresses:** S2, D2

### P2 -- Medium Term (Fix Within 1-2 Months)

#### M9: Implement Multi-Factor Authentication

- TOTP-based (authenticator app)
- Optional WebAuthn/FIDO2 for hardware key support
- Recovery codes

**Addresses:** S1, E1, E2

#### M10: Session Management Improvements

- Active session listing and remote revocation
- Session rotation on privilege changes
- Automatic API key revocation on password change
- Login history with IP and device information

**Addresses:** R2, E2, T2

#### M11: Add Content Security Policy for Auth Pages

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none';
```

The `form-action 'self'` directive is critical -- it prevents form submission to any external origin.

**Addresses:** I3, E3

### P3 -- Long Term (Fix Within Quarter)

#### M12: Implement Email Verification for Signup

**Addresses:** D3

#### M13: Add Login Notifications

**Addresses:** S1, R1

#### M14: Implement RBAC

**Addresses:** E1

---

## Compliance Impact Assessment

| Framework | Relevant Requirement | Status | Gap |
|---|---|---|---|
| **OWASP Top 10 (2021)** | A01: Broken Access Control | **FAIL** | Middleware only covers /dashboard; auth routes unprotected |
| **OWASP Top 10 (2021)** | A02: Cryptographic Failures | **FAIL** | Credentials transmitted in URL over HTTP (plaintext) |
| **OWASP Top 10 (2021)** | A04: Insecure Design | **FAIL** | Missing method="POST" is a design flaw, not implementation bug |
| **OWASP Top 10 (2021)** | A05: Security Misconfiguration | **FAIL** | No security headers, no HTTPS, debug logging enabled by default |
| **OWASP Top 10 (2021)** | A07: Identification and Authentication Failures | **FAIL** | Weak brute force protection, no MFA, weak password policy |
| **OWASP Top 10 (2021)** | A09: Security Logging and Monitoring Failures | **FAIL** | No auth audit logging |
| **OWASP ASVS L1** | V2.2.1: Anti-automation controls | **FAIL** | Random 0-1000ms delay only |
| **OWASP ASVS L1** | V3.1.1: Session management | **PARTIAL** | JWT sessions exist but no revocation, no rotation |
| **GDPR** | Art. 32: Security of processing | **RISK** | Credentials in URLs violate data minimization and security principles |
| **NIST 800-63B** | Authenticator requirements | **FAIL** | No rate limiting, no MFA, 6-char minimum password |

---

## Appendix A: Delay Function Analysis

The `delay()` utility (`src/utils/delay.ts`) used for brute-force "protection":

```typescript
export const delay = (max = 2500) => {
  const randomDelayTime = Math.floor(Math.random() * (max - 500 + 1));
  return new Promise((resolve) => setTimeout(resolve, randomDelayTime));
};
```

Called as `delay(1000)` in `authenticate()`, this produces:
- `Math.floor(Math.random() * (1000 - 500 + 1))` = random integer between 0 and 500
- Average delay: ~250ms
- This provides negligible brute-force protection (approximately 2-4 attempts/second per connection)
- With 10 parallel connections: ~20-40 attempts/second
- A 6-character password space can be brute-forced in hours

---

## Appendix B: Evidence File References

| File | Line(s) | Evidence |
|---|---|---|
| `src/components/auth/SigninForm.tsx` | 56-58 | `<form onSubmit={...}>` -- missing `method="POST"` |
| `src/components/auth/SignupForm.tsx` | 61 | `<form onSubmit={...}>` -- missing `method="POST"` |
| `src/actions/auth.actions.ts` | 60 | `await delay(1000)` -- only brute-force protection |
| `src/actions/auth.actions.ts` | 61-63 | `signIn("credentials", { redirect: false })` -- client redirect |
| `src/utils/delay.ts` | 1-4 | Delay generates 0-500ms, not 1 second |
| `src/auth.ts` | 27 | `password: z.string().min(6)` -- server-side minimum |
| `src/models/signinForm.schema.ts` | 16 | `password.min(1)` -- client-side signin accepts 1-char passwords |
| `src/auth.config.ts` | 20-29 | `authorized()` only checks `/dashboard` prefix |
| `src/middleware.ts` | 46-50 | Matcher limited to `/dashboard` and `/dashboard/:path*` |
| `src/middleware.ts` | 12-33 | CORS headers only, no security headers |
| `next.config.mjs` | 1-10 | No security headers configuration |
| `.env.example` | 9 | `NEXTAUTH_URL=http://localhost:3737` -- HTTP only |
| `.env.example` | 36 | `DEBUG_LOGGING=true` -- debug enabled by default |

---

*This threat model should be reviewed and updated whenever the authentication system is modified, new features are added to the auth flow, or the deployment topology changes.*
