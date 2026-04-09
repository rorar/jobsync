# Sprint 2 Team Review — Security Dimension

## Summary
- Files reviewed: ~35 of 129 (focused on `src/actions/`, `src/lib/notifications/channels/`, `src/lib/connector/data-enrichment/`, `src/lib/assets/`, `src/app/api/`, `src/lib/events/consumers/`, `prisma/schema.prisma`, and selected test fixtures)
- HIGH findings: 3
- MEDIUM findings: 5
- LOW findings: 4
- Verified CRIT fixes:
  - **CRIT-A1** — `src/actions/module.actions.ts:deactivateModule` no longer calls `prisma.notification.createMany` directly; it emits one `ModuleDeactivated` event per affected user (lines 267-284) and the dispatcher is the single writer. The allowlist in `scripts/check-notification-writers.sh` no longer contains `module.actions.ts`.
  - **CRIT-A2** — `src/components/staging/PromotionDialog.tsx:47` declares `onSuccess: (result: PromotionDialogSuccessResult) => void` with `{ jobId, stagedVacancyId }`, and lines 99-102 thread the created job id through. `StagingContainer` has matching `promotionResolveRef` wiring that forwards `createdJobId` into `useDeckStack.performAction`.
  - **CRIT-Y1** — `src/components/staging/DeckView.tsx:380,431,443` all action-rail buttons now use `h-11 w-11` (44×44) with explicit "WCAG 2.5.5 AAA (CRIT-Y1)" comments.
  - **CRIT-Y2** — `src/components/staging/StagingLayoutToggle.tsx:4,62-74` imports `Check`, renders a `Check` glyph overlay on the active segment (non-color indicator), and each segment carries a single `aria-label`.
  - **CRIT-Y3** — `src/components/staging/SuperLikeCelebration.tsx:106,196,214-227,276-284,380` has `ctaRef`, a global document-level `keydown` listener for Escape, and an `aria-labelledby` pointing at both title + subtitle ids.

## HIGH findings

### H-S-01 — SVG sanitizer hardening claimed in commit db2f050 was never applied
- **File:** `src/lib/assets/svg-sanitizer.ts` (unchanged in range); `__tests__/svg-sanitizer.spec.ts:337-343,347-362,366-376`
- **Severity:** HIGH
- **Rule:** specs/logo-asset-cache.allium (SVG sanitization), ADR — defence-in-depth for user-fetched logos
- **Finding:** Commit `db2f050 fix(security): SSRF in checkLogoUrl, SVG sanitizer gaps, asset pipeline hardening` lists in its body:
  - "Strip `<use>`, `<iframe>`, `<animate>`, `<set>`, xml-stylesheet from SVG sanitizer"
  - "Block data:image/svg+xml in href allowlist (nested SVG XSS vector)"
  - "Tighten SVG magic byte detection to require root-element position"
  - "Block 0.0.0.0/8 range in validateWebhookUrl"

  But `git log --oneline a92aaf3..HEAD -- src/lib/assets/svg-sanitizer.ts src/lib/assets/magic-bytes.ts src/lib/url-validation.ts` returns empty. None of the three files was touched. The current `sanitizeSvg` in `src/lib/assets/svg-sanitizer.ts`:
  - Does **not** strip `<use>`, `<iframe>`, `<animate>`, or `<set>` elements (only `<script>` and `<foreignObject>`).
  - Does **not** strip `<?xml-stylesheet ?>` processing instructions.
  - **Explicitly allows** `data:image/svg+xml;base64,...` in `href` / `xlink:href` via the regex `/^data:image\/(png|jpeg|gif|webp|svg\+xml);/i` (line 52 and 59) — a nested-SVG XSS vector that the commit claims was blocked.
  - The test `__tests__/svg-sanitizer.spec.ts:337-343` actually **asserts** that `data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+` (decoded: `<svg onload="alert(1)"/>`) passes through unchanged — i.e. the test codifies the gap the commit message claimed to close.
  - `magic-bytes.ts:106-109` still uses `head.includes("<svg")` for SVG detection; the "root-element position" tightening was not applied. An attacker-controlled file that happens to contain the substring `<svg` anywhere in its first 512 bytes (for example inside a comment in an arbitrary XML file) is misclassified as SVG.
