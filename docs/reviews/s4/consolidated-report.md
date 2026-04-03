# S4 Consolidated Code Review Report

**Target**: S4 Data Enrichment Connector (ROADMAP 1.13 Phase 1) + S3 Deferred Fixes + Catch-Up
**Reviewers**: Code Quality, Architecture, Security, WCAG 2.2, Interaction Design, Allium Weed
**Date**: 2026-04-03
**Files Reviewed**: 62 files across connector modules, orchestrator, server actions, UI components, hooks, tests

---

## Deduplication Log

Findings from multiple reviewers at the same location merged per multi-reviewer deduplication rules (same file:line + same issue = merge, take highest severity).

| Merged Finding | Sources | Resolution |
|---------------|---------|------------|
| Meta-parser redirect SSRF | SEC-01, CQ-02 | -> S4-C01 (Critical) |
| Clearbit domain validation | SEC-04, CQ-05 | -> S4-H02 (High) |
| Orchestrator globalThis singleton | SEC-06, ARCH-02 | -> S4-H04 (High) |
| extractDomain heuristic failures | CQ-01, BS-03 | -> S4-CQ01 (Critical) |
| Enrichment rate limiting | SEC-03, PERF-01 | -> S4-C03 (Critical) |

**Raw finding count**: ~82 across all reviewers
**After deduplication**: 62 unique findings

---

## Dimension Summary

| Dimension | Findings | Severity Breakdown | Status |
|-----------|----------|-------------------|--------|
| Code Quality | 19 | 1 Critical, 4 High, 8 Medium, 6 Low | All CRITICAL+HIGH fixed |
| Architecture | 5 | Clean, all ACL pattern compliant | No action required |
| Security | 12 | 3 Critical, 4 High, 5 Medium | All CRITICAL+HIGH fixed |
| WCAG 2.2 | 12 | 7 Level A, 4 Level AA, 1 Level AAA | Level A fixed |
| Interaction Design | 3 | 3 High | All fixed in catch-up |
| Allium Weed | 22 divergences | Spec aligned post-review | Resolved |

---

## Code Quality (19 findings)

### Critical (1)

#### S4-CQ01 -- extractDomain improved heuristic
**Location**: `src/lib/connector/data-enrichment/orchestrator.ts`
**Description**: `extractDomain()` failed on edge cases: URLs without protocol, domains with subdomains stripped incorrectly, international domains, and IP-based URLs. The heuristic returned garbage for inputs like `"example"` or `"http://"`.
**Impact**: Enrichment cache misses and incorrect module queries for malformed company domains.
**Fix**: Improved heuristic with proper URL parsing fallback, TLD validation, subdomain handling, and graceful degradation for unparseable inputs.

### High (4)

| ID | Finding | Location | Fix |
|----|---------|----------|-----|
| S4-CQ02 | Logo writeback logic duplicated in orchestrator and action | `orchestrator.ts`, `enrichment.actions.ts` | Deduplicated into single writeback path |
| S4-CQ03 | Missing null check on enrichment result before DB persist | `enrichment.actions.ts` | Added null guard before insert |
| S4-CQ04 | CompanyLogo component re-renders on every parent update | `CompanyLogo.tsx` | Added React.memo with custom comparison |
| S4-CQ05 | Orchestrator chain walk logs at info level (noisy) | `orchestrator.ts` | Downgraded to debug level |

### Medium (8)

| ID | Finding | Location |
|----|---------|----------|
| S4-CQ06 | `imageState` not reset when company prop changes | `CompanyLogo.tsx` |
| S4-CQ07 | Clearbit response not validated for content-type | `clearbit/index.ts` |
| S4-CQ08 | Meta-parser title truncation at arbitrary 200 chars | `meta-parser/index.ts` |
| S4-CQ09 | Missing JSDoc on public orchestrator methods | `orchestrator.ts` |
| S4-CQ10 | Enrichment action error messages not i18n | `enrichment.actions.ts` |
| S4-CQ11 | Health indicator component missing loading skeleton | `EnrichmentModuleSettings.tsx` |
| S4-CQ12 | Unused import in registry facade | `registry.ts` |
| S4-CQ13 | TTL constants duplicated between types.ts and orchestrator | `types.ts`, `orchestrator.ts` |

### Low (6)

