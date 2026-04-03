# S4 Blind Spot Analysis -- Data Enrichment Connector

**Date**: 2026-04-03
**Scope**: Data Enrichment implementation (S4) -- areas not covered by standard review dimensions
**Method**: Systematic analysis of edge cases, integration boundaries, failure modes, and implicit assumptions
**Findings**: 17

---

## Summary

| Category | Count | Severity Breakdown |
|----------|-------|--------------------|
| Failure Modes | 4 | 1 High, 2 Medium, 1 Low |
| Integration Boundaries | 3 | 1 High, 2 Medium |
| Data Integrity | 3 | 1 High, 1 Medium, 1 Low |
| Implicit Assumptions | 3 | 1 Medium, 2 Low |
| Operational Gaps | 2 | 1 Medium, 1 Low |
| Test Coverage Gaps | 2 | 2 Medium |
| **Total** | **17** | **3 High, 8 Medium, 6 Low** |

---

## Failure Modes (4)

### BS4-01 -- Concurrent enrichment for same domain (HIGH)

**Description**: Two simultaneous requests for the same company domain (e.g., two vacancies from the same company imported in one automation run) trigger two parallel enrichment chains. Both hit external APIs, both attempt DB writes. The second write either duplicates the row (if no unique constraint) or fails silently (if constraint exists).
**Impact**: Wasted external API quota, potential duplicate cache entries.
**Status**: Documented as accepted risk (S4-M01). The frequency is low because the automation pipeline processes vacancies sequentially per run. Manual triggers are rate-limited to 30/min.
**Mitigation**: The enrichment cache provides coalescing for concurrent reads. Write conflicts are handled by Prisma's upsert semantics.

### BS4-02 -- Chain timeout fires mid-module (MEDIUM)

**Description**: The 10-second chain timeout (`CHAIN_TIMEOUT_MS`) applies to the entire fallback chain walk. If Clearbit takes 8 seconds and returns "not_found", Google Favicon gets only 2 seconds. The per-module timeout (5s) may not fire because the chain timeout fires first.
**Impact**: The last module in a chain gets less effective time than the first.
**Mitigation**: The chain timeout is defensive. In practice, each module has its own 5s timeout via Cockatiel, which fires before the chain timeout for any single module. The chain timeout catches cases where multiple modules each take 4.9 seconds.

### BS4-03 -- Clearbit free tier deprecation risk (MEDIUM)

**Description**: The Clearbit Logo API (`https://logo.clearbit.com/{domain}`) is a free, undocumented endpoint. Clearbit was acquired by HubSpot in 2023. The endpoint could be removed or rate-limited without notice. No API key is required (and none is accepted).
**Impact**: Primary logo enrichment module could fail without warning. Fallback to Google Favicon mitigates but provides lower-quality results (16x16 favicons vs full logos).
**Status**: Documented. The fallback chain architecture was designed specifically for this scenario. Adding a new logo module requires only `manifest.ts` + `index.ts` + one line in `connectors.ts`.

### BS4-04 -- Streaming body read edge case with chunked encoding (LOW)

**Description**: The 100KB streaming body limit counts bytes from the `ReadableStream` reader. For chunked transfer encoding, the stream delivers decoded chunks. If the server sends a single >100KB chunk, the limit fires correctly. However, if Content-Length header is present and exceeds 100KB, the code could short-circuit earlier by checking the header before streaming.
**Impact**: Negligible -- the streaming approach works correctly in all cases, just slightly less efficient than a header check.
**Recommendation**: Add Content-Length header check as an optimization before falling back to streaming.

---

## Integration Boundaries (3)

### BS4-05 -- Event bridge timing with transaction boundaries (HIGH)

**Description**: `CompanyCreated` and `VacancyPromoted` events are emitted after the Prisma transaction commits. The enrichment event handler fires asynchronously and queries the database for the newly created entity. In rare cases (high write load, SQLite WAL mode), the read may not see the committed write due to WAL checkpoint timing.
**Impact**: Enrichment silently skips the entity because the DB query returns null.
**Mitigation**: The event handler includes a retry with 500ms delay. SQLite WAL checkpoints are typically sub-millisecond. In practice, this has not been observed.

### BS4-06 -- Domain event types not exhaustive for enrichment triggers (MEDIUM)

**Description**: The enrichment system listens for `CompanyCreated` and `VacancyPromoted` events. However, companies can also be created through: (1) the public API v1 `POST /api/v1/jobs` with a new company name, (2) the admin CompaniesContainer, (3) the profile work experience form. These paths create companies without emitting `CompanyCreated`.
**Impact**: Companies created through non-primary paths do not get auto-enriched.
**Recommendation**: Ensure `CompanyCreated` is emitted from all company creation paths, or add a scheduled enrichment scan for un-enriched companies.

### BS4-07 -- Google Favicon returns redirect to default icon (MEDIUM)

**Description**: Google Favicon API (`https://www.google.com/s2/favicons?domain={domain}&sz=128`) returns a valid 200 response even for non-existent domains -- it returns the default globe icon. The module cannot distinguish "found the real favicon" from "returned the default placeholder".
**Impact**: Companies with no website get the Google default globe icon stored as their "logo", which is misleading.
**Mitigation**: The module checks response Content-Length against known default icon sizes (specific byte counts) to detect the placeholder. This heuristic may break if Google changes the default icon.

---

## Data Integrity (3)

### BS4-08 -- EnrichmentResult TTL drift across dimensions (HIGH)

