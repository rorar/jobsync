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
  - DataSourceConnector / AIProviderConnector / DataEnrichmentConnector / ReferenceDataConnector interfaces
  - ModuleRegistry: unified registry with manifests + factories
  - Runner: orchestrates search + matching with credential PUSH
  - Orchestrator: fallback chains per enrichment dimension
  ↕
Modules (each declares a Manifest + implements a Connector interface)
  - EURES, Arbeitsagentur, JSearch (Job Discovery)
  - Ollama, OpenAI, DeepSeek (AI Provider)
  - Logo.dev, Google Favicon, Meta/OpenGraph Parser (Data Enrichment)
  - ESCO Classification, Eurostat NUTS (Reference Data — health-only)
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
- **Shared Kernel:** `manifest.ts` (types + `DependencyHealthCheck` + `ModuleI18n`), `registry.ts` (unified registry), `register-all.ts` (central module registration), `resilience.ts` (Cockatiel policy builder), `health-monitor.ts` (+ dependency health checking), `degradation.ts`, `credential-resolver.ts`
- **Job Discovery** (`job-discovery/`): `types.ts`, `registry.ts` (facade), `runner.ts`
  - Modules: `modules/eures/`, `modules/arbeitsagentur/`, `modules/jsearch/` (each with `index.ts`, `manifest.ts`, `i18n.ts`, `resilience.ts`)
- **AI Provider** (`ai-provider/`): `types.ts`, `registry.ts` (facade)
  - Modules: `modules/ollama/`, `modules/openai/`, `modules/deepseek/` (each with `index.ts`, `manifest.ts`, `i18n.ts`)
- **Reference Data** (`reference-data/`): `types.ts`, `registry.ts` (facade)
  - Modules: `modules/esco-classification/`, `modules/eurostat-nuts/` (health-only, no connector interface yet)

**For new Modules:** Create `modules/{name}/` under the appropriate connector directory with:
1. `i18n.ts` — co-located translations for 4 locales (en, de, fr, es), exports `ModuleI18n`
2. `manifest.ts` — declares the appropriate manifest type with `i18n` field:
   - `JobDiscoveryManifest` (job search modules)
   - `AiManifest` (AI provider modules)
   - `DataEnrichmentManifest` (enrichment modules, declares `supportedDimensions`)
   - `ReferenceDataManifest` (taxonomy/classification services, declares `taxonomy`)
   - Optional: `dependencies: DependencyHealthCheck[]` for modules that depend on external services
3. `index.ts` — implements the connector interface + self-registers at bottom of file:
   ```typescript
   moduleRegistry.register(manifest, createMyModule);
   ```
4. `resilience.ts` (if manifest declares `resilience`) — thin wrapper calling `buildResiliencePolicy()`
5. Add import line in `src/lib/connector/register-all.ts`:
   ```typescript
   import "./my-connector/modules/my-module";
   ```
6. Add `envFallback` entry to `.env.example` if module has `credential.type: api_key`

That's it — no hardcoded arrays, no ENV_VAR_MAP entries, no duplicate resilience code, no global i18n dictionary edits. The module is fully self-contained.

**Credential Resolution (PUSH):** `credential-resolver.ts` resolves credentials from manifest config (DB → Env → Default). Runner calls `resolveCredential()` before module instantiation.

**Activation/Deactivation:** `module.actions.ts` provides `activateModule()` / `deactivateModule()`. Deactivation pauses affected automations with `pauseReason`. Settings UI shows activation toggle per module.

**Degradation Rules:** `degradation.ts` implements 3 escalation rules:
- `handleAuthFailure()` — immediate pause on 401/403
- `checkConsecutiveRunFailures()` — pause after 5 failed runs
- `handleCircuitBreakerTrip()` — pause after 3 CB opens

**Allium Spec:** `specs/module-lifecycle.allium` — authoritative specification for all lifecycle rules.

### Data Enrichment Connector (ROADMAP 1.13)

**Enrichment Orchestrator** (`src/lib/connector/data-enrichment/orchestrator.ts`) — Fallback-chain-based enrichment per dimension. First success wins, remaining modules skipped.

**Key Rule:** Enrichment is **best-effort and non-blocking**. Never show errors to users for enrichment failures. Use placeholders when enrichment fails.

**Current structure:** `src/lib/connector/data-enrichment/`:
- **types.ts** — DataEnrichmentConnector, EnrichmentDimension, LogoData, DeepLinkData, FallbackChainConfig, ENRICHMENT_CONFIG
- **registry.ts** — Facade: `getActiveEnrichmentModules()`, `getEnrichmentModuleByDimension()`
- **orchestrator.ts** — `EnrichmentOrchestrator.execute()`: cache check → chain execution → persist result → publish events. `globalThis` singleton. Resolves credentials via PUSH pattern for key-based modules.
  - Cache keys include `userId` to prevent cross-user data leakage (ADR-029).
  - Per-module timeout uses `Promise.race` (not AbortSignal propagation). Chain-level timeout at `CHAIN_TIMEOUT_MS`.
  - Enrichment log writes (`logAttempt`) are fire-and-forget (void return, `.catch(() => {})`) — best-effort, non-blocking.
- **domain-extractor.ts** — shared `extractDomain(input)` utility. Used by both `enrichment.actions.ts` and `enrichment-trigger.ts`.
- **Modules:** `modules/logo-dev/`, `modules/google-favicon/`, `modules/meta-parser/` (each with `index.ts`, `manifest.ts`, `i18n.ts`)

### Reference Data Connector (ROADMAP 1.20)

**Purpose:** Health-only connector for taxonomy/classification services (ESCO, Eurostat NUTS). These are not enrichment modules — they provide reference data that other modules depend on.

