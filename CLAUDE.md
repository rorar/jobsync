# CLAUDE.md — JobSync Project Guidelines

## Project Overview

JobSync is a self-hosted job application tracker built with Next.js 15, Prisma (SQLite), and Shadcn UI. It includes EURES/ESCO integration for European job discovery automations.

## Development Environment

### Option A: devenv (recommended for standard NixOS)

```bash
devenv shell    # Enter dev environment with all dependencies
dev             # Start Next.js dev server
test            # Run Jest tests
build           # Production build
db-migrate      # Run Prisma migrations
devenv up       # Start all processes
```

See `devenv.nix` for the full configuration. Requires a writable Nix store.

### Option B: Helper scripts (for read-only Nix store / VMs)

```bash
./scripts/dev.sh      # Start dev server (port 3737)
./scripts/build.sh    # Production build
./scripts/test.sh     # Run Jest tests (uses system Node.js)
./scripts/stop.sh     # Stop dev server
./scripts/prisma-generate.sh  # Generate Prisma client
./scripts/prisma-migrate.sh   # Run migrations
```

All scripts source `scripts/env.sh` which auto-downloads and patches Prisma engines for NixOS.

**bun** is the package manager (not npm/yarn). Use `bun add`, `bun run`, etc.

## i18n — Internationalization

**CRITICAL: Every UI string must be translated.** When adding or modifying user-visible text, update translations in all 4 locales (EN, DE, FR, ES).

### Import Pattern

```tsx
// Client Components:
import { useTranslations, formatDate, formatNumber } from "@/i18n";
const { t, locale } = useTranslations();

// Server Components / Actions / API Routes:
import { t, getUserLocale, formatDate } from "@/i18n/server";
const locale = await getUserLocale();
```

**Never import from internal modules** (`@/i18n/dictionaries`, `@/i18n/use-translations`, `@/lib/formatters`, `@/lib/locale`). Always use `@/i18n` or `@/i18n/server`.

### Adding Translation Keys

1. Add keys to the appropriate namespace file in `src/i18n/dictionaries/` (dashboard, jobs, activities, tasks, automations, profile, questions, admin, settings)
2. Add translations for ALL 4 locales (en, de, fr, es)
3. Use in components: `t("namespace.keyName")`
4. Validate: `bun run /tmp/test-dictionaries.ts`

Key naming: `namespace.camelCaseKey` (e.g., `jobs.addNote`, `automations.createAutomation`)

### Date/Number Formatting

Always use locale-aware formatters, never hardcoded formats:

```tsx
// CORRECT:
formatDateShort(date, locale)     // "23. März 2026" (de) / "Mar 23, 2026" (en)
formatNumber(1234, locale)        // "1.234" (de) / "1,234" (en)

// WRONG:
format(date, "MMM d, yyyy")      // Always English
value.toLocaleString()            // No explicit locale
```

Use `formatISODate()` for machine-readable dates (CSV, data keys, filenames).

### Architecture

The i18n system uses an **adapter pattern** (`@/i18n/index.ts` + `@/i18n/server.ts`). This allows switching from the current dictionary-based system to LinguiJS macros without changing consumer code. See `src/i18n/README.md` for full documentation.

## Connector Architecture (ACL Pattern)

All external integrations follow the **App ↔ Connector ↔ Module** pattern:

```
App (Core Logic)
  ↕ ConnectorResult<T> / DiscoveredVacancy / ActionResult
Connector (Shared ACL — ONE interface, ONE registry)
  - DataSourceConnector / AIProviderConnector interfaces
  - ModuleRegistry: unified registry with manifests + factories
  - Runner: orchestrates search + matching with credential PUSH
  ↕
Modules (each declares a Manifest + implements a Connector interface)
  - EURES, Arbeitsagentur, JSearch (Job Discovery)
  - Ollama, OpenAI, DeepSeek (AI Provider)
```

**Key principle:** The Connector is the shared domain layer. Modules are pluggable implementations. Each Module declares a `ModuleManifest` describing its identity, credentials, health, resilience, and settings.