| ID | Finding |
|----|---------|
| S4-CQ14 | Console.log in clearbit module (should use debugLog) |
| S4-CQ15 | Magic number 100000 (100KB) without named constant |
| S4-CQ16 | Inconsistent error message format across modules |
| S4-CQ17 | Test fixture missing enrichment-related Prisma models |
| S4-CQ18 | Comment references removed TODO |
| S4-CQ19 | Variable naming: `res` vs `response` inconsistency in modules |

---

## Architecture (5 findings)

All findings confirmed the implementation follows the ACL pattern faithfully.

| ID | Observation | Status |
|----|-------------|--------|
| S4-ARCH01 | DataEnrichmentConnector interface follows established ACL pattern | Clean |
| S4-ARCH02 | Fallback chain is a proper strategy pattern with priority ordering | Clean |
| S4-ARCH03 | Registry facade follows existing job-discovery/ai-provider pattern | Clean |
| S4-ARCH04 | Domain events (EnrichmentCompleted/Failed) correctly decouple enrichment from UI | Clean |
| S4-ARCH05 | Module manifests declare capabilities declaratively (supportedDimensions) | Clean |

---

## Security (12 findings)

### Critical (3)

#### S4-C01 -- Meta-parser SSRF via redirect chain
**Location**: `src/lib/connector/data-enrichment/modules/meta-parser/index.ts`
**Description**: The meta-parser followed HTTP redirects automatically (default `fetch` behavior). An attacker-controlled URL could redirect to internal services (169.254.169.254, localhost, internal DNS).
**Impact**: Server-Side Request Forgery -- access to cloud metadata endpoints, internal services.
**Fix**: Set `redirect: "manual"` on fetch. On 3xx, extract `Location` header, revalidate the target URL with the same SSRF checks (private IP, IMDS, non-HTTP protocol), then issue a second fetch to the validated target.

#### S4-C02 -- Memory DoS via unbounded response.text()
**Location**: `src/lib/connector/data-enrichment/modules/meta-parser/index.ts`
**Description**: `response.text()` reads the entire response body into memory. A malicious URL serving a multi-GB response would exhaust server memory.
**Impact**: Denial of Service -- server OOM crash.
**Fix**: Streaming body read with 100KB limit. Uses `ReadableStream` reader with byte counter. Aborts fetch when limit exceeded.

#### S4-C03 -- No rate limiting on enrichment server actions
**Location**: `src/actions/enrichment.actions.ts`
**Description**: Enrichment server actions (triggerEnrichment, getEnrichmentStatus) had no rate limiting. An attacker could trigger thousands of external API calls.
**Impact**: Resource exhaustion, upstream API abuse, potential cost amplification.
**Fix**: Per-user sliding window rate limiter (same pattern as API v1). Limit: 30 enrichment requests per minute per user.

### High (4)

| ID | Finding | Fix |
|----|---------|-----|
| S4-H01 | IDOR: enrichmentResult.update without userId in WHERE | Added userId to all WHERE clauses (ADR-015) |
| S4-H02 | Clearbit domain not validated -- arbitrary strings sent to external API | Domain regex validation before fetch |
| S4-H03 | XSS via unsanitized OpenGraph data stored and rendered | sanitizeMetaValue() strips HTML + image URL validation |
| S4-H04 | Orchestrator singleton not using globalThis -- broken after HMR | Applied globalThis pattern (matches RunCoordinator/EventBus) |

### Medium (5)

| ID | Finding | Status |
|----|---------|--------|
| S4-M01 | No concurrency control for same-domain enrichment | Documented as accepted risk |
| S4-M02 | EnrichmentLog unbounded growth | Documented, cleanup planned for 0.9 |
| S4-M03 | Persist failure returns success to caller | Documented as accepted |
| S4-H05 | Missing DEGRADED health check in chain walk | Fixed: skip degraded + unreachable modules |
| S4-M04 | Enrichment cache key uses unsanitized domain | Fixed: sanitize domain in cache key |

---

## WCAG 2.2 (12 findings)

Full WCAG audit: `docs/reviews/s4/wcag-audit.md`

### Level A (7)

