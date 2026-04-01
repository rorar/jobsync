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
  const userId = await getTestUserId();
  if (!userId) {
    console.log("[E2E Cleanup] Test user not found, skipping cleanup");
    return;
  }

  let total = 0;

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

  // 6. Jobs with E2E titles (Job → Resume, Job → JobTitle, etc.)
  total += (await prisma.job.deleteMany({
    where: { userId, JobTitle: { label: { startsWith: "E2E " } } },
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

  if (total > 0) {
    console.log(`[E2E Cleanup] Removed ${total} stale E2E records`);
  }

  await prisma.$disconnect();
}

async function getTestUserId(): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: "admin@example.com" },
    select: { id: true },
  });
  return user?.id ?? null;
}
