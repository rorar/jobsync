# ADR-025: Data Enrichment Connector Architecture

**Date:** 2026-04-03
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

JobSync's job discovery pipeline collects vacancy data from external job boards (EURES, Arbeitsagentur, JSearch). These vacancies reference companies, but the pipeline captures only the company name -- no logos, website metadata, or structured company information. Users see a wall of text-only company names in the staging queue and job list, making it difficult to quickly scan and evaluate opportunities.

Additionally, vacancies imported from job boards often include a URL to the original listing, but no preview metadata (title, description, image). When users see a "View Original" link, they have no visual indication of what the link contains.

We need a system to enrich company and job data from external sources after initial import. Key requirements:

1. **Multiple data dimensions**: logos, deep links (OpenGraph), and future dimensions (reviews, salary, contacts)
2. **Multiple sources per dimension**: Company logos can come from Clearbit, Google Favicon, or other providers
3. **Graceful degradation**: If one source fails, try the next; never block the user
4. **Caching with TTL**: Avoid redundant external API calls; serve stale data during outages
5. **Audit trail**: Track which module provided which data, with latency and error details

## Decision

Introduce a third ConnectorType (`DATA_ENRICHMENT`) alongside `JOB_DISCOVERY` and `AI_PROVIDER`, following the established App-Connector-Module ACL pattern (ADR-004, ADR-010).

### Architecture

```
App Layer (enrichment.actions.ts)
  |
  v
Orchestrator (orchestrator.ts)
  - Receives EnrichmentInput (dimension + domain/URL)
  - Looks up fallback chain for the requested dimension
  - Walks chain in priority order: first success wins
  - Skips inactive, degraded, or circuit-broken modules
  - Stores result in EnrichmentResult cache table
  - Logs attempt in EnrichmentLog audit table
  - Emits EnrichmentCompleted / EnrichmentFailed events
  |
  v
DataEnrichmentConnector (types.ts)
  - Single interface: enrich(input) -> EnrichmentOutput
  - Dimension-agnostic: same interface for logo, deep_link, etc.
  |
  v
Modules (modules/{clearbit,google_favicon,meta_parser}/)
  - Each declares a DataEnrichmentManifest (id, type, supportedDimensions, health, resilience)
  - Each implements DataEnrichmentConnector
  - Registered in connectors.ts via moduleRegistry
```

### Fallback Chain Design

Rather than a single enrichment service that tries all sources internally, we use a **dimension-based fallback chain** where the orchestrator selects which modules to try and in what order:

```
Logo dimension:
  1. Clearbit Logo API (priority 1) -- full-size company logos
  2. Google Favicon API (priority 2) -- 128px favicons as fallback
  3. [Placeholder] (built-in) -- initials avatar

Deep Link dimension:
  1. Meta/OpenGraph Parser (priority 1) -- HTML meta tag extraction
```

The chain configuration is declarative (`DEFAULT_CHAINS` in `orchestrator.ts`). New modules are added to the chain by editing the configuration array -- no code changes needed in the orchestrator.

### Alternatives Considered

**Alternative A: Single enrichment service** -- One monolithic `EnrichmentService` class that internally calls all external APIs and manages fallback logic. Rejected because:
- Violates the ACL pattern (ADR-004): each external API should be behind its own module
- No manifest-driven lifecycle: cannot activate/deactivate individual sources
- Resilience policies (retry, circuit breaker) cannot be configured per-source
- Adding a new source requires modifying the service class

**Alternative B: Per-module approach without orchestrator** -- Each module enriches independently, consumers pick the best result. Rejected because:
- Wastes API quota: all modules called even when the first succeeds
- No priority ordering: consumers must implement their own selection logic
- No fallback semantics: if the primary fails, the consumer must know about alternatives

**Alternative C: External enrichment service (microservice)** -- Offload enrichment to a separate service. Rejected because:
- JobSync is a self-hosted application; adding a microservice increases deployment complexity
- The enrichment logic is simple enough to run in-process
- SQLite database is co-located with the application

### Key Design Decisions

1. **Dimension as first-class concept**: The `EnrichmentDimension` type ("logo", "deep_link") is the primary routing key. Future dimensions (reviews, salary, contacts) are added by defining a new dimension value and registering modules that support it.

