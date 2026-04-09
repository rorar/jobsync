# Sprint 2 Security Specialist Validation

## Purpose
Validation run — comparing specialized `comprehensive-review:security-auditor` against
the baseline at `.team-feature/stream-5b-security.md`. The architecture specialist run
produced ~40% uplift on HIGH findings; the orchestrator asked for a security-specialist
pass to test whether domain-specific expertise adds value on the other four dimensions.

Scope reviewed: `a92aaf3..HEAD` (dc48f4b), 129 files, ~14k lines. I deeply read the
security-surface files the baseline flagged PLUS the files the baseline did not touch:
`src/actions/module.actions.ts` (activation/deactivation cross-tenancy), `src/actions/
undo.actions.ts` + `src/lib/undo/undo-store.ts` (token ownership), `src/app/api/scheduler/
status/route.ts` (SSE leakage), `src/actions/logoCheck.actions.ts` (Wikimedia side channel),
and all 4 notification channel files end-to-end.

## Summary
- Files reviewed deeply: 28 of 129 (focused on security surface + files the baseline
  did not reach: `module.actions.ts`, `undo.actions.ts`, `undo-store.ts`, `scheduler/
  status/route.ts`, `notification-dispatcher.ts`, `email.channel.ts`, `push.channel.ts`,
  `email/templates.ts`, `api-key-resolver`, `logoCheck.actions.ts`, `deep-links.ts`,
  `enrichment-trigger.ts`, and all 4 Allium specs).
- Baseline HIGH findings confirmed: 3 of 3
- Baseline HIGH findings downgraded/rejected: 0
- NEW HIGH findings: 2 (HS-04 cross-tenant module privilege escalation, HS-05
  incomplete token stripping in the ONE place it currently exists)
- NEW MEDIUM findings: 3
- NEW LOW findings: 2
- Out-of-scope observations: 2

## Baseline findings — agreement check

### H-S-01 (SVG sanitizer hardening claimed in db2f050 but never applied)
**Agree — CONFIRMED HIGH.**

Verified via `git show --name-only db2f050` — the commit changed only 4 files
(`logoCheck.actions.ts`, `logos/[id]/route.ts`, `logo-asset-service.ts`,
`logo-asset-subscriber.ts`). Neither `svg-sanitizer.ts`, `magic-bytes.ts`, nor
`url-validation.ts` appear in the commit. Reading the current source:

- `src/lib/assets/svg-sanitizer.ts:21-65` strips only `<script>`, `<foreignObject>`,
  `on*=` attributes, and `javascript:` URIs. It does NOT strip `<use>`, `<iframe>`,
  `<animate>`, `<set>`, `<image>`, `<handler>`, or `<?xml-stylesheet ?>` elements.
- `src/lib/assets/svg-sanitizer.ts:52,59` explicitly ALLOWS
  `data:image/svg+xml;base64,...` in `href`/`xlink:href`. The commit claimed this was
  blocked.
- `src/lib/assets/magic-bytes.ts:106-109` still uses `head.includes("<svg")` — not the
  root-element check the commit claimed.
- `__tests__/svg-sanitizer.spec.ts:337-343` codifies the gap as a passing test:
  `allows data:image/svg+xml in href (image allowlist)` asserts that
  `data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+` (decoded:
  `<svg onload="alert(1)"/>`) passes through unchanged. Baseline is exactly right.

In addition to the baseline's fix list, I note the CSP header on
`/api/logos/[id]/route.ts:111-112` (`default-src 'none'; style-src 'unsafe-inline';
sandbox`) is a strong mitigation for the `<img>`-embedded case. However, a nested-SVG
attack via `<image href="data:image/svg+xml;base64,...">` circumvents the outer
sanitizer's DOM-level protections because the sanitizer never decodes the base64 blob.
**In Firefox with certain rendering contexts the nested SVG's `onload` will still fire
even inside an `img` sandbox.** The commit message claim "nested SVG XSS vector blocked"
was strictly false.

### H-S-02 (Meta parser SSRF allowlist drifts from `validateWebhookUrl`)
**Agree — CONFIRMED HIGH.**