**Shared-Client-Pattern:** External platforms that are pure transport/gateways (RapidAPI, Google Maps API, LinkedIn API) are NOT Modules — they are shared client utilities. The services BEHIND them are the Modules. Example: RapidAPI is a `rapidapi-client` (shared API Key + HTTP), JSearch and OpenWeb Ninja are separate Modules behind different Connectors. Same pattern for Google Maps (`google-maps-client` → Places Module in Data Enrichment + Geocoding Module in Geo/Map).

**Manifest-Driven UI Pattern:** The AutomationWizard is a **generic rendering engine** that consumes manifests — no hardcoded module knowledge. Three mechanisms:

1. **`connectorParamsSchema`** (Array on manifest): Each module declares its filter fields. The wizard's `DynamicParamsForm` renders them dynamically. No `if (jobBoard === "x")` checks.
2. **`searchFieldOverrides`** (Array on manifest): Modules declare specialized widgets for shared fields (keywords, location). Example: EURES declares `{ field: "keywords", widgetId: "eures-occupation" }`.
3. **Widget Registry** (`src/components/automations/widget-registry.tsx`): Maps `widgetId → React Component`. The wizard looks up widgets by ID, never by module name.

New modules (StepStone, Indeed, etc.) work without wizard code changes — they just declare their manifest.

### Module Lifecycle Manager (ROADMAP 0.4)

**Unified Registry:** `src/lib/connector/registry.ts` — single `ModuleRegistry` stores `RegisteredModule` entities (manifest + runtime state). The old `ConnectorRegistry` and `AIProviderRegistry` are thin facades.

**Current structure:** `src/lib/connector/`:
- **Shared Kernel:** `manifest.ts` (types), `registry.ts` (unified registry), `resilience.ts` (policy builder), `health-monitor.ts`, `degradation.ts`, `credential-resolver.ts`
- **Job Discovery** (`job-discovery/`): `types.ts`, `registry.ts` (facade), `runner.ts`, `connectors.ts` (registration barrel)
  - Modules: `modules/eures/`, `modules/arbeitsagentur/`, `modules/jsearch/` (each with `index.ts`, `manifest.ts`)
- **AI Provider** (`ai-provider/`): `types.ts`, `registry.ts` (facade), `modules/connectors.ts` (registration barrel)
  - Modules: `modules/ollama/`, `modules/openai/`, `modules/deepseek/` (each with `index.ts`, `manifest.ts`)

**For new Modules:** Create `modules/{name}/` with:
1. `manifest.ts` — declares `JobDiscoveryManifest` or `AiManifest` (credentials, health, resilience)
2. `index.ts` — implements `DataSourceConnector` or `AIProviderConnector`
3. Register in `connectors.ts`: `moduleRegistry.register(manifest, factory)`

That's it — no hardcoded arrays, no ENV_VAR_MAP entries, no duplicate resilience code.

**Credential Resolution (PUSH):** `credential-resolver.ts` resolves credentials from manifest config (DB → Env → Default). Runner calls `resolveCredential()` before module instantiation.

**Activation/Deactivation:** `module.actions.ts` provides `activateModule()` / `deactivateModule()`. Deactivation pauses affected automations with `pauseReason`. Settings UI shows activation toggle per module.

**Degradation Rules:** `degradation.ts` implements 3 escalation rules:
- `handleAuthFailure()` — immediate pause on 401/403
- `checkConsecutiveRunFailures()` — pause after 5 failed runs
- `handleCircuitBreakerTrip()` — pause after 3 CB opens

**Allium Spec:** `specs/module-lifecycle.allium` — authoritative specification for all lifecycle rules.

### Scheduler Coordination (ROADMAP 0.10)

**RunCoordinator** (`src/lib/scheduler/run-coordinator.ts`) — Single entry point for ALL automation runs (scheduler + manual). Uses in-memory mutex per automationId to prevent double-execution.

**Key Rule:** ALL automation runs MUST go through `runCoordinator.requestRun()`. Never call `runAutomation()` directly.

**Current structure:** `src/lib/scheduler/`:
- **types.ts** — RunSource, RunLock, SchedulerSnapshot, RunOptions, RunProgress
- **run-coordinator.ts** — RunCoordinator singleton (mutex, state, events, watchdog, degradation bridge)
- **index.ts** — Scheduler cron loop using RunCoordinator

