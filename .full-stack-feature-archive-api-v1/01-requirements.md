# Requirements: Public API v1 Foundation (ROADMAP 7.1 Phase 1)

## Problem Statement

JobSync needs a stable REST API for external tools (n8n workflows, webhooks, browser extensions, custom scripts). Currently all data access goes through NextAuth session-protected Server Actions, which are only usable from the Next.js frontend. External consumers have no way to programmatically access job data.

**User:** Self-hosted JobSync operators who want to integrate with automation tools.
**Pain point:** No programmatic access to job data from external systems.

## Acceptance Criteria

- [ ] New `PublicApiKey` Prisma model with SHA-256 hashed key storage
- [ ] API Key auth middleware (Bearer token + X-API-Key header)
- [ ] Rate limiting: In-memory sliding window, 60 req/min per API key
- [ ] ActionResult→HTTP response bridge with proper status codes
- [ ] REST endpoints: GET/POST /api/v1/jobs, GET/PATCH/DELETE /api/v1/jobs/:id, GET/POST /api/v1/jobs/:id/notes
- [ ] Zod validation on all inputs
- [ ] Pagination: ?page=1&perPage=25
- [ ] API Key Management UI in Settings (create, list, revoke)
- [ ] Key shown once on creation, then only prefix visible
- [ ] i18n: New `api.ts` dictionary with all 4 locales
- [ ] Integration tests for every endpoint
- [ ] Unit tests for auth, rate limiting, response bridge
- [ ] Middleware not blocking /api/v1/* with session auth

## Scope

### In Scope

- PublicApiKey model + SHA-256 hashing
- API Key auth middleware with rate limiting
- ActionResult→HTTP bridge utilities
- Jobs CRUD endpoints (Phase 1 only)
- Notes sub-resource endpoints
- API Key Management Settings UI
- i18n for API key management UI
- Comprehensive test suite

### Out of Scope

- Tasks, Activities, Automations endpoints (Phase 2)
- Scoped keys / permissions enforcement (Phase 3)
- Key rotation (Phase 3)
- Audit logging (Phase 3)
- AsyncLocalStorage user context bridge (Phase 2)
- OAuth / OpenID Connect
- GraphQL
- OpenAPI/Swagger documentation (ROADMAP 7.2)
- Redis-based rate limiting

## Technical Constraints

- SQLite database (Prisma ORM)
- Next.js 15 App Router for API routes
- Existing Server Actions as data layer (job.actions.ts)
- SHA-256 for key hashing (NOT AES — fast lookup required)
- In-memory rate limiting (no Redis for self-hosted simplicity)
- Zod for input validation (already installed)
- Must not break existing session-based auth for /api/* internal routes
- Aggregate boundaries: Jobs endpoints use ONLY job.actions.ts
- Parallel track safety: Don't modify automations.ts, settings.ts dictionaries, scheduler/*, staging/*

## Technology Stack

- **Framework:** Next.js 15 (App Router)
- **ORM:** Prisma (SQLite)
- **UI:** Shadcn UI + Tailwind CSS
- **Auth:** NextAuth (existing session) + new API Key auth
- **Validation:** Zod
- **Testing:** Jest + Testing Library
- **i18n:** Custom dictionary-based system

## Dependencies

- Existing `job.actions.ts` server actions (data layer)
- Existing `ActionResult<T>` type (response bridge)
- Existing `getCurrentUser()` utility (reference for auth pattern)
- `APP_CONSTANTS.RECORDS_PER_PAGE` for pagination defaults
- Existing `ApiKey` model is for Module-Credentials — PublicApiKey is separate

## Configuration

- Stack: nextjs-15-prisma-sqlite-shadcn
- API Style: REST
- Complexity: complex