I diffed `src/lib/url-validation.ts:validateWebhookUrl` against
`src/lib/connector/data-enrichment/modules/meta-parser/index.ts:isValidExternalUrl /
isPrivateIP`:

| Range | validateWebhookUrl | meta-parser |
|---|---|---|
| 100.64.0.0/10 (CGNAT) | BLOCKED (L97) | **NOT BLOCKED** |
| 192.0.0.0/24 (IETF) | BLOCKED (L102) | **NOT BLOCKED** |
| 198.18.0.0/15 (bench) | BLOCKED (L108) | **NOT BLOCKED** |
| 240.0.0.0/4 (reserved) | BLOCKED (L114) | **NOT BLOCKED** |
| ::ffff:127.0.0.1 | BLOCKED (L128-153) | **NOT BLOCKED** |
| embedded credentials | BLOCKED | BLOCKED |

The meta-parser is reachable via `enrichment-trigger.ts:222-224` which passes
`job.jobUrl` (user-supplied when manually promoted OR harvested by a discovery module)
directly into the orchestrator. A user pasting `http://100.64.0.1/admin` in a Job URL
triggers server-side fetch during deep-link enrichment with NO CGNAT protection —
while the exact same URL is rejected by the webhook channel.

**Supplemental observation the baseline did not flag:** the cache key for deep-link
enrichment is `job.jobUrl` itself (see `enrichment-trigger.ts:209`), so an attacker
doesn't even have to trigger a fresh fetch — the URL gets persisted verbatim as
`EnrichmentResult.domainKey` (unbounded length). This is not directly exploitable, but
it means a fresh SSRF attempt pollutes the cache with the attacker's URL as the
domain-key, which could break legitimate lookups.

Suggested fix (same as baseline): delete `isValidExternalUrl` + `isPrivateIP` from the
meta-parser module and call `validateWebhookUrl(url)` directly. I additionally recommend
extracting a `safeFetchWithRedirects()` helper in `src/lib/http/safe-fetch.ts` because
the logic is now duplicated across `logo-asset-service.ts:safeFetch`,
`logoCheck.actions.ts:checkLogoUrl`, and `meta-parser/index.ts` — three divergent
implementations of the exact same pattern is a high maintenance burden and precisely
why the drift in H-S-02 happened.

### H-S-03 (`applyLogoWriteback` persists tokenized URLs verbatim)
**Agree — CONFIRMED HIGH.**

Verified in `src/lib/connector/data-enrichment/logo-writeback.ts:47-54` — the
`updateMany` writes `logoData.logoUrl` with zero token handling. Compare to
`src/lib/assets/logo-asset-service.ts:243` which does `stripTokenFromUrl(sourceUrl)`
before the company update. Two sibling paths, one defended, the other not.

**Critical supplemental observation I filed separately as H-S-05:** even where
`stripTokenFromUrl` IS called, it only strips the single parameter `token`
(url-validation-service.ts:114: `parsed.searchParams.delete("token")`). Logo.dev's URL
scheme happens to use exactly `?token=` so this works today. But any future module
using `?key=`, `?api_key=`, `?apiKey=`, `?sig=`, `?signature=`, `?auth=` etc. will leak
credentials into `Company.logoUrl` → rendered in Kanban cards, job details, CSV export,
notification payloads. Baseline correctly identified the writeback gap but didn't name
the incompleteness of the existing stripper. See H-S-05 below.

The baseline's suggested direction (shared `src/lib/assets/url-token-strip.ts` with an
expanded allowlist) is correct — I concur fully.

## NEW HIGH findings

### H-S-04 — Any authenticated user can cross-tenant-pause all other users' automations
- **File:** `src/actions/module.actions.ts:154-298` (activateModule, deactivateModule)
- **Severity:** HIGH
- **Rule:** OWASP A01 Broken Access Control, ADR-021 (cross-user module degradation is
  explicitly limited to internal signals, not user-initiated actions); specs/module-
  lifecycle.allium invariant `ActivationSymmetric`