**SSE Endpoint:** `GET /api/scheduler/status` — Real-time scheduler state, per-user filtered. Client hook: `useSchedulerStatus()` from `src/hooks/use-scheduler-status.ts` (shared singleton EventSource, one connection per tab).

**Singleton Pattern:** RunCoordinator and EventBus use `globalThis` to survive HMR. New singletons MUST follow this pattern.

**Domain Events:**
- `SchedulerCycleStarted/Completed` — Scheduler lifecycle
- `AutomationRunStarted/Completed` — Run lifecycle
- `AutomationDegraded` — Degradation → RunCoordinator bridge

**Progress Reporting:** Runner calls `runCoordinator.reportProgress()` at each phase (search → dedup → enrich → match → save → finalize). UI shows live stepper via RunProgressPanel.

**Allium Spec:** `specs/scheduler-coordination.allium` — authoritative specification for all coordination rules.

### Public API v1 (ROADMAP 7.1 Phase 1)

REST API as "Open Host Service" (DDD) — manually designed surface over existing data layer.

**Route Namespace:** `/api/v1/*` (public, versioned) alongside `/api/*` (internal, frontend-only).

**Auth:** API Keys via `Authorization: Bearer pk_live_...` or `X-API-Key` header. SHA-256 hashed, stored in `PublicApiKey` model (separate from Module `ApiKey` which uses AES).

**Key Infrastructure:** `src/lib/api/`:
- **auth.ts** — `validateApiKey()`, `hashApiKey()`, `generateApiKey()`, `getKeyPrefix()`
- **rate-limit.ts** — In-memory sliding window (60 req/min per key, `globalThis` singleton)
- **response.ts** — `actionToResponse()`, `paginatedResponse()`, `errorResponse()`, `createdResponse()`
- **with-api-auth.ts** — `withApiAuth()` HOF: CORS + auth + rate limit + error catch + security headers
- **schemas.ts** — Zod schemas for all API inputs (max lengths, UUID validation)

**Key Rule:** ALL `/api/v1/*` route handlers MUST use `withApiAuth()` wrapper. Never access Prisma directly without it.

**Phase 1 Endpoints (Jobs only):**
- `GET/POST /api/v1/jobs` — list (paginated) + create
- `GET/PATCH/DELETE /api/v1/jobs/:id` — single job CRUD
- `GET/POST /api/v1/jobs/:id/notes` — notes sub-resource

**Phase 1 uses direct Prisma queries** (not server actions) because `getCurrentUser()` depends on NextAuth session. Phase 2 will add `AsyncLocalStorage` bridge for server action reuse.

**API Key Management:** `src/components/settings/PublicApiKeySettings.tsx` — create/revoke/delete keys in Settings UI. Keys shown once on creation, then only prefix visible. Max 10 active keys per user.

**Server Actions:** `src/actions/publicApiKey.actions.ts` — `createPublicApiKey()`, `listPublicApiKeys()`, `revokePublicApiKey()`, `deletePublicApiKey()`

**i18n:** `src/i18n/dictionaries/api.ts` — own namespace, NOT in settings.ts or automations.ts.

### Company Blacklist (ROADMAP 2.15)

**Server Actions:** `src/actions/companyBlacklist.actions.ts` — CRUD for blacklist entries with name/pattern matching.

**UI:** `src/components/settings/CompanyBlacklistSettings.tsx` — manage blocked companies in Settings.

**Pipeline Integration:** Runner filters staged vacancies against blacklist during the dedup phase.

### Response Caching (ROADMAP 0.9 Stufe 1)

**Cache:** `src/lib/connector/cache.ts` — in-memory LRU cache for external API responses.

**HTTP Headers:** ESCO/EURES proxy routes set `Cache-Control` headers for browser caching.

### Connector & Module Lifecycle Rules

Implemented in `module.actions.ts` and `degradation.ts`. Spec: `specs/module-lifecycle.allium`.

