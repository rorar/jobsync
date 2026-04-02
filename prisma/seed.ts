/**
 * Prisma seed script — creates test user and base data for E2E tests.
 *
 * Usage: bun run prisma/seed.ts
 * Or via Prisma: bunx prisma db seed
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TEST_USER = {
  name: "Admin",
  email: "admin@example.com",
  password: "password123",
};

const JOB_SOURCES = [
  { label: "Indeed", value: "indeed" },
  { label: "LinkedIn", value: "linkedin" },
  { label: "Company Career Page", value: "career_page" },
  { label: "Glassdoor", value: "glassdoor" },
  { label: "Google", value: "google" },
  { label: "ZipRecruiter", value: "ziprecruiter" },
  { label: "EURES", value: "eures" },
  { label: "Arbeitsagentur", value: "arbeitsagentur" },
  { label: "JSearch", value: "jsearch" },
];

const JOB_STATUSES = [
  { label: "Bookmarked", value: "bookmarked" },
  { label: "Applied", value: "applied" },
  { label: "Interview", value: "interview" },
  { label: "Offer", value: "offer" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
  { label: "Expired", value: "expired" },
  { label: "Archived", value: "archived" },
];

// Legacy status renames: "draft" → "bookmarked", "saved" → "bookmarked"
const LEGACY_STATUS_RENAMES: Record<string, { label: string; value: string }> = {
  draft: { label: "Bookmarked", value: "bookmarked" },
  saved: { label: "Bookmarked", value: "bookmarked" },
};

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Create or update test user
  const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);

  const user = await prisma.user.upsert({
    where: { email: TEST_USER.email },
    update: { name: TEST_USER.name, password: hashedPassword },
    create: {
      name: TEST_USER.name,
      email: TEST_USER.email,
      password: hashedPassword,
    },
  });

  console.log(`  ✓ User: ${user.email} (${user.id})`);

  // 2. Create job sources for the test user
  for (const source of JOB_SOURCES) {
    await prisma.jobSource.upsert({
      where: {
        value_createdBy: { value: source.value, createdBy: user.id },
      },
      update: {},
      create: {
        label: source.label,
        value: source.value,
        createdBy: user.id,
      },
    });
  }

  console.log(`  ✓ Job Sources: ${JOB_SOURCES.length} entries`);

  // 3. Rename legacy statuses (idempotent)
  for (const [oldValue, newData] of Object.entries(LEGACY_STATUS_RENAMES)) {
    const existing = await prisma.jobStatus.findFirst({ where: { value: oldValue } });
    if (existing) {
      // Only rename if the target value doesn't already exist
      const targetExists = await prisma.jobStatus.findFirst({ where: { value: newData.value } });
      if (!targetExists) {
        await prisma.jobStatus.update({
          where: { value: oldValue },
          data: { label: newData.label, value: newData.value },
        });
        console.log(`  ✓ Renamed status "${oldValue}" → "${newData.value}"`);
      } else {
        // Target already exists — reassign jobs from old status to new status, then delete old
        await prisma.job.updateMany({
          where: { statusId: existing.id },
          data: { statusId: targetExists.id },
        });
        await prisma.jobStatusHistory.updateMany({
          where: { previousStatusId: existing.id },
          data: { previousStatusId: targetExists.id },
        });
        await prisma.jobStatusHistory.updateMany({
          where: { newStatusId: existing.id },
          data: { newStatusId: targetExists.id },
        });
        await prisma.jobStatus.delete({ where: { value: oldValue } });
        console.log(`  ✓ Migrated jobs from "${oldValue}" to "${newData.value}" and removed old status`);
      }
    }
  }

  // 4. Create job statuses (shared, no createdBy)
  for (const status of JOB_STATUSES) {
    await prisma.jobStatus.upsert({
      where: { value: status.value },
      update: {},
      create: status,
    });
  }

  console.log(`  ✓ Job Statuses: ${JOB_STATUSES.length} entries`);

  // 4. Create a default profile + resume for E2E tests
  const existingProfile = await prisma.profile.findFirst({
    where: { userId: user.id },
  });

  if (!existingProfile) {
    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
      },
    });

    await prisma.resume.create({
      data: {
        profileId: profile.id,
        title: "Test Resume",
      },
    });

    console.log(`  ✓ Profile + Resume created`);
  } else {
    console.log(`  ✓ Profile already exists`);
  }

  console.log("✅ Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
