# Review Scope

## Target

Data Enrichment Connector (ROADMAP 1.13 Phase 1) — new Connector type with 3 modules (Clearbit Logo, Google Favicon, Meta/OpenGraph Parser), fallback chain orchestration, cache with TTL, server actions, UI components, i18n, and Allium spec.

## Files

### Connector Infrastructure (13 files)
- `src/lib/connector/data-enrichment/types.ts`
- `src/lib/connector/data-enrichment/registry.ts`
- `src/lib/connector/data-enrichment/orchestrator.ts`
- `src/lib/connector/data-enrichment/connectors.ts`
- `src/lib/connector/data-enrichment/modules/clearbit/index.ts`
- `src/lib/connector/data-enrichment/modules/clearbit/manifest.ts`
- `src/lib/connector/data-enrichment/modules/clearbit/resilience.ts`
- `src/lib/connector/data-enrichment/modules/google-favicon/index.ts`
- `src/lib/connector/data-enrichment/modules/google-favicon/manifest.ts`
- `src/lib/connector/data-enrichment/modules/google-favicon/resilience.ts`
- `src/lib/connector/data-enrichment/modules/meta-parser/index.ts`
- `src/lib/connector/data-enrichment/modules/meta-parser/manifest.ts`
- `src/lib/connector/data-enrichment/modules/meta-parser/resilience.ts`

### Server Actions (1 file)
- `src/actions/enrichment.actions.ts`

### UI Components (2 files)
- `src/components/ui/company-logo.tsx`
- `src/components/settings/EnrichmentModuleSettings.tsx`

### i18n (1 file)
- `src/i18n/dictionaries/enrichment.ts`

### Allium Spec (1 file)
- `specs/data-enrichment.allium`

### Tests (7 files)
- `__tests__/enrichment-orchestrator.spec.ts`
- `__tests__/enrichment-actions.spec.ts`
- `__tests__/enrichment-clearbit.spec.ts`
- `__tests__/enrichment-google-favicon.spec.ts`
- `__tests__/enrichment-meta-parser.spec.ts`
- `__tests__/CompanyLogo.spec.tsx`
- `__tests__/EnrichmentModuleSettings.spec.tsx`

### Modified Shared Files
- `src/lib/connector/manifest.ts` — ConnectorType extension
- `src/lib/connector/registry.ts` — AnyConnector union
- `src/lib/events/event-types.ts` — EnrichmentCompleted/Failed events
- `prisma/schema.prisma` — EnrichmentResult + EnrichmentLog models

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js 15 (auto-detected)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