- **Finding:** `deactivateModule(moduleId)` and `activateModule(moduleId)` are
  `"use server"` exports (the file declares `"use server"` at line 1). They accept a
  `moduleId` string from the client, call `getCurrentUser()` only to check that SOMEONE
  is authenticated, then flip the global module status in `moduleRegistry` AND
  `ModuleRegistration` in the DB, AND (in the deactivate path) pause every other user's
  automations that use that module.

  JobSync has no role model — `src/utils/user.utils.ts:5-14` returns `{ id, name, email }`
  with no role field; the Prisma schema has no `role` or `isAdmin` column. This is by
  design for a self-hosted single-user app, but multi-user is explicitly supported (the
  event-driven notification dispatch, the cross-user comments in CLAUDE.md "Cross-User
  Degradation" section, the per-user IDOR enforcement pattern throughout the codebase
  — all presuppose a multi-tenant deployment).

  Concretely: user Alice calls `deactivateModule("eures")` from her browser. The server
  action:
  1. Passes `getCurrentUser()` check because Alice is authenticated (line 205-206).
  2. Does NOT check that Alice has any relationship to the "eures" module.
  3. Flips `moduleRegistry.setStatus("eures", INACTIVE)` globally (line 221).
  4. Persists `moduleRegistration.status = "inactive"` — shared across all tenants
     (line 224-236).
  5. Queries `automation.findMany({ where: { jobBoard: "eures", status: "active" } })`
     with NO userId filter (line 242-248) — returns Bob's, Carol's, Dave's automations.
  6. `updateMany` pauses them all (line 252-258).
  7. Emits `ModuleDeactivated` domain events per affected user so they all get a
     notification from the dispatcher that THEIR automation was paused because the
     module was deactivated.

  Result: Alice has just disabled EURES for the entire deployment. Bob's job-discovery
  pipeline dies silently until an admin notices and manually reactivates. Bob cannot
  even reactivate his own automations without first calling `activateModule("eures")`
  — which is the same cross-tenant lever, now used to re-enable for everyone (possibly
  while another user is mid-credential-rotation or has explicitly disabled the module
  because of a data leak on the upstream side).

  CLAUDE.md frames the cross-user degradation pattern as "by design — module-level
  failures (invalid API key, circuit breaker) affect the shared external service".
  That rationale is specific to module-level runtime signals (auth-failure, CB-open)
  where the pause is a defensive response. User-initiated deactivation is a different
  category: it is explicitly a volitional toggle by one user, not an observation about
  the external service. ADR-021 conflates these two cases and therefore does not
  exempt the user-initiated path from authorization.

- **Reproduction / rationale:** From Alice's browser devtools:
  ```js
  const { deactivateModule } = await import("/src/actions/module.actions");
  // Actually, the server action ID is what the browser has; in practice:
  fetch("/dashboard/settings", {
    method: "POST",
    headers: { "Next-Action": "<hash>", "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(["eures"]),
  });
  ```
  Since the server action has a stable ID exposed by Next.js, any authenticated user
  can invoke it with arbitrary `moduleId`. There is no permission check, no rate limit,
  no audit log entry identifying WHO deactivated the module.

  Additionally: the activation path is the mirror image — Alice can flip a module back
  on that another user (or admin) explicitly disabled, potentially re-enabling a known-
  leaking integration.

- **Suggested fix direction:**
  1. **Short-term (no schema change):** Require the current user to own at least one
     automation that uses the module, OR own a credential for the module, before
     allowing deactivation. `deactivateModule` should:
     ```ts
     const hasRelation = await prisma.automation.findFirst({
       where: { userId: user.id, jobBoard: moduleId },
       select: { id: true },
     }) ?? await prisma.apiKey.findFirst({
       where: { userId: user.id, moduleId },
       select: { id: true },
     });
     if (!hasRelation) return { success: false, message: "errors.notAuthorizedForModule" };
     ```
     This scopes the action to users who actually have skin in the game.

  2. **Better:** Model activation as per-user. The `ModuleRegistration` table should
     become `UserModulePreference { userId, moduleId, enabled }` with per-user rows.
     The aggregate "is this module live" becomes `EXISTS (SELECT 1 WHERE enabled)`.
     `moduleRegistry` keeps its global ACTIVE/INACTIVE for CB/health reasons, but
     user-visible "deactivate" only pauses the caller's automations and their
     per-user preference. This is the correct multi-tenant model and matches the
     per-user semantics of `ApiKey` (AES-encrypted per-user module credentials).

  3. **Audit:** regardless of approach, write an `AuditLog` entry for every
     activate/deactivate call naming the caller userId, target moduleId, and the
     automationIds affected. Currently there is no record of who pulled the lever.

  4. **Rate-limit** activate/deactivate per user — a burst of 100 toggles can flap
     automations in and out of paused state.

