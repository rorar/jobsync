/*
  Warnings:

  - You are about to drop the column `jobTitle` on the `Person` table. All the data in the column will be lost.
  - You are about to drop the column `linkedinUrl` on the `Person` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN "domain" TEXT;

-- CreateTable
CREATE TABLE "JobContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JobContact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JobContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "emails" TEXT NOT NULL DEFAULT '[]',
    "phones" TEXT NOT NULL DEFAULT '[]',
    "headline" TEXT,
    "socialProfiles" TEXT NOT NULL DEFAULT '[]',
    "avatarUrl" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressPostalCode" TEXT,
    "addressCountry" TEXT,
    "companies" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "dataSource" TEXT NOT NULL DEFAULT 'manual',
    "processingBasis" TEXT NOT NULL DEFAULT 'legitimate_interest',
    "retentionExpiresAt" DATETIME,
    "createdBySource" TEXT NOT NULL DEFAULT 'manual',
    "createdByName" TEXT,
    "updatedBySource" TEXT NOT NULL DEFAULT 'manual',
    "updatedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("addressCity", "addressCountry", "addressPostalCode", "addressStreet", "avatarUrl", "companies", "createdAt", "createdByName", "createdBySource", "dataSource", "emails", "firstName", "id", "lastName", "phones", "processingBasis", "retentionExpiresAt", "status", "updatedAt", "userId") SELECT "addressCity", "addressCountry", "addressPostalCode", "addressStreet", "avatarUrl", "companies", "createdAt", "createdByName", "createdBySource", "dataSource", "emails", "firstName", "id", "lastName", "phones", "processingBasis", "retentionExpiresAt", "status", "updatedAt", "userId" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE INDEX "Person_userId_idx" ON "Person"("userId");
CREATE INDEX "Person_userId_status_idx" ON "Person"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "JobContact_userId_idx" ON "JobContact"("userId");

-- CreateIndex
CREATE INDEX "JobContact_personId_idx" ON "JobContact"("personId");

-- CreateIndex
CREATE INDEX "JobContact_jobId_idx" ON "JobContact"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobContact_jobId_personId_key" ON "JobContact"("jobId", "personId");
