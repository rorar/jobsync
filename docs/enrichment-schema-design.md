# Data Enrichment Schema Design: EnrichmentResult + EnrichmentLog

**Date:** 2026-04-03
**Scope:** Database schema for Data Enrichment caching and audit trail
**Status:** Design (pre-implementation)

## Current State Analysis

### Company Model

The existing `Company` model already has a `logoUrl` field (optional String). Data Enrichment will populate this field via its pipeline, but the enrichment system itself needs a separate cache layer to avoid redundant API calls and to track which modules produced which results.

```prisma
model Company {
  id              String           @id @default(uuid())
  label           String
  value           String
  logoUrl         String?          // <-- enrichment target for "logo" dimension
  createdBy       String
  user            User             @relation(fields: [createdBy], references: [id])
  // ...
}
```

### Enrichment Architecture Context

Data Enrichment follows the existing Connector Architecture (ACL pattern). Each enrichment dimension (logo, deep-link, review, etc.) may be served by multiple modules in a fallback chain. The cache layer stores successful results to avoid re-fetching within the TTL window.

```
Pipeline Request (companyDomain, dimension)
  --> Check EnrichmentResult cache (fresh? stale? expired?)
    --> If fresh: return cached data
    --> If stale/expired/missing: run module fallback chain
      --> Module 1 (e.g. Clearbit) --> EnrichmentLog entry
      --> Module 2 (e.g. Google Favicon) --> EnrichmentLog entry
      --> First success --> upsert EnrichmentResult, return data
```

### ID Generation Convention

The existing schema uses `uuid()` for all models except `JobStatusHistory` which uses `cuid()` (its CRM schema design document explains the rationale: CUIDs are time-sortable, aligning with append-only audit patterns). The new models follow this precedent:

- **EnrichmentResult** uses `uuid()` -- it is a cache entity, not an append-only log. Rows are upserted (created or replaced), not appended.
- **EnrichmentLog** uses `cuid()` -- it is an append-only audit trail, like `JobStatusHistory`. Time-sortable IDs benefit chronological queries.

### Ownership Pattern

The schema consistently uses `userId` for user-scoped entities (Job, Automation, Note, StagedVacancy, DedupHash, CompanyBlacklist) and `createdBy` for reference data entities (JobTitle, Company, Location, JobSource, Tag). The enrichment tables use `userId` because they are operational data, not reference data.

---

## Schema Additions

### 1. EnrichmentResult Model (New)

Cache table for enrichment results. One row per (userId, dimension, domainKey) combination. Supports TTL-based cache invalidation with status tracking for stale-if-error semantics.

```prisma
model EnrichmentResult {
  id             String    @id @default(uuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id])

  // Cache identity
  dimension      String    // "logo" | "deep_link" | "review" | "contact" | "salary" | "company_profile"
  domainKey      String    // lookup key: company domain for logos, URL for deep-links

  // Optional link to Company aggregate
  companyId      String?
  company        Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)

  // Cache state
  status         String    // "fresh" | "stale" | "expired" | "not_found" | "error"
  data           String    // JSON blob -- dimension-specific result data
  sourceModuleId String    // which module produced this result (e.g. "clearbit", "google-favicon")

  // TTL management
  ttlSeconds     Int       // how long this result is valid
  expiresAt      DateTime  // computed at write time: createdAt + ttlSeconds

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  // Back-relation for audit trail
  logs           EnrichmentLog[]

  @@unique([userId, dimension, domainKey])
  @@index([userId, dimension, status])
  @@index([expiresAt])
  @@index([companyId])
}
```

**Design decisions:**