2. **Cache-first with stale-if-error**: The orchestrator checks the `EnrichmentResult` table before calling any module. If a result exists and is not expired, it is returned immediately. If the result is stale (past TTL but within grace period), it is returned while a background refresh is attempted. On error, stale data is served.

3. **Module-level resilience via Cockatiel**: Each module has its own Cockatiel policy (retry + circuit breaker + timeout), configured through the manifest. The orchestrator does not retry failed modules -- it moves to the next in the chain.

4. **Events for decoupled triggering**: Enrichment is triggered via domain events (`CompanyCreated`, `VacancyPromoted`) rather than direct calls from the creation path. This keeps the import pipeline fast and the enrichment non-blocking.

5. **Audit logging per attempt**: Every module invocation is logged to `EnrichmentLog` with outcome, latency, and error details. This enables module effectiveness tracking (which modules succeed most often, which are slow).

## Consequences

### Positive

- **Extensible**: Adding a new enrichment source (e.g., Brandfetch for logos, LinkedIn for contacts) requires only `manifest.ts` + `index.ts` + one line in `connectors.ts` + one entry in the chain config
- **Resilient**: Fallback chains ensure enrichment degrades gracefully. If Clearbit goes down, Google Favicon takes over automatically
- **Observable**: EnrichmentLog table provides per-module effectiveness data
- **Consistent**: Follows the same ACL pattern as Job Discovery and AI Provider connectors -- developers familiar with one connector type can work on any
- **Non-blocking**: Event-driven triggering keeps the import pipeline fast. Users see data as it enriches asynchronously

### Negative

- **Schema complexity**: Two new tables (`EnrichmentResult`, `EnrichmentLog`) plus the existing `ModuleRegistration` table. Three migration files for S4
- **External API dependency**: Logo and favicon enrichment depend on free-tier APIs (Clearbit, Google) that could change terms or availability without notice
- **In-memory orchestrator**: The singleton orchestrator holds no persistent state, but its globalThis pattern adds to the growing list of HMR-safe singletons
- **Domain heuristic**: Deriving a company domain from its name is inherently imprecise. The `extractDomain` function handles common cases but will fail for companies whose domain differs significantly from their name

### Risks

- **Clearbit free tier deprecation**: Clearbit was acquired by HubSpot. The free logo API is undocumented and could be removed. Mitigation: fallback chain architecture, Google Favicon as backup
- **Rate limiting by external APIs**: High-volume enrichment (large automation import) could trigger rate limits. Mitigation: enrichment cache prevents duplicate requests, per-user rate limiting prevents abuse
- **SQLite write contention**: Enrichment writes (result + log) add to SQLite's single-writer contention. Mitigation: writes are small and infrequent (per-company, not per-job), cached results avoid repeated writes

### Files Changed

- `src/lib/connector/data-enrichment/types.ts` -- DataEnrichmentConnector interface, dimension types, config constants
- `src/lib/connector/data-enrichment/orchestrator.ts` -- Fallback chain orchestration, caching, event emission
- `src/lib/connector/data-enrichment/registry.ts` -- EnrichmentConnectorRegistry facade
- `src/lib/connector/data-enrichment/connectors.ts` -- Module registration barrel
- `src/lib/connector/data-enrichment/modules/clearbit/` -- Clearbit Logo module (manifest + connector)
- `src/lib/connector/data-enrichment/modules/google-favicon/` -- Google Favicon module (manifest + connector)
- `src/lib/connector/data-enrichment/modules/meta-parser/` -- Meta/OpenGraph Parser module (manifest + connector)
- `src/lib/connector/manifest.ts` -- Added `DATA_ENRICHMENT` to `ConnectorType` enum
- `src/actions/enrichment.actions.ts` -- Server actions for enrichment triggers
- `src/components/enrichment/CompanyLogo.tsx` -- Logo display with skeleton/image/initials fallback
- `src/components/settings/EnrichmentModuleSettings.tsx` -- Module activation toggles
- `prisma/schema.prisma` -- EnrichmentResult + EnrichmentLog models
- `specs/data-enrichment.allium` -- Allium specification (821 lines)

## Amendment (2026-04-08)

References to `connectors.ts` barrel registration are superseded by ADR-028 (Self-Contained Modules). Modules now self-register in their own `index.ts`, imported by `register-all.ts`. The enrichment chain config and orchestrator patterns are unchanged.
