# S1 — Account Deletion (GDPR Art. 17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement complete GDPR Art. 17 account deletion: a single `deleteAccount()` server action that removes ALL user data (DB rows + disk files) and signs the user out.

**Architecture:** Explicit multi-step delete in dependency-safe order inside a single Prisma transaction, followed by best-effort disk cleanup. Migration adds `onDelete: Cascade` to all 29 missing direct User FK relations as defense-in-depth. UI adds a "Danger Zone" section to Settings with confirmation dialog.

**Tech Stack:** Prisma migration (SQLite), Next.js server action, Shadcn AlertDialog, NextAuth signOut, i18n (4 locales)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `prisma/migrations/2026XXXX_s1_account_deletion_cascades/migration.sql` | Add onDelete CASCADE to 29 User FKs |
| Create | `src/actions/account.actions.ts` | `deleteAccount()` server action |
| Create | `src/components/settings/AccountDeletionSettings.tsx` | Danger Zone UI with confirmation |
| Modify | `src/app/dashboard/settings/page.tsx` | Add "danger-zone" section |
| Modify | `src/components/settings/SettingsSidebar.tsx` | Add "danger-zone" nav entry |
| Modify | `src/i18n/dictionaries/settings.ts` | Add i18n keys (4 locales) |
| Create | `__tests__/account.actions.spec.ts` | Unit tests for deleteAccount |

---

### Task 1: Prisma Migration — Add onDelete Cascade to 29 User FK Relations

**Files:**
- Modify: `prisma/schema.prisma` (29 `@relation` lines)

**Why:** 29 of 33 direct User FK relations lack `onDelete: Cascade`. Adding them provides defense-in-depth and documents intent. The server action uses explicit delete order (not relying on cascade order), but the cascades prevent orphaned rows if any step is missed.

- [ ] **Step 1: Add `onDelete: Cascade` to all 29 User FK relations**

Change each `@relation(fields: [...], references: [id])` to `@relation(fields: [...], references: [id], onDelete: Cascade)` on these models:

ApiKey, UserSettings, Profile, Contact, JobTitle, Location, Company, JobSource, Job, ActivityType, Activity, Task, Automation, Notification, StagedVacancy, DedupHash, Note, CompanyBlacklist, Tag, Question, PublicApiKey, JobStatusHistory, EnrichmentResult, EnrichmentLog, LogoAsset, Person, CrmInterview, CrmTask, CrmNote, CrmActivityLog, CrmBlocklist, ConnectedAccount, JobContact

(WebhookEndpoint, VapidConfig, WebPushSubscription, SmtpConfig already have Cascade — skip these.)

- [ ] **Step 2: Generate and apply migration**

```bash
cd /home/pascal/projekte/jobsync
source scripts/env.sh
npx prisma migrate dev --name s1_account_deletion_cascades
npx prisma generate
```

- [ ] **Step 3: Verify migration applied**

```bash
npx prisma migrate status
```

Expected: All migrations applied, no pending.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(schema): add onDelete Cascade to all 29 User FK relations (S1 prep)"
```

---

### Task 2: Server Action — deleteAccount()

**Files:**
- Create: `src/actions/account.actions.ts`
- Test: `__tests__/account.actions.spec.ts`

The delete order handles cross-model Restrict FKs (e.g., Job→JobTitle, WorkExperience→Company, Activity→ActivityType) by deleting dependents before their reference-data parents.

- [ ] **Step 1: Write failing tests**

Create `__tests__/account.actions.spec.ts` with tests covering:
1. Unauthenticated user returns error
2. Authenticated user: all user data deleted (mock Prisma calls)
3. Logo asset disk cleanup called
4. Resume file disk cleanup called

- [ ] **Step 2: Run tests — verify they fail**

```bash
source scripts/env.sh && bash scripts/test.sh --workers=1 -- __tests__/account.actions.spec.ts
```

- [ ] **Step 3: Implement deleteAccount()**

```typescript
// src/actions/account.actions.ts
"use server";

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/db";
import type { ActionResult } from "@/models/action.model";
import { promises as fs } from "fs";
import path from "path";

const LOGO_BASE_DIR = process.env.LOGO_STORAGE_PATH || "/data/logos";