- **`uuid()` for IDs:** This is a cache entity with upsert semantics, not an append-only log. No benefit from time-sortable IDs.
- **`userId` for IDOR protection:** Different users may receive different enrichment results for the same company (e.g., different API keys, different rate limit states). All queries MUST include `userId` in the WHERE clause.
- **`companyId` is nullable:** Enrichment can happen for a URL (deep-link dimension) without a Company record existing. For logo enrichment, the `companyId` links the cached result to the Company for efficient lookup. `onDelete: SetNull` ensures that deleting a Company does not destroy cached enrichment data -- the cache row remains valid by `domainKey`.
- **`data` as String (not JSON):** SQLite has no native JSON column type. Prisma maps JSON to String for SQLite. Using String explicitly avoids confusion. Application code parses the JSON.
- **`status` as String:** SQLite has no enum type. Application-level validation enforces the allowed values ("fresh", "stale", "expired", "not_found", "error").
- **`expiresAt` is computed at write time:** The application computes `expiresAt = now() + ttlSeconds` when creating or updating the row. This avoids runtime arithmetic in queries -- the cleanup job simply queries `WHERE expiresAt < now()`.
- **`sourceModuleId` is a plain String, not a FK:** Module IDs are defined in manifests (code), not in the database. No `ModuleRegistration` FK is needed because modules can be registered/unregistered without invalidating cached results.
- **`@@unique([userId, dimension, domainKey])`:** Enforces one cached result per user per dimension per lookup key. The upsert operation uses this constraint.
- **No `onDelete: Cascade` on user relation:** Matches the existing pattern (User, Job, Note, etc. do not use Cascade on user FK). If user deletion is added later, a dedicated cleanup job handles orphans.

### 2. EnrichmentLog Model (New)

Append-only audit trail for enrichment attempts. Tracks which module was tried, in what order, and with what outcome. Powers the effectiveness dashboard and debugging.

```prisma
model EnrichmentLog {
  id                 String           @id @default(cuid())
  userId             String
  user               User             @relation(fields: [userId], references: [id])

  // Link to cached result (may not exist yet if all modules failed)
  enrichmentResultId String?
  enrichmentResult   EnrichmentResult? @relation(fields: [enrichmentResultId], references: [id], onDelete: SetNull)

  // Attempt identity
  dimension          String    // "logo" | "deep_link" | "review" | ...
  domainKey          String    // the lookup key that was enriched

  // Module attempt details
  moduleId           String    // which module was attempted (e.g. "clearbit", "google-favicon")
  chainPosition      Int       // position in fallback chain: 1, 2, 3...
  outcome            String    // "success" | "not_found" | "error" | "timeout" | "skipped"
  latencyMs          Int       // how long the module took in milliseconds
  errorMessage       String?   // if error, sanitized message (no secrets)

  createdAt          DateTime  @default(now())

  @@index([userId, dimension, domainKey])
  @@index([moduleId, outcome])
  @@index([createdAt])
}
```

**Design decisions:**

- **`cuid()` for IDs:** Append-only audit log benefits from time-sortable IDs. Matches the `JobStatusHistory` precedent.
- **`enrichmentResultId` is nullable:** If all modules in the chain fail, no `EnrichmentResult` row is created (or the existing one transitions to "error" status). The log entries still record each attempt. `onDelete: SetNull` preserves log entries if the cached result is cleaned up.
- **No `updatedAt`:** This is an append-only table. Rows are never modified after creation.
- **`chainPosition` as Int:** Records the position in the fallback chain (1 = primary module, 2 = first fallback, etc.). This enables effectiveness analysis: "Module X succeeds 80% of the time at position 1, Module Y picks up 15% at position 2."
- **`latencyMs` as Int:** Millisecond precision is sufficient for API call timing. Stored as integer, not float.
- **`errorMessage` is sanitized:** Application code MUST strip credentials, API keys, and internal URLs before storing. Only store the error type and a sanitized message.

### 3. Company Model Extension

Add the back-relation for EnrichmentResult:

```prisma
model Company {
  // ... all existing fields unchanged ...
  enrichmentResults EnrichmentResult[]  // NEW
}
```

No structural changes to the Company model. The existing `logoUrl` field remains the denormalized display value. The enrichment pipeline writes to `logoUrl` on the Company AND creates/updates the `EnrichmentResult` cache row.

### 4. User Model Extension

Add back-relations for both enrichment tables:

```prisma
model User {
  // ... all existing fields unchanged ...
  EnrichmentResult  EnrichmentResult[]   // NEW
  EnrichmentLog     EnrichmentLog[]      // NEW
}
```

---

## Complete Copy-Pasteable Schema Additions

Below is everything that needs to be added/modified in `schema.prisma`. Existing fields are shown only for context; only the lines marked with `// NEW` are additions.