**Current structure:** `src/lib/connector/reference-data/`:
- **types.ts** — `ReferenceDataConnector` interface (health-only, no lookup yet)
- **registry.ts** — Facade over `moduleRegistry` for `reference_data` modules
- **Modules:** `modules/esco-classification/`, `modules/eurostat-nuts/` (each with `index.ts`, `manifest.ts`, `i18n.ts`)

**Module Dependencies:** Modules can declare `dependencies: DependencyHealthCheck[]` in their manifest. The health monitor probes dependencies alongside the main health check. A failed dependency can **degrade** the parent but **never** make it unreachable (spec rule `DependencyHealthDegradation`). EURES declares ESCO, Eurostat, and EURES Country Stats as dependencies.

**Enrichment Dimensions (Phase 1):**
- **Logo:** Company domain → logo URL. Chain: Logo.dev (optional key) → Google Favicon → Placeholder
- **DeepLink:** URL → OpenGraph metadata. Chain: Meta Parser (single module)

**Cache:** `EnrichmentResult` table with TTL-based stale-if-error. Unique key: `(userId, dimension, domainKey)`.
**Audit:** `EnrichmentLog` append-only trail per module attempt (chain position, outcome, latency).

**Server Actions:** `src/actions/enrichment.actions.ts` — `triggerEnrichment()`, `getEnrichmentStatus()`, `getEnrichmentResult()`, `refreshEnrichment()`. Rate-limited per user.

**Event-Triggered Enrichment:** `src/lib/events/consumers/enrichment-trigger.ts` — subscribes to `CompanyCreated` and `VacancyPromoted` events. Checks DB for existing fresh results before executing chain (cache-before-chain). Concurrent event-triggered enrichments are throttled by an in-memory semaphore (`MAX_CONCURRENT_ENRICHMENTS=5`).

**UI Components:**
- `src/components/ui/company-logo.tsx` — CompanyLogo (skeleton → image → initials fallback)
- `src/components/settings/EnrichmentModuleSettings.tsx` — Module activation in Settings

**Security:**
- Meta-parser: `redirect: "manual"` (SSRF protection), streaming body read (100KB limit), XSS sanitization on all extracted values
- Logo.dev: domain regex validation before URL construction
- ALL Prisma queries include `userId` (IDOR protection, ADR-015)

**Domain Events:** `EnrichmentCompleted`, `EnrichmentFailed` — published via TypedEventBus.

**Allium Spec:** `specs/data-enrichment.allium` — authoritative specification for all enrichment rules.

### Logo Asset Cache (Local Logo Storage)

**Domain Area:** `src/lib/assets/` — asset management (download, store, serve). Separate from enrichment (which discovers URLs). File Explorer will later live alongside it.

**LogoAssetService** (`src/lib/assets/logo-asset-service.ts`) — `globalThis` singleton. Downloads logo images from enriched URLs, validates (SSRF, content-type, magic bytes), sanitizes SVGs, stores on persistent Docker volume at `/data/logos/{userId}/{companyId}/logo.{ext}`.

**LogoAssetSubscriber** (`src/lib/assets/logo-asset-subscriber.ts`) — EventBus consumer for `EnrichmentCompleted` (logo dimension). Resolves companyId from domainKey, guards against duplicates, fires download as fire-and-forget.

**Serving:** `GET /api/logos/[id]` — authenticated file serving with `Cache-Control: public, max-age=86400, immutable`, ETag, CSP sandbox for SVGs.

**CompanyLogo Priority:** logoAssetId (local) → logoUrl (external fallback, token-stripped) → initials avatar.

**Token Stripping:** `stripTokenFromUrl()` removes API tokens (e.g., Logo.dev `pk_` key) from URLs before storing as `Company.logoUrl`. Preserves the URL as an external fallback per Allium spec.

**Server Actions:** `src/actions/logoAsset.actions.ts` — deleteLogoAsset, getLogoAssetForCompany, triggerLogoDownload.

**Security:** SSRF validation (validateWebhookUrl) on all downloads + redirects. SVG sanitization (strip scripts, handlers, external refs). Magic byte validation. CSP sandbox on SVG serving. IDOR via userId in all queries.

**Allium Spec:** `specs/logo-asset-cache.allium` — authoritative specification for all logo asset rules.

### Scheduler Coordination (ROADMAP 0.10)

**RunCoordinator** (`src/lib/scheduler/run-coordinator.ts`) — Single entry point for ALL automation runs (scheduler + manual). Uses in-memory mutex per automationId to prevent double-execution.

**Key Rule:** ALL automation runs MUST go through `runCoordinator.requestRun()`. Never call `runAutomation()` directly.

**Current structure:** `src/lib/scheduler/`:
- **types.ts** — RunSource, RunLock, SchedulerSnapshot, RunOptions, RunProgress
- **run-coordinator.ts** — RunCoordinator singleton (mutex, state, events, watchdog, degradation bridge)
- **index.ts** — Scheduler cron loop using RunCoordinator

**SSE Endpoint:** `GET /api/scheduler/status` — Real-time scheduler state, per-user filtered. Client hook: `useSchedulerStatus()` from `src/hooks/use-scheduler-status.ts` (shared singleton EventSource, one connection per tab).

**SSE Connection Limit:** Max 5 concurrent SSE connections per user (in-memory counter on `globalThis`). Excess connections receive error response.

**Singleton Pattern:** RunCoordinator and EventBus use `globalThis` to survive HMR. New singletons MUST follow this pattern.

**Domain Events:**
- `SchedulerCycleStarted/Completed` — Scheduler lifecycle
- `AutomationRunStarted/Completed` — Run lifecycle
- `AutomationDegraded` — Degradation → RunCoordinator bridge

**Progress Reporting:** Runner calls `runCoordinator.reportProgress()` at each phase (search → dedup → enrich → match → save → finalize). UI shows live stepper via RunProgressPanel.