export async function deleteAccount(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, message: "errors.notAuthenticated" };
  }

  const uid = user.id;

  // Phase 0: Collect file paths for post-delete disk cleanup
  const [logoAssets, resumeFiles] = await Promise.all([
    prisma.logoAsset.findMany({
      where: { userId: uid },
      select: { filePath: true },
    }),
    prisma.file.findMany({
      where: { Resume: { profile: { userId: uid } } },
      select: { filePath: true },
    }),
  ]);

  // Phase 1: Delete all user data in dependency-safe order
  await prisma.$transaction(async (tx) => {
    // --- Resume deep chain (blocks Company/JobTitle/Location via Restrict) ---
    await tx.workExperience.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.education.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.licenseOrCertification.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.otherSection.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.contactInfo.deleteMany({
      where: { resume: { profile: { userId: uid } } },
    });

    // Summary (orphan-prone — FK is ON ResumeSection side)
    const sections = await tx.resumeSection.findMany({
      where: { Resume: { profile: { userId: uid } } },
      select: { summaryId: true },
    });
    const summaryIds = sections
      .map((s) => s.summaryId)
      .filter((id): id is string => id !== null);

    await tx.resumeSection.deleteMany({
      where: { Resume: { profile: { userId: uid } } },
    });
    if (summaryIds.length > 0) {
      await tx.summary.deleteMany({ where: { id: { in: summaryIds } } });
    }

    // File records (orphan-prone — FK is ON Resume side)
    await tx.file.deleteMany({
      where: { Resume: { profile: { userId: uid } } },
    });
    await tx.resume.deleteMany({
      where: { profile: { userId: uid } },
    });

    // --- Activity (references ActivityType via Restrict) ---
    await tx.activity.deleteMany({ where: { userId: uid } });

    // --- Detach Automation → Resume (Restrict FK) ---
    await tx.automation.updateMany({
      where: { userId: uid },
      data: { resumeId: null },
    });

    // --- CRM targets (reference CrmTask/CrmNote + Person/Company/Job) ---
    await tx.crmTaskTarget.deleteMany({
      where: { task: { userId: uid } },
    });
    await tx.crmNoteTarget.deleteMany({
      where: { note: { userId: uid } },
    });

    // --- Interview (legacy model — no userId, FK to Job) ---
    await tx.contact.deleteMany({ where: { createdBy: uid } });
    await tx.interview.deleteMany({
      where: { job: { userId: uid } },
    });

    // --- Delete User (cascades all 33 direct FK relations) ---
    await tx.user.delete({ where: { id: uid } });
  });

  // Phase 2: Best-effort disk cleanup (after DB commit succeeds)
  const allPaths = [
    ...logoAssets.map((a) => a.filePath).filter(Boolean),
    ...resumeFiles.map((f) => f.filePath),
  ];

  await Promise.allSettled(
    allPaths.map((p) => fs.unlink(p as string).catch(() => {})),
  );

  // Clean up logo directory
  try {
    await fs.rm(path.join(LOGO_BASE_DIR, uid), {
      recursive: true,
      force: true,
    });
  } catch {}

  return { success: true };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
source scripts/env.sh && bash scripts/test.sh --workers=1 -- __tests__/account.actions.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/account.actions.ts __tests__/account.actions.spec.ts
git commit -m "feat(gdpr): add deleteAccount server action with explicit delete order (S1)"
```

---

### Task 3: i18n — Add Account Deletion Keys (4 Locales)

**Files:**
- Modify: `src/i18n/dictionaries/settings.ts`

- [ ] **Step 1: Add keys to all 4 locales**

Add to each locale block in `settings.ts`:

```typescript
"settings.sidebarDangerZone": "Danger Zone",  // en
"settings.dangerZone": "Danger Zone",
"settings.dangerZoneDesc": "Permanently delete your account and all associated data. This action cannot be undone.",
"settings.deleteAccount": "Delete Account",
"settings.deleteAccountConfirmTitle": "Delete Account?",
"settings.deleteAccountConfirmDesc": "This will permanently delete your account, all jobs, automations, contacts, resumes, and settings. This action cannot be undone.",
"settings.deleteAccountConfirmButton": "Yes, Delete My Account",
"settings.deleteAccountCancel": "Cancel",
"settings.deleteAccountSuccess": "Account deleted successfully.",
"settings.deleteAccountError": "Failed to delete account. Please try again.",
"settings.typeToConfirm": "Type DELETE to confirm:",
"settings.typeDeletePlaceholder": "DELETE",
```

DE/FR/ES translations for all keys.

- [ ] **Step 2: Validate dictionaries**

```bash
bun run /tmp/test-dictionaries.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/dictionaries/settings.ts
git commit -m "feat(i18n): add account deletion keys (4 locales, S1)"
```

---

### Task 4: UI — AccountDeletionSettings Component

**Files:**
- Create: `src/components/settings/AccountDeletionSettings.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`
- Modify: `src/components/settings/SettingsSidebar.tsx`

- [ ] **Step 1: Create AccountDeletionSettings component**

Shadcn AlertDialog with typed confirmation ("DELETE"). Red destructive styling. Calls `deleteAccount()` on confirm, then `signOut()`.

- [ ] **Step 2: Add "danger-zone" to SettingsSidebar**

Add `"danger-zone"` to `SettingsSection` type union and `SETTINGS_SECTIONS` array with `Trash2` icon.

- [ ] **Step 3: Wire into Settings page**

Add `{activeSection === "danger-zone" && <AccountDeletionSettings />}` to settings page.

- [ ] **Step 4: Verify manually**

Start dev server, navigate to Settings, check Danger Zone section renders with confirmation dialog.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/AccountDeletionSettings.tsx src/app/dashboard/settings/page.tsx src/components/settings/SettingsSidebar.tsx
git commit -m "feat(ui): add Account Deletion danger zone to Settings (S1)"
```

---

### Task 5: Build + Tests + Verification

- [ ] **Step 1: Stop dev server, run build**

```bash
source scripts/env.sh && bun run build
```

- [ ] **Step 2: Run full test suite**

```bash
bash scripts/test.sh --workers=1
```

- [ ] **Step 3: Run notification-writers check**

```bash
bun run check:notification-writers
```

- [ ] **Step 4: Commit any fixes, final commit**