```prisma
// ============================================================
// NEW MODEL: EnrichmentResult (Cache)
// ============================================================

model EnrichmentResult {
  id             String    @id @default(uuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id])

  dimension      String
  domainKey      String

  companyId      String?
  company        Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)

  status         String
  data           String
  sourceModuleId String

  ttlSeconds     Int
  expiresAt      DateTime

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  logs           EnrichmentLog[]

  @@unique([userId, dimension, domainKey])
  @@index([userId, dimension, status])
  @@index([expiresAt])
  @@index([companyId])
}

// ============================================================
// NEW MODEL: EnrichmentLog (Audit Trail)
// ============================================================

model EnrichmentLog {
  id                 String            @id @default(cuid())
  userId             String
  user               User              @relation(fields: [userId], references: [id])

  enrichmentResultId String?
  enrichmentResult   EnrichmentResult? @relation(fields: [enrichmentResultId], references: [id], onDelete: SetNull)

  dimension          String
  domainKey          String

  moduleId           String
  chainPosition      Int
  outcome            String
  latencyMs          Int
  errorMessage       String?

  createdAt          DateTime          @default(now())

  @@index([userId, dimension, domainKey])
  @@index([moduleId, outcome])
  @@index([createdAt])
}

// ============================================================
// MODIFIED MODEL: User -- add back-relations
// ============================================================

model User {
  // ... all existing fields unchanged ...
  EnrichmentResult  EnrichmentResult[]   // NEW
  EnrichmentLog     EnrichmentLog[]      // NEW
}

// ============================================================
// MODIFIED MODEL: Company -- add back-relation
// ============================================================

model Company {
  // ... all existing fields unchanged ...
  enrichmentResults EnrichmentResult[]   // NEW
}
```

---

## Index Justification

### EnrichmentResult Indexes

| Index | Query Pattern | Justification |
|---|---|---|
| `@@unique([userId, dimension, domainKey])` | Cache lookup: "Get logo enrichment for domain example.com for user X" | THE primary access pattern. Every cache check hits this unique index. Also serves as the upsert constraint -- `prisma.enrichmentResult.upsert({ where: { userId_dimension_domainKey: { ... } } })`. |
| `@@index([userId, dimension, status])` | Refresh query: "Find all stale logo results for user X" | Background refresh job queries for results approaching expiration. The three-column index lets SQLite satisfy `WHERE userId = ? AND dimension = ? AND status = 'stale'` with a single range scan. |
| `@@index([expiresAt])` | Cleanup query: "Delete all expired results older than 30 days" | Global cleanup job (not user-scoped) that prunes expired cache entries. Runs periodically (e.g., daily). Single-column index is sufficient because this query does not filter by userId -- it is a maintenance operation. |
| `@@index([companyId])` | Company detail: "Get all enrichment results for company X" | When displaying a company detail page, fetch all enrichment dimensions at once. Also needed for cleanup when a Company is deleted (though `onDelete: SetNull` handles the FK, the application may want to proactively delete orphaned cache rows). |

### EnrichmentLog Indexes

| Index | Query Pattern | Justification |
|---|---|---|
| `@@index([userId, dimension, domainKey])` | Audit trail: "Show all enrichment attempts for domain example.com logo for user X" | Debugging view: when an enrichment result seems wrong, inspect the full fallback chain execution. Also powers a "why did this fail?" diagnostic panel. |
| `@@index([moduleId, outcome])` | Effectiveness dashboard: "What is the success rate for clearbit across all dimensions?" | Module effectiveness analysis. Not user-scoped because this is an admin/system-level metric. Enables queries like `GROUP BY moduleId, outcome` for bar charts. |
| `@@index([createdAt])` | Retention: "Delete all log entries older than 90 days" | Time-based cleanup for the audit log. Without this, the retention job would do a full table scan. Also supports "recent activity" queries for the dashboard. |

### Why NOT Additional Indexes

- **`[userId]` alone on EnrichmentResult:** Already covered by the leftmost prefix of `@@unique([userId, dimension, domainKey])` and `@@index([userId, dimension, status])`. SQLite can use leftmost prefix matching.
- **`[dimension]` alone:** Never queried without `userId` (IDOR invariant). A bare dimension index would only serve cross-user queries, which are not permitted for cache data.
- **`[sourceModuleId]` on EnrichmentResult:** Rarely queried. Module effectiveness is tracked via EnrichmentLog, not the cache table. Adding this index would add write overhead with no read benefit.
- **`[enrichmentResultId]` on EnrichmentLog:** The back-relation from EnrichmentResult to logs is used infrequently (only in diagnostic views). Prisma does not require an explicit index for the FK, and the query volume does not justify one. If diagnostic queries become slow, add this index later.
- **`[userId, createdAt]` on EnrichmentLog:** The `[userId, dimension, domainKey]` index already covers user-scoped queries. Time-ordered queries for a specific user are rare enough to not warrant a dedicated index.