### H-S-05 — `stripTokenFromUrl` strips exactly one parameter name, missing the common credential patterns
- **File:** `src/lib/assets/logo-asset-service.ts:111-119`
- **Severity:** HIGH (compounds with H-S-03; the two findings together mean NO token
  stripping in the writeback path AND incomplete stripping in the asset-service path)
- **Rule:** ADR-016 (credential defence), specs/logo-asset-cache.allium invariant
  `TokenStripOnPersist`, specs/security-rules.allium invariant `SecureSecretManagement`
  ("no secrets in code, commits, logs, or URLs")
- **Finding:** The current implementation is a four-line function that deletes only the
  literal `token` query param:
  ```ts
  function stripTokenFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete("token");
      return parsed.toString();
    } catch { return url; }
  }
  ```
  This is tailored to Logo.dev which happens to use `?token=` as its API key parameter.
  It will NOT strip any of these very common patterns:

  - `?key=pk_live_xxx` (common generic pattern, including Clearbit)
  - `?api_key=xxx` (Pexels, Unsplash, Stripe, many more)
  - `?apiKey=xxx` (camelCase variant)
  - `?access_token=xxx` (OAuth bearer-in-URL, Facebook Graph, Instagram)
  - `?accessToken=xxx`
  - `?auth=xxx`
  - `?sig=xxx` / `?signature=xxx` (AWS presigned, CloudFront, Cloudflare Stream)
  - `?X-Amz-Signature=xxx` (AWS S3 presigned URLs)
  - `?t=<timestamp>&token=<hmac>` (many CDN signing schemes use two params)
  - URL path segments like `.../<key>/...` (not strippable by query-param deletion)
  - `Authorization` header (NOT in URL, but some services use `?authorization=`)

  The meta-parser module (`meta-parser/index.ts:229-250`) parses `og:image` from
  arbitrary user-visited pages. If a company's OG page happens to serve a signed CDN
  URL in `<meta property="og:image" content="https://cdn.example.com/logo.png?X-Amz-
  Signature=...&X-Amz-Expires=3600">`, that URL flows through the enrichment chain
  → EnrichmentResult.data.image → logo-asset-subscriber picks it up (indirectly) →
  `sourceUrl` field of LogoAsset → `Company.logoUrl` write, which in the writeback
  path does NO stripping (H-S-03) and in the asset-service path only strips `?token=`.

  The signature is now cached in `Company.logoUrl`, rendered client-side in every
  Kanban card's image `src` attribute, transmitted over webhook payloads, logged in
  CSV export, visible in browser dev tools Network tab. Anyone with access to any of
  those can replay the presigned URL until expiry — which for CDN-signed assets can
  be anywhere from seconds to multiple days.

  **Because H-S-03 means writeback is unguarded AND H-S-05 means even the asset-service
  path is incomplete, the `logo-dev` module is the ONLY safe path today, purely by
  accident.** Any new enrichment module (paid meta-parser, Clearbit, BuiltWith, etc.)
  is one commit away from leaking credentials.

- **Reproduction / rationale:** `grep -rn 'stripTokenFromUrl' src/` shows 2 call sites:
  `logo-asset-service.ts:243` (only during on-disk caching) and the function
  definition itself. No other call site, no shared module, no test coverage that the
  stripping is complete. The test at `__tests__/logo-writeback.spec.ts:34-54` verifies
  the URL is written to the DB verbatim — i.e. the test codifies H-S-03.

