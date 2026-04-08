# ADR-028: Self-Contained Modules (Manifest v2)

**Date:** 2026-04-08
**Status:** Accepted
**Deciders:** @rorar, Claude Sonnet 4.6

## Context

Replacing Clearbit with Logo.dev (2026-04-08) required changes to 15+ files across the project. The root cause was that module-specific concerns were distributed across global infrastructure rather than co-located with the module:

1. **Global i18n dictionaries:** Module names, descriptions, and credential hints lived in `src/i18n/dictionaries/enrichment.ts`. Adding a module meant editing all 4 locale files; removing one meant finding and deleting keys scattered across 4 files.

2. **Hardcoded UI maps:** Three UI components maintained explicit `NAME_KEYS` and `DESCRIPTION_KEYS` maps. Every new module required updating these maps in each component.

3. **Distributed barrel registration:** Registration was split across 4 per-connector barrel files (`connectors.ts`). Each barrel manually imported and registered the modules belonging to its connector type.

As a result, adding or removing a single module required:
- Editing barrel files (1 per connector type affected)
- Adding global i18n keys in all 4 locale files
- Updating hardcoded maps in 3 UI components

This violated the Open/Closed Principle: the system was open for extension only in theory — in practice every addition rippled through shared infrastructure. The burden would worsen linearly with each new module.

## Decision

Introduce "Manifest v2": a self-contained module pattern where each module is the single source of truth for its own identity, translations, and registration.

### 1. Co-located i18n

Each module exports an `i18n.ts` file containing per-locale translations as a `ModuleI18n` value (`Record<string, { name, description, credentialHint? }>`). The `ModuleManifest` gains an optional `i18n` field. UI reads `manifest.i18n[locale]` with a three-step fallback chain: `locale → "en" → manifest.name`.

Module-specific keys are removed from global i18n dictionaries entirely. Module names, descriptions, and credential hints live only inside the module's own directory.

### 2. Self-registration

Each module calls `moduleRegistry.register(manifest, factory)` at the bottom of its `index.ts`. Importing the module file is sufficient to register it — no separate registration step, no external list to maintain.

### 3. Central import point

`src/lib/connector/register-all.ts` imports every module file, triggering self-registration. Every server-side entry point (server actions, runner, providers, health scheduler) imports `register-all` — one import that brings the entire module set into the registry.

### 4. No global module strings

All module-specific i18n keys are removed from the global dictionaries under `src/i18n/dictionaries/`. The global dictionaries remain for application-level strings (UI chrome, settings page labels, status messages). Module identity strings live only in the module directory.

## Consequences

### Positive

- **Adding a module:** Create the module directory (`i18n.ts`, `manifest.ts`, `index.ts`) and add one import line to `register-all.ts`. No other files change.
- **Removing a module:** Delete the module directory and remove one import line from `register-all.ts`. No other files change.
- **No UI maintenance for new modules:** Module settings, wizard, and display components are manifest-driven — they render whatever the registry provides. New modules appear automatically.
- **Partial-translation safety:** The `locale → "en" → manifest.name` fallback chain ensures community modules or modules with incomplete translations degrade gracefully rather than displaying missing-key strings.
- **Duplicate detection:** `moduleRegistry.register()` emits a dev-mode warning on duplicate module IDs, catching copy-paste errors early.

### Negative

- **Implicit registration dependency:** Every server-side entry point MUST import `register-all` or it will operate against an empty registry. There is no compile-time enforcement of this requirement.
- **Silent failure mode:** If an entry point omits the `register-all` import, the registry is empty and the application silently degrades rather than failing loudly. No runtime error surfaces at startup.

### Risks

- **Missing import in new entry points:** Future developers adding a new server-side entry point may not know to import `register-all`. Mitigation: explicit imports in all 5 known entry points at time of writing, plus test coverage that asserts a non-empty registry.

## Alternatives Considered

**Dynamic directory scanning:** Auto-discover modules by calling `fs.readdirSync` on the modules directory at startup. Rejected: incompatible with bundlers (Next.js/webpack tree-shaking discards unimported modules), and requires runtime filesystem access that is unavailable in edge runtimes and serverless deployments.

**Plugin registry file:** Maintain a JSON or YAML manifest listing all module paths. Rejected: introduces a configuration file that is not type-checked, can drift from the actual code, and must be updated on every add/remove — the same problem as barrel files, with weaker tooling support.

**Keep barrel files:** Maintain the status quo with one `connectors.ts` barrel per connector type. Rejected: 4 files to maintain, registration logic duplicated across them, easy to forget one when adding a module that spans connector types.

## Related

- ROADMAP 8.7 Phase 0
- `specs/module-lifecycle.allium` — `ModuleI18n` value type, `ModuleManifest.i18n` field definition
- ADR-010 — Connector architecture unification (established the unified `ModuleRegistry` this pattern builds on)
- ADR-013 — Module lifecycle manager (established `register`/`deactivate`/`activate` semantics)