- **Reproduction / rationale:** `git show db2f050 --name-only` shows only 4 files touched: `src/actions/logoCheck.actions.ts`, `src/app/api/logos/[id]/route.ts`, `src/lib/assets/logo-asset-service.ts`, `src/lib/assets/logo-asset-subscriber.ts`. None of the sanitizer/magic-byte/url-validation files were modified.

  Exploit sketch: a malicious logo server returns an SVG payload containing `<image href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIG9ubG9hZD0iYWxlcnQoZG9jdW1lbnQuY29va2llKSIvPg=="/>`. `sanitizeSvg` leaves it untouched, the asset is written to disk, and `/api/logos/[id]` serves it. The CSP sandbox on line 111-113 of `src/app/api/logos/[id]/route.ts` (`default-src 'none'; style-src 'unsafe-inline'; sandbox`) is defence-in-depth that makes the attack difficult when the SVG is loaded via `<img>`/`<iframe>`, **but** direct navigation to `/api/logos/:id` in some browser versions and quirks-mode contexts may still execute the inner SVG's `onload`. Either way, the on-disk file is malicious and the promised tightening is absent.
- **Suggested fix direction:** Either perform the sanitizer work the commit message promised, or amend BUGS.md + honesty-gate the commit. Minimally:
  1. Strip `<use>`, `<iframe>`, `<animate>`, `<set>`, `<image>`, `<handler>` elements (not just their `on*` attributes).
  2. Strip `<?xml-stylesheet ?>` processing instructions and CDATA blocks.
  3. Block `data:image/svg+xml` in `href`/`xlink:href` (svg inside svg is still a scripting surface in Firefox/Chrome under certain conditions — keep it disallowed).
  4. Tighten `detectMimeFromBytes` to require `<svg` at the root element position (optionally preceded by whitespace, `<?xml ?>`, or `<!DOCTYPE svg ...>`), not `head.includes("<svg")`.
  5. Update `__tests__/svg-sanitizer.spec.ts` so the `allows data:image/svg+xml` test inverts to `blocks data:image/svg+xml` — the current test codifies the vulnerability.

### H-S-02 — Meta parser has its own SSRF allowlist that drifts from the canonical `validateWebhookUrl`
- **File:** `src/lib/connector/data-enrichment/modules/meta-parser/index.ts:37-129`
- **Severity:** HIGH
- **Rule:** ADR-015 (defence-in-depth), security invariant "one SSRF validator"
- **Finding:** The meta-parser module implements `isValidExternalUrl` + `isPrivateIP` from scratch instead of calling `validateWebhookUrl` from `src/lib/url-validation.ts`. The two implementations have diverged:
  - The parser-local version does **not** block `100.64.0.0/10` (Carrier-Grade NAT, RFC 6598) — reachable on AWS VPCs, Tailscale, WireGuard, many corporate VPNs. `validateWebhookUrl` blocks it (url-validation.ts:97).
  - The parser-local version does **not** block `192.0.0.0/24` (IETF protocol assignments).
  - The parser-local version does **not** block `198.18.0.0/15` (benchmarking).
  - The parser-local version does **not** block `240.0.0.0/4` / `255.255.255.255` (reserved/broadcast).
  - The parser-local version does **not** handle IPv4-mapped IPv6 (`::ffff:127.0.0.1`, `::ffff:7f00:1`) that `validateWebhookUrl` covers at lines 128-153.
  - The parser-local version's IPv6 private-range check uses raw `startsWith("fc")` / `startsWith("fd")` on the hostname (lines 119-127). For an IP-literal URL this is correct, but for a DNS hostname like `fcbarcelona.com` the check would **incorrectly block** it — false positive DoS rather than a SSRF leak, but it shows the branch is being reached for non-IP hostnames and suggests the author did not understand the cleanup semantics.