1. **Aktivierung:** Module registers as `active` by default. User can deactivate via Settings toggle.
2. **Deaktivierung:** `deactivateModule()` pauses all active automations using it (`pauseReason: "module_deactivated"`)
3. **Reaktivierung:** Paused automations are NOT auto-restarted — user must manually reactivate
4. **Deaktivierte Module** are hidden from Automation Wizard module selector (`getActiveModules()`)
5. **Automation Degradation:** Auth failure → immediate pause. 5 consecutive failed runs → pause. 3 CB opens → pause.

## EURES/ESCO Integration

- EURES Location Combobox: 3-level hierarchy (Country → NUTS Region → City) with SVG flags
- ESCO Occupation Combobox: Multi-select with detail popovers (ISCO groups, portal links)
- All EU API routes read user locale from `NEXT_LOCALE` cookie
- Eurostat NUTS names are fetched in the user's language
- Flag SVGs are in `public/flags/` (circle-flags library)

## Security Rules

**Allium Spec:** `specs/security-rules.allium` — authoritative specification for all security rules.
**ADRs:** ADR-015 (IDOR), ADR-016 (Credential Defense), ADR-017 (Encryption Salt), ADR-018 (AUTH_SECRET), ADR-019 (Rate Limiting + Server Action Security)

### IDOR Ownership Enforcement (ADR-015)
- **All Prisma reads/writes MUST include userId in the where clause.** Never query by resource ID alone.
- **Direct ownership:** `findFirst({ where: { id, userId: user.id } })` for Job, Company, Tag
- **Chain traversal:** Pre-flight `findFirst` via relation chain for sub-resources: `ContactInfo → resume → profile → userId`, `WorkExperience → ResumeSection → Resume → profile → userId`
- **Never trust client-submitted userId.** Only use `user.id` from `getCurrentUser()` session.
- **`findFirst` replaces `findUnique`** when adding userId filter (Prisma constraint).

### "use server" Export Security (ADR-019)
- **Functions accepting raw userId MUST NOT be in `"use server"` files.** Next.js exposes all exports from "use server" files as callable Server Actions from the browser.
- **Pattern A (preferred):** Move to a file with `import "server-only"` (e.g., `src/lib/blacklist-query.ts`)
- **Pattern B:** Add `const user = await getCurrentUser(); if (!user || user.id !== userId) return defaults;`
- **Runtime validation:** TypeScript union types (`matchType`, `TaskStatus`, `BulkActionType`) are erased at runtime — validate with array/enum check at the server action boundary.

