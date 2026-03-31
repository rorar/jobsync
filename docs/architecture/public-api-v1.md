# Public API v1 — Complete Architecture Document

**Status:** Design
**Date:** 2026-03-31
**Author:** @rorar

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Schema](#2-database-schema)
3. [File-by-File Breakdown](#3-file-by-file-breakdown)
4. [Authentication Flow](#4-authentication-flow)
5. [Rate Limiting](#5-rate-limiting)
6. [API Endpoint Contracts](#6-api-endpoint-contracts)
7. [ActionResult-to-HTTP Bridge](#7-actionresult-to-http-bridge)
8. [Shared API Wrapper](#8-shared-api-wrapper)
9. [Server Actions for API Key CRUD](#9-server-actions-for-api-key-crud)
10. [Frontend Component Hierarchy](#10-frontend-component-hierarchy)
11. [i18n Strategy](#11-i18n-strategy)
12. [Error Handling Strategy](#12-error-handling-strategy)
13. [Security Considerations](#13-security-considerations)
14. [Testing Strategy](#14-testing-strategy)

---

## 1. Overview

The Public API v1 exposes JobSync's core Job and Note resources over REST, authenticated via user-managed API keys rather than browser sessions. This allows external tools (CLI scripts, mobile apps, CI pipelines, Zapier/n8n integrations) to interact with a user's data.

### Design Principles

- **No server action reuse.** Existing server actions (`job.actions.ts`, `note.actions.ts`) use `"use server"` + `getCurrentUser()` which depends on NextAuth sessions. API route handlers perform direct Prisma queries, scoped by the `userId` returned from API key validation.
- **Thin route handlers.** Each route handler is a 10-30 line function that validates input (Zod), runs a Prisma query, and returns via the response helpers.
- **Existing patterns preserved.** The `ActionResult<T>` shape is reused in the HTTP response envelope. The existing `ApiKey` model is NOT repurposed (it stores encrypted module credentials). A new `PublicApiKey` model is added.
- **Middleware bypass confirmed.** The existing middleware matcher (`/dashboard`, `/dashboard/:path*`) does not intercept `/api/v1/*` routes, so no middleware changes are needed.

---

## 2. Database Schema

### New Model: `PublicApiKey`

```prisma
model PublicApiKey {
  id         String    @id @default(uuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  name       String                        // User-assigned label, e.g. "CI Pipeline"
  keyHash    String    @unique             // SHA-256 hash of the full key
  keyPrefix  String                        // First 8 chars of the key, e.g. "jsk_a1b2"
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?

  @@index([userId])
  @@index([keyHash])
}
```

### User Model Addition

```prisma
model User {
  // ... existing fields ...
  PublicApiKey PublicApiKey[]
}
```

### Key Format

Keys follow the pattern `jsk_<32-char-hex>` (total 36 chars). The `jsk_` prefix makes keys identifiable in logs and secret scanners.

- **Stored:** Only the SHA-256 hash of the full key.
- **Displayed:** Only the `keyPrefix` (first 8 chars: `jsk_a1b2`).
- **Shown once:** The full plaintext key is returned exactly once at creation time.

---

## 3. File-by-File Breakdown

### Backend — API Infrastructure

| File | Responsibility |
|---|---|
| `src/lib/api/auth.ts` | `validateApiKey(req)` — extracts key from headers, hashes it, looks up `PublicApiKey`, returns `userId` or throws |
| `src/lib/api/rate-limit.ts` | In-memory sliding window rate limiter. `checkRateLimit(keyHash)` returns `{ allowed, remaining, resetAt }` |
| `src/lib/api/response.ts` | HTTP response helpers: `successResponse()`, `paginatedResponse()`, `errorResponse()`, `actionToResponse()` |
| `src/lib/api/with-api-auth.ts` | `withApiAuth(handler)` — HOF that wraps route handlers with auth + rate limit + error catching |
| `src/lib/api/schemas.ts` | Zod schemas for API request validation (create job, update job, create note, query params) |

### Backend — API Route Handlers

| File | Methods | Responsibility |
|---|---|---|
| `src/app/api/v1/jobs/route.ts` | GET, POST | List jobs (paginated, filterable) and create a job |
| `src/app/api/v1/jobs/[id]/route.ts` | GET, PATCH, DELETE | Get, update, or delete a single job |
| `src/app/api/v1/jobs/[id]/notes/route.ts` | GET, POST | List notes for a job and add a note |

### Backend — Server Actions (API Key Management)

| File | Responsibility |
|---|---|
| `src/actions/publicApiKey.actions.ts` | `createPublicApiKey()`, `listPublicApiKeys()`, `revokePublicApiKey()` — session-authenticated CRUD for key management |

### Frontend — Settings UI

| File | Responsibility |
|---|---|
| `src/components/settings/PublicApiKeySettings.tsx` | Main component: key list table + create form + revoke dialog |

### i18n

| File | Responsibility |
|---|---|
| `src/i18n/dictionaries/settings.ts` | Extended with `settings.publicApi*` keys (all 4 locales) |

### Prisma

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | New `PublicApiKey` model + `PublicApiKey[]` relation on `User` |
| `prisma/migrations/YYYYMMDD_add_public_api_key/` | Migration file |

---

## 4. Authentication Flow

```
Client Request
  │
  ├─ Header: "Authorization: Bearer jsk_a1b2c3d4..."
  │  OR
  ├─ Header: "X-API-Key: jsk_a1b2c3d4..."
  │
  ▼
withApiAuth(handler)
  │
  ├─ 1. Extract key from headers
  │     - Check Authorization header first (strip "Bearer " prefix)
  │     - Fall back to X-API-Key header
  │     - If neither → 401 { error: { code: "UNAUTHORIZED", message: "Missing API key" } }
  │
  ├─ 2. Validate key format
  │     - Must match /^jsk_[a-f0-9]{32}$/
  │     - If invalid → 401 { error: { code: "UNAUTHORIZED", message: "Invalid API key format" } }
  │
  ├─ 3. Hash key with SHA-256
  │     - crypto.createHash("sha256").update(key).digest("hex")
  │
  ├─ 4. Look up PublicApiKey by keyHash
  │     - If not found → 401
  │     - If revokedAt !== null → 401 { message: "API key has been revoked" }
  │
  ├─ 5. Check rate limit
  │     - checkRateLimit(keyHash) → { allowed, remaining, resetAt }
  │     - If !allowed → 429 with X-RateLimit-* headers
  │
  ├─ 6. Update lastUsedAt (fire-and-forget, no await)
  │     - prisma.publicApiKey.update({ where: { id }, data: { lastUsedAt: new Date() } })
  │
  ├─ 7. Inject userId + set rate limit headers on response
  │     - Call handler(req, { userId, keyId })
  │     - Attach X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  │
  └─ 8. Global error catch
        - Prisma errors → 500
        - Zod errors → 400
        - Unknown → 500
```

### Why NOT reuse `getCurrentUser()`

`getCurrentUser()` in `src/utils/user.utils.ts` calls `auth()` from NextAuth, which reads the session cookie. API key auth is stateless and header-based. Reusing it would require either:
- Monkey-patching the session (fragile)
- Adding a second code path inside `getCurrentUser()` (violates SRP)

Instead, `validateApiKey()` returns a plain `userId: string`. Route handlers use this directly in Prisma `where` clauses.

---

## 5. Rate Limiting

### Implementation: `src/lib/api/rate-limit.ts`

```typescript
interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;  // Unix timestamp in seconds
}

const WINDOW_MS = 60_000;     // 1 minute
const MAX_REQUESTS = 60;      // 60 requests per window
const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(keyHash: string): RateLimitResult
```

### Sliding Window Algorithm

1. Get or create entry for `keyHash`.
2. Filter out timestamps older than `Date.now() - WINDOW_MS`.
3. If `timestamps.length >= MAX_REQUESTS`, return `{ allowed: false, remaining: 0, resetAt }`.
4. Otherwise, push `Date.now()` and return `{ allowed: true, remaining: MAX_REQUESTS - timestamps.length, resetAt }`.
5. `resetAt` = oldest timestamp in window + WINDOW_MS (converted to Unix seconds).

### Cleanup

A periodic cleanup runs every 5 minutes, removing entries with no timestamps newer than `WINDOW_MS`. Uses `globalThis` singleton pattern (same as RunCoordinator) to survive HMR.

### Response Headers

Every response includes:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1743408000
```

When rate-limited (429):
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 42 seconds."
  }
}
```
Plus `Retry-After: 42` header.

---

## 6. API Endpoint Contracts

### Common Response Envelope

All responses follow the same envelope:

**Success (single resource):**
```json
{
  "success": true,
  "data": { ... }
}
```

**Success (paginated list):**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "total": 142,
    "page": 1,
    "perPage": 25,
    "totalPages": 6
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description of what went wrong"
  }
}
```

---

### `GET /api/v1/jobs`

List the authenticated user's jobs with pagination, filtering, and search.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number (1-based) |
| `perPage` | integer | 25 | Items per page (max 100) |
| `status` | string | — | Filter by status value (e.g., `applied`, `interview`, `draft`) |
| `type` | string | — | Filter by job type (`Full-time`, `Part-time`, `Contract`) |
| `search` | string | — | Search across job title, company, location, description |

**Response: 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "jobTitle": { "id": "uuid", "label": "Software Engineer" },
      "company": { "id": "uuid", "label": "Acme Corp", "logoUrl": null },
      "status": { "id": "uuid", "label": "Applied", "value": "applied" },
      "location": { "id": "uuid", "label": "Berlin" },
      "jobSource": { "id": "uuid", "label": "LinkedIn" },
      "jobType": "Full-time",
      "jobUrl": "https://...",
      "salaryRange": "80k-100k",
      "applied": true,
      "appliedDate": "2026-03-15T00:00:00.000Z",
      "dueDate": "2026-04-01T00:00:00.000Z",
      "matchScore": 85,
      "notesCount": 3,
      "createdAt": "2026-03-10T12:00:00.000Z"
    }
  ],
  "meta": { "total": 142, "page": 1, "perPage": 25, "totalPages": 6 }
}
```

**Notes:**
- `description` is excluded from list responses (same as `getJobsList` in `job.actions.ts`).
- Relations are flattened to camelCase keys (`JobTitle` -> `jobTitle`, `_count.Notes` -> `notesCount`).

---

### `POST /api/v1/jobs`

Create a new job application.

**Request Body:**
```json
{
  "jobTitleId": "uuid",
  "companyId": "uuid",
  "statusId": "uuid",
  "locationId": "uuid",
  "jobSourceId": "uuid",
  "jobType": "Full-time",
  "description": "Job description text...",
  "salaryRange": "80k-100k",
  "jobUrl": "https://example.com/job/123",
  "dueDate": "2026-04-01T00:00:00.000Z",
  "appliedDate": "2026-03-15T00:00:00.000Z",
  "applied": false,
  "resumeId": "uuid",
  "tagIds": ["uuid1", "uuid2"]
}
```

**Required fields:** `jobTitleId`, `companyId`, `statusId`, `jobType`, `description`

**Validation Schema (Zod):**
```typescript
const CreateJobApiSchema = z.object({
  jobTitleId: z.string().uuid(),
  companyId: z.string().uuid(),
  statusId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  jobSourceId: z.string().uuid().optional(),
  jobType: z.enum(["Full-time", "Part-time", "Contract"]),
  description: z.string().min(10).max(10000),
  salaryRange: z.string().max(100).optional(),
  jobUrl: z.string().url().optional(),
  dueDate: z.string().datetime().optional(),
  appliedDate: z.string().datetime().optional(),
  applied: z.boolean().default(false),
  resumeId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).max(10).optional(),
});
```

**Response: 201**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "jobTitle": { "id": "uuid", "label": "Software Engineer" },
    "company": { "id": "uuid", "label": "Acme Corp" },
    "status": { "id": "uuid", "label": "Draft", "value": "draft" },
    "location": null,
    "jobSource": null,
    "jobType": "Full-time",
    "description": "Job description text...",
    "salaryRange": null,
    "jobUrl": null,
    "applied": false,
    "appliedDate": null,
    "dueDate": null,
    "matchScore": null,
    "tags": [],
    "createdAt": "2026-03-31T10:00:00.000Z"
  }
}
```

---

### `GET /api/v1/jobs/:id`

Get full details for a single job, including description and tags.

**Response: 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "jobTitle": { "id": "uuid", "label": "Software Engineer" },
    "company": { "id": "uuid", "label": "Acme Corp", "logoUrl": null },
    "status": { "id": "uuid", "label": "Applied", "value": "applied" },
    "location": { "id": "uuid", "label": "Berlin" },
    "jobSource": { "id": "uuid", "label": "LinkedIn" },
    "jobType": "Full-time",
    "description": "Full job description...",
    "salaryRange": "80k-100k",
    "jobUrl": "https://...",
    "applied": true,
    "appliedDate": "2026-03-15T00:00:00.000Z",
    "dueDate": "2026-04-01T00:00:00.000Z",
    "matchScore": 85,
    "matchData": "{...}",
    "tags": [
      { "id": "uuid", "label": "Remote", "value": "remote" }
    ],
    "resume": { "id": "uuid", "title": "My Resume" },
    "createdAt": "2026-03-10T12:00:00.000Z"
  }
}
```

**Error: 404** — Job not found or belongs to another user.

---

### `PATCH /api/v1/jobs/:id`

Partial update of a job. Only provided fields are updated.

**Request Body:** (all fields optional)
```json
{
  "statusId": "uuid",
  "jobType": "Part-time",
  "description": "Updated description...",
  "salaryRange": "90k-110k",
  "applied": true,
  "appliedDate": "2026-03-20T00:00:00.000Z",
  "tagIds": ["uuid1"]
}
```

**Validation Schema:**
```typescript
const UpdateJobApiSchema = z.object({
  jobTitleId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional().nullable(),
  jobSourceId: z.string().uuid().optional().nullable(),
  jobType: z.enum(["Full-time", "Part-time", "Contract"]).optional(),
  description: z.string().min(10).max(10000).optional(),
  salaryRange: z.string().max(100).optional().nullable(),
  jobUrl: z.string().url().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  appliedDate: z.string().datetime().optional().nullable(),
  applied: z.boolean().optional(),
  resumeId: z.string().uuid().optional().nullable(),
  tagIds: z.array(z.string().uuid()).max(10).optional(),
});
```

**Response: 200** — Same shape as `GET /api/v1/jobs/:id`.

---

### `DELETE /api/v1/jobs/:id`

Delete a job and all its associated notes (cascading).

**Response: 200**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

**Error: 404** — Job not found or belongs to another user.

---

### `GET /api/v1/jobs/:id/notes`

List all notes for a job, ordered by `createdAt` descending.

**Response: 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "content": "Had a great call with the recruiter.",
      "isEdited": false,
      "createdAt": "2026-03-20T14:30:00.000Z",
      "updatedAt": "2026-03-20T14:30:00.000Z"
    }
  ]
}
```

**Error: 404** — Job not found or belongs to another user.

---

### `POST /api/v1/jobs/:id/notes`

Add a note to a job.

**Request Body:**
```json
{
  "content": "Follow up with hiring manager next week."
}
```

**Validation Schema:**
```typescript
const CreateNoteApiSchema = z.object({
  content: z.string().min(1).max(5000),
});
```

**Response: 201**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "content": "Follow up with hiring manager next week.",
    "isEdited": false,
    "createdAt": "2026-03-31T10:00:00.000Z",
    "updatedAt": "2026-03-31T10:00:00.000Z"
  }
}
```

**Error: 404** — Job not found or belongs to another user.

---

## 7. ActionResult-to-HTTP Bridge

### `src/lib/api/response.ts`

```typescript
import { NextResponse } from "next/server";
import type { ActionResult } from "@/models/actionResult";

// ---- Error codes ----
type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

// ---- Helpers ----

export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    meta: {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    },
  });
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

/** Map an ActionResult<T> to the appropriate HTTP response. */
export function actionToResponse<T>(
  result: ActionResult<T>,
  successStatus = 200,
): NextResponse {
  if (result.success) {
    return NextResponse.json(
      {
        success: true,
        data: result.data,
        ...(result.total !== undefined ? { total: result.total } : {}),
      },
      { status: successStatus },
    );
  }
  // Map common error messages to HTTP status codes
  const msg = result.message ?? "Unknown error";
  if (msg.includes("Not authenticated")) {
    return errorResponse("UNAUTHORIZED", msg, 401);
  }
  if (msg.includes("not found")) {
    return errorResponse("NOT_FOUND", msg, 404);
  }
  return errorResponse("INTERNAL_ERROR", msg, 500);
}
```

### HTTP Status Code Mapping

| Scenario | HTTP Status | Error Code |
|---|---|---|
| Success (single) | 200 | — |
| Created | 201 | — |
| Missing/invalid API key | 401 | `UNAUTHORIZED` |
| Key revoked | 401 | `UNAUTHORIZED` |
| Resource not found / wrong user | 404 | `NOT_FOUND` |
| Zod validation failure | 400 | `VALIDATION_ERROR` |
| Rate limit exceeded | 429 | `RATE_LIMITED` |
| Prisma / unknown error | 500 | `INTERNAL_ERROR` |

---

## 8. Shared API Wrapper

### `src/lib/api/with-api-auth.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { errorResponse } from "./response";

export interface ApiContext {
  userId: string;
  keyId: string;
}

type ApiHandler = (
  req: NextRequest,
  ctx: ApiContext & { params: Record<string, string> },
) => Promise<NextResponse>;

export function withApiAuth(handler: ApiHandler) {
  return async (
    req: NextRequest,
    { params }: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      // 1. Authenticate
      const authResult = await validateApiKey(req);
      if (!authResult.success) {
        return errorResponse("UNAUTHORIZED", authResult.message, 401);
      }

      // 2. Rate limit
      const rateResult = checkRateLimit(authResult.keyHash);
      const headers = new Headers();
      headers.set("X-RateLimit-Limit", "60");
      headers.set("X-RateLimit-Remaining", String(rateResult.remaining));
      headers.set("X-RateLimit-Reset", String(rateResult.resetAt));

      if (!rateResult.allowed) {
        const retryAfter = Math.ceil(rateResult.resetAt - Date.now() / 1000);
        headers.set("Retry-After", String(Math.max(retryAfter, 1)));
        const resp = errorResponse(
          "RATE_LIMITED",
          `Rate limit exceeded. Try again in ${Math.max(retryAfter, 1)} seconds.`,
          429,
        );
        headers.forEach((v, k) => resp.headers.set(k, v));
        return resp;
      }

      // 3. Call handler
      const resolvedParams = await params;
      const response = await handler(req, {
        userId: authResult.userId,
        keyId: authResult.keyId,
        params: resolvedParams,
      });

      // 4. Attach rate limit headers to success response
      headers.forEach((v, k) => response.headers.set(k, v));
      return response;
    } catch (error) {
      console.error("[API v1] Unhandled error:", error);

      // Zod validation errors
      if (error instanceof Error && error.name === "ZodError") {
        return errorResponse("VALIDATION_ERROR", error.message, 400);
      }

      return errorResponse(
        "INTERNAL_ERROR",
        "An unexpected error occurred",
        500,
      );
    }
  };
}
```

### Usage Pattern in Route Handlers

```typescript
// src/app/api/v1/jobs/route.ts
import { withApiAuth } from "@/lib/api/with-api-auth";
import { paginatedResponse, successResponse } from "@/lib/api/response";
import prisma from "@/lib/db";

export const GET = withApiAuth(async (req, { userId, params }) => {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  // ... Prisma query with userId ...
  return paginatedResponse(data, total, page, perPage);
});

export const POST = withApiAuth(async (req, { userId }) => {
  const body = await req.json();
  // ... validate with Zod, create via Prisma ...
  return successResponse(job, 201);
});
```

### Next.js 15 App Router Compatibility

Next.js 15 passes `params` as a `Promise<Record<string, string>>`. The `withApiAuth` wrapper awaits the params promise and passes the resolved object to the handler, so route handlers receive `ctx.params.id` directly.

---

## 9. Server Actions for API Key CRUD

### `src/actions/publicApiKey.actions.ts`

These actions use `getCurrentUser()` (NextAuth session) because they are called from the Settings UI, not from the public API.

```typescript
"use server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";

// ---- Types ----

interface PublicApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

interface CreateKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  plaintextKey: string;   // shown ONCE
}

// ---- Actions ----

export async function createPublicApiKey(
  name: string,
): Promise<ActionResult<CreateKeyResponse>>

export async function listPublicApiKeys(): Promise<ActionResult<PublicApiKeyResponse[]>>

export async function revokePublicApiKey(
  keyId: string,
): Promise<ActionResult>
```

### Key Generation Algorithm

```typescript
function generateApiKey(): { plaintextKey: string; keyHash: string; keyPrefix: string } {
  const randomBytes = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  const plaintextKey = `jsk_${randomBytes}`;
  const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");
  const keyPrefix = plaintextKey.slice(0, 8); // "jsk_a1b2"
  return { plaintextKey, keyHash, keyPrefix };
}
```

### `createPublicApiKey(name)`

1. Validate `name` is 1-50 chars, non-empty.
2. Count existing active keys for user. Enforce max 5 active keys per user.
3. Generate key via `generateApiKey()`.
4. Insert `PublicApiKey` record with `keyHash`, `keyPrefix`, `name`.
5. Return `{ id, name, keyPrefix, plaintextKey }`.

### `listPublicApiKeys()`

1. Query all `PublicApiKey` records for user, ordered by `createdAt desc`.
2. Return `{ id, name, keyPrefix, createdAt, lastUsedAt, revokedAt }[]`.
3. Never return `keyHash`.

### `revokePublicApiKey(keyId)`

1. Verify key belongs to current user.
2. Set `revokedAt = new Date()`. (Soft delete, preserves audit trail.)
3. Return `{ success: true }`.

---

## 10. Frontend Component Hierarchy

### Integration Point

The Settings page (`src/app/dashboard/settings/page.tsx`) already has a sidebar with sections. A new section `"public-api"` is added.

```
Settings page (page.tsx)
  ├── SettingsSidebar
  │     └── New entry: { id: "public-api", labelKey: "settings.sidebarPublicApi", icon: Globe }
  │
  └── Content area
        └── {activeSection === "public-api" && <PublicApiKeySettings />}
```

### `PublicApiKeySettings.tsx` — Component Tree

```
PublicApiKeySettings
  ├── Header
  │     ├── <h3> t("settings.publicApi")
  │     └── <p> t("settings.publicApiDesc")
  │
  ├── CreateKeyForm (inline, not a dialog)
  │     ├── <Input> name (placeholder: t("settings.publicApiKeyNamePlaceholder"))
  │     └── <Button> t("settings.publicApiCreateKey")
  │
  ├── NewKeyDialog (shown after creation, contains plaintext key)
  │     ├── Alert: t("settings.publicApiKeyWarning") — "Copy this key now. You won't see it again."
  │     ├── <code> with copy-to-clipboard button
  │     └── <Button> t("settings.publicApiKeyDone")
  │
  └── KeysTable
        ├── Table headers: Name | Key Prefix | Created | Last Used | Status | Actions
        └── Table rows (one per key)
              ├── Name column
              ├── Key prefix: <code>jsk_a1b2</code>
              ├── Created: formatDateCompact()
              ├── Last Used: formatDateCompact() or t("settings.publicApiNeverUsed")
              ├── Status: Badge (Active | Revoked)
              └── Actions: RevokeButton (opens AlertDialog confirmation)
```

### State Management

```typescript
const [keys, setKeys] = useState<PublicApiKeyResponse[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [newKeyName, setNewKeyName] = useState("");
const [creating, setCreating] = useState(false);
const [newlyCreatedKey, setNewlyCreatedKey] = useState<CreateKeyResponse | null>(null);
const [revoking, setRevoking] = useState<string | null>(null);
```

### User Flows

**Create Key:**
1. User types name in input.
2. Clicks "Create Key".
3. `createPublicApiKey(name)` called.
4. On success, `newlyCreatedKey` state is set, dialog opens showing plaintext key.
5. User copies key, clicks "Done".
6. Dialog closes, `newlyCreatedKey` is cleared, key list refreshes.

**Revoke Key:**
1. User clicks revoke icon on a key row.
2. AlertDialog appears: "Are you sure? This cannot be undone."
3. User confirms.
4. `revokePublicApiKey(keyId)` called.
5. Key list refreshes, showing key with "Revoked" badge.

---

## 11. i18n Strategy

### New Translation Keys

Added to `src/i18n/dictionaries/settings.ts` under the existing `settings` namespace:

```typescript
// All 4 locales (en shown as reference)
"settings.sidebarPublicApi": "Public API",
"settings.publicApi": "Public API Keys",
"settings.publicApiDesc": "Manage API keys for external access to your JobSync data.",
"settings.publicApiCreateKey": "Create API Key",
"settings.publicApiKeyNameLabel": "Key Name",
"settings.publicApiKeyNamePlaceholder": "e.g., CI Pipeline, Mobile App",
"settings.publicApiKeyCreated": "API key created successfully",
"settings.publicApiKeyWarning": "Copy this key now. You will not be able to see it again.",
"settings.publicApiCopyKey": "Copy Key",
"settings.publicApiKeyCopied": "Key copied to clipboard",
"settings.publicApiKeyDone": "Done",
"settings.publicApiRevokeKey": "Revoke API Key",
"settings.publicApiRevokeKeyDesc": "Are you sure? This key will immediately stop working and cannot be reactivated.",
"settings.publicApiRevoked": "API key revoked",
"settings.publicApiNeverUsed": "Never used",
"settings.publicApiStatusActive": "Active",
"settings.publicApiStatusRevoked": "Revoked",
"settings.publicApiMaxKeysReached": "Maximum of 5 active API keys reached. Revoke an existing key to create a new one.",
"settings.publicApiTableName": "Name",
"settings.publicApiTablePrefix": "Key Prefix",
"settings.publicApiTableCreated": "Created",
"settings.publicApiTableLastUsed": "Last Used",
"settings.publicApiTableStatus": "Status",
"settings.publicApiTableActions": "Actions",
"settings.publicApiNoKeys": "No API keys created yet.",
```

### Pattern

Follows existing convention: keys are prefixed with `settings.publicApi*`, use camelCase, and exist in all 4 locale blocks (en, de, fr, es) within `src/i18n/dictionaries/settings.ts`.

---

## 12. Error Handling Strategy

### Three Layers

1. **Zod Validation** (request parsing)
   - Invalid request bodies or query params are caught at parse time.
   - Response: 400 with `VALIDATION_ERROR` code and the Zod error message.
   - Zod's `safeParse` is used (not `parse`) so errors are handled gracefully.

2. **Business Logic Errors** (resource not found, ownership check)
   - When a Prisma query returns `null` for a resource lookup, return 404.
   - When `job.userId !== ctx.userId`, return 404 (not 403 — prevents enumeration).
   - Response: 404 with `NOT_FOUND` code.

3. **Infrastructure Errors** (Prisma failures, unexpected throws)
   - Caught by the `try/catch` in `withApiAuth`.
   - Prisma-specific errors are logged but returned as generic 500s (no DB details leaked).
   - Response: 500 with `INTERNAL_ERROR` code.

### Error Response Shape (consistent across all errors)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "description must be at least 10 characters"
  }
}
```

### Logging

All errors are logged via `console.error` with the `[API v1]` prefix for easy filtering. The log includes:
- HTTP method + path
- Error type + message
- Key prefix (for attribution without exposing the full key)
- Request ID (if added via middleware in future)

---

## 13. Security Considerations

### 1. Key Storage

- **Never store plaintext keys.** Only the SHA-256 hash is stored in `PublicApiKey.keyHash`.
- **Hash before lookup.** The received key is hashed before the database query, so even if SQL injection were possible, the attacker only sees hashes.
- **Plaintext shown once.** The full key is returned only in the `createPublicApiKey` response. It is never persisted or logged.

### 2. Key Format and Validation

- Keys follow a strict format: `jsk_` prefix + 32 hex characters.
- Format validation happens before the database lookup, preventing unnecessary queries from malformed inputs.
- The `jsk_` prefix enables GitHub secret scanning and `.gitignore` pattern matching.

### 3. Ownership Isolation

- Every Prisma query includes `userId` in the `where` clause.
- A user can never access another user's jobs or notes via the API, even with a valid API key.
- Resource not found and permission denied both return 404 (prevents resource enumeration).

### 4. Rate Limiting

- 60 requests per minute per API key (not per user, per key).
- Prevents brute-force key guessing (an attacker would need to guess the correct 32-hex-char key within the rate limit).
- In-memory store is acceptable for a self-hosted single-instance app. If multi-instance is needed in the future, swap to Redis.

### 5. Revocation

- Revoked keys are rejected immediately on the next request.
- Revocation is irreversible (soft delete via `revokedAt` timestamp).
- The `lastUsedAt` field enables audit of when a key was last active.

### 6. Key Limits

- Maximum 5 active (non-revoked) API keys per user.
- Prevents API key hoarding and limits the attack surface.

### 7. No Session Mixing

- API key auth and NextAuth session auth are completely separate code paths.
- API routes under `/api/v1/*` never call `getCurrentUser()` or `auth()`.
- Settings UI actions (`publicApiKey.actions.ts`) use NextAuth sessions exclusively.

### 8. Transport Security

- The API should only be served over HTTPS in production.
- No CORS headers are set on `/api/v1/*` routes by default (same-origin only). If CORS is needed, it should be explicitly configured per deployment.

### 9. Request Size Limits

- Job description max: 10,000 characters.
- Note content max: 5,000 characters.
- Tag IDs max: 10 per request.
- `perPage` max: 100 (prevents resource exhaustion from large list queries).

### 10. Information Disclosure Prevention

- Prisma errors are not forwarded to the client. Generic messages are returned.
- Stack traces are never included in API responses.
- The `keyHash` is never returned in any API response or server action response.

---

## 14. Testing Strategy

### Unit Tests

| Test File | What It Tests |
|---|---|
| `__tests__/lib/api/auth.spec.ts` | `validateApiKey()` — valid key, missing header, invalid format, revoked key, unknown key |
| `__tests__/lib/api/rate-limit.spec.ts` | Sliding window: allow under limit, reject over limit, window reset, cleanup |
| `__tests__/lib/api/response.spec.ts` | Response helpers: correct HTTP status, envelope shape, header attachment |
| `__tests__/lib/api/with-api-auth.spec.ts` | Wrapper: auth failure passthrough, rate limit headers, error catching |
| `__tests__/actions/publicApiKey.actions.spec.ts` | Create (key format, hash storage, max limit), list (no hash leaks), revoke (soft delete) |

### Integration Tests

| Test File | What It Tests |
|---|---|
| `__tests__/api/v1/jobs.spec.ts` | GET list (pagination, filters, search), POST create (validation, Prisma call) |
| `__tests__/api/v1/jobs-id.spec.ts` | GET detail, PATCH update (partial), DELETE (cascade) |
| `__tests__/api/v1/jobs-notes.spec.ts` | GET notes list, POST create note, ownership check |

### E2E Tests

| Test File | What It Tests |
|---|---|
| `e2e/crud/public-api-keys.spec.ts` | Create key in UI, see it in table, copy key, revoke key, verify revoked badge |

### Dictionary Tests

Validate all `settings.publicApi*` keys exist in all 4 locales with non-empty values.

---

## Appendix A: Response Serialization

### Relation Flattening Convention

The Prisma models use PascalCase relation names (`JobTitle`, `Company`, `Status`). The API response uses camelCase to follow REST conventions:

| Prisma Relation | API Response Key |
|---|---|
| `JobTitle` | `jobTitle` |
| `Company` | `company` |
| `Status` | `status` |
| `Location` | `location` |
| `JobSource` | `jobSource` |
| `Resume` | `resume` |
| `Notes` (count) | `notesCount` |

A `serializeJob(prismaJob)` utility function in `src/lib/api/response.ts` handles this transformation.

---

## Appendix B: Complete Route Handler Example

```typescript
// src/app/api/v1/jobs/[id]/route.ts
import { NextRequest } from "next/server";
import { withApiAuth, type ApiContext } from "@/lib/api/with-api-auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { UpdateJobApiSchema } from "@/lib/api/schemas";
import { serializeJob } from "@/lib/api/response";
import prisma from "@/lib/db";

export const GET = withApiAuth(async (req, { userId, params }) => {
  const job = await prisma.job.findFirst({
    where: { id: params.id, userId },
    include: {
      JobTitle: true,
      Company: true,
      Status: true,
      Location: true,
      JobSource: true,
      Resume: true,
      tags: true,
    },
  });

  if (!job) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  return successResponse(serializeJob(job));
});

export const PATCH = withApiAuth(async (req, { userId, params }) => {
  // Verify ownership
  const existing = await prisma.job.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!existing) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  const body = await req.json();
  const parsed = UpdateJobApiSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.message, 400);
  }

  const { tagIds, dueDate, appliedDate, ...fields } = parsed.data;

  const job = await prisma.job.update({
    where: { id: params.id },
    data: {
      ...fields,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(appliedDate !== undefined ? { appliedDate: appliedDate ? new Date(appliedDate) : null } : {}),
      ...(tagIds !== undefined ? { tags: { set: tagIds.map((id) => ({ id })) } } : {}),
    },
    include: {
      JobTitle: true,
      Company: true,
      Status: true,
      Location: true,
      JobSource: true,
      Resume: true,
      tags: true,
    },
  });

  return successResponse(serializeJob(job));
});

export const DELETE = withApiAuth(async (req, { userId, params }) => {
  const existing = await prisma.job.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!existing) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  await prisma.job.delete({ where: { id: params.id } });
  return successResponse({ deleted: true });
});
```

---

## Appendix C: File Creation Checklist

```
[ ] prisma/schema.prisma                          — Add PublicApiKey model
[ ] prisma/migrations/...                         — Run migration
[ ] src/lib/api/auth.ts                           — API key validation
[ ] src/lib/api/rate-limit.ts                     — Sliding window rate limiter
[ ] src/lib/api/response.ts                       — HTTP response helpers + serializeJob
[ ] src/lib/api/with-api-auth.ts                  — HOF wrapper
[ ] src/lib/api/schemas.ts                        — Zod validation schemas
[ ] src/app/api/v1/jobs/route.ts                  — GET + POST
[ ] src/app/api/v1/jobs/[id]/route.ts             — GET + PATCH + DELETE
[ ] src/app/api/v1/jobs/[id]/notes/route.ts       — GET + POST
[ ] src/actions/publicApiKey.actions.ts            — CRUD actions
[ ] src/components/settings/PublicApiKeySettings.tsx — UI component
[ ] src/app/dashboard/settings/page.tsx            — Add "public-api" section
[ ] src/components/settings/SettingsSidebar.tsx     — Add sidebar entry
[ ] src/i18n/dictionaries/settings.ts              — Add translation keys (4 locales)
[ ] __tests__/lib/api/auth.spec.ts                 — Unit tests
[ ] __tests__/lib/api/rate-limit.spec.ts           — Unit tests
[ ] __tests__/lib/api/response.spec.ts             — Unit tests
[ ] __tests__/actions/publicApiKey.actions.spec.ts  — Unit tests
[ ] __tests__/api/v1/jobs.spec.ts                  — Integration tests
[ ] __tests__/api/v1/jobs-id.spec.ts               — Integration tests
[ ] __tests__/api/v1/jobs-notes.spec.ts            — Integration tests
[ ] e2e/crud/public-api-keys.spec.ts               — E2E test
```
