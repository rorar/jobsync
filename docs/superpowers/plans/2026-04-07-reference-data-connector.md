# Reference Data Connector + Module Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `reference_data` ConnectorType, move ESCO/Eurostat modules from data_enrichment to reference_data, add `dependencies` field to ModuleManifest, implement dependency health checking, and show dependency tree in the API Status UI.

**Architecture:** Extend the existing manifest type system with `REFERENCE_DATA` enum value, `DependencyHealthCheck` type, and `ReferenceDataManifest` interface. Move the esco-api and eurostat-nuts modules to a new `reference-data/` connector directory. Extend the health monitor to probe dependency endpoints. Add dependency declarations to the EURES manifest. Update ApiStatusOverview to render dependency tree.

**Tech Stack:** TypeScript, Next.js 15, Shadcn UI, Tailwind CSS, Jest + Testing Library, Allium spec (already patched)

**Spec:** `specs/module-lifecycle.allium` (already updated this session — source of truth for all changes below)

**Resource constraint:** Never run tests and builds in parallel. Single worker for tests.

---

## File Structure

### New files
- `src/lib/connector/reference-data/types.ts` — ReferenceDataConnector interface (health-only, no lookup yet)
- `src/lib/connector/reference-data/registry.ts` — Facade over moduleRegistry for reference_data modules
- `src/lib/connector/reference-data/connectors.ts` — Registration barrel
- `src/lib/connector/reference-data/modules/esco-classification/manifest.ts` — ESCO manifest (moved + renamed)
- `src/lib/connector/reference-data/modules/esco-classification/index.ts` — ESCO no-op connector (moved + renamed)
- `src/lib/connector/reference-data/modules/eurostat-nuts/manifest.ts` — Eurostat manifest (moved)
- `src/lib/connector/reference-data/modules/eurostat-nuts/index.ts` — Eurostat no-op connector (moved)
- `__tests__/connector/reference-data-registration.spec.ts` — Registration tests
- `__tests__/connector/dependency-health.spec.ts` — Dependency health degradation tests
- `__tests__/connector/reference-data-manifests.spec.ts` — Manifest property tests

### Modified files
- `src/lib/connector/manifest.ts` — Add `REFERENCE_DATA` to ConnectorType enum, add `DependencyHealthCheck` interface, add `dependencies` to ModuleManifest, add `ReferenceDataManifest` interface
- `src/lib/connector/registry.ts` — Import ReferenceDataConnector in AnyConnector union
- `src/lib/connector/health-monitor.ts` — Add `checkDependencyHealth()`, integrate into `checkModuleHealth()`
- `src/lib/connector/data-enrichment/connectors.ts` — Remove esco-api and eurostat-nuts registrations
- `src/actions/module.actions.ts` — Import reference-data connectors barrel, add `dependencies` to ModuleManifestSummary, include REFERENCE_DATA in getModuleManifests default query
- `src/lib/connector/job-discovery/modules/eures/manifest.ts` — Add `dependencies` array
- `src/components/settings/ApiStatusOverview.tsx` — Add `reference_data` to CONNECTOR_GROUPS, render dependency sub-rows
- `src/components/settings/SettingsSidebar.tsx` — No change needed (already has api-status section)
- `src/i18n/dictionaries/enrichment.ts` — Add `connectorGroup.reference_data` key (4 locales)
- `__tests__/esco-api-manifest.spec.ts` — Update import path
- `__tests__/eurostat-nuts-manifest.spec.ts` — Update import path
- `__tests__/data-enrichment-registration.spec.ts` — Remove esco/eurostat assertions
- `__tests__/ApiStatusOverview.spec.tsx` — Add dependency rendering tests

### Deleted files
- `src/lib/connector/data-enrichment/modules/esco-api/manifest.ts`
- `src/lib/connector/data-enrichment/modules/esco-api/index.ts`
- `src/lib/connector/data-enrichment/modules/eurostat-nuts/manifest.ts`
- `src/lib/connector/data-enrichment/modules/eurostat-nuts/index.ts`

---

## Task 1: Extend manifest types

