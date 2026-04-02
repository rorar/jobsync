# Phase 2 Security Audit -- 34-File Review

**Auditor:** Claude Opus 4.6 (Security Agent)
**Date:** 2026-04-01
**Scope:** 34 files across Sprint A, B, C (Tracks 1-3)
**Methodology:** Manual code review against ADR-015 through ADR-019, OWASP Top 10 2021, CWE database
**Baseline:** Post-audit codebase with 96 bugs previously fixed

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 4     |
| Medium   | 7     |
| Low      | 5     |
| **Total**| **17**|

---

## Critical Findings

### SEC-P2-01: GET /api/v1/jobs/:id uses `include` instead of `select`, leaking internal fields and full userId to API consumers

**Severity:** Critical
**CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
**File:** `src/app/api/v1/jobs/[id]/route.ts:18-29`

**Description:** The GET handler uses Prisma `include` instead of an explicit `select`. When Prisma uses `include`, ALL scalar fields on the Job model are returned in the response. This leaks:

- `userId` -- the internal user ID of the job owner
- `matchData` -- raw JSON AI match analysis (may contain resume content excerpts)
- `automationId` -- internal automation linkage
- `discoveryStatus` -- internal pipeline state
- `statusId`, `jobTitleId`, `companyId`, `locationId`, `jobSourceId`, `resumeId` -- internal foreign keys
- Related entity `createdBy` fields (e.g., `Company.createdBy`, `JobTitle.createdBy`) -- these are userId values leaked through nested relations with `include: true`

The same problem exists in the PATCH response at line 141-152 and the POST response in `route.ts:165-173`.

**Attack scenario:** An API consumer (n8n workflow, browser extension, script) sees the full userId, internal IDs, and potentially AI-generated match data containing resume excerpts. The userId could be used to correlate across API calls or attempt IDOR attacks on other endpoints. The `createdBy` field on related entities (JobTitle, Company, Location, JobSource) also exposes the userId through the nested `include: true`.

**Recommended fix:** Replace `include` with explicit `select` on all three handlers (GET, PATCH, POST). Omit `userId`, `matchData`, `automationId`, `discoveryStatus`, all foreign key IDs, and use `select` (not `include: true`) on nested relations to exclude `createdBy` fields. The GET list endpoint at `/api/v1/jobs/route.ts` already demonstrates the correct pattern with explicit `select`.

---

## High Findings

### SEC-P2-02: Degradation system uses `findUnique` by ID alone without userId -- IDOR violation (ADR-015)

**Severity:** High
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
**File:** `src/lib/connector/degradation.ts:144`

**Description:** The `checkConsecutiveRunFailures` function uses `prisma.automation.findUnique({ where: { id: automationId } })` without including `userId` in the where clause. This violates ADR-015 which mandates that ALL Prisma reads/writes include userId.

While this function is called from server-side runner code (not directly from a client), the `automationId` parameter flows from scheduler context. The ADR-015 rule exists as defense-in-depth -- if an attacker could influence which automationId is passed (e.g., through a race condition or future code path), they could query or modify another user's automation.

Additionally, `findUnique` is used where the security rules require `findFirst` when adding userId filters (since Prisma `findUnique` requires the exact unique key constraint).

**Attack scenario:** If a future code path allows an attacker to supply an arbitrary automationId to `checkConsecutiveRunFailures`, the function would operate on any user's automation without ownership verification.

**Recommended fix:** Change `findUnique` to `findFirst` and add a userId parameter or resolve userId from the automation's run context. Since this is a server-only utility, the userId can be passed from the caller or resolved from the automationRun's associated automation.

---

### SEC-P2-03: `handleAuthFailure` and `handleCircuitBreakerTrip` query automations without userId scoping

**Severity:** High
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
**File:** `src/lib/connector/degradation.ts:60-71`, `src/lib/connector/degradation.ts:223-239`

**Description:** Both `handleAuthFailure` (line 60) and `handleCircuitBreakerTrip` (line 223) query `prisma.automation.findMany({ where: { jobBoard: moduleId, status: "active" } })` without any userId scope. They then issue `updateMany` on the matched IDs.

