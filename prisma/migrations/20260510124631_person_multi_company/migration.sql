/*
  Warnings:

  - You are about to drop the column `companyId` on the `Person` table. All the data in the column will be lost.

*/
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
    "jobTitle" TEXT,
    "linkedinUrl" TEXT,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Data migration: convert existing companyId FK to companies JSON array.
-- Persons WITH a companyId get a single CompanyAssociation with isPrimary=true.
-- Persons WITHOUT a companyId get an empty array "[]".
INSERT INTO "new_Person" ("addressCity", "addressCountry", "addressPostalCode", "addressStreet", "avatarUrl", "createdAt", "createdByName", "createdBySource", "dataSource", "emails", "firstName", "id", "jobTitle", "lastName", "linkedinUrl", "phones", "processingBasis", "retentionExpiresAt", "status", "updatedAt", "userId", "companies")
SELECT p."addressCity", p."addressCountry", p."addressPostalCode", p."addressStreet", p."avatarUrl", p."createdAt", p."createdByName", p."createdBySource", p."dataSource", p."emails", p."firstName", p."id", p."jobTitle", p."lastName", p."linkedinUrl", p."phones", p."processingBasis", p."retentionExpiresAt", p."status", p."updatedAt", p."userId",
  CASE
    WHEN p."companyId" IS NOT NULL THEN
      '[{"companyId":"' || p."companyId" || '","companyLabel":"' || COALESCE(c."label", '') || '","role":null,"isPrimary":true,"startDate":null,"endDate":null}]'
    ELSE '[]'
  END
FROM "Person" p
LEFT JOIN "Company" c ON p."companyId" = c."id";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE INDEX "Person_userId_idx" ON "Person"("userId");
CREATE INDEX "Person_userId_status_idx" ON "Person"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