**Allium Spec:** `specs/scheduler-coordination.allium` — authoritative specification for all coordination rules.

### Webhook Notification Channel (ROADMAP 0.6 Phase 2)

**Multi-Channel Architecture:** Notification dispatcher refactored from hardcoded in-app to `ChannelRouter` pattern. Each channel implements `NotificationChannel` interface (`dispatch`, `isEnabled`). Note: `isAvailable()` was removed from the interface in PERF-3 — availability is now derived from `DispatchContext` fields. `invalidateAvailability()` on `ChannelRouter` is retained as a **no-op** (method kept so existing callers in server actions do not break).

**Current structure:** `src/lib/notifications/`:
- **types.ts** — NotificationChannel, NotificationDraft, ChannelResult, WebhookPayload, WebhookDeliveryResult
- **channel-router.ts** — ChannelRouter singleton (register channels, route to all enabled). `globalThis` pattern.
- **channels/in-app.channel.ts** — InAppChannel (creates Notification DB record)
- **channels/webhook.channel.ts** — WebhookChannel (HMAC signing, retry, auto-deactivation)

**Webhook Delivery:**
- HMAC-SHA256 signing: `X-Webhook-Signature: sha256=<hmac>` header
- Headers: `X-Webhook-Event`, `Content-Type: application/json`, `User-Agent: JobSync-Webhook/1.0`
- Retry: 3 attempts with 1s/5s/30s backoff, 10s timeout via AbortController
- `redirect: "manual"` on fetch (SSRF protection via open redirector prevention)
- Concurrent delivery via `Promise.allSettled()` (independent endpoints)

**Failure Handling:**
- Atomic `failureCount` increment via Prisma `{ increment: 1 }`
- After 3 failed attempts: in-app notification "Webhook delivery failed"
- After 5 consecutive failures: auto-deactivate endpoint + notification
- Success resets `failureCount` to 0

**SSRF Protection:** `validateWebhookUrl()` in `src/lib/url-validation.ts` — SUPERSET of existing validators. Blocks: IMDS (169.254.*), RFC 1918 (10.x, 172.16-31.x, 192.168.x), localhost (127.x, ::1), non-http(s), embedded credentials, IPv6 private (fc00::/7, fe80::/10), IPv4-mapped IPv6 (::ffff:*). Validated on create AND on dispatch.

**Secret Storage:** AES-encrypted via `src/lib/encryption.ts`. Secret shown once on creation, then only as masked prefix.

**Server Actions:** `src/actions/webhook.actions.ts` — CRUD with ADR-015 IDOR protection (userId in all queries). Max 10 endpoints per user.

**Settings UI:** `src/components/settings/WebhookSettings.tsx` — endpoint list with active toggle, event selection, create form with client-side URL validation, secret-once dialog, delete confirmation.

**shouldNotify() Channel-Aware:** `src/models/notification.model.ts` — accepts optional `channel` parameter. When inApp is disabled but webhook is enabled, webhook still fires.

**Allium Spec:** `specs/notification-dispatch.allium` — All 4 channels, WebhookEndpoint/SmtpConfig/VapidConfig/WebPushSubscription entities, delivery rules per channel.

### Email Notification Channel (ROADMAP 0.6 Phase 3)

**EmailChannel** (`src/lib/notifications/channels/email.channel.ts`) — SMTP delivery via nodemailer. TLS enforced (TLSv1.2+, rejectUnauthorized). Rate-limited 10/min per user.

**SmtpConfig** Prisma model — one per user (userId @unique), AES-encrypted password. Fields: host, port, username, password (encrypted), fromAddress, tlsRequired, active.

**Current structure:** `src/lib/email/`:
- **templates.ts** — `renderEmailTemplate(type, data, locale)` → `{subject, html, text}`. Inline CSS, locale-aware HTML lang tag.

**Security:**
- SMTP host SSRF validation via `src/lib/smtp-validation.ts` (blocks private IPs, IMDS, localhost) — validated on save AND on every dispatch
- Password encrypted at rest, decrypted only at send time. `import "server-only"` on decrypt files.
- Rate limiting: `src/lib/email-rate-limit.ts` (10 emails/min, test button 1/60s)

**Server Actions:** `src/actions/smtp.actions.ts` — `saveSmtpConfig()`, `getSmtpConfig()`, `testSmtpConnection()`, `deleteSmtpConfig()`

**Settings UI:** `src/components/settings/SmtpSettings.tsx` — SMTP form, password show/hide, test email with countdown, delete confirmation

### Browser Push Notification Channel (ROADMAP 0.6 Phase 4)

**PushChannel** (`src/lib/notifications/channels/push.channel.ts`) — Browser push delivery via web-push VAPID protocol. Concurrent delivery to all subscriptions. Rate-limited 20/min per user.

**Prisma models:**
- **VapidConfig** — one per user (userId @unique), AES-encrypted privateKey. Auto-generated on first push enable.
- **WebPushSubscription** — multiple per user (different browsers/devices). AES-encrypted p256dh + auth keys. @@unique([userId, endpoint]).

**Current structure:** `src/lib/push/`:
- **vapid.ts** — `getOrCreateVapidKeys()`, `rotateVapidKeys()` (deletes all subscriptions)
- **rate-limit.ts** — `checkPushDispatchRateLimit()` (20/min), `checkPushTestRateLimit()` (1/60s)

**Stale Subscription Handling:** 410 Gone or 404 Not Found → silently delete subscription.

**Service Worker:** `public/sw-push.js` — minimal push-only (NOT full PWA). Shows notification, handles click navigation. URL validation prevents open redirect.

**VAPID Key Rotation:** Confirmation dialog warns that ALL subscriptions become invalid. Users must re-enable push after rotation.