While the intent is to pause ALL automations using a failing module (cross-user), this means a single module failure affects all users. This is an architectural concern: the degradation functions operate on a global scope, which is intentional for module-level failures. However, the `notification.createMany` at lines 80-91 and 243-254 creates notifications containing automation names and module names for each affected user -- this is correct per-user notification.

The real concern is that the `updateMany` at lines 70-76 and 233-239 uses `id: { in: affectedAutomations.map(a => a.id) }` without userId, which means if there were a TOCTOU race where an automation changed ownership, it could affect the wrong user. The code already documents TOCTOU prevention via pre-querying IDs, but the update itself lacks userId scoping.

**Attack scenario:** In a multi-user deployment, a module failure triggered by User A's credentials would pause User B's automations using the same module. While this may be intentional for module-level failures, the notifications leak automation names across user boundaries (each user sees only their own notifications, but the batch operation itself is cross-user).

**Recommended fix:** If cross-user degradation is intentional (module-level), document this explicitly as a security-aware design decision in an ADR. If per-user degradation is desired, add `userId` scoping to the queries. At minimum, add a userId filter to the `updateMany` calls as defense-in-depth.

---

### SEC-P2-04: Timing oracle in API key validation despite comment claiming constant-time

**Severity:** High
**CWE:** CWE-208 (Observable Timing Discrepancy)
**File:** `src/lib/api/auth.ts:24-35`

**Description:** The code comments claim "Constant-time evaluation to prevent timing oracle (SEC-17)" but the implementation is not actually constant-time. The `findUnique` database query at line 24 will return faster for non-existent keys (no disk I/O for the row) than for existing keys. More critically, the `shouldWriteLastUsedAt` call and `prisma.publicApiKey.update` at lines 38-47 only execute for valid keys, creating a measurable timing difference between valid and invalid keys.

The boolean operations at lines 31-33 are JavaScript-level and negligible compared to the DB-level timing difference. True constant-time would require performing equivalent DB operations regardless of key validity.

**Attack scenario:** An attacker could measure response times to determine whether a key hash exists in the database (valid but revoked vs. completely non-existent), narrowing the search space for brute-force attacks. The `lastUsedAt` update for valid keys creates an even larger timing delta.

**Recommended fix:**
1. Remove the misleading "constant-time" comment -- the current implementation does NOT achieve constant-time behavior.
2. For a self-hosted single-user deployment, the practical risk is low. Document this as an accepted risk.
3. If stronger protection is needed: perform a dummy DB query for invalid keys to equalize timing, or use the `crypto.timingSafeEqual` pattern for the hash comparison step (though the DB query timing is the larger issue).

---

### SEC-P2-05: IP-based rate limiting trusts `x-forwarded-for` header without validation

**Severity:** High
**CWE:** CWE-348 (Use of Less Trusted Source)
**File:** `src/lib/api/with-api-auth.ts:44-47`

**Description:** The pre-auth IP rate limiter extracts the client IP from `x-forwarded-for` or `x-real-ip` headers:

```
const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || req.headers.get("x-real-ip")
  || "unknown";
```

These headers are trivially spoofable by clients when there is no trusted reverse proxy, or when the proxy configuration does not strip/overwrite incoming `x-forwarded-for` values. An attacker can bypass the 120 req/min IP rate limit entirely by rotating the `x-forwarded-for` header value with each request.

Furthermore, the fallback to `"unknown"` means that if neither header is present, ALL requests without headers share a single rate limit bucket -- an attacker could exhaust this shared bucket to deny service to other headerless clients.

**Attack scenario:** Attacker sends requests with randomized `X-Forwarded-For: <random_ip>` headers, each getting its own rate limit bucket with 120 requests. This completely bypasses the pre-auth rate limiting designed to prevent DoS via invalid key flooding (ADR-019).