- **Reproduction / rationale:** `src/lib/events/consumers/enrichment-trigger.ts:206-227` passes `job.jobUrl` (user-supplied) straight into the meta-parser deep-link chain. If a user pastes `http://100.64.0.1/admin` as a job URL, the deep-link enrichment will happily fetch it (CGNAT is not in the meta-parser blocklist), while the webhook channel would reject the same host. The inconsistency means the SSRF defence the rest of the codebase relies on is bypassed for this dimension.
- **Suggested fix direction:** Delete `isValidExternalUrl` and `isPrivateIP` from `meta-parser/index.ts` and call `validateWebhookUrl(url)` directly. This is the ADR-015 "single source of truth" pattern that webhook.channel, logo-asset-service, logoCheck.actions, and logo-asset-subscriber already follow. Add a regression test that asserts `100.64.0.1`, `198.18.0.1`, `::ffff:10.0.0.1`, and `240.0.0.1` are rejected on both initial URL and every redirect hop.

### H-S-03 — `applyLogoWriteback` persists tokenized URLs verbatim; only the logo-dev module happens to strip tokens
- **File:** `src/lib/connector/data-enrichment/logo-writeback.ts:31-55`; `src/lib/connector/data-enrichment/modules/logo-dev/index.ts:69-70`
- **Severity:** HIGH
- **Rule:** ADR-016 (credential defence), specs/logo-asset-cache.allium ("token stripping")
- **Finding:** `applyLogoWriteback` writes `logoData.logoUrl` verbatim to `Company.logoUrl` whenever the column is currently null (line 47-54). There is **no** token stripping in this path. Security today is entirely dependent on the accident that `logo-dev/index.ts` builds a separate `cleanLogoUrl = \`https://img.logo.dev/\${encodeURIComponent(domain)}?format=png\`` (line 70) that omits the API token — the `tokenizedUrl` (line 69) is only used for the HEAD probe. Any future enrichment module that returns a tokenized URL in its `logoUrl` field (for example, a paid meta-parser, a signed CDN URL with `?sig=...`, or a `data.logoUrl` extracted from an OG `og:image` with auth params) would leak that token into `Company.logoUrl` → shown in Kanban cards, job details, recent cards, etc. → readable by the browser client, logged in client-side telemetry, and exported in CSV.

  By contrast, `src/lib/assets/logo-asset-service.ts:111-119,243` has a proper `stripTokenFromUrl` wrapper for the same column — but it only runs on the LogoAssetService path, not on the writeback path. The writeback path is called from BOTH `enrichment.actions.ts:139,297` and `enrichment-trigger.ts:118,194` and reaches `Company.logoUrl` directly, without ever going through the logo-asset-service token strip.
- **Reproduction / rationale:** `git show 14585f8 -- src/lib/connector/data-enrichment/modules/logo-dev/index.ts` shows the clean/tokenized split was added, but the corresponding defence was never generalized to writeback. The spec invariant `TokenStripOnPersist` (logo-asset-cache.allium) is not enforced at the writeback boundary.
- **Suggested fix direction:** Move `stripTokenFromUrl` to a shared module (e.g. `src/lib/assets/url-token-strip.ts`) and call it from `applyLogoWriteback` before the `updateMany` on line 47-54. Expand the allowlist of stripped query params beyond just `token` to include `key`, `api_key`, `apiKey`, `sig`, `signature`, `auth` to cover common signed-URL patterns. Add a unit test: `applyLogoWriteback` called with `{ logoUrl: "https://example.com/logo.png?token=secret" }` must write `https://example.com/logo.png` (no `?token=`).

## MEDIUM findings

### M-S-01 — Notification server-action ownership pattern is correct but silent on cross-user IDs
- **File:** `src/actions/notification.actions.ts:68-84,108-123`
- **Severity:** MEDIUM
- **Rule:** ADR-015, UX signal consistency
- **Finding:** `markAsRead` and `dismissNotification` use `prisma.notification.update / delete` with `where: { id: notificationId, userId: user.id }`. This relies on Prisma 6's extended-where-unique feature (valid, since `@prisma/client@^6.19.0` is declared in `package.json`). When an attacker sends another user's notification id, Prisma throws `RecordNotFound` which falls through to `handleError`, returning a generic `errors.markNotificationRead` message. That is secure against IDOR but:
  - The caller cannot distinguish "not found" from "DB error" in the response shape.
  - The action does not normalize the error into a `{ success: false, errorCode: "NOT_FOUND" }` like `enrichment.actions.ts:93` does.
  - If the Prisma client ever drops the extended-where-unique behavior (unlikely but possible), the `userId` filter would be silently ignored and the action would become a full IDOR. There is no test that an attacker cannot mark another user's notification as read / delete it.