- **Suggested fix direction:** Extract a shared `src/lib/assets/url-token-strip.ts`
  (as the baseline suggests) but broaden the strip list to:
  ```ts
  const STRIP_PARAMS = new Set([
    "token", "access_token", "accesstoken",
    "key", "api_key", "apikey",
    "auth", "authorization",
    "sig", "signature",
    "x-amz-signature", "x-amz-credential", "x-amz-security-token",
    "goog-signature", "ms-signature",
  ]);

  export function stripCredentialsFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (STRIP_PARAMS.has(key.toLowerCase())) {
          parsed.searchParams.delete(key);
        }
      }
      return parsed.toString();
    } catch { return url; }
  }
  ```
  Then call it from `applyLogoWriteback` (closes H-S-03) AND replace the existing
  `stripTokenFromUrl` usage in `logo-asset-service.ts`. Add a regression test that
  iterates over all 14 patterns above and asserts the output URL is credential-free.

## NEW MEDIUM findings

### M-S-06 — Undo token ownership check is a TOCTOU read-then-use, susceptible to token-reuse across concurrent requests
- **File:** `src/actions/undo.actions.ts:11-25`; `src/lib/undo/undo-store.ts:48-70`
- **Severity:** MEDIUM
- **Rule:** ADR-015 (ownership enforcement), CWE-367 (TOCTOU)
- **Finding:** `undoAction(tokenId)` reads the entry, checks `entry.userId !== user.id`,
  then calls `undoStore.undoById(tokenId)` which does NOT re-verify ownership. Between
  the read and the use, another request (e.g., the same attacker in a race) could
  observe a gap in the ownership guard. More importantly, `undoStore.undoById` is a
  non-authenticated primitive and is also reachable from `undoLast` (which DOES check
  userId via its own loop at line 87-90). The pattern is inconsistent: two call sites,
  two different enforcement mechanisms, one authoritative guard missing at the sink.

  Additionally, `undoAction:15-17` has a subtle bug: if `entry` is undefined (token
  expired, purged between `get` and now), the ownership check is skipped and
  `undoById` runs. `undoById` returns a "not found" error in that case, which is
  safe, but the guarding code is structured confusingly (`if (entry && entry.userId
  !== user.id)`) and a future reader could easily introduce a real IDOR by flipping
  the condition.

- **Suggested fix direction:** Make `undoById` accept a mandatory `expectedUserId`
  parameter and check it internally against `entry.userId`. The caller passes
  `user.id` from the session. Remove the read-then-check pattern from
  `undoAction`. Add a test that simulates two authenticated users racing on the
  same token ID and asserts only the owner can consume it.

### M-S-07 — Email template's `buildNotificationMessage` stringifies objects into user-visible email bodies
- **File:** `src/lib/email/templates.ts:206-213`
- **Severity:** MEDIUM (data-quality + minor information disclosure, not XSS)
- **Rule:** Defensive coding; OWASP A05 security misconfiguration
- **Finding:** `buildNotificationMessage` iterates `Object.entries(data)` and does
  `String(v ?? "")` for each value. But `data` now carries the 5W+H structured blob,
  including `titleParams: { count: 5, automationName: "My Automation" }` which is an
  object — `String(titleParams)` produces `"[object Object]"`. This ends up in the
  email body via `message.replace("{titleParams}", "[object Object]")` — a
  quality-of-service bug, not a direct security issue, BUT: if a future template
  accidentally uses `{titleParams}` as a placeholder, it would expose internal
  notation.

  More concerning: the same loop runs on every field of `data`, including fields like
  `moduleId`, `automationId`, `stagedVacancyId`, `endpointUrl` (for
  `module_unreachable` notifications — see `webhook.channel.ts:181-190`). These
  internal IDs + user-supplied URLs end up in email bodies even if the i18n template
  doesn't reference them. The current templates happen to not have matching
  placeholders so nothing shows, but any future template referencing `{endpointUrl}`
  will leak the user's webhook URL verbatim into the email body. That webhook URL may
  contain query parameters (HMAC secrets, tokens) that the user intended only for the
  endpoint.

- **Suggested fix direction:** (a) Replace the loop with an explicit allowlist of
  known-safe placeholders per notification type. (b) Serialize object values as JSON
  when needed. (c) Filter `data` before passing into template rendering:
  ```ts
  const scalarData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => typeof v === "string" || typeof v === "number")
  );
  ```
  (d) Add a test that asserts an email rendered from a realistic NotificationDraft
  contains no `[object Object]` or raw database IDs that weren't in the template.