**Recommended fix:**
1. In production behind a reverse proxy (nginx, Caddy): configure the proxy to set a trusted `X-Real-IP` header and strip client-supplied `X-Forwarded-For`.
2. In the code: add a configuration option for the trusted proxy header (e.g., `TRUSTED_PROXY_HEADER=x-real-ip`) and only use that header for rate limiting.
3. When no trusted header is available, fall back to the socket IP (Next.js does not directly expose this, but the request object may carry it depending on the deployment).
4. Change the `"unknown"` fallback to generate a unique bucket key per request (effectively rate-limiting nothing) rather than creating a shared bucket.

---

## Medium Findings

### SEC-P2-06: `GET /api/v1/jobs` list endpoint exposes `userId` in response

**Severity:** Medium
**CWE:** CWE-200 (Exposure of Sensitive Information)
**File:** `src/app/api/v1/jobs/route.ts:54`

**Description:** The GET list handler explicitly includes `userId: true` in the select clause at line 54. The userId is an internal identifier that should not be exposed to API consumers. While the API consumer already authenticated with an API key tied to this user, exposing the raw userId provides no value to the consumer and increases the attack surface.

**Recommended fix:** Remove `userId: true` from the select clause. The API consumer knows their own identity through their API key -- there is no use case for returning the userId in job list responses.

---

### SEC-P2-07: POST and PATCH responses on `/api/v1/jobs` and `/api/v1/jobs/:id` leak internal entity `createdBy` (userId)

**Severity:** Medium
**CWE:** CWE-200 (Exposure of Sensitive Information)
**File:** `src/app/api/v1/jobs/route.ts:165-173`, `src/app/api/v1/jobs/[id]/route.ts:144-152`

**Description:** Both the POST create and PATCH update responses use `include: { JobTitle: true, Company: true, Status: true, Location: true, JobSource: true, tags: true }`. When using `include: true` on related entities, Prisma returns ALL fields of those entities. The JobTitle, Company, Location, and JobSource models all contain a `createdBy` field which is the userId. The Tag model also likely has ownership fields.

This means every POST and PATCH response leaks the userId through multiple nested paths.

**Recommended fix:** Use explicit `select` on all included relations. For example:
```
JobTitle: { select: { id: true, label: true, value: true } },
Company: { select: { id: true, label: true, value: true } },
```

---

### SEC-P2-08: SSE scheduler endpoint lacks per-user rate limiting

**Severity:** Medium
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
**File:** `src/app/api/scheduler/status/route.ts:33`

**Description:** The SSE endpoint at `/api/scheduler/status` checks authentication (line 34-37) but has no rate limiting on connection establishment. An authenticated user could open hundreds of simultaneous SSE connections, each of which creates a `ReadableStream` with an `setInterval` polling every 2 seconds and a `setTimeout` for 10 minutes.

The client-side hook (`use-scheduler-status.ts`) uses a singleton pattern to prevent multiple connections per tab, but a malicious user could bypass the client-side code and directly open many EventSource connections.

**Attack scenario:** Authenticated user opens 1000 SSE connections via curl or script. Each connection runs a `setInterval` every 2s and holds server memory for up to 10 minutes. This creates 500 interval ticks/second of CPU load plus memory for 1000 stream controllers and their closures.

**Recommended fix:** Add a per-user connection counter (in-memory Map keyed by userId). Reject new SSE connections when a user already has N active connections (e.g., N=5). Decrement the counter in the cleanup function.

---

### SEC-P2-09: Blacklist pattern input lacks length validation

**Severity:** Medium
**CWE:** CWE-20 (Improper Input Validation)
**File:** `src/actions/companyBlacklist.actions.ts:59`

**Description:** The `addBlacklistEntry` function trims the pattern and checks for empty strings, but does not enforce a maximum length. An attacker could submit extremely long blacklist patterns (megabytes) which would be stored in the database and potentially cause performance issues during the blacklist matching phase in the pipeline.

The `reason` parameter is also unbounded in length.

**Recommended fix:** Add maximum length validation:
```
if (trimmedPattern.length > 500) {
  return { success: false, message: "blacklist.patternTooLong" };
}
if (reason && reason.trim().length > 1000) {
  return { success: false, message: "blacklist.reasonTooLong" };
}
```

---

### SEC-P2-10: `ConnectorCache` key injection via unsanitized user input in `buildKey`