- **Reproduction / rationale:** The tests in `__tests__/NotificationItem.spec.tsx` and surrounding files cover rendering, not the action IDOR contract. `__tests__/notification-dispatcher.spec.ts` covers write paths but not `markAsRead` / `dismissNotification`.
- **Suggested fix direction:** Convert to the atomic `updateMany` + `deleteMany` pattern that `companyBlacklist.actions.ts:152-157` uses — `const result = await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } }); if (result.count === 0) return { success: false, message: "notifications.notFound", errorCode: "NOT_FOUND" };`. This makes the ownership check explicit and testable without relying on Prisma's extended-where-unique behavior. Add two regression tests (one per action) that mock Prisma to return `{ count: 0 }` and assert the action returns `NOT_FOUND`.

### M-S-02 — `checkConsecutiveRunFailures` queries + mutates Automation without userId scope
- **File:** `src/lib/connector/degradation.ts:179-279`
- **Severity:** MEDIUM (internal-only; not a direct IDOR, but violates ADR-015 pattern)
- **Rule:** ADR-015 (all Prisma queries include userId); defence-in-depth
- **Finding:** `checkConsecutiveRunFailures` is exported from `degradation.ts` and called from `src/lib/connector/job-discovery/runner.ts:859`. It accepts only an `automationId` (line 180), then does `prisma.automation.findFirst({ where: { id: automationId }})` (line 204-207) and `prisma.automation.update({ where: { id: automationId }})` (line 214-219). Neither query is scoped by userId.

  This is not a direct IDOR because the function is not reachable from a `"use server"` export, and the runner derives `automationId` from the scheduler's authenticated run context. However, the pattern is brittle:
  1. If a future caller passes an attacker-influenced `automationId` (e.g. via a public API route or a webhook trigger), the function would silently pause the wrong user's automation.
  2. The function's own notification write (`prisma.notification.create` on line 242-256) reads `automation.userId` from the un-scoped query result. If two tenants shared the same `automationId` (impossible today because uuid, but still relying on a primary-key collision guarantee for correctness) the wrong user would be notified.
  3. `degradation.ts` is in the allowlist for direct `prisma.notification.create` writes. The file is trusted to produce correctly-attributed notifications — and it does, since `userId` is read from the DB — but an IDOR-clean pattern would read the userId from an upstream source (run payload) and cross-check, not trust the row.
- **Reproduction / rationale:** `grep -rn "checkConsecutiveRunFailures" src/` shows one caller (runner.ts:859). Today it's safe. The concern is that the pattern `findFirst({ where: { id } })` in a file under `import "server-only"` is exactly the shape ADR-015 warns about.
- **Suggested fix direction:** Change the signature to `checkConsecutiveRunFailures(automationId: string, expectedUserId: string)` and either (a) pass it through the runner, or (b) use `findFirst({ where: { id: automationId, userId: expectedUserId } })` as a defence-in-depth check. Update the caller in `runner.ts:859` to pass `run.userId` (already in scope since the runner carries the automation context).

### M-S-03 — Logo file-serving 404 distinguishes "owned but missing on disk" from "not owned"
- **File:** `src/app/api/logos/[id]/route.ts:61-97`
- **Severity:** MEDIUM
- **Rule:** OWASP information-disclosure (resource enumeration)
- **Finding:** The 404 response at line 61-62 (`"Not found"`) is returned both when the row doesn't exist AND when the row exists but belongs to another user (IDOR filter). Lines 86-97, however, return `"File not found on disk"` when the row **is** owned by the caller but the file is missing. An attacker who learns a valid logo asset id (via DB leak, analytics, log file, guessed uuid, etc.) can distinguish:
  - "I own this id, but the file is corrupt/missing" → `"File not found on disk"` (404)
  - "Not my id" → `"Not found"` (404)
  - "Invalid uuid" → `"Invalid ID"` (400)

  This is a minor enumeration oracle — given a population of candidate uuids, an attacker can determine which ones belong to their own account's companies (the file-not-found case) vs not. Combined with the fact that `userId` is embedded in the on-disk path (`/data/logos/{userId}/{companyId}/logo.{ext}`, line 84 of `logo-asset-service.ts`), a misconfigured backup or traversal bug elsewhere could leak both pieces of info.
