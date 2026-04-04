# Architecture: Public API v1

## File Structure

```
src/lib/api/
  auth.ts          — validateApiKey, hashApiKey, generateApiKey, getKeyPrefix
  rate-limit.ts    — checkRateLimit (sliding window, 60 req/min)
  response.ts      — actionToResponse, paginatedResponse, errorResponse, createdResponse
  with-api-auth.ts — withApiAuth HOF (auth + rate limit + error catch)
  schemas.ts       — Zod schemas (PaginationSchema, CreateJobSchema, etc.)

src/app/api/v1/
  jobs/
    route.ts       — GET (list) + POST (create)
    [id]/
      route.ts     — GET + PATCH + DELETE
      notes/
        route.ts   — GET (list) + POST (add)

src/actions/publicApiKey.actions.ts  — CRUD for API keys (session-auth)
src/models/publicApiKey.model.ts     — TypeScript types
src/components/settings/PublicApiKeySettings.tsx — UI component
src/i18n/dictionaries/api.ts        — 4-locale translations
```

## Auth Flow

1. Client sends `Authorization: Bearer pk_live_...` or `X-API-Key: pk_live_...`
2. `withApiAuth` wrapper calls `validateApiKey(req)`
3. Key extracted from header → SHA-256 hashed → looked up in DB
4. If found and not revoked → userId returned
5. Rate limit checked against key hash
6. Handler called with userId for direct Prisma queries
7. Rate limit headers added to response

## Key Design Decisions

- **Phase 1: Direct Prisma queries** instead of server actions (avoids getCurrentUser session dependency)
- **Phase 2 will add AsyncLocalStorage** bridge for server action reuse
- **withApiAuth HOF** provides consistent auth/rate-limit/error-handling across all endpoints
- **Zod validation** on all inputs at the API boundary
- **Aggregate boundaries respected**: Jobs endpoints only query Job aggregate