---

## Relation Diagram

```
  User (1)
  |
  +------< EnrichmentResult (N)      -- userId FK, IDOR protection
  |        |
  |        +------< EnrichmentLog (N) -- enrichmentResultId FK (optional)
  |        |
  |        +------> Company (0..1)    -- companyId FK (optional, SetNull)
  |
  +------< EnrichmentLog (N)          -- userId FK, IDOR protection
  |
  +------< Company (N)               -- createdBy FK (existing)
           |
           +------< EnrichmentResult (N) -- companyId FK (back-relation)
```

**Cardinalities:**

- User 1 : N EnrichmentResult (one user has many cached results)
- User 1 : N EnrichmentLog (one user has many audit entries)
- EnrichmentResult 1 : N EnrichmentLog (one cached result can have many attempt logs)
- Company 1 : N EnrichmentResult (one company can have results across dimensions)
- EnrichmentResult N : 0..1 Company (a result may or may not link to a company)
- EnrichmentLog N : 0..1 EnrichmentResult (a log entry may or may not link to a result)

---

## Data Field Schemas

The `data` field on EnrichmentResult stores dimension-specific JSON. Application code MUST validate the parsed JSON against these shapes using Zod schemas (defined in the enrichment module, not in Prisma).

### Logo Dimension

```typescript
// Stored in data field as JSON string
interface LogoData {
  logoUrl: string;       // absolute URL to the logo image
  width?: number;        // pixel width (if known)
  height?: number;       // pixel height (if known)
  format?: string;       // "png" | "svg" | "ico" | "jpg"
}
```

**Example:** `{"logoUrl":"https://logo.clearbit.com/stripe.com","width":128,"height":128,"format":"png"}`

### DeepLink Dimension

```typescript
interface DeepLinkData {
  title?: string;        // og:title or <title>
  description?: string;  // og:description or meta description
  image?: string;        // og:image URL
  siteName?: string;     // og:site_name
  favicon?: string;      // favicon URL
}
```

**Example:** `{"title":"Software Engineer - Stripe","description":"Join our team...","image":"https://...","siteName":"Stripe Jobs"}`

### Review Dimension (Future)

```typescript
interface ReviewData {
  rating?: number;       // aggregate rating (1.0 - 5.0)
  reviewCount?: number;  // total number of reviews
  source: string;        // "glassdoor" | "kununu" | "indeed"
  profileUrl?: string;   // URL to the company's review profile
}
```

### Contact Dimension (Future)

```typescript
interface ContactData {
  email?: string;        // general contact email
  phone?: string;        // general phone number
  website?: string;      // company website URL
  linkedIn?: string;     // LinkedIn company page URL
}
```

### Salary Dimension (Future)

```typescript
interface SalaryData {
  median?: number;       // median salary in EUR
  min?: number;          // lower bound
  max?: number;          // upper bound
  currency: string;      // ISO 4217 currency code
  source: string;        // "glassdoor" | "levels.fyi" | "kununu"
  role?: string;         // the role this salary applies to
}
```

### CompanyProfile Dimension (Future)

```typescript
interface CompanyProfileData {
  industry?: string;     // industry classification
  size?: string;         // employee count range (e.g. "51-200")
  founded?: number;      // founding year
  headquarters?: string; // HQ location
  description?: string;  // short company description
  techStack?: string[];  // known technologies (stored as JSON array)
}
```

---

## SQLite-Specific Considerations

### No Native Enum Type

SQLite stores all values as TEXT. The dimension, status, and outcome fields are plain Strings with application-level validation. Zod schemas at the server action boundary enforce valid values:

```typescript
const DimensionEnum = z.enum([
  "logo", "deep_link", "review", "contact", "salary", "company_profile"
]);

const CacheStatusEnum = z.enum([
  "fresh", "stale", "expired", "not_found", "error"
]);

const OutcomeEnum = z.enum([
  "success", "not_found", "error", "timeout", "skipped"
]);
```

### No Native JSON Type

The `data` field is a plain String. Prisma does not support `Json` scalar for SQLite. Application code:

1. Serializes with `JSON.stringify()` before writing
2. Parses with `JSON.parse()` after reading
3. Validates the parsed object against the dimension-specific Zod schema

SQLite's `json_extract()` function is available for raw SQL queries but should be avoided in normal application code (use Prisma, parse in TypeScript).

### DateTime as ISO String

