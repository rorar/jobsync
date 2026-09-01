/**
 * E2E Test Data Cleanup — removes stale records from previous runs.
 *
 * All E2E test data uses the "E2E " prefix in names/titles.
 * This script deletes those records before each test run,
 * ensuring a clean slate even if previous cleanup failed.
 *
 * Called from global-setup.ts before the login step.
 *
 * Deletes sequentially in strict FK dependency order because SQLite
 * enforces FK constraints per-statement, not per-transaction.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function cleanupStaleE2EData(): Promise<void> {
  // The disconnect MUST survive every exit path: the "no test user" early
  // return below, and any deleteMany that throws (a foreign-key error is the
  // realistic one — see step 6a). A PrismaClient left connected keeps the
  // SQLite handle open after globalSetup returns. The work is a separate
  // function purely so wrapping it does not re-indent 200 lines of deletions.
  try {
    await deleteStaleRecords();
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteStaleRecords(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) {
    console.log("[E2E Cleanup] Test user not found, skipping cleanup");
    return;
  }

  let total = 0;

  // Steps 0a/0b run FIRST, ahead of the FK-ordered deletions below, because
  // they are the two steps whose omission causes a PERMANENT outage rather
  // than clutter. Any later step that throws aborts this function (step 6a's
  // comment records a foreign-key error escaping globalSetup and failing an
  // entire run), and a purge that only runs if everything before it succeeded
  // is the first casualty. Neither step has an FK reason to sit anywhere:
  // WebhookEndpoint's only edge is user (Cascade) and ModuleRegistration has
  // no relations at all.

  // 0a. Webhook endpoints (E2E test endpoints)
  //
  // Load-bearing, not tidiness. A user may hold at most 10 endpoints
  // (MAX_ENDPOINTS_PER_USER in webhook.actions.ts, MAX_ENDPOINTS in
  // WebhookSettings.tsx), and at the cap the component renders the create form
  // DISABLED. webhook-settings.spec.ts deletes its endpoint inline at the end
  // of each test, so every test that fails before that line leaks one. After
  // ten such leaks the form can never be filled again and EVERY webhook test
  // fails in EVERY later run, permanently, until someone deletes rows by hand.
  // That is exactly what happened on 2026-09-01: one load-induced failure
  // leaked the tenth row and the next run lost two webhook tests to a disabled
  // input. Same shape as the WorkExperience/Company foreign-key landmine in
  // step 6a — a cleanup gap that turns one flake into a permanent outage.
  total += (await prisma.webhookEndpoint.deleteMany({
    where: { userId, url: { startsWith: "https://example.com/webhooks/e2e-" } },
  })).count;

  // 0b. Module registrations — delete ALL rows, unfiltered.
  //
  // This RESTORES the manifest-declared default instead of imposing a status:
  // ModuleRegistration is an OVERRIDE layer (see module.actions.ts
  // syncRegistryFromDb), so with no row a module keeps the in-memory default
  // from registry.ts (ModuleStatus.ACTIVE), and every writer is an upsert, so
  // rows come back on demand. Writing "active" here instead would hardcode a
  // status policy and a module list, which is precisely what the
  // manifest-driven architecture forbids; deleting keeps the manifest the
  // single source of truth and covers new modules automatically.
  //
  // Deliberately GLOBAL while every other step is userId-scoped: the model has
  // no user column (schema.prisma), module state is instance-wide.
  //
  // Why this matters: automation-wizard-modules.spec.ts and enrichment.spec.ts
  // toggle a module and restore it only on the success path, so a run that
  // dies in between leaves it inactive for good. The next run then reads
  // "already inactive" — and in automation-wizard-modules that means skipping
  // the very deactivation the test exists to prove, asserting instead that an
  // absent option is absent. (enrichment.spec.ts mirrors its flow for the
  // inactive case, so it still asserts something real; it is the drifted
  // starting state, not a vacuous test.)
  //
  // LIMITATION, honestly stated: syncRegistryFromDb latches on a `dbSynced`
  // flag per process, so a dev server that already synced will NOT re-read the
  // table. The reset therefore takes effect from the next server start, not
  // immediately. The health/monitoring columns on these rows are re-populated
  // by the health monitor.
  total += (await prisma.moduleRegistration.deleteMany({})).count;

  // Delete in strict FK dependency order (deepest children first)

  // 1. Notes on E2E jobs (Note → Job)
  total += (await prisma.note.deleteMany({
    where: { userId, content: { startsWith: "E2E " } },
  })).count;

  // 2. Activities (Activity → Task, Activity → ActivityType)
  total += (await prisma.activity.deleteMany({
    where: { userId, activityName: { startsWith: "E2E " } },
  })).count;

  // 3. Tasks (Task → ActivityType)
  total += (await prisma.task.deleteMany({
    where: { userId, title: { startsWith: "E2E " } },
  })).count;

  // 4. Interviews on E2E jobs (Interview → Job)
  total += (await prisma.interview.deleteMany({
    where: { job: { userId, JobTitle: { label: { startsWith: "E2E " } } } },
  })).count;

  // 5. Notes on E2E jobs by title (Note → Job)
  total += (await prisma.note.deleteMany({
    where: { job: { userId, JobTitle: { label: { startsWith: "E2E " } } } },
  })).count;

  // 5a. CRM ActivityLog linked to E2E jobs (CrmActivityLog.targetJobId → Job)
  total += (await prisma.crmActivityLog.deleteMany({
    where: { userId, targetJob: { JobTitle: { label: { startsWith: "E2E " } } } },
  })).count;

  // 5b. CRM NoteTargets linked to E2E jobs (CrmNoteTarget.targetJobId → Job)
  total += (await prisma.crmNoteTarget.deleteMany({
    where: { targetJob: { userId, JobTitle: { label: { startsWith: "E2E " } } } },
  })).count;

  // 5c. CRM TaskTargets linked to E2E jobs (CrmTaskTarget.targetJobId → Job)
  total += (await prisma.crmTaskTarget.deleteMany({
    where: { targetJob: { userId, JobTitle: { label: { startsWith: "E2E " } } } },
  })).count;

  // 5d. JobContacts linked to E2E jobs (JobContact.jobId → Job, onDelete: Cascade)
  total += (await prisma.jobContact.deleteMany({
    where: { userId, job: { JobTitle: { label: { startsWith: "E2E " } } } },
  })).count;

  // 5e. CRM Interviews linked to E2E jobs (CrmInterview.jobId → Job, onDelete: Cascade)
  total += (await prisma.crmInterview.deleteMany({
    where: { userId, job: { JobTitle: { label: { startsWith: "E2E " } } } },
  })).count;

  // 5f. CRM Notes created by E2E user (orphan cleanup)
  total += (await prisma.crmNote.deleteMany({
    where: { userId, title: { startsWith: "E2E " } },
  })).count;

  // 5g. CRM Tasks created by E2E user (orphan cleanup)
  total += (await prisma.crmTask.deleteMany({
    where: { userId, title: { startsWith: "E2E " } },
  })).count;

  // 5h. Persons created by E2E user (Person.userId)
  total += (await prisma.person.deleteMany({
    where: { userId, firstName: { startsWith: "E2E " } },
  })).count;

  // 6. Jobs with E2E titles (Job → Resume, Job → JobTitle, etc.)
  total += (await prisma.job.deleteMany({
    where: { userId, JobTitle: { label: { startsWith: "E2E " } } },
  })).count;

  // 6aa. Orphan custom JobStatuses created by the Welle 4 job-status E2E
  // (labels prefixed "E2E "). Job.statusId and JobStatusHistory.newStatusId are
  // ON DELETE RESTRICT, so a status is only removable once nothing references it.
  // Step 6 already deleted the E2E jobs and (via JobStatusHistory.jobId Cascade)
  // their history rows, so these guards normally hold; we still assert `jobs` and
  // `historyAsNew` are empty so a status referenced by surviving data is never
  // removed, and never touch the user's default status. The 7 system categories
  // are kind-seeded (never E2E-created), so only JobStatus rows need cleanup.
  total += (await prisma.jobStatus.deleteMany({
    where: {
      userId,
      label: { startsWith: "E2E " },
      isDefault: false,
      jobs: { none: {} },
      historyAsNew: { none: {} },
    },
  })).count;

  // 6a. E2E Companies — both the hiring company and the Welle 3 F-AJ-08
  // recruiting agency ("E2E Agency …"). Companies are never created with a
  // userId-scoped name elsewhere, so they accumulated across runs before this
  // step existed. Job→Company (HiringCompany) has NO onDelete (default
  // Restrict), so this MUST run AFTER step 6. RecruitingCompany (SetNull) and
  // the CRM target relations (Cascade/SetNull) do not block. We still guard on
  // both job relations being empty so a company referenced by a non-E2E job
  // (shared label) is never removed.
  //
  // WorkExperience.companyId is the third Restrict edge into Company, and step
  // 7 does not clear it: WorkExperience.resumeSectionId is OPTIONAL, so
  // deleting a ResumeSection only NULLs that link (ON DELETE SET NULL) and
  // leaves the work-experience row behind. A work experience left behind by a
  // profile-crud test that failed before its inline cleanup therefore pins its
  // company forever — and an unguarded deleteMany then throws a foreign-key
  // error out of globalSetup, which fails every single test in the run rather
  // than the one that leaked. Guarding is the conservative half of the fix: the
  // company survives instead of the suite dying. (Observed 2026-09-01: "E2E
  // Corp" pinned by a WorkExperience row.)
  total += (await prisma.company.deleteMany({
    where: {
      createdBy: userId,
      label: { startsWith: "E2E " },
      jobsApplied: { none: {} },
      recruitingJobs: { none: {} },
      workExperiences: { none: {} },
    },
  })).count;

  // 7. Resume children: ContactInfo, ResumeSection (→ Resume)
  total += (await prisma.contactInfo.deleteMany({
    where: { resume: { title: { startsWith: "E2E " }, profile: { userId } } },
  })).count;
  total += (await prisma.resumeSection.deleteMany({
    where: { Resume: { title: { startsWith: "E2E " }, profile: { userId } } },
  })).count;

  // 8. AutomationRun → Automation (before Automations)
  total += (await prisma.automationRun.deleteMany({
    where: { automation: { userId, name: { startsWith: "E2E " } } },
  })).count;

  // 9. E2E Automations
  total += (await prisma.automation.deleteMany({
    where: { userId, name: { startsWith: "E2E " } },
  })).count;

  // 10. Resumes — only delete orphaned ones (no Automation or Job FK references)
  total += (await prisma.resume.deleteMany({
    where: {
      title: { startsWith: "E2E " },
      profile: { userId },
      Job: { none: {} },
      Automation: { none: {} },
    },
  })).count;

  // 11. Questions
  total += (await prisma.question.deleteMany({
    where: { createdBy: userId, question: { startsWith: "E2E " } },
  })).count;

  // 12. Reference data (only orphaned — not used by any remaining record)
  total += (await prisma.activityType.deleteMany({
    where: {
      createdBy: userId,
      label: { startsWith: "E2E " },
      Activities: { none: {} },
      Tasks: { none: {} },
    },
  })).count;

  total += (await prisma.jobTitle.deleteMany({
    where: {
      createdBy: userId,
      label: { startsWith: "E2E " },
      jobs: { none: {} },
      workExperiences: { none: {} },
    },
  })).count;

  total += (await prisma.location.deleteMany({
    where: {
      createdBy: userId,
      label: { startsWith: "E2E " },
      jobsApplied: { none: {} },
      educations: { none: {} },
      workExperience: { none: {} },
    },
  })).count;

  // 13. Public API Keys (E2E test keys)
  total += (await prisma.publicApiKey.deleteMany({
    where: { userId, name: { startsWith: "E2E " } },
  })).count;

  // 14. Company Blacklist entries (E2E test entries)
  total += (await prisma.companyBlacklist.deleteMany({
    where: { userId, pattern: { startsWith: "E2E " } },
  })).count;

  // 15. CRM Blocklist entries (E2E test entries)
  total += (await prisma.crmBlocklist.deleteMany({
    where: { userId, handle: { startsWith: "E2E " } },
  })).count;

  if (total > 0) {
    console.log(`[E2E Cleanup] Removed ${total} stale E2E records`);
  }
}

async function getTestUserId(): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: "admin@example.com" },
    select: { id: true },
  });
  return user?.id ?? null;
}