**Description**: Different dimensions have different TTLs (logo: 30 days, deep_link: 7 days). The `staleAt` timestamp is computed at enrichment time. If the system clock drifts or the server restarts with a different timezone, stale-if-error calculations may serve expired data or prematurely evict fresh data.
**Impact**: Stale enrichment data served when fresh data should be fetched, or unnecessary re-enrichment.
**Mitigation**: All timestamps use UTC via `new Date().toISOString()`. Clock drift on a self-hosted server is the operator's responsibility. NTP is assumed.

### BS4-09 -- Logo URL stored but not validated on read (MEDIUM)

**Description**: The `logoUrl` stored in `EnrichmentResult.data` is validated at write time (URL format, HTTPS, no private IPs). However, the URL is not re-validated on read. If the stored URL's target is later compromised or changed, CompanyLogo will load a potentially malicious image.
**Impact**: Stored URLs could serve different content over time. Low risk because logos are loaded as `<img>` tags (no script execution) and the browser's CSP applies.
**Recommendation**: Consider Content-Security-Policy `img-src` directive to restrict logo loading to known domains (Clearbit, Google Favicon).

### BS4-10 -- EnrichmentLog unbounded growth (LOW)

**Description**: Every enrichment attempt creates an `EnrichmentLog` row recording module, outcome, latency, and error details. There is no TTL or cleanup mechanism. Over time, the table grows unboundedly.
**Impact**: SQLite database file growth, slower queries on the log table. Not a practical concern for single-user self-hosted deployment for months/years.
**Status**: Documented (S4-M02). Cleanup planned for ROADMAP 0.9 Stufe 2.

---

## Implicit Assumptions (3)

### BS4-11 -- Assumes company domain is derivable from company name (MEDIUM)

**Description**: The enrichment pipeline tries to derive a domain from the company name when no explicit domain is available. The `extractDomain` heuristic converts "Google LLC" to "google.com" and "Deutsche Bank AG" to "deutschebank.com". This fails for: companies with non-.com TLDs, companies whose domain differs from their name (e.g., "Alphabet" -> not alphabet.com for Google), and companies with non-Latin names.
**Impact**: Logo enrichment fails silently for companies where the domain heuristic returns an incorrect domain.
**Mitigation**: The extractDomain improvement (catch-up) handles more cases. Users can manually set the company URL in the admin panel, which bypasses the heuristic.

### BS4-12 -- Assumes external services return consistent responses (LOW)

**Description**: The Clearbit and Google Favicon modules assume the external API response format is stable. No schema validation is performed on the response beyond basic HTTP status checks.
**Impact**: If an external API changes its response format, the module may store garbage data.
**Mitigation**: The data stored is simple (a URL string for logos, text strings for meta tags). Schema changes in these mature APIs are unlikely.

### BS4-13 -- Assumes single-node deployment (LOW)

**Description**: The in-memory orchestrator singleton (globalThis), enrichment rate limiter, and request coalescing assume a single Node.js process. Multi-node deployment would bypass these safeguards.
**Impact**: Duplicate enrichment requests and rate limit bypass in multi-node setups.
**Status**: Consistent with project-wide assumption. JobSync is designed for self-hosted single-node deployment. Documented in architecture decisions.

---

## Operational Gaps (2)

### BS4-14 -- No enrichment health dashboard (MEDIUM)

**Description**: Module health is visible in Settings (activation toggles, health indicators), but there is no aggregated view of enrichment effectiveness: cache hit rates, module success rates, average latency, chain fallback frequency.
**Impact**: Operators cannot diagnose enrichment problems without querying the EnrichmentLog table directly.
**Recommendation**: Future: Add enrichment metrics to the admin dashboard. Data exists in EnrichmentLog table.

### BS4-15 -- No manual re-enrichment trigger from job detail (LOW)

**Description**: Enrichment can be triggered from Settings (admin-level) or automatically via events. There is no "Re-enrich" button on the job detail page where a user notices a missing/wrong logo.
**Impact**: Users must wait for the next automation run or manually trigger from Settings.
**Recommendation**: Add a small refresh icon on CompanyLogo that triggers manual re-enrichment for that specific company.

---

## Test Coverage Gaps (2)

### BS4-16 -- No integration test for event-triggered enrichment (MEDIUM)

**Description**: The auto-trigger path (CompanyCreated -> enrichment) is tested at the unit level (event handler is called) but not at the integration level (event emitted -> handler fires -> orchestrator called -> DB updated).
**Impact**: Regressions in the event wiring would not be caught until E2E tests or manual testing.
**Recommendation**: Add an integration test that emits `CompanyCreated` and asserts an `EnrichmentResult` row is created.

### BS4-17 -- No test for fallback chain exhaustion (MEDIUM)

**Description**: The happy path (first module succeeds) and single-fallback path (first fails, second succeeds) are tested. The exhaustion path (all modules in chain fail) is not tested end-to-end.
**Impact**: If all modules fail, the orchestrator should store a "not_found" result with appropriate TTL and emit `EnrichmentFailed`. This behavior is asserted only in unit tests, not integration.
**Recommendation**: Add orchestrator integration test with all module mocks returning errors.

---

## Cross-Reference

| Finding | Related Review Finding | Relationship |
|---------|----------------------|--------------|
| BS4-01 | S4-M01 (Security) | Same issue, different dimension |
| BS4-05 | S4-ARCH04 (Architecture) | Event decoupling creates timing gap |
| BS4-07 | S4-CQ07 (Code Quality) | Response validation gap |
| BS4-10 | S4-M02 (Security) | Same issue, different dimension |
| BS4-11 | S4-CQ01 (Code Quality) | extractDomain heuristic limitations |
