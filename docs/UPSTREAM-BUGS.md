# Upstream Bug Report for Gsync/jobsync

**Reported by:** @rorar (fork maintainer)
**Date:** 2026-03-24, updated 2026-04-01
**Branch tested:** dev (commit 5879362), re-verified against upstream/main (v1.1.9, 2026-04-01)
**JobSync version:** 1.1.4+

### GitHub Issues Filed (2026-04-01)

| Issue | Title | Severity | Bugs Covered |
|---|---|---|---|
| [#67](https://github.com/Gsync/jobsync/issues/67) | Credentials exposed in URL (missing form method=POST) | Critical (CVSS 9.1) | #0 |
| [#68](https://github.com/Gsync/jobsync/issues/68) | Path Traversal + IDOR in Resume API | High (CVSS 8.6) | #1, #8, #14 |
| [#69](https://github.com/Gsync/jobsync/issues/69) | Stored XSS via unsanitized HTML rendering | Critical (CVSS 9.0) | #12 |
| [#70](https://github.com/Gsync/jobsync/issues/70) | SSRF via user-controlled Ollama URL | High (CVSS 8.5) | NEW |
| [#71](https://github.com/Gsync/jobsync/issues/71) | Systematic IDOR — missing ownership checks | High (CVSS 8.3) | #6, NEW (B-G) |
| [#72](https://github.com/Gsync/jobsync/issues/72) | Auth architecture weaknesses (bundled) | Medium | #9, #10, #16, NEW (H, I, J) |

---

## Critical Security Vulnerabilities

### 0. Credentials Exposed in URL via GET Fallback — [#67](https://github.com/Gsync/jobsync/issues/67)

**Files:** `src/components/auth/SigninForm.tsx` (~line 57), `src/components/auth/SignupForm.tsx` (~line 61)
**CVSS 3.1:** 9.1 (Critical) — AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N
**CWE:** CWE-598 (Use of GET Request Method With Sensitive Query Strings)

Both authentication forms render `<form onSubmit={form.handleSubmit(onSubmit)}>` without `method="POST"`. During Next.js hydration gaps (the period between server-rendered HTML and client-side JS initialization), if a user submits the form before JavaScript loads, the browser falls back to native HTML form behavior. Without an explicit `method` attribute, the HTML spec defaults to `GET`, encoding all form fields — including email and password — as URL query parameters:

```
http://<host>:3737/signin?email=admin%40example.com&password=password123
```

**Exposure vectors:**
- Browser history (permanent, synced across devices via Chrome/Firefox/Edge sync)
- Browser URL bar autocomplete suggestions
- Server access logs (nginx, Apache, Caddy log full GET URLs)
- Next.js dev server stdout logging
- Proxy/firewall logs (Squid, Zscaler, corporate DPI)
- Referer header leakage to any external resources loaded on the page
- Plaintext HTTP transmission (self-hosted deployments typically use HTTP)
- Screenshot/screen recording/screen share visibility

**Reproduction:**
1. Navigate to `/signin`
2. Disable JavaScript in browser DevTools (or throttle network to Slow 3G and submit quickly)
3. Enter credentials and press Enter
4. Observe URL bar contains `?email=...&password=...`

**Suggested Fix:**
```diff
- <form onSubmit={form.handleSubmit(onSubmit)}>
+ <form method="POST" action="" onSubmit={form.handleSubmit(onSubmit)}>
```

**Full analysis:** See [security/SECURITY-REPORT-upstream-credential-url-leakage.md](security/SECURITY-REPORT-upstream-credential-url-leakage.md)

---

### 1. Path Traversal in Resume File Download API

**File:** `src/app/api/profile/resume/route.ts` (GET handler, ~line 96-108)

The `filePath` query parameter is read directly from user input and passed to `fs.readFileSync()` without any path validation. An attacker can read any file on the server.

**Reproduction:**
```
GET /api/profile/resume?filePath=/etc/passwd
GET /api/profile/resume?filePath=/home/user/.env
```

**Impact:** Full server file system read access for any authenticated user. Exposes `.env`, source code, and all server files.

**Suggested Fix:** Validate resolved path is within the upload directory, or look up file path by database ID instead of accepting raw paths.

---

### 2. handleError() Returns undefined for Non-Error Exceptions

**File:** `src/lib/utils.ts` (function `handleError`, ~line 36-44)

Only returns `{ success, message }` when `error instanceof Error`. For non-Error exceptions (string, number, plain object), returns `undefined`. Affects ~80 call sites across all server actions, causing runtime crashes on destructuring.

**Suggested Fix:** Add fallback `return { success: false, message: msg };` at end of function.

---

### 3. API Route Handlers Return undefined on Non-Error Exceptions

**File:** `src/app/api/profile/resume/route.ts` (POST ~line 65-77, GET ~line 138-150)

Catch blocks only return NextResponse for `instanceof Error`. Non-Error throws produce empty responses.

**Suggested Fix:** Add generic fallback: `return NextResponse.json({ error: "Internal error" }, { status: 500 });`

---

### 4. CSV Export Error Silently Swallowed

**File:** `src/app/api/jobs/export/route.ts` (~line 82-94)

Error response inside IIFE catch returns to the IIFE, not the HTTP handler. The PassThrough stream was already returned. Error response is created but never sent to client.

**Suggested Fix:** Write error to the stream before ending it.

---

### 5. Toast Race Condition in AddJob

**File:** `src/components/myjobs/AddJob.tsx` (~line 149-168)

Success toast fires outside `startTransition` callback — runs before async server action completes. User sees success toast even when action fails.

**Suggested Fix:** Move success toast inside the transition callback, after checking result.

---

## High Severity Bugs

### 6. Loose Equality for Authorization Checks

**Files:** `src/actions/job.actions.ts:337`, `src/actions/company.actions.ts:162`

Uses `!=` instead of `!==` for user ID comparison. Type coercion could bypass auth.

### 7. Non-Null Assertions on Undefined Values

**File:** `src/actions/profile.actions.ts:250-262`

`fileName!` and `filePath!` used on `string | undefined` parameters.

### 8. path.join(filePath) is a No-op

**File:** `src/app/api/profile/resume/route.ts:106`

Single-argument `path.join()` returns input unchanged. Path sandboxing was intended but never implemented.

### 9. Hardcoded PBKDF2 Salt

**File:** `src/lib/encryption.ts:15`

Salt is `"jobsync-api-key-encryption"` instead of random per-encryption. Enables pre-computation attacks.

### 10. Jobs Export Missing Auth Check

**File:** `src/app/api/jobs/export/route.ts`

No `auth()` call. Returns HTTP 200 with empty CSV for unauthenticated users.

### 11. No Error Boundaries

Missing: `src/app/error.tsx`, `global-error.tsx`, `dashboard/error.tsx`, `not-found.tsx`. Unhandled errors show blank white screen.

---

## Medium Severity

### 12. XSS via Unsanitized HTML Rendering

**File:** `src/components/questions/QuestionCard.tsx:94`

User-provided `question.answer` rendered via innerHTML without sanitization. Needs DOMPurify or safe rendering.

### 13. Salary Range Data Gaps

**File:** `src/lib/data/salaryRangeData.ts`

Missing: 110K-120K and 140K-150K ranges.

### 14. Resume Route Missing Ownership Check

**File:** `src/app/api/profile/resume/route.ts:15,82`

`userId` extracted but never used. Files accessed without verifying ownership.

### 15. DeepSeek API Returns 500 Instead of 401

**File:** `src/app/api/ai/deepseek/models/route.ts`

Returns "API key not configured" (500) for unauthenticated users instead of 401.

### 16. Middleware Only Protects /dashboard

**File:** `src/middleware.ts`

Matcher excludes all `/api/*` routes. Each route must individually implement auth.

---

## Low Severity

| Bug | File |
|-----|------|
| `Promise<any>` return types on ~80 actions | Multiple |
| 50+ console.log in production | Multiple |
| Typo: "no user privilages" | `job.actions.ts:338` |
| Variable typo: `comapnies` | `company.actions.ts:76` |
| Commented-out time validation | `utils.ts:73` |
| Dead file: `route.example.ts` | `src/app/api/company/` |
| DownloadFileButton typed as `any` | `DownloadFileButton.tsx` |

---

*Report generated by automated static analysis, runtime testing, and code review.*
*Fork: https://github.com/rorar/jobsync*
*Upstream: https://github.com/Gsync/jobsync*