| ID | SC | Finding | Status |
|----|----|---------|--------|
| W4-A01 | 1.1.1 | CompanyLogo missing alt text for screen readers | Fixed |
| W4-A02 | 1.3.1 | Health indicator status not programmatically determinable | Fixed |
| W4-A03 | 2.1.1 | Settings module toggle not keyboard-accessible | Fixed |
| W4-A04 | 4.1.2 | Loading skeleton missing aria-busy="true" | Fixed |
| W4-A05 | 1.3.1 | Enrichment status badge uses color only | Fixed |
| W4-A06 | 4.1.2 | Module activation toggle missing aria-label | Fixed |
| W4-A07 | 3.3.1 | Enrichment error state not announced to screen readers | Fixed |

### Level AA (4)

| ID | SC | Finding | Status |
|----|----|---------|--------|
| W4-AA01 | 1.4.3 | Health dot color insufficient contrast on light background | Documented |
| W4-AA02 | 1.4.11 | Module card border relies on color alone | Documented |
| W4-AA03 | 4.1.3 | No status message on enrichment completion | Documented |
| W4-AA04 | 2.4.7 | Focus not moved to result after enrichment completes | Documented |

### Level AAA (1)

| ID | SC | Finding | Status |
|----|----|---------|--------|
| W4-AAA01 | 2.4.10 | Settings enrichment section not in page heading hierarchy | Documented |

---

## Interaction Design (3 findings)

All HIGH findings fixed in catch-up session.

| ID | Finding | Fix |
|----|---------|-----|
| S4-ID01 | No status feedback during enrichment (user sees no progress) | Added loading state with spinner + status text |
| S4-ID02 | Module deactivation has no confirmation dialog | Added AlertDialog with consequence explanation |
| S4-ID03 | Mobile settings page enrichment section poorly laid out | Responsive grid with stacked cards on mobile |

---

## Allium Weed (22 divergences)

Spec `specs/data-enrichment.allium` aligned with implementation after review. Key corrections:

| Category | Count | Description |
|----------|-------|-------------|
| Missing surfaces | 5 | CompanyLogo, EnrichmentModuleSettings, HealthIndicator, StatusBadge, OrchestratorPanel |
| Incorrect types | 4 | CacheStatus enum values, TTL types, dimension literals, outcome values |
| Missing rules | 6 | Chain timeout, module skip conditions, cache eviction, stale-if-error, writeback dedup, placeholder fallback |
| Missing events | 3 | EnrichmentCompleted, EnrichmentFailed, EnrichmentCacheHit |
| Naming mismatches | 4 | companyDomain vs domain, moduleId vs connectorId, chainTimeout vs timeout, ttl vs ttlSeconds |

All 22 divergences resolved: 8 code changes + 14 spec updates.

---

## Catch-Up Session Fixes (Tasks 6-11)

### Task 6: Auto-trigger enrichment
- `CompanyCreated` event triggers logo enrichment for new companies
- `VacancyPromoted` event triggers deep link enrichment when vacancy is promoted to job
- Event handlers registered in enrichment event bridge

### Task 7: Cockatiel resilience
- All 3 enrichment modules wrapped with Cockatiel resilience policies
- Retry (2 attempts, 1s backoff), Circuit Breaker (3 failures, 30s half-open), Timeout (5s)
- Uses shared `buildResiliencePolicy()` from manifest config

### Task 11: S3 deferred MEDIUM items
- **F7**: handleError prefix strings converted to i18n keys across affected callsites
- **F6**: Toast dismiss button sr-only text uses i18n key
- **EDGE-3**: KanbanEmptyState CTA button properly conditional
- **D5**: "Expired" status transitions documented in spec
- **D7**: Vacancy promoter creates initial JobStatusHistory entry

### WCAG Level A fixes
- Health indicator: added aria-label with status text
- Loading states: added aria-busy and sr-only announcements
- CompanyLogo imageState: reset on company prop change

### extractDomain improvement
- Handles URLs without protocol prefix
- Correctly preserves subdomains for known multi-tenant hosts
- Graceful fallback for unparseable inputs
- Added unit tests for edge cases

### Logo writeback deduplication
- Single writeback path in orchestrator (removed duplicate in action file)
- Prevents double-write when both orchestrator and action attempt DB update

---

## Test Coverage

- 121 new tests across 8 suites (modules, orchestrator, actions, components)
- Total project: 138 suites, 2569 tests passing
- Coverage areas: enrichment modules, fallback chains, cache, orchestrator, UI components, domain events