**Server Actions:** `src/actions/push.actions.ts` — `subscribePush()`, `unsubscribePush()`, `getVapidPublicKeyAction()`, `rotateVapidKeysAction()`, `sendTestPush()`

**Settings UI:** `src/components/settings/PushSettings.tsx` — enable/disable push, device count, test push, VAPID rotation warning

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

**Shared Helpers:** `src/lib/api/helpers.ts`:
- `findOrCreate(type, userId, value)` — generic upsert for JobTitle, Company, Location, JobSource
- `resolveStatus(statusValue)` — find JobStatus by value
- `JOB_API_SELECT` / `JOB_DETAIL_SELECT` / `JOB_LIST_SELECT` — shared Prisma select shapes for API responses
- `isValidUUID(id)` — UUID format validation (in `schemas.ts`)

**Key Rule:** ALL `/api/v1/*` route handlers MUST use `withApiAuth()` wrapper. Never access Prisma directly without it.

**Key Rule:** API responses MUST use explicit `select` (never `include`) to prevent leaking internal fields (userId, matchData, automationId, foreign keys, createdBy). Use the shared select shapes from `helpers.ts`.

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

**Cache:** `src/lib/connector/cache.ts` — in-memory LRU cache (true LRU via Map re-insertion on access) with TTL, request coalescing, stale-if-error, periodic prune (15 min). Singleton on `globalThis`.

**HTTP Headers:** ESCO/EURES proxy routes set `Cache-Control` headers for browser caching.

### Connector & Module Lifecycle Rules

Implemented in `module.actions.ts` and `degradation.ts`. Spec: `specs/module-lifecycle.allium`.

1. **Aktivierung:** Module registers as `active` by default. User can deactivate via Settings toggle.
2. **Deaktivierung:** `deactivateModule()` pauses all active automations using it (`pauseReason: "module_deactivated"`)
3. **Reaktivierung:** Paused automations are NOT auto-restarted — user must manually reactivate
4. **Deaktivierte Module** are hidden from Automation Wizard module selector (`getActiveModules()`)
5. **Automation Degradation:** Auth failure → immediate pause. 5 consecutive failed runs → pause. 3 CB opens → pause.

**Cross-User Degradation:** `handleAuthFailure()` and `handleCircuitBreakerTrip()` intentionally affect ALL users' automations for the failing module. This is by design — module-level failures (invalid API key, circuit breaker) affect the shared external service, not individual users. Notifications are per-user.

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
- **Admin-only actions (Sprint 1.5 CRIT-S-04):** Any `"use server"` export that mutates SHARED singleton state (module registry, system toggles, cross-tenant automations) MUST gate on `authorizeAdminAction()` from `src/lib/auth/admin.ts` AND `checkAdminActionRateLimit()` from `src/lib/auth/admin-rate-limit.ts`. Gating only on `getCurrentUser()` (any authenticated user) is a cross-tenant privilege escalation — see `src/actions/module.actions.ts:activateModule/deactivateModule` for the reference implementation.

### Admin Authorization Tiered Rule (Sprint 1.5 CRIT-S-04)
JobSync has NO role/RBAC model — admin status is derived from a tiered rule evaluated per call in `src/lib/auth/admin.ts`:
- **Tier A — `ADMIN_USER_IDS` env var (comma-separated user ids):** if set, only listed ids are admins. Matches the ADR-018 env-var pattern (`AUTH_SECRET`). Required for multi-user deployments.
- **Tier B — single-user implicit:** if `ADMIN_USER_IDS` is unset AND `prisma.user.count() === 1` AND the sole user's id matches the session user, that user is admin. Preserves the zero-config self-hosted single-user UX.
- **Tier C — fail-closed:** if `ADMIN_USER_IDS` is unset AND the DB has more than one user, every admin call is DENIED. Multi-user deployments MUST configure `ADMIN_USER_IDS` and restart the instance.
- **Rate limit:** 10 admin actions per minute per user (sliding window, in-memory on `globalThis`). Enforced by `checkAdminActionRateLimit()` in `src/lib/auth/admin-rate-limit.ts`.
- **Audit log:** every admin call emits a structured `[admin-audit]` JSON line on stderr via `writeAdminAuditLog()`. Schema: `{ kind, ts, action, targetId, actorId, actorEmail, allowed, tier, reason, ...extra }`. A follow-up sprint will promote this to a Prisma `AdminAuditLog` model once a migration slot is available.
- **Allium invariant:** `AdminOnlyModuleLifecycle` in `specs/module-lifecycle.allium`.
- **Enforcement sites today:** `activateModule` and `deactivateModule` in `src/actions/module.actions.ts`. Any NEW server action that mutates shared singleton state must add the same gate.