**Severity:** Medium
**CWE:** CWE-74 (Improper Neutralization of Special Elements in Output)
**File:** `src/lib/connector/cache.ts:63-82`

**Description:** The `ConnectorCache.buildKey` method joins segments with `:` as a delimiter, but does not sanitize input segments that may contain `:` characters. If user-controlled input (e.g., search keywords, location strings) flows into the `params` segment, an attacker could craft input that produces cache key collisions with other modules or operations.

For example, a search for `"developer:eures:search"` as a keyword could produce a key that collides with a legitimate cache entry for a different module/operation combination.

**Attack scenario:** User submits search keywords containing `:` characters. The resulting cache key `eures:search:developer:eures:search:en` could collide with or be confused with `eures:search:developer:eures:search:en` from a different parameter set, leading to cache poisoning where one user's search results are served to another query.

**Recommended fix:** Sanitize the `:` delimiter from input segments, or use a different delimiter that is unlikely in user input (e.g., null byte), or hash the params segment before inclusion in the key.

---

### SEC-P2-11: `handleError` in utils.ts forwards raw Error.message to API consumers via ActionResult

**Severity:** Medium
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)
**File:** `src/lib/utils.ts:54` (consumed by `src/actions/publicApiKey.actions.ts` and `src/actions/companyBlacklist.actions.ts`)

**Description:** The `handleError` function returns `error.message` directly in the ActionResult. While the `/api/v1/*` routes have error sanitization in `response.ts` (SEC-18), the server actions used by the UI components (`publicApiKey.actions.ts`, `companyBlacklist.actions.ts`) pass these raw messages to `toast()` in the UI.

If Prisma throws an error (e.g., unique constraint violation with table/column names), the raw error message including database schema details could be displayed in the toast notification.

The `response.ts:43-44` sanitization only catches 500-level errors. Error messages that happen to contain the words "not found", "validation", "invalid", or "provide" will be passed through unsanitized at 400/404 status codes. A Prisma error message like "Invalid `prisma.companyBlacklist.create()` invocation" contains "Invalid" and would be passed through as a 400 error with the full Prisma error detail.

**Recommended fix:** The `handleError` function should not forward raw Prisma error messages. Map known Prisma error codes (P2002 for unique, P2003 for FK, P2025 for not found) to safe i18n message keys. For all other errors, return the generic `msg` parameter.

---

### SEC-P2-12: Notification messages in degradation contain user-controlled automation names

**Severity:** Medium
**CWE:** CWE-116 (Improper Encoding or Escaping of Output)
**File:** `src/lib/connector/degradation.ts:84`, `src/lib/connector/degradation.ts:166`, `src/lib/connector/degradation.ts:247`

**Description:** Notification messages are constructed using string interpolation with user-controlled `automation.name`:

```
message: `Automation "${auto.name}" paused: authentication failed ...`
```

If the automation name contains special characters (e.g., HTML tags), and the notification rendering in the UI does not properly escape HTML, this could lead to stored XSS.

While React's JSX auto-escapes text content, this is a defense-in-depth concern: if any notification rendering path uses unsafe HTML rendering or a non-React renderer (e.g., email notifications, SSE push), the stored XSS payload would execute.

**Recommended fix:** Sanitize or truncate the automation name before interpolation in notification messages. This is a defense-in-depth measure -- even though React escapes by default, the stored message should be safe for any rendering context.

---

## Low Findings

### SEC-P2-13: `CompanyBlacklistSettings` UI allows `starts_with` and `ends_with` match types in server action but not in the Select dropdown

**Severity:** Low
**CWE:** CWE-20 (Improper Input Validation)
**File:** `src/actions/companyBlacklist.actions.ts:43`, `src/components/settings/CompanyBlacklistSettings.tsx:115-118`

**Description:** The server action `addBlacklistEntry` validates `matchType` against `["exact", "contains", "starts_with", "ends_with"]`, but the UI component only renders `"contains"` and `"exact"` in the Select dropdown. The `starts_with` and `ends_with` types are accepted server-side but have no UI for creation.