- **Reproduction / rationale:** Compare `if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })` (line 62) with `return NextResponse.json({ error: "File not found on disk" }, { status: 404 })` (line 87, 94). Both 404 but with distinguishable bodies.
- **Suggested fix direction:** Return a single uniform body `{ error: "Not found" }` for all 404 branches. Log the "owned but file missing on disk" case server-side (already logged indirectly via the console.error on line 120) but do not differentiate in the response. Add a unit test that asserts the body is byte-identical for the three 404 cases (not found, not owned, file missing on disk).

### M-S-04 — Rate limit on `checkLogoUrl` is 20/min per user but there is no global / pre-auth cap
- **File:** `src/actions/logoCheck.actions.ts:85-89`
- **Severity:** MEDIUM
- **Rule:** ADR-019 (rate-limiting)
- **Finding:** `checkLogoUrl` rate-limits by `logoCheck:${user.id}` at 20/min. This is fine as a fairness control but has two gaps:
  1. Each call makes **up to 4 outbound fetches** to arbitrary remote hosts (Wikipedia API lookup + up to 3 redirect hops). 20 calls/min × 4 fetches × N concurrent users = easily 100+ requests/minute of server-initiated outbound traffic, none of which is DNS-cached (different hostnames). An authenticated user can therefore use JobSync as an open-ish scanner / DoS amplifier against arbitrary third parties. Even a lightly abused self-hosted instance can make the host's IP appear on scanner blocklists (Project Honeypot, Cloudflare, Fail2Ban).
  2. There is no global cap — 100 users × 20/min = 2000/min from one instance. That's material outbound load for a self-hosted single-process deployment. The Wikimedia API has a 200 req/s rate limit that a shared instance can realistically blow through.

  This is a classic "SSRF-lite" concern: even when the target host is correctly validated, the volume of outbound traffic is user-controllable.