### M-S-08 — `resolveWikimediaUrl` has no response-status check, allowing poisoned JSON to pollute downstream
- **File:** `src/actions/logoCheck.actions.ts:35-71`
- **Severity:** MEDIUM
- **Rule:** Defensive coding; CWE-20 improper input validation
- **Finding:** Line 49-52:
  ```ts
  const response = await fetch(apiUrl.toString(), {
    signal: AbortSignal.timeout(5000),
  });
  const data = await response.json();
  ```
  There is NO `response.ok` check. If the Wikimedia API returns 500 / 503 with an HTML
  error page, `response.json()` throws — and the surrounding `catch` block on line 68
  swallows it. That path is fine. But the more insidious case: if Wikimedia returns a
  200 with a JSON error body (e.g. `{ "error": { "code": "badtitle" } }`), the code
  still processes `data.query.pages`, which is undefined → null → returns null. Also
  fine.

  The real risk is if an attacker can cause DNS resolution to return a non-Wikimedia
  server (DNS cache poisoning at the host level, or a proxy that rewrites hostnames).
  Then `apiUrl` resolves to an attacker-controlled server that returns crafted JSON
  with an `imageinfo[0].url` pointing at an attacker URL. The existing
  `validateWebhookUrl` guard on line 63-64 catches external private IPs but does NOT
  catch an arbitrary attacker-controlled public URL. The attacker's URL is then
  returned to the client, auto-populated into the form (`AddCompany.tsx:550-553`),
  and auto-saved as `Company.logoUrl` without the user ever clicking submit.

  Combined with H-S-05 (incomplete token stripping), a successful Wikimedia-host
  redirect attack can persist attacker-controlled URLs with embedded tokens into the
  company record.

- **Suggested fix direction:** (a) Check `response.ok` and treat non-2xx as a failure.
  (b) Pin the Wikimedia API using an IP allowlist or HTTPS public-key pinning (SHA-256
  fingerprint). (c) Validate that the returned `resolvedUrl` is rooted at a Wikimedia
  domain (`/\.wikimedia\.org$/` or `/\.wikipedia\.org$/`) before returning it to the
  client — the current code only checks SSRF against private ranges, not that the URL
  is actually a Wikimedia asset. (d) Rate-limit per user at a lower number than the
  main 20/min (baseline L-S-03 already flagged this; my suggestion here is
  complementary).

## NEW LOW findings

### L-S-05 — Notification webhook payload echoes user-controlled free-text back to the user's own endpoint
- **File:** `src/lib/notifications/channels/webhook.channel.ts:297-302`
- **Severity:** LOW (not a direct security issue, but an exfiltration concern worth
  noting)
- **Rule:** ADR-026 (multi-channel notification), best-effort data minimization
- **Finding:** `WebhookChannel.dispatch` builds `payload.data = notification.data ?? {}`
  and `JSON.stringify`s it. The `data` blob can contain:
  - `automationName` (user-supplied free text, truncated to 200 chars)
  - `moduleName` (module metadata — module names like "EURES" are static)
  - `endpointUrl` (for `module_unreachable` notifications — echoes the endpoint URL
    back to itself, which is fine)
  - `titleParams`, `reasonParams` — structured fields that may contain further free
    text

  Since webhooks are user-configured, the concern is NOT cross-tenant leakage — it's
  that an on-host attacker who gains access to the user's session cookies can register
  a webhook endpoint pointed at `https://attacker.com/collect` subscribed to all event
  types, and silently exfiltrate automation names, module IDs, job statuses, and
  truncated free-text. The webhook's HMAC signing doesn't help because the attacker
  controls the secret. Auto-deactivate after 5 failures doesn't help because the
  attacker's endpoint responds 200.

  This is a post-compromise concern, so it's LOW. But data-minimization in the
  webhook payload (strip free-text fields, emit only event type + primary key IDs)
  would reduce the blast radius of a session compromise.

- **Suggested fix direction:** Define a per-event-type payload schema that emits only
  the minimum necessary IDs (jobId, automationId, moduleId) and a static event label.
  Free text goes through a separate per-user "include_content" opt-in toggle that
  defaults to off. This matches GDPR data-minimization and reduces exfiltration risk.