**Files:**
- Modify: `src/lib/connector/manifest.ts:15-19` (ConnectorType enum)
- Modify: `src/lib/connector/manifest.ts:131-142` (ModuleManifest interface)
- Modify: `src/lib/connector/manifest.ts:156-159` (after DataEnrichmentManifest)

- [ ] **Step 1: Add REFERENCE_DATA to ConnectorType enum**

In `src/lib/connector/manifest.ts`, change the enum:

```typescript
export enum ConnectorType {
  JOB_DISCOVERY = "job_discovery",
  AI_PROVIDER = "ai_provider",
  DATA_ENRICHMENT = "data_enrichment",
  REFERENCE_DATA = "reference_data",
}
```

- [ ] **Step 2: Add DependencyHealthCheck interface**

After the `SearchFieldOverride` interface (around line 125), add:

```typescript
// =============================================================================
// Dependency Health Checks
// =============================================================================

export interface DependencyHealthCheck {
  /** Stable identifier (e.g. "esco_classification") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Health probe URL (absolute) */
  endpoint: string;
  /** Probe timeout in milliseconds */
  timeoutMs: number;
  /** true = module cannot function without it, false = degraded mode */
  required: boolean;
  /** Human-readable purpose (e.g. "Occupation search in Automation Wizard") */
  usedFor: string;
}
```

- [ ] **Step 3: Add dependencies to ModuleManifest**

In the `ModuleManifest` interface, after `cachePolicy`, add:

```typescript
  /** External services this module depends on. Health-checked alongside the module. */
  dependencies?: DependencyHealthCheck[];
```

- [ ] **Step 4: Add ReferenceDataManifest interface**

After `DataEnrichmentManifest`, add:

```typescript
export interface ReferenceDataManifest extends ModuleManifest {
  connectorType: ConnectorType.REFERENCE_DATA;
  /** Which taxonomy this module provides (e.g. "esco_occupations", "nuts_regions") */
  taxonomy: string;
}
```

- [ ] **Step 5: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/connector/manifest.ts
git commit -m "feat(connector): add REFERENCE_DATA ConnectorType, DependencyHealthCheck, and dependencies field to ModuleManifest"
```

---

## Task 2: Create reference-data connector structure

**Files:**
- Create: `src/lib/connector/reference-data/types.ts`
- Create: `src/lib/connector/reference-data/registry.ts`
- Create: `src/lib/connector/reference-data/connectors.ts`
- Modify: `src/lib/connector/registry.ts:13,23` (AnyConnector union)

- [ ] **Step 1: Create types.ts**

```typescript
/**
 * Reference Data Connector — Type Definitions
 *
 * Health-only connector for taxonomy/classification services.
 * No lookup interface yet — will be added when the first consumer
 * needs programmatic access (Skillsets 4.1, CareerBERT 9.1).
 */

export interface ReferenceDataConnector {
  /** Placeholder — reference data modules are health-only for now */
  readonly id: string;
}
```

- [ ] **Step 2: Create registry.ts**

```typescript
/**
 * Reference Data — Registry Facade
 *
 * Thin wrapper over the unified ModuleRegistry for reference_data modules.
 * Same pattern as job-discovery/registry.ts and data-enrichment/registry.ts.
 */

import { moduleRegistry } from "../registry";
import { ConnectorType } from "../manifest";

export function getReferenceDataModules() {
  return moduleRegistry.getByType(ConnectorType.REFERENCE_DATA);
}

export function getActiveReferenceDataModules() {
  return moduleRegistry.getActive(ConnectorType.REFERENCE_DATA);
}
```

- [ ] **Step 3: Create empty connectors.ts barrel**

```typescript
/**
 * Reference Data — Module Registration Barrel
 *
 * Imports and registers all reference data modules with the unified ModuleRegistry.
 * This file is imported once at startup.
 */

import { moduleRegistry } from "../registry";

// Modules will be registered here after move in Task 3
export { moduleRegistry };
```

- [ ] **Step 4: Update AnyConnector union in registry.ts**

In `src/lib/connector/registry.ts`, add the import and extend the union:

```typescript
import type { ReferenceDataConnector } from "./reference-data/types";