SQLite stores DateTime values as ISO 8601 strings. Prisma handles the conversion transparently. The `expiresAt` field stores an absolute timestamp, not a duration. Comparison queries (`WHERE expiresAt < datetime('now')`) work correctly with ISO string ordering because ISO 8601 is lexicographically sortable.

### No Partial Indexes

SQLite does not support partial indexes (e.g., `WHERE status = 'stale'`). The `@@index([userId, dimension, status])` index covers all status values. Queries filtering for a specific status use the full index with an equality predicate on the third column.

### No Array Types

The `CompanyProfileData.techStack` field (future) is stored as a JSON array within the `data` JSON string. There is no separate normalized table for tech stack items. If querying by tech stack becomes a requirement, a separate `CompanyTechStack` junction table should be added at that time.

### Transaction Isolation

SQLite uses serializable isolation by default (single-writer). The upsert pattern for EnrichmentResult is safe without explicit locking:

```typescript
await prisma.enrichmentResult.upsert({
  where: {
    userId_dimension_domainKey: {
      userId: user.id,
      dimension: "logo",
      domainKey: "stripe.com",
    },
  },
  create: { /* full row */ },
  update: { /* updated fields */ },
});
```

SQLite's write lock ensures no concurrent upsert can create a duplicate.

---

## Migration Strategy

### Step 1: Generate Migration

```bash
npx prisma migrate dev --name add-enrichment-tables
```

This creates:
- `EnrichmentResult` table with all columns and indexes
- `EnrichmentLog` table with all columns and indexes
- FK constraints for user, company, and enrichmentResult relations

### Step 2: No Data Migration Required

These are new tables with no existing data to backfill. The `Company.logoUrl` field remains unchanged -- the enrichment pipeline will populate it alongside the cache when enrichment runs.

### Step 3: Verify

```bash
npx prisma generate   # regenerate client
npx prisma validate   # check schema consistency
```

### Step 4: Application Constants

Files to create/update after migration:

| File | Change |
|---|---|
| `src/lib/connector/data-enrichment/types.ts` | Define `EnrichmentDimension`, `CacheStatus`, `EnrichmentOutcome` enums + Zod schemas |
| `src/actions/enrichment.actions.ts` | Server actions for cache lookup, upsert, cleanup |
| `src/lib/connector/data-enrichment/cache-manager.ts` | Cache check/refresh logic using EnrichmentResult |

---

## Query Patterns

### 1. Cache Lookup (Hot Path)

The most frequent query. Called before every enrichment attempt.

```typescript
async function getCachedResult(
  userId: string,
  dimension: string,
  domainKey: string,
): Promise<EnrichmentResult | null> {
  return prisma.enrichmentResult.findUnique({
    where: {
      userId_dimension_domainKey: {
        userId,
        dimension,
        domainKey,
      },
    },
  });
}
```

Returns the cached row. Caller inspects `status` and `expiresAt` to decide whether to use the cached data, refresh it, or run the module chain.

### 2. Cache Upsert (After Successful Enrichment)

```typescript
async function upsertEnrichmentResult(
  userId: string,
  dimension: string,
  domainKey: string,
  data: Record<string, unknown>,
  sourceModuleId: string,
  ttlSeconds: number,
  companyId?: string,
): Promise<EnrichmentResult> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  return prisma.enrichmentResult.upsert({
    where: {
      userId_dimension_domainKey: { userId, dimension, domainKey },
    },
    create: {
      userId,
      dimension,
      domainKey,
      companyId: companyId ?? null,
      status: "fresh",
      data: JSON.stringify(data),
      sourceModuleId,
      ttlSeconds,
      expiresAt,
    },
    update: {
      status: "fresh",
      data: JSON.stringify(data),
      sourceModuleId,
      ttlSeconds,
      expiresAt,
    },
  });
}
```

### 3. Stale Detection (Background Refresh Job)

Find results approaching expiration for proactive refresh.

```typescript
async function findStaleResults(
  userId: string,
  dimension?: string,
): Promise<EnrichmentResult[]> {
  const now = new Date();

  return prisma.enrichmentResult.findMany({
    where: {
      userId,
      ...(dimension ? { dimension } : {}),
      expiresAt: { lte: now },
      status: { in: ["fresh", "stale"] },
    },
    orderBy: { expiresAt: "asc" },
  });
}
```

Uses index `[userId, dimension, status]` for the filtered query and `[expiresAt]` for the unfiltered cleanup variant.