- **Reproduction / rationale:** Count the outbound fetches: `resolveWikimediaUrl` = 1 fetch (conditional), `checkLogoUrl` loop = up to 4 fetches (initial + MAX_REDIRECTS=3). 20 × 5 = 100 fetches per user per minute.
- **Suggested fix direction:** (a) Lower the per-user budget to 10/min or 5/min — there is no reason a logo picker should run more than that. (b) Add a global rate limit of 200/min shared across all users (a `globalThis`-scoped sliding window in `src/lib/api/rate-limit.ts`). (c) Cache the HEAD result in `connectorCache` (already imported elsewhere) by URL hash for 24h so repeated checks for the same URL do not re-fetch. (d) Consider requiring a "paid plan" / admin toggle for high-volume logo checking, or move the check client-side (with the browser issuing the HEAD from the user's own IP).

### M-S-05 — `redirect:"manual"` is correctly used but `response.body?.cancel()` is not awaited for redirects in `logo-asset-service.ts` / `meta-parser`
- **File:** `src/lib/assets/logo-asset-service.ts:357-362`; `src/lib/connector/data-enrichment/modules/meta-parser/index.ts:315-337`
- **Severity:** MEDIUM (resource leak under load)
- **Rule:** Defensive coding / DoS resilience
- **Finding:** `logo-asset-service.ts:358-362` does:
  ```
  try { await response.body?.cancel(); } catch { /* Ignore cancel errors */ }
  ```
  This correctly frees the ReadableStream for the redirect response. Good. However `meta-parser/index.ts:315-335` does **not** cancel the body on redirect — the code path breaks out of the loop on status 300-399, overwrites `response` on the next iteration, and relies on GC to clean up the abandoned ReadableStream. On Node's undici this works in practice but can trigger `MaxListenersExceededWarning` and back-pressure under sustained redirect chains (rare but exploitable: an attacker can make the server burn sockets by serving a chain of 30x that each hold open a body).

  Second concern: the meta-parser redirect loop uses `response` from an outer closure; if an attacker races a `Promise.race` timeout, the body stream may still be readable after the parent promise rejected, leaking the file descriptor until GC.
- **Reproduction / rationale:** `meta-parser/index.ts:307-338` does not call `response.body?.cancel()` on redirect. Compare with `logo-asset-service.ts:356-365` which does.
- **Suggested fix direction:** Add `try { await response.body?.cancel(); } catch {}` between line 333 and `currentUrl = resolvedUrl` in the meta-parser redirect branch. Consider extracting the "manual redirect follower with SSRF re-validation" pattern into a shared helper in `src/lib/http/safe-fetch.ts` so the logo service, meta parser, and `logoCheck.actions.ts` all share one audited implementation. Three divergent copies is 3x the audit surface for future changes.

## LOW findings

### L-S-01 — `collectCoverage: true` + `maxWorkers: 1` makes coverage runs serial; security tests take >5 min
- **File:** `jest.config.ts:37,104-106`
- **Severity:** LOW
- **Rule:** Developer ergonomics — long feedback loops invite skipping tests
- **Finding:** The combo `collectCoverage: true` (always-on) and `maxWorkers: 1` (enforced at config level) means every test run collects coverage serially, even during a targeted `bash scripts/test.sh __tests__/svg-sanitizer.spec.ts`. Security-critical tests (svg-sanitizer, webhook-channel, logo-asset-service, enrichment-actions) total ~2k lines of test code; running them serially with coverage instrumentation can push the watch-cycle over 5 minutes on the target VM. Developers tend to skip tests with long feedback loops, which degrades the enforcement property of the security suite.
- **Suggested fix direction:** Either (a) set `collectCoverage: false` by default and require `--coverage` on the CLI for coverage runs (matches the `scripts/test.sh --no-coverage` pattern mentioned in the scope), or (b) move coverage to a separate jest project that only runs in CI.

### L-S-02 — `stagedBuffers` timer map on `notification-dispatcher.ts` is not `globalThis`-scoped
- **File:** `src/lib/events/consumers/notification-dispatcher.ts:78-81`
- **Severity:** LOW
- **Rule:** Resource cleanup, HMR safety
- **Finding:** `const stagedBuffers = new Map<string, StagedBuffer>()` is module-level. On Next.js HMR the module can be re-instantiated, creating a new Map while the original `setTimeout` handles still live in the old module's closure. The old handles never fire the new `flushStagedBuffer` (they're bound to the old function reference), so a batch can be silently dropped across an HMR boundary. In production this is a non-issue, but in dev it can mask bugs because a test that triggers a flush after HMR will observe the wrong map.

  More importantly, the old timers also keep a reference to the old `prisma` client (pre-HMR) which may have been disconnected, leading to silent failures on flush.
- **Suggested fix direction:** Apply the `globalThis` singleton pattern used by `enrichmentOrchestrator` (orchestrator.ts:329-332), `channelRouter`, and `logoAssetService`. That pattern is already documented in CLAUDE.md under "Singleton Pattern".

### L-S-03 — `resolveWikimediaUrl` makes an unauthenticated API call that is not covered by the per-user rate-limit budget
- **File:** `src/actions/logoCheck.actions.ts:35-71`
- **Severity:** LOW
- **Rule:** ADR-019 (rate-limit coverage), best-effort fairness
- **Finding:** `resolveWikimediaUrl` is called unconditionally at line 101 when the pattern matches, *before* the main HEAD loop. It fires a `fetch` to `commons.wikimedia.org/w/api.php`. The per-user rate limit on line 88 (`logoCheck:${user.id}`, 20/min) **does** apply because it runs before `resolveWikimediaUrl` — good. But:
  1. The Wikimedia API call is not covered by any outbound circuit breaker / resilience policy.
  2. If the Wikipedia API is slow or down, the 5s `AbortSignal.timeout` blocks the user's request for 5 seconds per call; with 20 calls/min = 100 seconds/min spent just on Wikipedia, even when every call fails. A malicious pattern of regex-matching Wikipedia URLs can DoS a user's own logo-check action.
