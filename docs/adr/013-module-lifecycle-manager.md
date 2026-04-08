# ADR-013: Module Lifecycle Manager

**Date:** 2026-03-29
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The connector/module architecture (ADR-010) established the App ↔ Connector ↔ Module pattern. However, modules were registered as pure factories without metadata — the registries stored only `Map<string, () => Connector>`. This caused several problems:

1. **Hardcoded module lists** in 3 places: `ApiKeySettings.tsx`, `ENV_VAR_MAP`, `ApiKeyModuleId` type
2. **No lifecycle management** — all modules always active, no deactivation
3. **Duplicated resilience code** — EURES and Arbeitsagentur had near-identical `resilience.ts` files
4. **PULL credential pattern** — modules resolved their own credentials ad-hoc
5. **No health monitoring** or degradation handling

## Decision

Implement a Module Lifecycle Manager based on the Allium specification (`specs/module-lifecycle.allium`).

### Architecture

**Unified ModuleRegistry** (`src/lib/connector/registry.ts`): Single registry for all modules, storing `RegisteredModule` entities (manifest + runtime state). Existing registries become facades.

**ModuleManifest** contract: Each module declares its identity, credentials, health check config, resilience config, and settings schema. Derived from the Allium `contract ModuleManifest`.

**Credential PUSH**: Runner resolves credentials from manifest before module instantiation (DB → Env → Default). Replaces ad-hoc `resolveApiKey()` calls inside modules.

**Resilience Shared Kernel**: `buildResiliencePolicy()` creates Cockatiel policies from manifest config. Eliminates per-module duplication.

**Degradation Rules**: Three escalation rules pause automations on persistent failures:
- Auth failure → immediate pause
- 5 consecutive failed runs → pause
- 3 circuit breaker opens → pause

### Key Design Decisions

1. **Facades over replacement**: Old registries become facades, preserving all existing import paths
2. **Split registration barrels**: No single `register-all.ts` — each connector type registers its own modules to maintain `server-only` boundary
3. **Modules register as `active` by default** (not `inactive`), avoiding UX friction on startup
4. **Partial PUSH in Phase 2**: Only credentials are pushed; AI settings still resolved lazily per userId
5. **In-memory manifests, DB-backed state**: Manifests are static code; activation status persisted to `ModuleRegistration` table

## Consequences

### Positive
- Adding a new module requires only `manifest.ts` + `index.ts` + one line in `connectors.ts`
- No hardcoded module arrays in UI components (invariant `SettingsFromManifest`)
- Resilience code deduplicated (82 lines removed)
- Automation pausing prevents runaway failures against broken modules
- Health monitoring provides visibility into module availability

### Negative
- `Function` type on factory in registry (needed for heterogeneous factory signatures)
- LSP shows stale Prisma Client diagnostics after migrations (resolved by build)
- Narrow enum casts (`as TaskStatus`) remain where Prisma stores `String` for SQLite

### Risks
- Health check probes to external APIs from the server (rate limiting, IP blocking)
- `pauseReason` column migration on existing production databases

## Files

### New (13 files)
- `src/lib/connector/manifest.ts` — Type definitions
- `src/lib/connector/registry.ts` — Unified registry
- `src/lib/connector/credential-resolver.ts` — PUSH credential resolution
- `src/lib/connector/health-monitor.ts` — Health probing
- `src/lib/connector/resilience.ts` — Shared resilience kernel
- `src/lib/connector/degradation.ts` — Escalation rules
- `src/actions/module.actions.ts` — Server actions
- 6× `modules/*/manifest.ts` — Per-module manifests

### Modified (15 files)
- Registry facades, barrel files, runner, settings UI, automation wizard, Prisma schema

## Amendments (2026-03-29)

### Phase 4-6 Implementation
- Phase 4: Health monitoring with probe + status transitions
- Phase 5: Resilience shared kernel (buildResiliencePolicy from manifests)
- Phase 6: Degradation rules (auth/CB/runFailure escalation)

### Deferred Polish
- Pattern B getAllX migrated to ActionResult<T[]>
- Periodic health check scheduler (instrumentation.ts)
- ConnectorParams validation against manifest schema
- Persistent notification system (DB-backed)

### Connector Feinschliff
- All 3 Job Discovery connectors now have consistent cockatiel error handling
- JSearch gained resilience wrapper (retry, CB, timeout, rate limit)
- 106 connector-specific tests added
- Pagination safety cap (MAX_PAGES=20)

## Amendment (2026-04-08)

The "Per-Connector Barrel" pattern described in this ADR (one `connectors.ts` per connector type) was superseded by ADR-028 (Self-Contained Modules). Modules now self-register via `moduleRegistry.register()` in their own `index.ts`, and a single `register-all.ts` replaces all 4 barrel files. See ADR-028 for rationale.