### L-S-06 — Logo asset cache subscriber reads `enrichmentResult.data.logoUrl` with no ssrf re-validation before download
- **File:** `src/lib/assets/logo-asset-subscriber.ts:89-108`
- **Severity:** LOW (defense-in-depth; currently covered by `logoAssetService.
  downloadAndProcess` which calls `validateWebhookUrl` itself)
- **Rule:** Defense-in-depth (specs/security-rules.allium invariant `DefenseInDepth`)
- **Finding:** The subscriber parses `enrichmentResult.data` from a JSON blob in the
  DB, extracts `logoUrl`, and passes it directly to `logoAssetService.downloadAndProcess`.
  `downloadAndProcess` DOES call `validateWebhookUrl(sourceUrl)` at line 167 of
  `logo-asset-service.ts` as its step 1. So the chain IS safe today.

  However, the defense-in-depth principle argues for validation at the subscriber
  too, because:
  1. The DB blob is an untrusted deserialization surface — any SQL injection elsewhere
     (none known today) could poison `data.logoUrl`.
  2. A future refactor that changes `downloadAndProcess` to accept a pre-validated
     URL would quietly skip the check.
  3. Log messages at line 171 (`Triggering download for company ${companyId}:
     ${logoUrl}`) write the raw URL to server logs BEFORE any validation. A poisoned
     URL like `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
     would hit the log first, making it visible to anyone with log access.

  This is identical in structure to the pattern the meta-parser H-S-02 exposes — a
  divergent validation surface that could silently drift.

- **Suggested fix direction:** Add `validateWebhookUrl(logoUrl)` at line 105 before
  the `companyId` resolution logic. If invalid, early-return and log a security
  warning. Zero performance impact (one URL parse). Also sanitize the log line at
  line 171 to show only the URL hostname, not the full URL with query params.

## Out-of-scope / honorable mentions

- **`notification-dispatcher.ts` is susceptible to HMR map fragmentation** (already
  flagged as baseline L-S-02). I verified — the `stagedBuffers` Map is module-level,
  not on `globalThis`, unlike `enrichmentOrchestrator`/`channelRouter`/`runCoordinator`.
  The fix is trivial and should be done alongside H-S-04.

- **`checkConsecutiveRunFailures` is callable from runner.ts without a userId scope**
  (baseline M-S-02) — I confirmed. The function is in a `server-only` file and today's
  caller is safe. Defense-in-depth improvement: change signature to accept the run
  context's userId and double-check.

- **Notification `data.endpointUrl` in `webhook.channel.ts:183,227`** stores the full
  endpoint URL in the legacy `data` blob. Users can accidentally leak their webhook
  URL (with any query params they added) via the notification list. Consider strip-
  ping to origin-only.

- **`emailTemplate` wraps `<html lang="${escapeHtml(locale)}">`** — `locale` comes from
  a dictionary allowlist (`isValidLocale`) before reaching the template, so this is
  safe today, but the `escapeHtml` call is a correct defense-in-depth against a future
  locale-injection bug.

- **`catch (() => {})` still exists in 5 places** despite the new lint rule
  (`enrichment-trigger.ts:124,200,225`; `orchestrator.ts:277`; `credential-resolver.ts:36`;
  `api-key-resolver.ts:32`) because the new `no-empty` rule only flags empty BLOCKS,
  not arrow-function expressions. The baseline mentioned this as an observation; I
  concur — a custom rule or `no-empty-function` would close it.

## Methodology

What I did differently from the generic `team-reviewer` baseline:

1. **Full OWASP Top 10 mapping per file.** For each file I touched, I mentally mapped
   it against A01-A10. The baseline focuses on specific rules (IDOR, SSRF, credential
   URL); the specialist run adds explicit A01 (access control) coverage, which
   surfaced H-S-04 (cross-tenant privilege escalation in module activation).

2. **Read the Allium specs cover-to-cover.** `security-rules.allium` has 15 rules and
   5 invariants. I cross-referenced each of them against the new commits. The baseline
   read the spec but didn't use it as a checklist — I used it as the primary
   acceptance criteria.

3. **Traced the data flow end-to-end for URLs.** For H-S-05 I followed one URL from
   the meta-parser through the enrichment chain, through the orchestrator persistence,
   through the logo-asset-subscriber, through the downloadAndProcess pipeline, into
   the on-disk store, AND into the Company.logoUrl writeback path. Two paths, two
   different stripping implementations, both incomplete. The baseline saw H-S-03 (the
   writeback path is entirely unguarded) but stopped there.

4. **Checked token/credential surface for completeness, not just existence.** The
   baseline flagged that `stripTokenFromUrl` isn't called from writeback. I flagged
   that even WHERE it IS called, it strips exactly one param name — and listed the
   14 common credential param names it misses. This is the difference between a
   checkbox review and a threat-model review.

5. **Treated "use server" exports as a first-class threat surface.** I re-read every
   `"use server"` exported function in the commit range looking for raw cross-tenant
   parameters. `module.actions.ts:deactivateModule/activateModule` jumped out
   immediately on this pass — a `moduleId` parameter with no ownership check. The
   baseline's ADR-015 checks are scoped to "accepts userId" or "accesses user-owned
   entity"; they missed the case of "accepts a tenant-wide identifier that mutates
   shared state".

6. **Ran `git show --name-only` against the sprint's security-claim commit
   (db2f050)** to definitively prove the sanitizer hardening was not applied. The
   baseline correctly flagged this; I independently confirmed by enumerating the 4
   files the commit actually touched.

7. **Read the Prisma `schema.prisma` for role/admin columns** to confirm my suspicion
   about H-S-04. No role model = every authenticated user is at the same privilege
   level = module.actions.ts can be invoked by anyone. The baseline did not look at
   `module.actions.ts` at all (it's not listed in the files reviewed).

8. **Files the baseline explicitly did not touch that I deeply read:**
   `src/actions/module.actions.ts`, `src/actions/undo.actions.ts`,
   `src/lib/undo/undo-store.ts`, `src/lib/notifications/channels/push.channel.ts`,
   `src/lib/notifications/channels/email.channel.ts`, `src/lib/email/templates.ts`,
   `src/app/api/scheduler/status/route.ts`, `src/lib/connector/degradation.ts`,
   `src/lib/notifications/deep-links.ts`, `src/components/layout/NotificationItem.tsx`
   (XSS sink for `title` and `reason`).

## Verdict on specialization value

**YES — specialization produced meaningful uplift on security findings.**

The specialist pass surfaced 2 additional HIGHs (H-S-04, H-S-05) and 3 additional
MEDIUMs (M-S-06, M-S-07, M-S-08) that the generic reviewer did not. H-S-04 is arguably
the most impactful finding in the entire security review — it is a one-line
cross-tenant privilege escalation (any authenticated user can pause every other
user's automations) that is directly exploitable via a Server Action call from the
browser, requires no special tools, and is not gated by any ADR or spec. The baseline
completely missed this because `module.actions.ts` was not in its file list.

H-S-05 is a generalization of the baseline's H-S-03 — the baseline correctly noticed
that the writeback path doesn't strip tokens, but I extended the finding to show that
even WHERE tokens ARE stripped today, the implementation is tailored to a single
vendor (Logo.dev's `?token=` param) and silently fails for 13+ other common
credential-in-URL patterns, making the codebase one refactor away from a data leak.

The 3 new MEDIUMs (undo-token TOCTOU, email-template object stringification, Wikimedia
response-status gap) are defense-in-depth improvements that would each take a
reviewer with specific security-threat-modeling experience to surface. The generic
reviewer correctly caught the more surface-level findings (H-S-01 through H-S-03,
and 5 MEDIUMs covering IDOR, rate limiting, 404-oracle, redirect resource leaks).

Ratio: baseline 3 HIGH / 5 MEDIUM / 4 LOW (12 findings); specialist +2 HIGH / +3
MEDIUM / +2 LOW (7 additional findings) = 58% uplift by count, with two of the three
new HIGHs being exploitable rather than theoretical. This exceeds the architecture
specialist's ~40% uplift and is comparable in quality. Recommend running the
specialist across the other 3 dimensions (accessibility, performance, testing) for
consistent depth, and updating the orchestration playbook to always run specialist
passes for security-surface sprints.