### 4. Log Enrichment Attempt

```typescript
async function logEnrichmentAttempt(
  userId: string,
  enrichmentResultId: string | null,
  dimension: string,
  domainKey: string,
  moduleId: string,
  chainPosition: number,
  outcome: string,
  latencyMs: number,
  errorMessage?: string,
): Promise<void> {
  await prisma.enrichmentLog.create({
    data: {
      userId,
      enrichmentResultId,
      dimension,
      domainKey,
      moduleId,
      chainPosition,
      outcome,
      latencyMs,
      errorMessage: errorMessage ?? null,
    },
  });
}
```

### 5. Module Effectiveness Query (Dashboard)

```typescript
async function getModuleEffectiveness(): Promise<ModuleStats[]> {
  // Raw query for GROUP BY aggregation (Prisma groupBy is limited)
  const stats = await prisma.enrichmentLog.groupBy({
    by: ["moduleId", "outcome"],
    _count: { id: true },
    _avg: { latencyMs: true },
  });

  return stats;
}
```

Uses index `[moduleId, outcome]` for the GROUP BY scan.

### 6. Retention Cleanup

```typescript
async function cleanupExpiredResults(maxAgeDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  const { count } = await prisma.enrichmentResult.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
      status: "expired",
    },
  });

  return count;
}

async function cleanupOldLogs(maxAgeDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  const { count } = await prisma.enrichmentLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });

  return count;
}
```

---

## Cache Lifecycle

### Status Transitions

```
                   +-- TTL expires --> [expired] -- cleanup job --> (deleted)
                   |
[missing] -- module success --> [fresh] --+
                                   ^      |
                                   |      +-- background refresh success --> [fresh]
                                   |      |
                                   |      +-- background refresh fails --> [stale]
                                   |                                        |
                                   |                                        +-- serves stale data
                                   |                                        |   (stale-if-error)
                                   |                                        |
                                   +--- manual refresh success -------------+

[missing] -- all modules fail --> [error] -- retry after backoff --> [fresh] or [error]

[missing] -- all modules return 404 --> [not_found] -- TTL expires --> (retry or delete)
```

### TTL Values (Recommended Defaults)

| Dimension | TTL | Rationale |
|---|---|---|
| logo | 7 days (604800s) | Logos change rarely. Low API cost to refresh weekly. |
| deep_link | 24 hours (86400s) | Job postings change frequently. Metadata (og:tags) may update. |
| review | 7 days (604800s) | Review aggregates update slowly. |
| contact | 30 days (2592000s) | Company contact info is stable. |
| salary | 30 days (2592000s) | Salary data updates quarterly at most. |
| company_profile | 14 days (1209600s) | Company metadata changes infrequently. |

---

## Open Design Questions

### Q1: Should EnrichmentResult be shared across users?

**Current design: No.** Each user has their own cache rows. This ensures IDOR protection and allows per-user enrichment (e.g., different API keys may yield different results). The trade-off is duplicate cached data if multiple users track the same company.

**If sharing is needed later:** Add a `SharedEnrichmentResult` table without `userId` for system-level caching (logos, public company profiles). User-specific dimensions (salary for a specific role) remain user-scoped.

### Q2: Should the `data` field have a max length?

**Recommendation: Yes, enforce at application level.** Most enrichment data is small (< 1KB). The Zod validation schema should enforce a max string length (e.g., 10KB) to prevent abuse. SQLite has no native column-level length constraint for TEXT, so this must be application-enforced.

### Q3: Should expired results be deleted or kept for analytics?

**Current design: Keep with "expired" status, delete after retention period.** The retention cleanup job (Q6 in Query Patterns) deletes results older than the retention threshold (e.g., 30 days past expiration). This gives the background refresh job time to proactively refresh before data is lost.

### Q4: Should EnrichmentLog support batch inserts?

**Not in Phase 1.** If a fallback chain tries 3 modules, it creates 3 individual log entries. If profiling shows this is a write bottleneck, add a batch insert helper using `prisma.enrichmentLog.createMany()`.

### Q5: Relation naming pattern

Following existing codebase conventions: back-relations on User use PascalCase (`EnrichmentResult`, `EnrichmentLog`), forward relations on child models use camelCase (`user`, `company`, `enrichmentResult`). The `logs` relation on EnrichmentResult uses camelCase because it is a child collection (same pattern as `Job.tags`, `Automation.runs`).