This is not a vulnerability per se, but an inconsistency. A user could call the server action directly (since it's a "use server" export) with `starts_with` or `ends_with` match types, creating entries that are displayed in the UI with the "contains" label (since the display logic only maps "exact" and "contains" at line 163-165).

**Recommended fix:** Either restrict the server-side validation to only `["exact", "contains"]` to match the UI, or add the missing match types to the Select dropdown and update the display logic.

---

### SEC-P2-14: `isMockDataEnabled` uses `NEXT_PUBLIC_` env var that is visible to clients

**Severity:** Low
**CWE:** CWE-215 (Insertion of Sensitive Information Into Debugging Code)
**File:** `src/lib/constants.ts:63-68`

**Description:** The `isMockDataEnabled` function checks `process.env.NEXT_PUBLIC_ENABLE_MOCK_DATA === "true"`. The `NEXT_PUBLIC_` prefix means this value is bundled into client-side JavaScript and visible to anyone inspecting the page source. If developer tools or mock data routes are gated by this flag, a user could see that mock data mode is enabled.

**Recommended fix:** If this flag controls any server-side behavior beyond UI elements, use a non-public env var (without the `NEXT_PUBLIC_` prefix) for the server-side check. The current implementation is acceptable if it only controls client-side UI elements like the developer sidebar link.

---

### SEC-P2-15: `ViewModeToggle` stores preference in localStorage without validation on read

**Severity:** Low
**CWE:** CWE-20 (Improper Input Validation)
**File:** `src/components/staging/ViewModeToggle.tsx:16-19`

**Description:** The `getPersistedViewMode` function reads from localStorage and checks `stored === "deck"`, defaulting to `"list"` for any other value. This is safe. However, there is no concern here beyond noting that localStorage values can be tampered with by browser extensions or XSS. The current implementation handles this correctly by treating any unexpected value as "list".

**Recommended fix:** No action needed -- included for completeness. The current default-to-safe pattern is correct.

---

### SEC-P2-16: `publicApiKey.actions.ts` throws Error with English strings instead of i18n keys

**Severity:** Low
**CWE:** CWE-209 (Information Exposure Through an Error Message)
**File:** `src/actions/publicApiKey.actions.ts:23,28,30,39`

**Description:** The server actions use `throw new Error("Not authenticated")`, `throw new Error("Please provide a name for the API key")`, etc. Per the project's feedback rule (`feedback_i18n_error_messages.md`), all `throw new Error()` in server actions MUST use i18n keys, not hardcoded English. These error messages are forwarded to the UI via `handleError` and displayed in toast notifications, meaning non-English users see English error text.

While this is primarily an i18n issue, it has a minor security implication: English error messages can reveal implementation details to attackers probing the API.

**Recommended fix:** Replace all `throw new Error("...")` with i18n key references: `throw new Error("api.notAuthenticated")`, `throw new Error("api.keyNameRequired")`, etc.

---

### SEC-P2-17: Race condition in `removeBlacklistEntry` between findFirst and delete

**Severity:** Low
**CWE:** CWE-367 (Time-of-check Time-of-use)
**File:** `src/actions/companyBlacklist.actions.ts:112-121`

**Description:** The `removeBlacklistEntry` function performs a `findFirst` with `{ id, userId }` for ownership verification, then performs a `delete` with only `{ id }`. There is a TOCTOU window between the ownership check and the delete where, in a multi-process deployment, another request could modify the entry.

In practice, this is mitigated by SQLite's single-writer nature and the self-hosted single-instance deployment model. However, the pattern violates the defense-in-depth principle.

**Recommended fix:** Use a single `deleteMany` with both `{ id, userId: user.id }` to combine ownership check and deletion atomically:
```
const result = await prisma.companyBlacklist.deleteMany({
  where: { id, userId: user.id },
});
if (result.count === 0) {
  return { success: false, message: "Entry not found" };
}
```

---

## Passed Checks (No Issues Found)

The following security rules were verified and found to be correctly implemented:

1. **SSE authentication (Rule 10):** The `/api/scheduler/status` endpoint correctly calls `auth()` and checks `session?.user?.id` before establishing the SSE stream. User data is filtered by userId before streaming.

2. **withApiAuth wrapper (Rule 7):** All `/api/v1/*` route exports (GET, POST, PATCH, DELETE, OPTIONS) are wrapped with `withApiAuth()`. No routes bypass this wrapper.

3. **UUID validation (Rule 4):** All route parameter IDs in `/api/v1/jobs/[id]` and `/api/v1/jobs/[id]/notes` are validated with the UUID regex pattern.

4. **File.filePath never in responses (Rule 5):** The `GET /api/v1/jobs/:id` correctly uses `File: { select: { id: true, fileName: true, fileType: true } }` which excludes `filePath`.

5. **Pre-auth IP rate limiting (Rule 3):** The `withApiAuth` wrapper correctly applies 120 req/min IP-based rate limiting BEFORE API key validation, and 60 req/min per-key rate limiting AFTER authentication.

6. **Error sanitization (Rule 6):** The `response.ts` `actionToResponse` function correctly replaces 500-level error messages with a generic "An unexpected error occurred." string. The global catch in `withApiAuth` also returns a sanitized 500 error.

7. **"use server" exports (Rule 2):** The `companyBlacklist.actions.ts` correctly notes that `getBlacklistEntriesForUser` was moved to `src/lib/blacklist-query.ts` per SEC-13. All exported functions in "use server" files use `getCurrentUser()` rather than accepting raw userId.

8. **IDOR in API routes (Rule 1):** All Prisma queries in `/api/v1/*` routes include `userId` in the where clause. Ownership checks for resume and tags are correctly implemented with userId scoping.

9. **Credential handling (Rule 8):** The `PublicApiKeySettings` component correctly shows the API key only once during creation and uses clipboard API for copying. No credentials are embedded in URLs.

10. **No XSS via unsafe HTML rendering:** None of the 34 reviewed files use unsafe HTML injection patterns. All dynamic content is rendered through React JSX which auto-escapes.

11. **Rate limit store bounded:** The rate limit store has a `MAX_STORE_SIZE = 10_000` cap with LRU eviction, preventing unbounded memory growth.

12. **SSE connection lifecycle:** The SSE endpoint auto-closes after 10 minutes, has cleanup on client disconnect, and the client hook uses a shared singleton pattern to prevent connection multiplication.

13. **CORS configuration:** The `Access-Control-Allow-Origin: *` on API v1 routes is acceptable because authentication is via API key (not cookies), making CSRF irrelevant for these endpoints.

14. **Notes endpoint IDOR:** The `/api/v1/jobs/:id/notes` route correctly verifies job ownership via `findFirst({ where: { id: jobId, userId } })` before listing or creating notes, and includes `userId` in the note creation.

---

## Recommendations Summary (Prioritized)

| Priority | Finding | Fix Effort |
|----------|---------|------------|
| P0 | SEC-P2-01: Replace `include` with `select` in GET/PATCH/POST job responses | Small (3 endpoints) |
| P1 | SEC-P2-05: Document/fix IP rate limit header trust model | Small (config + docs) |
| P1 | SEC-P2-06: Remove `userId` from GET list select | Trivial |
| P1 | SEC-P2-07: Replace `include: true` with `select` on nested relations | Small (2 endpoints) |
| P2 | SEC-P2-02: Add userId to degradation findUnique | Small |
| P2 | SEC-P2-03: Document cross-user degradation as intentional or add userId scoping | Small (ADR) |
| P2 | SEC-P2-04: Remove misleading constant-time comment | Trivial |
| P2 | SEC-P2-08: Add per-user SSE connection limit | Small |
| P2 | SEC-P2-09: Add max length to blacklist pattern/reason | Trivial |
| P3 | SEC-P2-10: Sanitize cache key segments | Small |
| P3 | SEC-P2-11: Map Prisma errors to safe messages in handleError | Medium |
| P3 | SEC-P2-12: Sanitize automation names in notification messages | Small |
| P3 | SEC-P2-13: Align matchType validation between UI and server | Trivial |
| P3 | SEC-P2-16: Use i18n keys in publicApiKey error messages | Small |
| P3 | SEC-P2-17: Use atomic deleteMany for blacklist removal | Trivial |