### API Security
- **Pre-auth IP rate limiting:** `withApiAuth()` applies 120 req/min by IP BEFORE API key validation to prevent DoS via invalid key flooding (ADR-019).
- **UUID validation:** All `/api/v1/*` route params validated with `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- **File.filePath never in responses:** Use `File: { select: { id: true, fileName: true, fileType: true } }` — never `File: true`
- **Error sanitization:** 500 errors return generic message, never raw Prisma errors
- **ALL `/api/v1/*` routes** MUST use `withApiAuth()` wrapper

### Credential Protection (ADR-016)
- **Auth forms:** `method="POST"` + `action=""` on all `<form>` elements
- **Client-side:** `useEffect` strips credential params from URL on mount
- **Middleware:** 303 redirect strips credential params from `/signin` and `/signup`
- **AUTH_SECRET:** Container MUST fail startup if not set (ADR-018). Never auto-generate.

### Existing Rules
- **All API proxy routes** (`/api/esco/*`, `/api/eures/*`) MUST check `auth()` — never expose EU APIs without authentication
- **ESCO URI validation**: Always validate that user-supplied URIs start with `http://data.europa.eu/esco/` to prevent SSRF
- **Ollama URL validation**: `validateOllamaUrl()` before every fetch — blocks IMDS, private IPs, non-http protocols
- **Ollama body allowlist**: Only forward `model`, `prompt`, `stream`, `system`, `template`, `context` to Ollama
- **Server-only barrel**: `@/i18n/server.ts` has `import "server-only"` — never import it in client components
- **No credentials in commits**: `.env` is gitignored, never commit API keys
- **Security headers** (middleware): Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS (prod), Permissions-Policy

## Reusable UI Components

- `src/components/ui/chip-list.tsx` — Multi-select badge chips with edit/remove
- `src/components/ui/info-tooltip.tsx` — Info icon with popover (hover + tap)
- `src/components/ui/command.tsx` — Has `touch-action: pan-y` for mobile scroll fix

## Domain-Driven Design (DDD) Principles

This project uses DDD idioms. All agents and contributors MUST follow these principles:

### Ubiquitous Language

Use consistent domain terms across code, UI, specs, and documentation:

| Domain Term | Meaning | NOT |
|---|---|---|
| `DiscoveredVacancy` | A job found by an automation | "scraped job", "result" |
| `Connector` | ACL that translates external APIs to domain types | "scraper", "fetcher" |
| `Module` | External system behind a Connector | "API", "service", "provider" |
| `AiModuleId` | Enum identifying an AI Module (ollama, openai, deepseek) | `AiProvider`, `ProviderType` |
| `Automation` | A scheduled job search configuration | "cron job", "task" |
| `ActionResult<T>` | Typed server action response | `Promise<any>` |

### Bounded Contexts

Each Connector is a Bounded Context with its own internal language:

```
src/lib/connector/job-discovery/
  modules/
    eures/          ← EURES Context (locationCodes, jvProfiles, requestLanguage)
    arbeitsagentur/ ← Arbeitsagentur Context (arbeitsort, beruf, refnr)
    jsearch/        ← JSearch Context (job_city, employer_name)
```

Contexts communicate ONLY through the shared domain type `DiscoveredVacancy`. Never leak context-specific types (e.g., `ArbeitsagenturJob`) into the App layer.

### Anti-Corruption Layer (ACL)

See "Connector Architecture" section above. Every external integration MUST have a Connector that:
1. Translates foreign types → domain types
2. Implements resilience (circuit breaker, retry)
3. Returns `ConnectorResult<T>` — never raw exceptions

### Value Objects

Prefer Value Objects for domain concepts without identity:
- `ActionResult<T>` — operation outcome
- `DiscoveredVacancy` — job data (identity via `externalId`)
- `EuresCountry` — country reference data
- Use `as const` for immutable value collections

### Aggregate Boundaries

When modifying data, respect aggregate boundaries:
- **Job Aggregate:** Job + Notes + Tags + Status (modify together via `job.actions.ts`)
- **Automation Aggregate:** Automation + Runs + Discovered Jobs (via `automation.actions.ts`)
- **Profile Aggregate:** Profile + Resumes + Sections + Contact Info (via `profile.actions.ts`)
- Never modify an aggregate's children from outside its action file

### Repository Pattern

Server actions (`src/actions/*.ts`) serve as Repositories:
- Each aggregate has one action file (its Repository)
- Return `ActionResult<T>` for typed responses (Pattern A)
- Pattern B functions (`getAllX`) may return raw arrays — see `specs/action-result.allium`
- Dashboard functions (Pattern C) use custom return types

### Domain Events (Future)

Currently implicit in `AutomationRun` status transitions. When implementing CRM features (Roadmap Section 5), introduce an explicit Event Bus for:
- `JobDiscovered` → trigger notifications, CRM updates
- `ApplicationStatusChanged` → trigger follow-ups, calendar events
- `ConnectorHealthChanged` → trigger alerts

### Specification Pattern (Allium)

Formal specifications in `specs/*.allium` capture domain behaviour:
- Write specs BEFORE implementing complex features
- Specs are the single source of truth for domain rules
- Use `allium:elicit` to build specs through conversation
- Use `allium:distill` to extract specs from existing code

## Testing Requirements

**CRITICAL: Every feature, bugfix, and refactoring MUST include tests.** No code ships without test coverage.

### Test Pyramid

| Layer | Tool | When | What to test |
|---|---|---|---|
| **Unit Tests** | Jest + Testing Library | Every PR | Server actions, utilities, formatters, hooks, pure functions |
| **Component Tests** | Jest + Testing Library | Every UI change | Component rendering, user interactions, i18n, props |
| **Integration Tests** | Jest | API routes, DB interactions | Auth flows, ActionResult contracts, Prisma queries (mocked) |
| **E2E Tests** | Playwright + Chromium | Major features, critical paths | Login flow, automation wizard, CRUD operations, settings |
| **Dictionary Tests** | bun runtime | Every i18n change | Key consistency across 4 locales, no empty values |

### Rules

- **New feature** → unit tests + component tests + at minimum 1 E2E test for the happy path
- **Bug fix** → regression test that reproduces the bug before fixing
- **Refactoring** → existing tests must pass unchanged (or be updated if return shapes change)
- **New Connector Module** → unit tests for translator, integration test for search/getDetails
- **i18n changes** → dictionary consistency validation
- Run `bash scripts/test.sh --no-coverage` before every commit — all tests must pass
- Run `source scripts/env.sh && bun run build` — zero type errors

### Test Infrastructure

- `scripts/test.sh` — runs Jest with system Node.js (not bun, due to compatibility)
- `__tests__/*.spec.ts` — unit + component tests
- `src/lib/data/testFixtures.ts` — reusable typed fixtures for all Prisma models

### E2E Test Infrastructure (Playwright)

**CRITICAL: Read `e2e/CONVENTIONS.md` before writing any E2E test.** It contains templates, anti-patterns, and environment constraints learned from production incidents.

**Directory structure:**
- `e2e/smoke/` — Auth-free tests (signin, locale-switching). No storageState.
- `e2e/crud/` — CRUD tests (job, task, activity, automation, question, profile). Uses storageState.
- `e2e/helpers/index.ts` — Shared utilities (`login`, `expectToast`, `selectOrCreateComboboxOption`, `uniqueId`)
- `e2e/global-setup.ts` — One-time auth setup, saves session to `e2e/.auth/user.json`

**Pipeline:** `globalSetup` → smoke project → crud project. Smoke tests verify auth works; CRUD tests skip login via storageState.

**Running E2E tests:**
```bash
# Resource-tight (NixOS VM, CI) — single worker:
nice -n 10 npx playwright test --project=chromium --workers=1

# Local development — parallel workers:
npx playwright test --workers=4
```
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium` on NixOS.

**Dev server:** Agents may start the dev server but must **NEVER stop it**. `reuseExistingServer: true` ensures Playwright reuses a running server.

**E2E conventions:**
- CRUD tests must be **self-contained** (create → assert → cleanup in one test body)
- Use `uniqueId()` from `e2e/helpers/` for test data names (prevents parallel collision)
- **No `test.describe.serial`** — all tests must be independently runnable
- One spec file per domain aggregate (DDD: single source of truth)
- System Chromium at `/run/current-system/sw/bin/chromium`

## Code Conventions

- Use `useTranslations()` hook for client components, `t(locale, key)` for server components
- Use formatters from `@/i18n` for all user-visible dates/numbers
- Commit messages follow conventional commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`
- Helper scripts in `./scripts/` can always be run without asking
- Delegate large-scale changes (translation, formatting) to parallel agents
- Use DDD terminology in code, comments, commits, and documentation

## Post-Work Checklist

- **When user reports bugs:** IMMEDIATELY add them to `docs/BUGS.md` with ID, description, file, and severity — before starting any fix. BUGS.md is the single source of truth for all known issues.
- **After bugfixes:** Mark fixed bugs in `docs/BUGS.md`, update counts and status header. Always keep BUGS.md in sync with reality.
- **After architecture changes:** Run the `/architecture-decision-records` skill to document the decision in `docs/adr/`, unless an ADR was already written by a team agent in the same session OR it is outdated.
- **After UI changes:** Must have consulted the ui-design agents before implementation (design-review, create-component, accessibility-audit) and for mobile responsiveness `/responsive-design`. Wait for findings, if needed share with other agents,  then implement.
- **After feature implementation:** Check `docs/documentation-agents.md` for which documentation agent/skill to run. Docs grow WITH features — update README, write User Guide sections, generate API docs as features ship.

## Git Workflow

- Upstream: `Gsync/jobsync` (fork) 
- Upstream-Maintainer won't accept PRs, use own repository
- Create and use own branches whereas needed
- Always commit with logical grouping, not one big commit
- Push explicitly when asked