type AnyConnector = DataSourceConnector | AIProviderConnector | DataEnrichmentConnector | ReferenceDataConnector;
```

- [ ] **Step 5: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/connector/reference-data/ src/lib/connector/registry.ts
git commit -m "feat(connector): create reference-data connector structure with types, registry facade, and barrel"
```

---

## Task 3: Move ESCO and Eurostat modules to reference-data

**Files:**
- Create: `src/lib/connector/reference-data/modules/esco-classification/manifest.ts`
- Create: `src/lib/connector/reference-data/modules/esco-classification/index.ts`
- Create: `src/lib/connector/reference-data/modules/eurostat-nuts/manifest.ts`
- Create: `src/lib/connector/reference-data/modules/eurostat-nuts/index.ts`
- Modify: `src/lib/connector/reference-data/connectors.ts`
- Modify: `src/lib/connector/data-enrichment/connectors.ts`
- Delete: `src/lib/connector/data-enrichment/modules/esco-api/manifest.ts`
- Delete: `src/lib/connector/data-enrichment/modules/esco-api/index.ts`
- Delete: `src/lib/connector/data-enrichment/modules/eurostat-nuts/manifest.ts`
- Delete: `src/lib/connector/data-enrichment/modules/eurostat-nuts/index.ts`

- [ ] **Step 1: Create ESCO Classification manifest**

Create `src/lib/connector/reference-data/modules/esco-classification/manifest.ts`:

```typescript
/**
 * ESCO Classification Module — Manifest
 *
 * Reference data module for the EU ESCO occupation/skill taxonomy.
 * Health-only — no lookup interface yet.
 *
 * Consumer: EURES module (EuresOccupationCombobox, via /api/esco/ proxy routes)
 * Note: ISCO groups are embedded in ESCO responses (broaderIscoGroup), not a separate API.
 * Note: The ESCO portal's classification/occupation?uri= endpoint returns HTTP 500
 *       as of 2026-04 (EU-side bug). The search endpoint used here still works.
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";

export const escoClassificationManifest: ReferenceDataManifest = {
  id: "esco_classification",
  name: "ESCO Classification API",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "esco_occupations",
  credential: {
    type: CredentialType.NONE,
    moduleId: "esco_classification",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint:
      "https://ec.europa.eu/esco/api/search?text=test&language=en&type=occupation&limit=1",
    timeoutMs: 10000,
    intervalMs: 300000,
  },
};
```

- [ ] **Step 2: Create ESCO Classification no-op connector**

Create `src/lib/connector/reference-data/modules/esco-classification/index.ts`:

```typescript
/**
 * ESCO Classification Module — Health-only (no connector interface yet)
 */

import type { ReferenceDataConnector } from "../../types";

export function createEscoClassificationModule(): ReferenceDataConnector {
  return { id: "esco_classification" };
}
```

- [ ] **Step 3: Create Eurostat NUTS manifest**

Create `src/lib/connector/reference-data/modules/eurostat-nuts/manifest.ts`:

```typescript
/**
 * Eurostat NUTS Module — Manifest
 *
 * Reference data module for the EU NUTS regional classification.
 * Health-only — no lookup interface yet.
 *
 * Consumer: EURES module (EuresLocationCombobox, via /api/eures/locations proxy route)
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";

export const eurostatNutsManifest: ReferenceDataManifest = {
  id: "eurostat_nuts",
  name: "Eurostat NUTS Regions",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "nuts_regions",
  credential: {
    type: CredentialType.NONE,
    moduleId: "eurostat_nuts",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint:
      "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=JSON&lang=en",
    timeoutMs: 10000,
    intervalMs: 300000,
  },
};
```

- [ ] **Step 4: Create Eurostat NUTS no-op connector**

Create `src/lib/connector/reference-data/modules/eurostat-nuts/index.ts`:

```typescript
/**
 * Eurostat NUTS Module — Health-only (no connector interface yet)
 */

import type { ReferenceDataConnector } from "../../types";

export function createEurostatNutsModule(): ReferenceDataConnector {
  return { id: "eurostat_nuts" };
}
```

- [ ] **Step 5: Update reference-data connectors.ts barrel**

Replace the content of `src/lib/connector/reference-data/connectors.ts`:

```typescript
/**
 * Reference Data — Module Registration Barrel
 *
 * Imports and registers all reference data modules with the unified ModuleRegistry.
 * This file is imported once at startup.
 */

import { moduleRegistry } from "../registry";

import { escoClassificationManifest } from "./modules/esco-classification/manifest";
import { createEscoClassificationModule } from "./modules/esco-classification";
import { eurostatNutsManifest } from "./modules/eurostat-nuts/manifest";
import { createEurostatNutsModule } from "./modules/eurostat-nuts";

moduleRegistry.register(escoClassificationManifest, createEscoClassificationModule);
moduleRegistry.register(eurostatNutsManifest, createEurostatNutsModule);
```

- [ ] **Step 6: Remove old modules from data-enrichment connectors.ts**

In `src/lib/connector/data-enrichment/connectors.ts`, remove the esco-api and eurostat-nuts imports and registrations. The file should only have clearbit, google-favicon, and meta-parser.

- [ ] **Step 7: Delete old module files**

```bash
rm -rf src/lib/connector/data-enrichment/modules/esco-api/
rm -rf src/lib/connector/data-enrichment/modules/eurostat-nuts/
```

- [ ] **Step 8: Update module.actions.ts imports**

In `src/actions/module.actions.ts`, change:

```typescript
import "@/lib/connector/data-enrichment/connectors";
```

to:

```typescript
import "@/lib/connector/data-enrichment/connectors";
import "@/lib/connector/reference-data/connectors";
```

And in `getModuleManifests()`, add `REFERENCE_DATA` to the default query (should already be there from earlier work, verify it includes all 4 types):

```typescript
const modules = connectorType
  ? moduleRegistry.getByType(connectorType)
  : [
      ...moduleRegistry.getByType(ConnectorType.JOB_DISCOVERY),
      ...moduleRegistry.getByType(ConnectorType.AI_PROVIDER),
      ...moduleRegistry.getByType(ConnectorType.DATA_ENRICHMENT),
      ...moduleRegistry.getByType(ConnectorType.REFERENCE_DATA),
    ];
```

- [ ] **Step 9: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(connector): move ESCO and Eurostat modules from data-enrichment to reference-data connector"
```

---

## Task 4: Add dependencies to EURES manifest

**Files:**
- Modify: `src/lib/connector/job-discovery/modules/eures/manifest.ts`

- [ ] **Step 1: Add dependencies to euresManifest**

In `src/lib/connector/job-discovery/modules/eures/manifest.ts`, add the import and field:

```typescript
import { ConnectorType, CredentialType, type JobDiscoveryManifest, type DependencyHealthCheck } from "@/lib/connector/manifest";
```

Then add the `dependencies` array to the manifest object, after `cachePolicy`:

```typescript
  dependencies: [
    {
      id: "esco_classification",
      name: "ESCO Classification",
      endpoint: "https://ec.europa.eu/esco/api/search?text=test&language=en&type=occupation&limit=1",
      timeoutMs: 10000,
      required: false,
      usedFor: "Occupation search in Automation Wizard (EuresOccupationCombobox)",
    },
    {
      id: "eurostat_nuts",
      name: "Eurostat NUTS Regions",
      endpoint: "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=JSON&lang=en",
      timeoutMs: 10000,
      required: false,
      usedFor: "Region name i18n in location hierarchy (EuresLocationCombobox)",
    },
    {
      id: "eures_country_stats",
      name: "EURES Country Stats",
      endpoint: "https://europa.eu/eures/api/jv-searchengine/public/statistics/getCountryStats",
      timeoutMs: 10000,
      required: false,
      usedFor: "Country/region job counts in location hierarchy",
    },
  ],
```

- [ ] **Step 2: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/connector/job-discovery/modules/eures/manifest.ts
git commit -m "feat(eures): declare ESCO, Eurostat, and EURES Stats as manifest dependencies"
```

---

## Task 5: Extend health monitor for dependency checking

**Files:**
- Modify: `src/lib/connector/health-monitor.ts`
- Test: `__tests__/connector/dependency-health.spec.ts`

- [ ] **Step 1: Write failing tests for dependency health degradation**

Create `__tests__/connector/dependency-health.spec.ts`:

```typescript
/**
 * Dependency Health Degradation — Unit Tests
 *
 * Spec: module-lifecycle.allium, rule DependencyHealthDegradation
 * "A failed dependency can degrade the parent but NEVER make it unreachable"
 */

import { checkDependencyHealth } from "@/lib/connector/health-monitor";
import { HealthStatus, type DependencyHealthCheck } from "@/lib/connector/manifest";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const deps: DependencyHealthCheck[] = [
  {
    id: "esco_classification",
    name: "ESCO",
    endpoint: "https://ec.europa.eu/esco/api/search?text=test&language=en&type=occupation&limit=1",
    timeoutMs: 5000,
    required: false,
    usedFor: "test",
  },
  {
    id: "eurostat_nuts",
    name: "Eurostat",
    endpoint: "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=JSON&lang=en",
    timeoutMs: 5000,
    required: false,
    usedFor: "test",
  },
];

describe("checkDependencyHealth", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns healthy when all dependencies respond OK", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await checkDependencyHealth(deps);

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.success)).toBe(true);
  });

  it("returns degraded when one dependency fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" });

    const result = await checkDependencyHealth(deps);

    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
  });

  it("returns degraded when all dependencies fail", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Error" });

    const result = await checkDependencyHealth(deps);

    // Still DEGRADED, never UNREACHABLE — spec rule
    expect(result.status).toBe(HealthStatus.DEGRADED);
  });

  it("returns healthy when dependencies array is empty", async () => {
    const result = await checkDependencyHealth([]);

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.results).toHaveLength(0);
  });

  it("handles fetch timeout as failure", async () => {
    mockFetch.mockRejectedValue(new Error("AbortError"));

    const result = await checkDependencyHealth(deps);

    expect(result.status).toBe(HealthStatus.DEGRADED);
  });

  it("returns per-dependency results with id and error", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await checkDependencyHealth(deps);

    expect(result.results[0]).toMatchObject({ id: "esco_classification", success: true });
    expect(result.results[1]).toMatchObject({ id: "eurostat_nuts", success: false, error: "Network error" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/test.sh --no-coverage -- --testPathPattern "dependency-health"`
Expected: FAIL — `checkDependencyHealth` is not exported

- [ ] **Step 3: Implement checkDependencyHealth in health-monitor.ts**

In `src/lib/connector/health-monitor.ts`, add after the existing imports:

```typescript
import type { DependencyHealthCheck } from "./manifest";
```

Add this export before the `probeEndpoint` function:

```typescript
export interface DependencyCheckResult {
  id: string;
  name: string;
  success: boolean;
  error?: string;
}

export interface DependencyHealthResult {
  /** Aggregate: healthy if all pass, degraded if any fail. Never unreachable. */
  status: HealthStatus;
  results: DependencyCheckResult[];
}

/**
 * Check health of a module's declared dependencies.
 * Returns DEGRADED if any fail, HEALTHY if all pass. Never UNREACHABLE.
 * See: specs/module-lifecycle.allium, rule DependencyHealthDegradation
 */
export async function checkDependencyHealth(
  dependencies: DependencyHealthCheck[],
): Promise<DependencyHealthResult> {
  if (dependencies.length === 0) {
    return { status: HealthStatus.HEALTHY, results: [] };
  }

  const results: DependencyCheckResult[] = [];

  for (const dep of dependencies) {
    try {
      const response = await fetch(dep.endpoint, {
        method: "GET",
        signal: AbortSignal.timeout(dep.timeoutMs),
      });

      results.push({
        id: dep.id,
        name: dep.name,
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
      });
    } catch (error) {
      results.push({
        id: dep.id,
        name: dep.name,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const anyFailed = results.some((r) => !r.success);
  return {
    status: anyFailed ? HealthStatus.DEGRADED : HealthStatus.HEALTHY,
    results,
  };
}
```

- [ ] **Step 4: Integrate dependency checking into checkModuleHealth**

In the existing `checkModuleHealth()` function, after the primary health status is determined and registry is updated (around line 98), add dependency checking:

```typescript
  // Check dependencies (spec: DependencyHealthDegradation rule)
  const dependencies = registered.manifest.dependencies;
  let depResult: DependencyHealthResult | undefined;
  if (dependencies && dependencies.length > 0) {
    depResult = await checkDependencyHealth(dependencies);
    // Dependencies can only RAISE to degraded, never to unreachable
    if (depResult.status === HealthStatus.DEGRADED && newHealthStatus === HealthStatus.HEALTHY) {
      newHealthStatus = HealthStatus.DEGRADED;
      // Re-update registry with degraded status
      moduleRegistry.updateHealth(moduleId, newHealthStatus, new Date(), undefined, consecutiveFailures);
    }
  }
```

Update the return type to include dependency results:

```typescript
  return {
    moduleId,
    success: probeResult.success,
    healthStatus: newHealthStatus,
    responseTimeMs,
    error: probeResult.error,
    dependencyResults: depResult?.results,
  };
```

And update the `HealthCheckResult` interface at the top of the file:

```typescript
interface HealthCheckResult {
  moduleId: string;
  success: boolean;
  healthStatus: HealthStatus;
  responseTimeMs: number;
  error?: string;
  dependencyResults?: DependencyCheckResult[];
}
```

- [ ] **Step 5: Run tests**

Run: `bash scripts/test.sh --no-coverage -- --testPathPattern "dependency-health"`
Expected: PASS (6 tests)

- [ ] **Step 6: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/connector/health-monitor.ts __tests__/connector/dependency-health.spec.ts
git commit -m "feat(health): implement dependency health checking with degradation rule"
```

---

## Task 6: Extend ModuleManifestSummary and server action for dependencies

**Files:**
- Modify: `src/actions/module.actions.ts`

- [ ] **Step 1: Add dependencies to ModuleManifestSummary**

In `src/actions/module.actions.ts`, extend the `ModuleManifestSummary` interface:

```typescript
export interface DependencyHealthSummary {
  id: string;
  name: string;
  healthStatus: string;
  required: boolean;
  usedFor: string;
  error?: string;
}

/** Serializable manifest summary for client components */
export interface ModuleManifestSummary {
  // ... existing fields ...
  dependencies?: DependencyHealthSummary[];
}
```

- [ ] **Step 2: Populate dependencies in getModuleManifests**

In the `summaries` mapping inside `getModuleManifests()`, add after `searchFieldOverrides`:

```typescript
      dependencies: m.manifest.dependencies?.map((dep) => ({
        id: dep.id,
        name: dep.name,
        healthStatus: "unknown",
        required: dep.required,
        usedFor: dep.usedFor,
      })),
```

Note: Health status for dependencies starts as "unknown" — it gets populated when `checkModuleHealth()` runs (which fires for unknown-status modules on first load).

- [ ] **Step 3: Update runHealthCheck to return dependency results**

In the `runHealthCheck()` function, extend the return data to include dependency results:

```typescript
    return {
      success: true,
      data: {
        moduleId: result.moduleId,
        healthStatus: result.healthStatus,
        success: result.success,
        responseTimeMs: result.responseTimeMs,
        error: result.error,
        dependencyResults: result.dependencyResults?.map((dr) => ({
          id: dr.id,
          name: dr.name,
          healthStatus: dr.success ? "healthy" : "unreachable",
          error: dr.error,
        })),
      },
    };
```

- [ ] **Step 4: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/actions/module.actions.ts
git commit -m "feat(actions): expose module dependencies and health results in ModuleManifestSummary"
```

---

## Task 7: Add i18n keys for reference_data connector group

**Files:**
- Modify: `src/i18n/dictionaries/enrichment.ts` (4 locales)

- [ ] **Step 1: Add connectorGroup.reference_data key**

In `src/i18n/dictionaries/enrichment.ts`, add to each locale block alongside the existing `connectorGroup.*` keys:

EN: `"enrichment.connectorGroup.reference_data": "Reference Data",`
DE: `"enrichment.connectorGroup.reference_data": "Referenzdaten",`
FR: `"enrichment.connectorGroup.reference_data": "Donnees de reference",`
ES: `"enrichment.connectorGroup.reference_data": "Datos de referencia",`

- [ ] **Step 2: Commit**

```bash
git add src/i18n/dictionaries/enrichment.ts
git commit -m "i18n: add reference_data connector group labels (4 locales)"
```

---