### API Security
- **Pre-auth IP rate limiting:** `withApiAuth()` applies 120 req/min by IP BEFORE API key validation to prevent DoS via invalid key flooding (ADR-019).
- **UUID validation:** All `/api/v1/*` route params validated with `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- **File.filePath never in responses:** Use `File: { select: { id: true, fileName: true, fileType: true } }` — never `File: true`
- **Error sanitization:** 500 errors return generic message, never raw Prisma errors
- **ALL `/api/v1/*` routes** MUST use `withApiAuth()` wrapper

### Encryption Module (`src/lib/encryption.ts`)
- **Async API:** `encrypt()` and `decrypt()` are `async` — always `await` them
- **AES-256-GCM** with PBKDF2 key derivation (100K iterations, per-record random salt)
- **Derived-key LRU cache:** `globalThis` singleton (Symbol-keyed), max 128 entries. Same salt reuses the cached key without re-derivation. Cleared on process restart.
- **Legacy salt:** Records encrypted before the per-record salt migration use the hardcoded `LEGACY_SALT`. Decrypt auto-detects the format (`"salt:<hex>:..."` = new, plain base64 = legacy). No new encryption uses the legacy salt.
- **`import "server-only"`** — never import `encrypt`/`decrypt` in client components
- **Test helpers:** `_clearDerivedKeyCache()` and `_getDerivedKeyCacheSize()` exported for tests only
- **Allium Spec:** `specs/api-key-management.allium` — `DecryptKey` rule with `@guidance` for caching

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
- `src/components/ui/badge.tsx` — Base class includes `whitespace-nowrap` so badges grow to fit translated text instead of wrapping
- `src/components/staging/MatchScoreRing.tsx` — Shared circular match-score ring. Used by `DeckCard` and `StagedVacancyDetailContent`. Props: `{ score: number | null | undefined; size?: number }`
- `src/hooks/use-media-query.ts` — SSR-safe media query hook. Used by `StagedVacancyDetailSheet` (right/bottom side) and `NotificationBell` (Popover/Sheet). Returns `false` during SSR, hydrates on mount.
- `src/hooks/useStagingLayout.ts` — Persists staging layout size (`compact` / `default` / `comfortable`) in `localStorage` key `jobsync-staging-layout-size`. Mirrors the pattern of `useKanbanState`.

### Staging Details Sheet + Deck Action Routing

`src/components/staging/StagedVacancyDetailSheet.tsx` — responsive Sheet (right on desktop, bottom on mobile) that shows the full vacancy details. Opened via the Details button on `StagedVacancyCard` (list mode) or the Info button in the deck action rail (`i` keyboard shortcut, deck mode). The sheet preserves the deck position — it never advances `currentIndex` on open/close.

**Deck action routing invariant (ADR-030 Decision C + Sprint 1.5 CRIT-A-06 correction):** any action taken against a deck card from ANY entry point (swipe, action-rail button, details sheet, keyboard shortcut) MUST route through `useDeckStack.performAction` (the state machine). This is NOT the same as `StagingContainer.handleDeckAction` — the latter is the server-action dispatcher that `useDeckStack` consumes via its `onAction` prop. Routing sheet adapters through `handleDeckAction` instead of `performAction` bypasses the state machine: the server action fires but `currentIndex`, `undoStack`, `stats`, the exit animation, and the super-like celebration fly-in all stay stale. This was the CRIT-A-06 bug in the original honesty-gate hotfix (`2caab7e`).

The Sprint 1.5 fix exposes `DeckView` as a `forwardRef<DeckViewHandle, DeckViewProps>` with a `DeckViewHandle` imperative interface (`dismiss`, `promote`, `superLike`, `block`, `skip`). `StagingContainer` holds a `deckViewRef` and the sheet adapters in deck mode call `deckViewRef.current?.dismiss()` (etc.) — the SAME imperatives the swipe handlers and action-rail buttons use, guaranteeing every deck entry point flows through `performAction`. The four adapter functions (`detailsDismissAdapter`, `detailsPromoteAdapter`, `detailsSuperLikeAdapter`, `detailsBlockAdapter`) are still **mode-aware**, but now their deck branch goes through the ref handle and their list branch calls the direct list-mode handlers (`handleDismiss(id)` / `handlePromote(vacancy)` / ...). Regression guard: `__tests__/StagingContainerDeckSheetRouting.spec.tsx` mounts the real container + view + hook + sheet and asserts the deck counter advances after a sheet dismiss.

### Super-Like Celebration

`src/components/staging/SuperLikeCelebration.tsx` + `SuperLikeCelebrationHost.tsx` — bottom-center fly-in that celebrates a successful super-like and offers to open the newly created Job. Mounted inside `DeckView`, fed by `useSuperLikeCelebrations` (FIFO queue, max 5). Auto-dismisses after 6s with hover-pause + resume. Swipe-down / X / ESC dismiss. `role="status" aria-live="polite"`. Uses `Sparkles` icon (NOT `Star` — that's the action icon).

**Grace period:** when a new celebration replaces an outgoing one, the host plays a 1500ms slide-down exit animation before sliding up the next card. `SuperLikeCelebration` accepts an `isExiting` prop that disables pointer handlers and applies the exit keyframe. `prefers-reduced-motion` bypasses the grace period entirely.

**Test pattern:** jsdom does not implement `setPointerCapture`. `__tests__/SuperLikeCelebration.spec.tsx` stubs `setPointerCapture` / `releasePointerCapture` / `hasPointerCapture` on `HTMLElement.prototype` in `beforeAll` so `userEvent.click` works against the component's pointerdown listeners. Same pattern used in `JobsContainer.spec.tsx`.

### `useDeckStack.onAction` Contract (ADR-030)

```typescript
onAction: (vacancy, action) => Promise<{ success: boolean; createdJobId?: string }>
```

Callers populate `createdJobId` for actions that produce a Job (currently `promote` and `superlike`). The hook forwards it to:
- `options.onSuperLikeSuccess?.(jobId, vacancy)` — triggers the celebration fly-in
- `options.onSuperLikeUndone?.(jobId)` — removes the matching celebration from the queue on undo

The contract is additive — callers that only destructure `{ success }` keep working.

### Notification Late-Binding Pattern (ADR-030)

`src/lib/notifications/deep-links.ts` — centralized `buildNotificationActions(type, data)` mapping from notification type to deep-link URL + CTA label. Also exports `formatNotificationTitle(data, message, t)`, `formatNotificationReason(data, t)`, `formatNotificationActor(data, t)`, `resolveNotificationSeverity(data)`.

**Rule:** server-side notification creation MUST populate `data.titleKey + titleParams` (and optionally `reasonKey`, `reasonParams`, `actorType`, `actorId`, `severity`). The legacy `message` field is kept populated in English as a fallback for email/webhook/push channels and pre-migration clients. UI components use `formatNotificationTitle` at render time, so notifications correctly re-localize when the user switches locale.

**Enforced-writer helpers live in a leaf module:** `src/lib/notifications/enforced-writer.ts` exports `prepareEnforcedNotification` / `prepareEnforcedNotifications` + the `EnforcedNotificationDraft` / `PreparedNotificationRow` types + the `resolvePreferencesForEnforcer` helper. Sprint 4 Stream A (L-A-07) extracted them from `channel-router.ts` into this leaf module to break the `channel-router.ts` ↔ `webhook.channel.ts` circular import. The leaf has zero upstream dependencies (imports only `server-only`, `@/lib/db`, `@/models/notification.model`, `@/models/userSettings.model`), and `channel-router.ts`, `webhook.channel.ts`, `degradation.ts`, and all action files re-import from the leaf. The enforced-writer accepts an optional `locale` parameter so callers with an already-resolved locale (e.g. from `DispatchContext`) can skip the internal `resolveUserLocale()` DB query.

**New direct-writer sites MUST import `prepareEnforcedNotification[s]` from `@/lib/notifications/enforced-writer`, NOT from `@/lib/notifications/channel-router`.** The old re-exports are gone.

**Current direct writers** (all patched to satisfy the late-binding invariant inline, pending a full event-emission refactor):
- `src/lib/notifications/channels/in-app.channel.ts` — legitimate (the channel implementation)
- `src/lib/notifications/channels/webhook.channel.ts` — 2 sites

Note: `degradation.ts` was a direct writer with 3 sites until Sprint C (2026-05-13). Now routes via `AutomationDegraded` domain events → `notification-dispatcher.ts` handles fan-out.

**Removed in Sprint 1 CRIT-A1**: `src/actions/module.actions.ts:deactivateModule` used to call `prisma.notification.createMany` directly. It now emits `ModuleDeactivated` via the domain event bus, and `notification-dispatcher.handleModuleDeactivated` is the single writer. As a side-effect, users now receive one summary notification per module deactivation (instead of N notifications, one per paused automation), and the notification goes through all enabled channels (in-app + webhook + email + push) instead of only in-app.

**Enforcement:** `bash scripts/check-notification-writers.sh` (also `bun run check:notification-writers`) greps `src/` for `prisma.notification.(create|createMany)` and fails if any match lives outside the allowlist above. Run it before every commit that touches notification code.

Any new notification-creating code path MUST populate the structured fields.

### Notification Dispatch Context (PERF-3)

**`buildDispatchContext(userId)`** in `src/lib/notifications/dispatch-context.ts` consolidates 11-13 per-dispatch DB queries into 6 parallel Prisma queries executed once at the start of each notification dispatch cycle. The result is a read-only `DispatchContext` object threaded through the `ChannelRouter` and all channel implementations.

**DispatchContext interface** (`src/lib/notifications/types.ts`) contains:
- `userId`, `preferences` (NotificationPreferences), `locale` (display locale)
- `userEmail` (for email recipient)
- `smtp` (SmtpConfigSnapshot | null), `vapid` (VapidConfigSnapshot | null)
- `pushSubscriptions` (PushSubscriptionSnapshot[]), `webhookEndpoints` (WebhookEndpointSnapshot[])
- Derived availability flags: `emailAvailable`, `pushAvailable`, `webhookAvailable`, `inAppAvailable`
- `vapidSubject` (derived from SMTP fromAddress or default)

**Key rules:**
- **Channels MUST NOT query the DB for context data.** All user-scoped read data comes from `DispatchContext`. Channels may still perform writes (e.g., `notification.create`, `webhookEndpoint.update` for failure count).
- **Context is built fresh per dispatch, never cached across dispatches.** Each call to `buildDispatchContext()` fetches current state. There is no cross-dispatch staleness.
- **`isAvailable()` was removed from the `NotificationChannel` interface.** Availability is derived from context fields (e.g., `ctx.smtp !== null` for email). The router reads `ctx.[channel]Available` directly.
- **`ChannelRouter.route()` accepts `DispatchContext`** instead of `NotificationPreferences`. Preferences are read from `ctx.preferences`.
- **`invalidateAvailability()` is a no-op.** Retained on `ChannelRouter` for API compatibility with server action callers (`smtp.actions`, `webhook.actions`, `push.actions`). Each dispatch builds a fresh context, so invalidation is implicit.
- **Degraded context on DB failure:** If `Promise.all` rejects, `buildDispatchContext` returns a degraded context with all-null channel data and defaults, preserving InAppChannel functionality.

**Design document:** `docs/design/perf-3-dispatch-context.md` — full query inventory, interface definitions, edge cases, and migration strategy.

### CRM Core Module (ROADMAP 5.4, 5.5, 5.8, 5.9)

**Person** is an independent aggregate root — NOT part of the Job aggregate. The Job aggregate remains unchanged; new CRM models create relations TO Job via polymorphic nullable FKs.

**Naming:** Existing Task/Note/Interview models are untouched. CRM models use `Crm` prefix where names conflict: `CrmInterview`, `CrmTask`, `CrmNote`. The `Person` model is unique (no conflict with the old `Contact` model which remains for backward compatibility).

**Current structure:** `src/actions/`:
- **person.actions.ts** — Person CRUD + Merge + Anonymize (7 actions)
- **crmInterview.actions.ts** — Interview lifecycle (5 actions)
- **crmTask.actions.ts** — Task with polymorphic targets (6 actions)
- **crmNote.actions.ts** — Note with polymorphic targets (4 actions)
- **crmActivityLog.actions.ts** — Timeline read queries
- **crmBlocklist.actions.ts** — Email/phone/domain suppression

**Domain types:** `src/models/person.model.ts` — TypedEmail, TypedPhone, Address, FullName value objects + state machine validators + ExactlyOneTarget invariant validator + CRM_CONFIG constants.

**JSON Value Objects:** Person stores `emails`, `phones`, `companies` (CompanyAssociation[]), and `socialProfiles` (SocialProfile[]) as JSON strings (SQLite TEXT columns). Use `parseEmails()`/`parsePhones()`/`parseCompanies()`/`parseSocialProfiles()` from `person.model.ts` to deserialize.

**Person↔Job Contact Relationship:** `JobContact` is a join entity (Prisma model, NOT a value object) linking Person to Job with an optional `role` field. N:M: one Job can have multiple contact persons, one Person can be contact for multiple Jobs. Cascade rules: AnonymizePerson deletes, MergePersons transfers.

**Polymorphic Targeting (Twenty CRM Pattern):** `CrmTaskTarget` and `CrmNoteTarget` use nullable FK columns: exactly one of `targetPersonId`/`targetCompanyId`/`targetJobId` must be set. Enforced at app level by `validateExactlyOneTarget()`.

**State Machines:**
- Person: active → archived ↔ active, active → anonymized (terminal)
- Interview: scheduled → completed|cancelled|rescheduled, rescheduled → completed|cancelled
- Task: pending → in_progress|done|cancelled, in_progress → done|cancelled

**CRM Domain Events (9):** ContactCreated, ContactUpdated, ContactDeleted, InterviewScheduled, InterviewCompleted, ReminderTriggered, CrmTaskCreated, CrmTaskCompleted, CrmNoteCreated — all published via TypedEventBus.

**CRM Activity Logger:** `src/lib/events/consumers/crm-activity-logger.ts` — subscribes to JobStatusChanged, ContactCreated, ContactUpdated and projects into CrmActivityLog (immutable, append-only read model per TimelineProjection contract).

**GDPR on Person:** `dataSource` (manual|auto_created|imported), `processingBasis` (legitimate_interest|consent|contract), `retentionExpiresAt`. AnonymizePerson cascades to NoteTargets, TaskTargets, JobContacts, ActivityLog references, and clears `createdByName`/`updatedByName` (actor PII).

**Person Fields (Kette B):** `headline` (free-form professional identity, replaces old `jobTitle`), `socialProfiles` (List of `{platform, url}`, replaces old `linkedinUrl`). Platforms: linkedin, xing, github, twitter, other. URLs validated server-side (https/http only, ADR-019 runtime membership check on platform enum).

**CRM Temporal Rules (CRM Cron):** `src/lib/scheduler/crm-cron.ts` — separate cron job (every 15 min) for time-based CRM rules, independent from the automation scheduler (bounded context separation). Three rules:
- `ExpireAutoCreatedPersons` — archives auto-created persons past `retentionExpiresAt`
- `InterviewReminder` — fires `ReminderTriggered` event for interviews within 24h
- `TaskOverdueReminder` — fires `ReminderTriggered` event for overdue tasks

Idempotency via activity log check (no duplicate reminders within 24h window). Started in `src/instrumentation.ts` alongside the automation scheduler.

**CrmActivityLog Relations:** `targetCompanyId` and `targetJobId` have proper Prisma `@relation` FKs to Company and Job (migration `20260510193831`). Timeline queries include `targetCompany` and `targetJob` for rich display.

**Company.domain Auto-Fill:** When a company is created, the `CompanyCreated` event handler in `enrichment-trigger.ts` extracts a domain via `extractDomain()` and writes it back to `Company.domain` (best-effort, non-blocking). This populates the domain field for both manual and automation-created companies.

**Allium Spec:** `specs/crm.allium` — authoritative specification. `specs/crm-gdpr.allium` for GDPR rules.

**i18n:** `src/i18n/dictionaries/crm.ts` — own namespace (`crm.*`), ~160 keys × 4 locales.

**UI Routes:** `/dashboard/contacts`, `/dashboard/contacts/[id]`, `/dashboard/interviews`, `/dashboard/crm-tasks`.

## Domain-Driven Design (DDD) Principles

This project uses DDD idioms. All agents and contributors MUST follow these principles:

### Ubiquitous Language

Use consistent domain terms across code, UI, specs, and documentation:

| Domain Term | Meaning | NOT |
|---|---|---|
| `DiscoveredVacancy` | A job found by an automation | "scraped job", "result" |
| `Connector` | ACL that translates external APIs to domain types | "scraper", "fetcher" |
| `ConnectorType` | Category of connector (`job_discovery`, `ai_provider`, `data_enrichment`, `reference_data`) | "connector category", "module type" |
| `Module` | External system behind a Connector, self-describes via Manifest | "API", "service", "provider" |
| `Dependency` | External service a module depends on (declared via `DependencyHealthCheck[]` on manifest) | "sub-API", "child module" |
| `AiModuleId` | Enum identifying an AI Module (ollama, openai, deepseek) | `AiProvider`, `ProviderType` |
| `Automation` | A scheduled job search configuration | "cron job", "task" |
| `ActionResult<T>` | Typed server action response | `Promise<any>` |
| `Person` | CRM contact entity (recruiter, hiring manager, referral) | "Contact" (legacy model) |
| `CrmInterview` | Scheduled/completed interview with status machine | "Interview" (legacy model) |
| `CrmTask` | To-do with polymorphic targets (Job/Person/Company) | "Task" (existing activity-tracking model) |
| `CrmNote` | Free-text note with polymorphic targets | "Note" (existing Job-only note) |
| `CrmActivityLog` | Immutable timeline entry (materialized read model) | "Activity" (existing activity-tracking model) |
| `CrmBlocklist` | Email/phone/domain suppression for auto-creation | "CompanyBlacklist" (existing company-level filter) |
| `JobContact` | N:M join linking Person to Job with role | Not a value object — has own Prisma model |
| `CompanyAssociation` | Value object linking Person to Company with role + temporal bounds | Stored as JSON on Person |
| `SocialProfile` | Value object with platform + URL | Stored as JSON on Person |

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
- **Person Aggregate (CRM):** Person + CrmInterviews + JobContacts + CrmTaskTargets + CrmNoteTargets (via `person.actions.ts`, `crmInterview.actions.ts`, `jobContact.actions.ts`, `crmTask.actions.ts`, `crmNote.actions.ts`)
- Never modify an aggregate's children from outside its action file

### Repository Pattern

Server actions (`src/actions/*.ts`) serve as Repositories:
- Each aggregate has one action file (its Repository)
- Return `ActionResult<T>` for typed responses (Pattern A)
- Pattern B functions (`getAllX`) may return raw arrays — see `specs/action-result.allium`
- Dashboard functions (Pattern C) use custom return types

### Domain Events

The TypedEventBus (`src/lib/events/event-bus.ts`) publishes 29 event types with typed payloads. All event consumers MUST validate payloads at runtime using `safeParsePayload()` from `src/lib/events/event-schemas.ts`:

```typescript
import { XPayloadSchema, safeParsePayload } from "@/lib/events/event-schemas";

const payload = safeParsePayload(XPayloadSchema, event);
if (!payload) return; // logs error, skips processing
```

All emit sites MUST use the `createEvent()` typed factory (never inline `{ type, timestamp, payload }` objects). Zod schemas in `event-schemas.ts` are linked to TypeScript interfaces in `event-types.ts` via `satisfies z.ZodType<XPayload>` — adding a field to one without the other produces a compile error.

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
- Run `bash scripts/test.sh` before every commit — all tests must pass (coverage collection is OFF by default for speed; pass `--coverage` to opt in)
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

## Deferred Sprint Work — Handoff to Future Sessions

After Sprints 1-5 closed ~540 findings in the 2026-04-09/10 session series, a set of items remains DELIBERATELY DEFERRED. These are NOT new findings — they are known, tracked, and waiting for either dedicated sprints, human design decisions, or entry criteria to trigger them. **Before starting any "cleanup" or "more sprints" pass, read `docs/BUGS.md` § Sprint 5 follow-ups + the memory file `project_deferred_sprints_for_future_sessions.md`.**

The deferred items split into three categories:

### Dedicated-sprint items (too big for a standard cleanup pass)

- **H-P-09 Observability infrastructure** — Zero OpenTelemetry / Prometheus / distributed tracing / Core Web Vitals. Needs architectural design phase picking the stack (OpenTelemetry + Tempo + Prometheus + Grafana, OR an off-the-shelf APM). 2-3 week dedicated sprint. See `docs/BUGS.md` Sprint 2 deferred section.
- **M-A-09 undoStore split-brain full pipe-through** — Pipe `ActionResult.data.undoTokenId` through `useDeckStack.onAction` → `UndoEntry` → `handleDeckUndo` → `undoStore.compensate(tokenId)` so promote/superlike/block can join the `REVERSIBLE_DECK_ACTIONS` allowlist. Sprint 3 Stream B shipped only the minimal trimmed fix. Touches ADR-030 Decision A contract. 2-3 day focused sprint.
- **getStagedVacancies cursor pagination** — Currently uses skip/offset which degrades at large offsets. Cursor-based fix ripples into StagingContainer + RecordsPerPageSelector + BulkActionBar select-all + StagingNewItemsBanner. 2-3 day focused sprint. Preemptive — no user has hit the slowness yet.
- **email.ts multi-prefix split** (discovered Sprint 5 Stream C) — `src/i18n/dictionaries/email.ts` hosts FOUR prefixes (`email.*`, `errors.*`, `push.*`, `smtp.*`) across 78 keys. Same antipattern Sprint 5 Stream C fixed for `settings.ts`. Requires upfront decision on `errors.*` cross-cutting (core + email.ts both host it). Half-day pure split.

### Design-gated items (need human decision before any agent touches them)

- **6 input-adjacent settings buttons at 40×40** — kept because growing to 44×44 would misalign with h-10 Input height. Requires project-wide `<Input>` h-11 bump. Design review.
- **react-day-picker --cell-size 2rem → 44px** — widens the popover significantly. User testing.
- **TasksTable density toggle** — new UX feature, needs user-facing design.
- **Dark-mode MatchScoreRing contrast audit** — Sprint 4 Stream E L-Y-05 only audited light-mode. Needs full dark-mode WCAG sweep.

### Latent items (NOT blocking, quick wins ready when needed)

- **`DropdownMenuTrigger asChild` + JSX comment ESLint rule** — latent codebase-wide footgun. 2-3 hours for custom ESLint rule + integration test.
- **`unsubscribeAllPush` / GDPR delete-account invalidateAvailability audit** — Stream A Sprint 5 Open Question. 15 minutes.
- **Admin audit UI consumer** — Sprint 5 Stream D added the `AdminAuditLog` Prisma model + write path. Feature work to surface the DB rows in a review UI. 1-day feature sprint.
- **Plural rules for i18n keys** — systemic cross-cutting decision. Affects all count-based keys. Needs user decision on LinguiJS ICU vs per-key singular variant.

**Rule for future sessions:** if any team-review surfaces one of these items as a "new" finding, redirect the reviewer to this section. Re-surfacing a known deferral as a fresh finding wastes reviewer budget and misrepresents the project's deferral discipline. Team-reviews should focus on what's NEW since the last sprint, not rediscover the backlog.

## Git Workflow

- Upstream: `Gsync/jobsync` (fork) 
- Upstream-Maintainer won't accept PRs, use own repository
- Create and use own branches whereas needed
- Always commit with logical grouping, not one big commit
- Push explicitly when asked
