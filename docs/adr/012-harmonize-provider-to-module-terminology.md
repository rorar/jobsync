# ADR-012: Harmonize "Provider" to "Module" Terminology in AI Connector Domain

## Status

Accepted

## Context

The project follows the **App ↔ Connector ↔ Module** DDD idiom (see ADR-004, ADR-010). The Job Discovery domain consistently uses this terminology: `DataSourceConnector`, `ConnectorRegistry`, `createEuresConnector()`, etc.

However, the **AI Provider** domain had accumulated **semantic diffusion** — "Provider" language had replaced the canonical "Module" language throughout:

- `enum AiProvider` instead of `AiModuleId`
- `createOllamaProvider()` instead of `createOllamaConnector()`
- `ProviderType` instead of `AiModuleId`
- i18n strings: "AI Service Provider", "KI-Dienstanbieter"
- Error messages: "Unknown provider", "Cannot connect to ... service"
- Prisma/DB: `ApiKeyProvider` type
- Allium spec: `external entity LLMProvider`

This violated the Ubiquitous Language table in CLAUDE.md which explicitly states:
- **Module** = External system behind a Connector (NOT "API", "service", "provider")
- **Connector** = ACL that translates external APIs to domain types (NOT "scraper", "fetcher")

## Decision

Perform a **full harmonization** of the AI domain to match the canonical idiom:

### Naming Convention

| Concept | Name | Rationale |
|---|---|---|
| Enum identifying a Module | `AiModuleId` | Ollama/OpenAI/DeepSeek are Modules (external systems) |
| Connector interface | `AIProviderConnector` | Kept — it IS the Connector interface for AI providers |
| Factory functions | `createXConnector()` | Matches Job Discovery: `createEuresConnector()` |
| Registry method | `availableModules()` | Lists available Modules, not Connectors |
| API Key identifier | `ApiKeyModuleId` | Key belongs to a Module |
| Settings field | `AiSettings.moduleId` | Identifies which Module is active |

### Prisma Strategy

Used `@map("provider")` to rename the Prisma field to `moduleId` in code while keeping the DB column name `provider`. This avoids a risky ALTER TABLE migration while achieving the Ubiquitous Language goal in code.

### JSON Data Migration

Created `scripts/migrate-ai-settings-provider-to-moduleId.ts` to rename `settings.ai.provider` → `settings.ai.moduleId` in UserSettings JSON. UI components include backwards-compat fallback: `aiSettings.moduleId || aiSettings.provider || defaultModel.moduleId`.

## Consequences

### Positive

- AI domain now uses the same language as Job Discovery domain
- New contributors see ONE consistent pattern, not two
- Allium spec (`jobsync.allium`) is consistent with code
- i18n strings match domain language in all 4 locales

### Negative

- DB column is still physically named `provider` (mapped via `@map`)
- Backwards-compat fallback in UI for pre-migration JSON data
- All test files needed updating

### Files Changed

- **Allium spec:** `jobsync.allium` — `LLMProvider` → `LLMModule`
- **Prisma:** `prisma/schema.prisma` — `moduleId @map("provider")`
- **Models:** `ai.model.ts`, `userSettings.model.ts`, `apiKey.model.ts`, `apiKey.schema.ts`
- **Connector layer:** `registry.ts`, `providers.ts`, `index.ts`, `modules/*/index.ts`, `modules/connectors.ts`
- **Runner/Utils:** `runner.ts`, `ai.utils.ts`
- **Actions:** `apiKey.actions.ts`
- **API routes:** `verify/route.ts`, `resume/review/route.ts`, `resume/match/route.ts`, `ollama/*/route.ts`
- **UI:** `AiSettings.tsx`, `ApiKeySettings.tsx`, `SettingsSidebar.tsx`, `settings/page.tsx`, profile components
- **i18n:** `settings.ts` (all 4 locales)
- **Tests:** `ai-provider-modules.spec.ts`, `apiKey.schema.spec.ts`
- **Infra:** `api-key-resolver.ts`

## References

- ADR-004: App ↔ Connector ↔ Module (ACL) Architecture
- ADR-010: Connector Architecture Unification (Roadmap 0.1)