- **Suggested fix direction:** Wrap `resolveWikimediaUrl` in a circuit breaker (`resilience.ts`). Skip the Wikimedia call entirely when the circuit is open. Add a per-user in-flight cap (max 3 concurrent Wikimedia lookups) to bound blocking.

### L-S-04 — `enrichment-trigger.ts` concurrency semaphore is unbounded in the queue length
- **File:** `src/lib/events/consumers/enrichment-trigger.ts:36-57`
- **Severity:** LOW
- **Rule:** DoS resilience
- **Finding:** `MAX_CONCURRENT_ENRICHMENTS = 5` caps the active workers, but the `enrichmentQueue: Array<() => void>` that holds waiters is unbounded. A bulk-promotion of 10k jobs by an authenticated user will push 10k closures into this in-memory queue, each holding a reference to the pending enrichment callback. The orchestrator is correctly rate-limiting throughput, but memory growth is linear in the queue backlog.

  The per-user orchestrator rate-limit on `enrichment.actions.ts:75-78` (10/min) protects the manual path. The event-triggered path does not have a per-user cap — a single automation run that produces 500 staged vacancies will dispatch 500 `VacancyPromoted` events → 500 handlers waiting on the semaphore.
- **Suggested fix direction:** Bound the queue length (e.g. 1000) and drop or defer new enrichments past that cap. Alternatively, use a per-user semaphore (mirroring the `inflightMap` pattern in `enrichment.actions.ts:31-42`) so one user cannot starve others.

## Out-of-scope notes
(Things I noticed but did not file)

- `src/app/api/profile/resume/route.ts:98-135` accepts a `filePath` query param and uses `path.basename` + `resolvedPath.startsWith(dataDir)` for traversal defence. This file is outside the commit range but I verified the pattern is still correct.
- `src/lib/connector/data-enrichment/modules/logo-dev/index.ts:69-70` correctly uses a `cleanLogoUrl` without the token for the `logoUrl` returned in `EnrichmentOutput`, so the token never reaches `Company.logoUrl` through today's single module. This is the luck-based behaviour that H-S-03 is asking to codify.
- `__tests__/webhook-channel.spec.ts:329-345` correctly tests that the `findMany` query scopes by userId + active. The pattern is reproduced across multiple tests (H3: IDOR). This is good coverage.
- The Wikipedia-media URL regex at `logoCheck.actions.ts:29` is case-insensitive and covers multiple locale filename prefixes (Datei/Fichier/Archivo/Bestand/Fil/Tiedosto). Good coverage; I noticed Italian (`Immagine`) and Dutch (`Bestand` is present, but `Afbeelding` is not) are missing but that's a functional gap, not a security one.
- `src/lib/connector/degradation.ts:46-48` uses a `truncate()` helper that slices strings at a byte offset without respecting UTF-8 boundaries. A multi-byte character straddling position 200 would split into an invalid UTF-8 sequence. For notification `message` this is a cosmetic issue at worst, but the same helper is used inside the `actorName` / `titleParams` fields that flow through into the webhook JSON payload, where a malformed UTF-8 sequence can break downstream JSON parsers. Not a direct security issue (no injection, no code execution) — filing as an observation.
- The lint rule `"no-empty": ["error", { "allowEmptyCatch": false }]` added in `.eslintrc.json:4` is a good guard, but `.catch(() => {})` in 5 places (enrichment-trigger.ts:200,225; orchestrator.ts:277; credential-resolver.ts:36; api-key-resolver.ts:32) passes the rule because it's an expression callback, not an empty block. If tightening is desired, consider a custom rule that flags `.catch(()=>{})` too — these places silently swallow errors and the current rule does not catch them.
- `__tests__/svg-sanitizer.spec.ts:337-343` is a test that **asserts a vulnerability** rather than a defence. It should be inverted after fixing H-S-01. Noting this in the testing dimension's territory per scope instructions.
