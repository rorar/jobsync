# ADR-029: Scope Enrichment Cache Keys by userId

**Date:** 2026-04-08
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The in-memory enrichment cache in `orchestrator.ts` used `dimension + domainKey` as the cache key (e.g., `enrichment:logo:example.com`). This meant that when User A triggered enrichment for a company domain and the result was cached, User B requesting the same dimension and domain would receive User A's cached result directly from memory -- bypassing the database persistence step entirely.

This caused two problems:

1. **Cross-user data leakage:** User B received a result that was never written to their own `EnrichmentResult` row, violating the `@@unique(userId, dimension, domainKey)` constraint at the application level. While the data itself (a logo URL) is not user-specific, the audit trail and ownership tracking were bypassed.

2. **Missing audit trail:** Because the cache hit returned early before any database write, User B had no `EnrichmentResult` row and no `EnrichmentLog` entries. The per-user audit trail -- which tracks which modules were tried, their latency, and outcomes -- was silently skipped.

This violated the IDOR protection principle established in ADR-015, which requires all data access to be scoped by userId.

## Decision

Include `userId` in all enrichment cache keys. The cache key format changes from:

```
enrichment:{dimension}:{domainKey}
```

to:

```
enrichment:{dimension}:{userId}:{domainKey}
```

This is implemented in the `buildEnrichmentCacheKey()` function in `orchestrator.ts`. The `EnrichmentOrchestrator.execute()` method already receives `userId` as its first parameter, so no interface changes are needed.

## Consequences

### Positive

- Each user gets their own `EnrichmentResult` row and `EnrichmentLog` entries, maintaining the per-user audit trail
- Aligns with IDOR protection principle (ADR-015) -- all cached data is scoped to the requesting user
- No interface changes required -- `userId` was already a parameter of `execute()`

### Negative

- Cache hit rate may decrease slightly: the same domain enriched for two different users will result in two cache entries and two external API calls instead of one
- Memory usage increases proportionally with the number of distinct users requesting enrichment for the same domains

### Risks

- For self-hosted single-user deployments (the primary use case), this change has zero performance impact -- there is only one userId
- For multi-user deployments, the cache size increase is bounded by `users x dimensions x domains`, which remains small given the TTL-based eviction

## Related

- ADR-015 — IDOR ownership enforcement
- ADR-025 — Data enrichment connector architecture
- `specs/data-enrichment.allium` — EnrichmentResult unique constraint definition