## Task 8: Update ApiStatusOverview for dependency tree rendering

**Files:**
- Modify: `src/components/settings/ApiStatusOverview.tsx`

- [ ] **Step 1: Add reference_data to CONNECTOR_GROUPS**

```typescript
const CONNECTOR_GROUPS = ["job_discovery", "ai_provider", "data_enrichment", "reference_data"] as const;
```

- [ ] **Step 2: Add GROUP_LABEL_KEYS entry**

```typescript
const GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  job_discovery: "enrichment.connectorGroup.job_discovery",
  ai_provider: "enrichment.connectorGroup.ai_provider",
  data_enrichment: "enrichment.connectorGroup.data_enrichment",
  reference_data: "enrichment.connectorGroup.reference_data",
};
```

- [ ] **Step 3: Add DependencySubRow component**

After the `ModuleStatusRow` component, add:

```typescript
/** Dependency sub-row shown indented under the parent module */
function DependencySubRow({
  dep,
  t,
}: {
  dep: DependencyHealthSummary;
  t: (key: TranslationKey) => string;
}) {
  const healthLabel = t(HEALTH_STATUS_KEYS[dep.healthStatus] ?? "enrichment.health.unknown");

  return (
    <div className="flex items-center gap-3 py-1.5 pl-6">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-muted-foreground text-xs">└</span>
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${healthDotClass(dep.healthStatus)}`}
          role="img"
          aria-label={healthLabel}
        />
        <span className="text-xs truncate">{dep.name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{healthLabel}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Import DependencyHealthSummary type**

Add to the imports from module.actions:

```typescript
import type { ModuleManifestSummary, DependencyHealthSummary } from "@/actions/module.actions";
```

- [ ] **Step 5: Render dependency sub-rows after each module row**

In the module list rendering, after `<ModuleStatusRow>`, add:

```tsx
{module.dependencies && module.dependencies.length > 0 && (
  <>
    {module.dependencies.map((dep) => (
      <DependencySubRow key={dep.id} dep={dep} t={t} />
    ))}
  </>
)}
```

- [ ] **Step 6: Update handleHealthCheck to merge dependency results**

In the `handleHealthCheck` function, where module state is updated on success, also update dependency health statuses:

```typescript
if (result.success && result.data) {
  setModules((prev) =>
    prev.map((m) =>
      m.moduleId === moduleId
        ? {
            ...m,
            healthStatus: result.data!.healthStatus,
            lastHealthCheck: new Date().toISOString(),
            dependencies: m.dependencies?.map((dep) => {
              const depResult = result.data!.dependencyResults?.find((dr) => dr.id === dep.id);
              return depResult ? { ...dep, healthStatus: depResult.healthStatus } : dep;
            }),
          }
        : m,
    ),
  );
}
```

- [ ] **Step 7: Type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/components/settings/ApiStatusOverview.tsx
git commit -m "feat(ui): render dependency health tree in API Status Overview"
```

---

## Task 9: Update existing tests

**Files:**
- Modify: `__tests__/esco-api-manifest.spec.ts` → rename + update imports
- Modify: `__tests__/eurostat-nuts-manifest.spec.ts` → update imports
- Modify: `__tests__/data-enrichment-registration.spec.ts` → remove esco/eurostat assertions
- Create: `__tests__/connector/reference-data-registration.spec.ts`
- Modify: `__tests__/ApiStatusOverview.spec.tsx` → add dependency tests

- [ ] **Step 1: Update ESCO manifest test imports**

Rename `__tests__/esco-api-manifest.spec.ts` to `__tests__/esco-classification-manifest.spec.ts` and update:

```typescript
import { escoClassificationManifest } from "@/lib/connector/reference-data/modules/esco-classification/manifest";
import { ConnectorType, CredentialType } from "@/lib/connector/manifest";

describe("escoClassificationManifest", () => {
  it("has id esco_classification", () => {
    expect(escoClassificationManifest.id).toBe("esco_classification");
  });

  it("has connectorType REFERENCE_DATA", () => {
    expect(escoClassificationManifest.connectorType).toBe(ConnectorType.REFERENCE_DATA);
  });

  // ... keep remaining tests, update variable name from escoApiManifest to escoClassificationManifest
});
```

- [ ] **Step 2: Update Eurostat manifest test imports**

In `__tests__/eurostat-nuts-manifest.spec.ts`, update the import path:

```typescript
import { eurostatNutsManifest } from "@/lib/connector/reference-data/modules/eurostat-nuts/manifest";
```

ConnectorType assertion should check `REFERENCE_DATA` instead of `DATA_ENRICHMENT`.

- [ ] **Step 3: Update data-enrichment registration test**

In `__tests__/data-enrichment-registration.spec.ts`, remove the assertions for `esco_api` and `eurostat_nuts`. Keep the clearbit, google_favicon, meta_parser assertions.

- [ ] **Step 4: Create reference-data registration test**

Create `__tests__/connector/reference-data-registration.spec.ts`:

```typescript
import { moduleRegistry } from "@/lib/connector/registry";
import "@/lib/connector/reference-data/connectors";
import { ConnectorType } from "@/lib/connector/manifest";

describe("reference-data module registration", () => {
  it("registers esco_classification", () => {
    expect(moduleRegistry.has("esco_classification")).toBe(true);
  });

  it("registers eurostat_nuts", () => {
    expect(moduleRegistry.has("eurostat_nuts")).toBe(true);
  });

  it("esco_classification has connectorType REFERENCE_DATA", () => {
    const mod = moduleRegistry.get("esco_classification");
    expect(mod?.manifest.connectorType).toBe(ConnectorType.REFERENCE_DATA);
  });

  it("eurostat_nuts has connectorType REFERENCE_DATA", () => {
    const mod = moduleRegistry.get("eurostat_nuts");
    expect(mod?.manifest.connectorType).toBe(ConnectorType.REFERENCE_DATA);
  });
});
```

- [ ] **Step 5: Add dependency rendering test to ApiStatusOverview**

In `__tests__/ApiStatusOverview.spec.tsx`, add a fixture and test:

```typescript
const moduleWithDeps = {
  moduleId: "eures",
  name: "EURES",
  manifestVersion: 1,
  connectorType: "job_discovery",
  status: "active",
  healthStatus: "degraded",
  lastHealthCheck: undefined,
  credential: { type: "none", moduleId: "eures", required: false, sensitive: false },
  dependencies: [
    { id: "esco_classification", name: "ESCO Classification", healthStatus: "healthy", required: false, usedFor: "Occupation search" },
    { id: "eurostat_nuts", name: "Eurostat NUTS", healthStatus: "unreachable", required: false, usedFor: "Location names" },
  ],
};

it("renders dependency sub-rows under parent module", async () => {
  mockGetModuleManifests.mockResolvedValue({
    success: true,
    data: [moduleWithDeps],
  });

  render(<ApiStatusOverview />);

  await waitFor(() => {
    expect(screen.getByText("EURES")).toBeInTheDocument();
  });

  expect(screen.getByText("ESCO Classification")).toBeInTheDocument();
  expect(screen.getByText("Eurostat NUTS")).toBeInTheDocument();
});
```

- [ ] **Step 6: Delete old test file**

```bash
rm __tests__/esco-api-manifest.spec.ts
rm __tests__/health-only-modules.spec.ts
```

- [ ] **Step 7: Run all affected tests**

Run: `bash scripts/test.sh --no-coverage -- --testPathPattern "esco-classification|eurostat-nuts|data-enrichment-registration|reference-data|dependency-health|ApiStatus"`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: update tests for reference-data connector and dependency health"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full type-check**

Run: `source scripts/env.sh && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 2: Run full test suite**

Run: `bash scripts/test.sh --no-coverage`
Expected: No new failures (pre-existing failures in notification-dispatcher, ProfileContainer, CreateResume, AddJob are known)

- [ ] **Step 3: Verify no stale imports**

Run: `grep -r "esco-api\|esco_api" src/ --include="*.ts" --include="*.tsx"` — should return 0 results (all references now use `esco_classification` or `esco-classification`)

Run: `grep -r "data-enrichment/modules/esco\|data-enrichment/modules/eurostat" src/ --include="*.ts"` — should return 0 results

- [ ] **Step 4: Commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: final cleanup after reference-data connector migration"
```
