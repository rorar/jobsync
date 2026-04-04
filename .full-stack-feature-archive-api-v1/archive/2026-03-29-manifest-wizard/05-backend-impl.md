# Backend Implementation: Manifest-Driven AutomationWizard

## Type System (manifest.ts)
- `ConnectorParamField` with 5 types (string, number, boolean, select, multiselect)
- `ConnectorParamsSchema` as typed array
- `SearchFieldOverride` for widget overrides
- `manifestVersion: number` on ModuleManifest
- `automationType?: "discovery" | "maintenance"` on JobDiscoveryManifest

## Module Manifests Updated (all 6)
- Arbeitsagentur: Array format + i18n keys (4 fields)
- EURES: searchFieldOverrides + 9 new connectorParams from API
- JSearch: manifestVersion only
- Ollama/OpenAI/DeepSeek: manifestVersion only

## EURES Connector (eures/index.ts)
- All 9 configurable API fields read from connectorParams with sensible defaults
- Replaces hardcoded `publicationPeriod: "LAST_WEEK"`

## Params Validator (params-validator.ts)
- Array iteration, multiselect validation, number min/max validation

## ModuleManifestSummary DTO (module.actions.ts)
- Extended with connectorParamsSchema, searchFieldOverrides, manifestVersion, automationType

## Dynamic JobBoard (automation.schema.ts)
- `z.string().min(1)` replaces hardcoded enum

## i18n (~280 keys across 4 locales)
- Arbeitsagentur: 4 param labels + 7 option labels
- EURES: 9 param labels + ~40 option labels

## Verification
- 72 suites, 1511 tests passed
- Build: zero type errors
