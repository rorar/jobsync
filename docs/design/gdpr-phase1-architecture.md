# GDPR Sprint Phase 1 -- Architecture Design

**Date:** 2026-05-13
**Author:** Architecture Agent
**Scope:** S2 (User Data Export), S3 (Resume PII Stripping), S4 (Retention Policies)

---

## Table of Contents

1. [S2 -- User Data Export](#s2----user-data-export)
2. [S3 -- Resume PII Stripping](#s3----resume-pii-stripping)
3. [S4 -- Retention Policies](#s4----retention-policies)
4. [Cross-Cutting Concerns](#cross-cutting-concerns)
5. [i18n Keys](#i18n-keys)
6. [File Inventory](#file-inventory)

---

## S2 -- User Data Export

### Overview

GDPR Art. 20 right to data portability. Users download a ZIP archive containing all their personal data in machine-readable format (JSON). The archive streams directly to the client without buffering the full ZIP in memory.

### API Design

#### Server Action: `exportUserData()`

**File:** `src/actions/export.actions.ts` (new)

```typescript
"use server";

import { getCurrentUser } from "@/lib/auth";
import { checkExportRateLimit } from "@/lib/export-rate-limit";

export async function exportUserData(): Promise<ActionResult<{ downloadUrl: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const rateCheck = checkExportRateLimit(user.id);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: "RATE_LIMITED",
      data: { retryAfterMs: rateCheck.retryAfterMs },
    };
  }

  // Return the download URL -- the actual streaming happens in the API route
  return { success: true, data: { downloadUrl: "/api/users/export" } };
}
```

**Decision:** The server action validates auth + rate limit and returns a download URL. The actual ZIP streaming happens in the API route because server actions cannot return streaming responses. This follows the same separation used by `src/app/api/jobs/export/route.ts` (CSV export).

**Why not just call the API route directly?** The server action provides the rate limit pre-check with structured feedback (retryAfterMs) that the UI needs to show a countdown. The API route also checks rate limits (defense in depth) but returns a generic 429.

#### API Route: `GET /api/users/export`

**File:** `src/app/api/users/export/route.ts` (new)

```typescript
export const GET = async () => {
  // 1. Auth check (session via auth())
  // 2. Rate limit check (defense in depth -- same limiter as server action)
  // 3. Collect all user data (parallel Prisma queries)
  // 4. Stream ZIP via archiver
  // 5. Return NextResponse with streaming body
};
```

**Request:** `GET /api/users/export` -- no query params needed, user ID comes from session.

**Response:** Streaming ZIP (`Content-Type: application/zip`, `Content-Disposition: attachment; filename="jobsync-export-{date}.zip"`)

**Error responses:**
- `401` -- Not authenticated
- `429` -- Rate limited (`Retry-After` header in seconds)
- `500` -- Internal error (generic message, no PII leakage)

### ZIP Archive Structure

```
jobsync-export-2026-05-13/
  metadata.json          -- GDPR-mandated export metadata
  profile/
    user.json            -- User record (name, email, createdAt)
    settings.json        -- UserSettings
    resumes.json         -- All resumes with sections, contact info, education, work experience
  jobs/
    jobs.json            -- All jobs with titles, companies, locations, statuses
    notes.json           -- All job notes
    tags.json            -- All tags
    questions.json       -- Interview questions
  automations/
    automations.json     -- Automation configurations
  crm/
    persons.json         -- CRM contacts
    interviews.json      -- CRM interviews
    tasks.json           -- CRM tasks
    notes.json           -- CRM notes
    activity-log.json    -- CRM activity log
    blocklist.json       -- CRM blocklist entries
  notifications/
    notifications.json   -- All notifications
  integrations/
    webhook-endpoints.json  -- Webhook endpoints (secrets EXCLUDED)
    staged-vacancies.json   -- Staged vacancies
```

#### `metadata.json` (GDPR-mandated)

```json
{
  "exportVersion": "1.0",
  "exportedAt": "2026-05-13T14:30:00.000Z",
  "userId": "uuid",
  "dataController": "Self-hosted JobSync instance",
  "purposes": [
    "Job application tracking",
    "Automated job discovery",
    "Resume analysis",
    "CRM contact management"
  ],
  "retentionPolicy": {
    "jobs": "Retained until manual deletion or account deletion",
    "automations": "Retained until manual deletion or account deletion",
    "crm": "Auto-created persons expire per retentionExpiresAt; manual persons retained until deletion",
    "notifications": "90 days (configurable via retention cron)",
    "stagedVacancies": "30 days (configurable via retention cron)",
    "activityLog": "180 days (configurable via retention cron)"
  },
  "recipients": [
    "AI providers (OpenAI, DeepSeek) -- resume text for matching/review, only when user triggers analysis",
    "Job discovery APIs (EURES, Arbeitsagentur, JSearch) -- search keywords only, no PII",
    "Enrichment services (Logo.dev, Google Favicon) -- company domains only, no PII"
  ],
  "rightsExercised": {
    "export": "This file",
    "deletion": "Settings > Danger Zone > Delete Account",
    "rectification": "Edit data directly in the application"
  }
}
```

### Service Layer: Data Collection

**File:** `src/lib/export/collect-user-data.ts` (new, `import "server-only"`)

```typescript
export interface UserExportData {
  metadata: GdprMetadata;
  profile: {
    user: UserExport;
    settings: UserSettingsExport | null;
    resumes: ResumeExport[];
  };
  jobs: {
    jobs: JobExport[];
    notes: NoteExport[];
    tags: TagExport[];
    questions: QuestionExport[];
  };
  automations: {
    automations: AutomationExport[];
  };
  crm: {
    persons: PersonExport[];
    interviews: CrmInterviewExport[];
    tasks: CrmTaskExport[];
    notes: CrmNoteExport[];
    activityLog: CrmActivityLogExport[];
    blocklist: CrmBlocklistExport[];
  };
  notifications: {
    notifications: NotificationExport[];
  };
  integrations: {
    webhookEndpoints: WebhookEndpointExport[];
    stagedVacancies: StagedVacancyExport[];
  };
}

export async function collectUserData(userId: string): Promise<UserExportData>;
```

**Implementation strategy:** Parallel Prisma queries grouped by aggregate, same as `executeAccountDeletion` but SELECT instead of DELETE. Every query includes `userId` in the `where` clause (ADR-015 IDOR).

**Data sanitization rules:**
- Encrypted fields (SMTP password, webhook secrets, VAPID keys, API keys) are EXCLUDED -- never export secrets
- `WebhookEndpoint.secret` replaced with `"[encrypted -- not exported]"`
- `ApiKey.encryptedKey` and `ApiKey.iv` excluded entirely
- `SmtpConfig.password` excluded
- Internal IDs (`userId` foreign keys) included for referential integrity but are the user's own IDs
- `File.filePath` excluded (server-internal path, not useful to user)

### Streaming Architecture

**File:** `src/lib/export/stream-zip.ts` (new, `import "server-only"`)

```typescript
import archiver from "archiver";

export function createExportZipStream(data: UserExportData): ReadableStream;
```

**Pattern:** Follows `src/app/api/jobs/export/route.ts` (CSV streaming via PassThrough + Readable.toWeb):

```
collectUserData(userId)
  --> UserExportData object (in-memory, all JSON)
  --> archiver.create("zip", { zlib: { level: 6 } })
  --> append each JSON file as buffer to archive
  --> pipe archiver to PassThrough
  --> Readable.toWeb(passThrough) as ReadableStream
  --> NextResponse(webStream)
```

**Why not stream data collection too?** The JSON files are small enough per-user (< 10MB typical) that collecting first, then streaming the ZIP is simpler and avoids partial-archive corruption on query failure. The ZIP itself streams to the client (no 10MB buffer held in the response), but the data is collected fully before archiving starts. This matches the existing CSV export pattern.

### Rate Limiting

**File:** `src/lib/export-rate-limit.ts` (new)

Follows `src/lib/email-rate-limit.ts` pattern exactly:

```typescript
const EXPORT_WINDOW_MS = 3_600_000; // 1 hour
const EXPORT_MAX_PER_WINDOW = 1;    // 1 export per hour

// globalThis singleton store (survives HMR)
// slidingWindowCheck() reused pattern
// Periodic cleanup every 5 minutes

export function checkExportRateLimit(userId: string): ExportRateLimitResult;
export function resetExportRateLimitStore(): void; // for testing
```

**Interface:**
```typescript
export interface ExportRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}
```

### Frontend Architecture

#### Component: `DataExportSettings.tsx`

**File:** `src/components/settings/DataExportSettings.tsx` (new)

Rendered inside `PrivacySecuritySettings.tsx` as a sub-section (NOT a new sidebar item -- it belongs under Privacy & Security conceptually).

```
PrivacySecuritySettings
  |-- Audit trail toggle (existing)
  |-- Email confirmation toggle (existing)
  |-- Cooling-off period select (existing)
  |-- DataExportSettings (NEW -- inserted before cooling-off or after email confirmation)
```

**Component structure:**

```tsx
export default function DataExportSettings() {
  // State
  const [isExporting, setIsExporting] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Countdown timer effect (decrements cooldownMs every second)

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const result = await exportUserData(); // server action
      if (!result.success) {
        if (result.error === "RATE_LIMITED") {
          setCooldownMs(result.data.retryAfterMs);
          return;
        }
        throw new Error(result.error);
      }
      // Trigger download via hidden anchor
      window.location.href = result.data.downloadUrl;
    } catch (err) {
      setError(t("settings.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label>{t("settings.exportTitle")}</Label>
          <Badge variant="secondary">GDPR Art. 20</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("settings.exportDesc")}
        </p>
      </div>
      <Button
        onClick={handleExport}
        disabled={isExporting || cooldownMs > 0}
        variant="outline"
      >
        {isExporting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {cooldownMs > 0
          ? t("settings.exportCooldown", { seconds: Math.ceil(cooldownMs / 1000) })
          : t("settings.exportButton")}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

**State management:** Local component state only. No global store needed. The download is a one-shot action with cooldown feedback.

**Download mechanism:** `window.location.href = "/api/users/export"` triggers the browser's native download dialog. This works because the API route returns `Content-Disposition: attachment`. No fetch + blob needed.

---

## S3 -- Resume PII Stripping

### Overview

When sending resume/job text to cloud AI providers (OpenAI, DeepSeek), strip personally identifiable information. Local providers (Ollama) can receive full text since data never leaves the machine.

### Manifest Change: `isLocal` on `AiManifest`

**File:** `src/lib/connector/manifest.ts`

```typescript
export interface AiManifest extends ModuleManifest {
  connectorType: ConnectorType.AI_PROVIDER;
  modelSelection: ModelSelectionConfig;
  /** Whether this module runs locally (data never leaves the machine) */
  isLocal: boolean;
}
```

**Manifest updates:**

| Module | File | `isLocal` |
|--------|------|-----------|
| Ollama | `src/lib/connector/ai-provider/modules/ollama/manifest.ts` | `true` |
| OpenAI | `src/lib/connector/ai-provider/modules/openai/manifest.ts` | `false` |
| DeepSeek | `src/lib/connector/ai-provider/modules/deepseek/manifest.ts` | `false` |

### PII Stripping Utilities

**File:** `src/lib/connector/ai-provider/tools/pii-strip.ts` (new)

Two separate functions with different strategies:

#### `stripContactPii(text: string): string`

For resume text. Replaces structured contact fields with GDPR-safe placeholders:

```typescript
export function stripContactPii(text: string): string {
  let result = text;

  // Name line: "Name: John Doe" --> "Name: [NAME]"
  result = result.replace(/^Name:\s*.+$/m, "Name: [NAME]");

  // Email: any email pattern --> [EMAIL]
  result = result.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL]"
  );

  // Phone: international and local formats --> [PHONE]
  result = result.replace(
    /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g,
    "[PHONE]"
  );

  // Address line: "Address: ..." --> "Address: [ADDRESS]"
  result = result.replace(/^Address:\s*.+$/m, "Address: [ADDRESS]");

  // Headline is kept -- it's professional identity, not PII per se

  return result;
}
```

**Why structured replacement instead of NER?** The resume text comes from `convertResumeToText()` which produces known-format lines (`Name:`, `Email:`, `Phone:`, `Address:`). Regex on known structure is deterministic, fast, and has no external dependencies. NER models would add latency, a new dependency, and non-deterministic behavior.

#### `stripEmailPhonePatterns(text: string): string`

For job description text. Strips contact patterns that occasionally appear in job listings:

```typescript
export function stripEmailPhonePatterns(text: string): string {
  let result = text;

  // Email addresses
  result = result.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL]"
  );

  // Phone numbers (same pattern as above)
  result = result.replace(
    /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g,
    "[PHONE]"
  );

  return result;
}
```

### Preprocessing Pipeline Modification

**File:** `src/lib/connector/ai-provider/tools/preprocessing.ts`

`convertResumeToText` gains an optional options parameter:

```typescript
export interface ConvertResumeOptions {
  /** Strip PII (name, email, phone, address) for cloud providers */
  stripPii?: boolean;
}

export const convertResumeToText = (
  resume: Resume,
  options?: ConvertResumeOptions,
): Promise<string> => {
  return new Promise((resolve) => {
    // ... existing formatting logic (unchanged) ...

    let text = parts.join("\n\n");

    if (options?.stripPii) {
      text = stripContactPii(text);
    }

    return resolve(text);
  });
};
```

**File:** `src/lib/connector/ai-provider/tools/preprocessing-job.ts`

Similar optional stripping:

```typescript
export interface ConvertJobOptions {
  /** Strip email/phone patterns for cloud providers */
  stripPii?: boolean;
}

export const convertJobToText = (
  job: JobResponse,
  options?: ConvertJobOptions,
): Promise<string> => {
  return new Promise((resolve) => {
    // ... existing formatting logic (unchanged) ...

    let text = jobText;

    if (options?.stripPii) {
      text = stripEmailPhonePatterns(text);
    }

    return resolve(text);
  });
};
```

`preprocessResume` and `preprocessJob` also gain the options passthrough:

```typescript
export const preprocessResume = async (
  resume: Resume,
  options?: ConvertResumeOptions,
): Promise<PreprocessingResult> => {
  // ... existing logic ...
  const rawText = await convertResumeToText(resume, options);
  // ... rest unchanged ...
};

export const preprocessJob = async (
  job: JobResponse,
  options?: ConvertJobOptions,
): Promise<JobPreprocessingResult> => {
  // ... existing logic ...
  const rawText = await convertJobToText(job, options);
  // ... rest unchanged ...
};
```

### Route Handler Integration

Both route handlers need to resolve `isLocal` from the module manifest and pass it to preprocessing.

**File:** `src/app/api/ai/resume/match/route.ts`

```typescript
// NEW: import registry to check isLocal
import { moduleRegistry } from "@/lib/connector/registry";
import type { AiManifest } from "@/lib/connector/manifest";

export const POST = async (req: NextRequest) => {
  // ... existing auth + rate limit ...

  const { resumeId, jobId, selectedModel } = /* ... */;

  // NEW: Determine if PII stripping is needed
  const registered = moduleRegistry.get(selectedModel.moduleId);
  const isLocal = (registered?.manifest as AiManifest)?.isLocal ?? false;
  const stripPii = !isLocal;

  // ... existing data fetching ...

  const [resumePreprocessResult, jobPreprocessResult] = await Promise.all([
    preprocessResume(resume as Resume, { stripPii }),
    preprocessJob(job as JobResponse, { stripPii }),
  ]);

  // ... rest unchanged ...
};
```

**File:** `src/app/api/ai/resume/review/route.ts`

```typescript
// Same pattern
const registered = moduleRegistry.get(selectedModel.moduleId);
const isLocal = (registered?.manifest as AiManifest)?.isLocal ?? false;
const stripPii = !isLocal;

const preprocessResult = await preprocessResume(resume, { stripPii });
// ... rest unchanged ...
```

### TEXT_LIMITS Application

The existing `TEXT_LIMITS` from `src/lib/connector/ai-provider/config.ts` are already defined:

```typescript
export const TEXT_LIMITS = {
  OLLAMA: { RESUME: 1500, JOB: 1200 },
  CLOUD:  { RESUME: 4000, JOB: 3500 },
};
```

These limits should be applied AFTER PII stripping in the preprocessing pipeline. The route handlers should truncate the normalized text before building the prompt:

```typescript
// In match/route.ts, after preprocessing succeeds:
const limits = isLocal ? TEXT_LIMITS.OLLAMA : TEXT_LIMITS.CLOUD;
const resumeText = resumePreprocessResult.data.normalizedText.slice(0, limits.RESUME);
const jobText = jobPreprocessResult.data.normalizedText.slice(0, limits.JOB);
```

**Note:** If TEXT_LIMITS are already applied elsewhere in the prompt builders (`buildJobMatchPrompt`, `buildResumeReviewPrompt`), this truncation should happen there instead of in the route handler. Verify during implementation which layer currently owns truncation.

### Barrel Export Updates

**File:** `src/lib/connector/ai-provider/index.ts`

Add new exports:

```typescript
// PII stripping utilities
export { stripContactPii, stripEmailPhonePatterns } from "./tools/pii-strip";

// Updated type exports
export type { ConvertResumeOptions } from "./tools/preprocessing";
export type { ConvertJobOptions } from "./tools/preprocessing-job";
```

---

## S4 -- Retention Policies

### Overview

Automated cleanup cron that purges stale data according to configurable retention rules. Runs on its own schedule, separate from `crm-cron.ts` (bounded context separation: CRM temporal rules vs. GDPR data lifecycle rules).

### Configuration

**File:** `src/lib/scheduler/retention-config.ts` (new)

```typescript
export const RETENTION_CONFIG = {
  /** Read notifications older than this are deleted */
  NOTIFICATION_READ_DAYS: 90,
  /** Unread notifications older than this are deleted */
  NOTIFICATION_UNREAD_DAYS: 180,
  /** Staged vacancies older than this are deleted (regardless of status) */
  STAGED_VACANCY_DAYS: 30,
  /** Automation runs older than this are deleted */
  AUTOMATION_RUN_DAYS: 90,
  /** Enrichment logs older than this are deleted */
  ENRICHMENT_LOG_DAYS: 90,
  /** CRM activity log entries older than this are deleted */
  CRM_ACTIVITY_LOG_DAYS: 180,
  /** Admin audit log entries older than this are deleted */
  ADMIN_AUDIT_LOG_DAYS: 365,
  /** Dedup hashes older than this are deleted (prevents unbounded growth) */
  DEDUP_HASH_DAYS: 90,
} as const;
```

**Design decision:** Constants, not database-configurable. Reason: retention periods are operational policy, not user preference. If per-user configurability is needed later, promote to `UserSettings` fields. For now, constants keep the implementation simple and auditable.

### Cron Job

**File:** `src/lib/scheduler/retention-cron.ts` (new)

Follows `crm-cron.ts` pattern exactly:

```typescript
import "server-only";
import cron, { type ScheduledTask } from "node-cron";
import prisma from "@/lib/db";
import { debugLog, debugError } from "@/lib/debug";
import { RETENTION_CONFIG } from "./retention-config";

// globalThis guard (survives HMR)
const RETENTION_CRON_KEY = "__retentionCronTask";
const RETENTION_CRON_RUNNING_KEY = "__retentionCronRunning";

// ... getCronTask(), setCronTask(), getIsRunning(), setIsRunning() ...

const RETENTION_CRON_EXPRESSION = "30 3 * * *"; // Daily at 03:30 UTC

// 7 rule functions (each returns count of deleted rows):
async function purgeReadNotifications(): Promise<number>;
async function purgeUnreadNotifications(): Promise<number>;
async function purgeStagedVacancies(): Promise<number>;
async function purgeAutomationRuns(): Promise<number>;
async function purgeEnrichmentLogs(): Promise<number>;
async function purgeCrmActivityLogs(): Promise<number>;
async function purgeAdminAuditLogs(): Promise<number>;
async function purgeDedupHashes(): Promise<number>;

// Main loop
async function runRetentionRules(): Promise<void>;

// Lifecycle
export function startRetentionCron(): void;
export function stopRetentionCron(): void;

// Exported for testing
export {
  purgeReadNotifications,
  purgeUnreadNotifications,
  purgeStagedVacancies,
  purgeAutomationRuns,
  purgeEnrichmentLogs,
  purgeCrmActivityLogs,
  purgeAdminAuditLogs,
  purgeDedupHashes,
  runRetentionRules,
};
```

### Rule Implementations

Each rule is a single function with structured logging:

#### Rule 1: `purgeReadNotifications`

```typescript
async function purgeReadNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.NOTIFICATION_READ_DAYS * 86_400_000);
  const result = await prisma.notification.deleteMany({
    where: { read: true, createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

#### Rule 2: `purgeUnreadNotifications`

```typescript
async function purgeUnreadNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.NOTIFICATION_UNREAD_DAYS * 86_400_000);
  const result = await prisma.notification.deleteMany({
    where: { read: false, createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

#### Rule 3: `purgeStagedVacancies`

```typescript
async function purgeStagedVacancies(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.STAGED_VACANCY_DAYS * 86_400_000);
  const result = await prisma.stagedVacancy.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

#### Rule 4: `purgeAutomationRuns`

```typescript
async function purgeAutomationRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.AUTOMATION_RUN_DAYS * 86_400_000);
  // Only purge completed/failed runs, never running ones
  const result = await prisma.automationRun.deleteMany({
    where: {
      status: { in: ["completed", "failed"] },
      createdAt: { lt: cutoff },
    },
  });
  return result.count;
}
```

#### Rule 5: `purgeEnrichmentLogs`

```typescript
async function purgeEnrichmentLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.ENRICHMENT_LOG_DAYS * 86_400_000);
  const result = await prisma.enrichmentLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

#### Rule 6: `purgeCrmActivityLogs`

```typescript
async function purgeCrmActivityLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.CRM_ACTIVITY_LOG_DAYS * 86_400_000);
  const result = await prisma.crmActivityLog.deleteMany({
    where: { happenedAt: { lt: cutoff } },
  });
  return result.count;
}
```

#### Rule 7: `purgeAdminAuditLogs`

```typescript
async function purgeAdminAuditLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.ADMIN_AUDIT_LOG_DAYS * 86_400_000);
  const result = await prisma.adminAuditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

#### Rule 8 (bonus): `purgeDedupHashes`

```typescript
async function purgeDedupHashes(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_CONFIG.DEDUP_HASH_DAYS * 86_400_000);
  const result = await prisma.dedupHash.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

### Main Loop

```typescript
async function runRetentionRules(): Promise<void> {
  if (getIsRunning()) {
    debugLog("retention-cron", "[Retention] Previous cycle still running, skipping.");
    return;
  }
  setIsRunning(true);

  try {
    debugLog("retention-cron", "[Retention] Running retention rules...");

    const results = await Promise.allSettled([
      purgeReadNotifications(),
      purgeUnreadNotifications(),
      purgeStagedVacancies(),
      purgeAutomationRuns(),
      purgeEnrichmentLogs(),
      purgeCrmActivityLogs(),
      purgeAdminAuditLogs(),
      purgeDedupHashes(),
    ]);

    const labels = [
      "readNotifications", "unreadNotifications", "stagedVacancies",
      "automationRuns", "enrichmentLogs", "crmActivityLogs",
      "adminAuditLogs", "dedupHashes",
    ];

    let totalPurged = 0;
    for (const [i, label] of labels.entries()) {
      if (results[i].status === "rejected") {
        debugError("retention-cron", `[Retention] Rule ${label} failed:`,
          (results[i] as PromiseRejectedResult).reason);
      } else {
        totalPurged += (results[i] as PromiseFulfilledResult<number>).value;
      }
    }

    if (totalPurged > 0) {
      debugLog("retention-cron", `[Retention] Purged ${totalPurged} total rows.`);
    }
  } catch (error) {
    debugError("retention-cron", "[Retention] Error running retention rules:", error);
  } finally {
    setIsRunning(false);
  }
}
```

### Schedule: Why daily at 03:30 instead of every 15 minutes?

- CRM cron runs every 15 minutes because reminders need near-real-time delivery
- Retention is a cleanup job -- once daily is sufficient and avoids unnecessary DB churn
- 03:30 UTC targets the lowest-activity window for a European-focused app
- Different schedule than CRM cron (*/15) prevents schedule collisions

### Registration in `instrumentation.ts`

**File:** `src/instrumentation.ts`

```typescript
export async function register() {
  // ... existing env validation ...

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // ... existing registrations ...

    const { startCrmCron } = await import("@/lib/scheduler/crm-cron");
    startCrmCron();

    // NEW:
    const { startRetentionCron } = await import("@/lib/scheduler/retention-cron");
    startRetentionCron();
  }
}
```

---

## Cross-Cutting Concerns

### Error Handling

| Layer | Strategy | Pattern Source |
|-------|----------|---------------|
| Server action (`exportUserData`) | Returns `ActionResult<T>` with structured errors | All existing server actions |
| API route (`/api/users/export`) | HTTP status codes (401/429/500), generic error messages | `src/app/api/jobs/export/route.ts` |
| PII stripping | Never throws -- regex replacement is infallible | Same as `normalizeWhitespace` etc. |
| Retention cron rules | `Promise.allSettled` -- one failing rule never blocks others | `crm-cron.ts` |
| ZIP streaming | Error during archive writes `passThrough.end()` gracefully | CSV export pattern |

### Security

#### IDOR Protection (ADR-015)

- `collectUserData(userId)` uses `userId` in every Prisma `where` clause
- `GET /api/users/export` reads `userId` from `auth()` session only, never from query params
- Server action uses `getCurrentUser()` only

#### Rate Limiting

- Export: 1/hour sliding window, in-memory globalThis store
- Defense in depth: both server action AND API route check the same limiter
- Rate limit key: `userId` (not IP, because the feature requires authentication)

#### No PII Leakage in Export Errors

- 500 errors return generic message: `"Export failed"`, never raw Prisma/archiver errors
- ZIP file itself contains user's own data (authorized access)

#### PII Stripping Security Properties

- `stripContactPii` removes name/email/phone/address before cloud transmission
- `stripEmailPhonePatterns` catches stray contact info in job descriptions
- Stripping happens BEFORE text reaches the AI SDK `streamText()` call
- `isLocal` is read from the trusted server-side manifest registry, not from client input
- Fallback: if manifest lookup fails (`registered` is undefined), `isLocal` defaults to `false` (strip by default -- fail-safe)

#### Retention Cron Security

- No user-facing input -- runs purely server-side on schedule
- `AutomationRun` purge filters by `status: { in: ["completed", "failed"] }` -- never deletes running runs
- All queries are cross-user (retention is a system concern, not per-user)

### Observability

All three sub-features use `debugLog`/`debugError` from `@/lib/debug` for structured logging:

- Retention cron: `"retention-cron"` category (follow `"crm-cron"` pattern)
- Export: standard `console.error` for unexpected failures (matches API route pattern)
- PII stripping: no logging (deterministic, no failure modes)

---

## i18n Keys

### New keys for `src/i18n/dictionaries/settings.ts`

All 4 locales (en, de, fr, es). Keys placed in the `settings` namespace alongside existing privacy keys.

| Key | EN | Purpose |
|-----|-----|---------|
| `settings.exportTitle` | `"Download My Data"` | Section heading |
| `settings.exportDesc` | `"Download a ZIP archive containing all your personal data (GDPR Art. 20). Includes jobs, resumes, contacts, automations, and settings."` | Section description |
| `settings.exportButton` | `"Download My Data"` | Button label |
| `settings.exportCooldown` | `"Download ({seconds}s)"` | Button label during cooldown |
| `settings.exportStarted` | `"Preparing your data export..."` | Toast while generating |
| `settings.exportFailed` | `"Failed to export data. Please try again."` | Error toast |
| `settings.exportRateLimited` | `"You can only export once per hour. Please try again later."` | Rate limit toast |

**German (de):**

| Key | DE |
|-----|-----|
| `settings.exportTitle` | `"Meine Daten herunterladen"` |
| `settings.exportDesc` | `"Lade ein ZIP-Archiv mit all deinen personenbezogenen Daten herunter (DSGVO Art. 20). Enthalt Jobs, Lebensläufe, Kontakte, Automationen und Einstellungen."` |
| `settings.exportButton` | `"Meine Daten herunterladen"` |
| `settings.exportCooldown` | `"Herunterladen ({seconds}s)"` |
| `settings.exportStarted` | `"Datenexport wird vorbereitet..."` |
| `settings.exportFailed` | `"Datenexport fehlgeschlagen. Bitte versuche es erneut."` |
| `settings.exportRateLimited` | `"Du kannst nur einmal pro Stunde exportieren. Bitte versuche es spater erneut."` |

**French (fr) and Spanish (es):** Same pattern, translated appropriately during implementation.

---

## File Inventory

### New Files (10)

| File | Purpose |
|------|---------|
| `src/actions/export.actions.ts` | Server action: auth + rate limit pre-check |
| `src/app/api/users/export/route.ts` | API route: streaming ZIP response |
| `src/lib/export/collect-user-data.ts` | Service: parallel Prisma queries, data sanitization |
| `src/lib/export/stream-zip.ts` | Service: archiver ZIP streaming |
| `src/lib/export-rate-limit.ts` | Rate limiter: 1/hour sliding window |
| `src/components/settings/DataExportSettings.tsx` | UI: download button with cooldown |
| `src/lib/connector/ai-provider/tools/pii-strip.ts` | PII stripping utilities |
| `src/lib/scheduler/retention-cron.ts` | Retention cron job (7 rules) |
| `src/lib/scheduler/retention-config.ts` | Retention period constants |
| `__tests__/gdpr-phase1/` | Test directory for all S2/S3/S4 tests |

### Modified Files (9)

| File | Change |
|------|--------|
| `src/lib/connector/manifest.ts` | Add `isLocal: boolean` to `AiManifest` |
| `src/lib/connector/ai-provider/modules/ollama/manifest.ts` | Add `isLocal: true` |
| `src/lib/connector/ai-provider/modules/openai/manifest.ts` | Add `isLocal: false` |
| `src/lib/connector/ai-provider/modules/deepseek/manifest.ts` | Add `isLocal: false` |
| `src/lib/connector/ai-provider/tools/preprocessing.ts` | Add `ConvertResumeOptions`, pass to `convertResumeToText` |
| `src/lib/connector/ai-provider/tools/preprocessing-job.ts` | Add `ConvertJobOptions`, pass to `convertJobToText` |
| `src/app/api/ai/resume/match/route.ts` | Resolve `isLocal`, pass `stripPii` to preprocessing |
| `src/app/api/ai/resume/review/route.ts` | Resolve `isLocal`, pass `stripPii` to preprocessing |
| `src/instrumentation.ts` | Register `startRetentionCron()` |
| `src/lib/connector/ai-provider/index.ts` | Add PII strip + option type exports |
| `src/components/settings/PrivacySecuritySettings.tsx` | Import and render `DataExportSettings` |
| `src/i18n/dictionaries/settings.ts` | Add export i18n keys (4 locales) |

### Test Files (new)

| File | Coverage |
|------|----------|
| `__tests__/export-rate-limit.spec.ts` | Sliding window: allow, deny, retry-after calculation, cleanup |
| `__tests__/collect-user-data.spec.ts` | Data collection: all aggregates, secret exclusion, IDOR |
| `__tests__/pii-strip.spec.ts` | `stripContactPii`: name/email/phone/address; `stripEmailPhonePatterns`: email/phone |
| `__tests__/retention-cron.spec.ts` | Each rule: cutoff calculation, status filters, Promise.allSettled isolation |
| `__tests__/DataExportSettings.spec.tsx` | Component: button state, cooldown display, error handling |
| `__tests__/preprocessing-pii.spec.ts` | Integration: preprocessing with `stripPii: true/false`, text limits |

### Dependency

- `archiver` (npm) -- ZIP creation with streaming support. Well-maintained (55M weekly downloads), MIT licensed. Already compatible with Node.js streams used in the CSV export pattern.

---

## Integration Diagram

```
                  Settings Page
                       |
         PrivacySecuritySettings.tsx
          /                    \
   DataExportSettings     (existing toggles)
         |
   exportUserData()  -----> checkExportRateLimit()
   (server action)          (src/lib/export-rate-limit.ts)
         |
         v
   /api/users/export  ----> collectUserData(userId)
   (API route, GET)         (src/lib/export/collect-user-data.ts)
         |                       |
         v                  Parallel Prisma queries
   createExportZipStream()  (User, Jobs, Resumes, CRM, ...)
   (archiver streaming)
         |
         v
   Browser download (ZIP)


   AI Route Handlers
   /api/ai/resume/match  ----> moduleRegistry.get(moduleId)
   /api/ai/resume/review        |
         |                  isLocal? from AiManifest
         v                       |
   preprocessResume()       stripPii = !isLocal
   preprocessJob()               |
         |                  stripContactPii(text)
         v                  stripEmailPhonePatterns(text)
   streamText() to LLM


   instrumentation.ts
         |
         +-- startScheduler()
         +-- startHealthScheduler()
         +-- startCrmCron()
         +-- startRetentionCron()  ---- (NEW)
                    |
              Daily 03:30 UTC
                    |
              runRetentionRules()
              Promise.allSettled([
                purgeReadNotifications(),
                purgeUnreadNotifications(),
                purgeStagedVacancies(),
                purgeAutomationRuns(),
                purgeEnrichmentLogs(),
                purgeCrmActivityLogs(),
                purgeAdminAuditLogs(),
                purgeDedupHashes(),
              ])
```
