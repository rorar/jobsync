-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "tipsterId" TEXT,
    "targetCompanyId" TEXT,
    "forwardedToId" TEXT,
    "insiderId" TEXT,
    "viaId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByType" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Referral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Referral_tipsterId_fkey" FOREIGN KEY ("tipsterId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Referral_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Referral_forwardedToId_fkey" FOREIGN KEY ("forwardedToId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Referral_insiderId_fkey" FOREIGN KEY ("insiderId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Referral_viaId_fkey" FOREIGN KEY ("viaId") REFERENCES "PersonConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonConnection_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonConnection_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobUrl" TEXT,
    "description" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "appliedDate" DATETIME,
    "dueDate" DATETIME,
    "statusId" TEXT NOT NULL,
    "jobTitleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recruitingCompanyId" TEXT,
    "relationshipType" TEXT,
    "jobSourceId" TEXT,
    "salaryRange" TEXT,
    "salaryMin" REAL,
    "salaryMax" REAL,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryBonus" TEXT,
    "locationId" TEXT,
    "resumeId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" REAL NOT NULL DEFAULT 0,
    "automationId" TEXT,
    "matchScore" INTEGER,
    "matchData" TEXT,
    "discoveryStatus" TEXT,
    "discoveredAt" DATETIME,
    "sourceReferralId" TEXT,
    CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Job_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "JobStatus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_recruitingCompanyId_fkey" FOREIGN KEY ("recruitingCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_sourceReferralId_fkey" FOREIGN KEY ("sourceReferralId") REFERENCES "Referral" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("applied", "appliedDate", "automationId", "companyId", "createdAt", "description", "discoveredAt", "discoveryStatus", "dueDate", "id", "jobSourceId", "jobTitleId", "jobType", "jobUrl", "locationId", "matchData", "matchScore", "recruitingCompanyId", "relationshipType", "resumeId", "salaryBonus", "salaryCurrency", "salaryMax", "salaryMin", "salaryPeriod", "salaryRange", "sortOrder", "statusId", "userId", "version") SELECT "applied", "appliedDate", "automationId", "companyId", "createdAt", "description", "discoveredAt", "discoveryStatus", "dueDate", "id", "jobSourceId", "jobTitleId", "jobType", "jobUrl", "locationId", "matchData", "matchScore", "recruitingCompanyId", "relationshipType", "resumeId", "salaryBonus", "salaryCurrency", "salaryMax", "salaryMin", "salaryPeriod", "salaryRange", "sortOrder", "statusId", "userId", "version" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_sourceReferralId_key" ON "Job"("sourceReferralId");
CREATE INDEX "Job_userId_automationId_idx" ON "Job"("userId", "automationId");
CREATE INDEX "Job_userId_discoveryStatus_idx" ON "Job"("userId", "discoveryStatus");
CREATE INDEX "Job_userId_statusId_sortOrder_idx" ON "Job"("userId", "statusId", "sortOrder");
CREATE INDEX "Job_jobTitleId_idx" ON "Job"("jobTitleId");
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");
CREATE INDEX "Job_recruitingCompanyId_idx" ON "Job"("recruitingCompanyId");
CREATE INDEX "Job_jobSourceId_idx" ON "Job"("jobSourceId");
CREATE INDEX "Job_locationId_idx" ON "Job"("locationId");
CREATE INDEX "Job_resumeId_idx" ON "Job"("resumeId");
CREATE INDEX "Job_automationId_idx" ON "Job"("automationId");
CREATE INDEX "Job_statusId_idx" ON "Job"("statusId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Referral_userId_idx" ON "Referral"("userId");

-- CreateIndex
CREATE INDEX "Referral_userId_status_idx" ON "Referral"("userId", "status");

-- CreateIndex
CREATE INDEX "Referral_tipsterId_idx" ON "Referral"("tipsterId");

-- CreateIndex
CREATE INDEX "Referral_targetCompanyId_idx" ON "Referral"("targetCompanyId");

-- CreateIndex
CREATE INDEX "PersonConnection_userId_idx" ON "PersonConnection"("userId");

-- CreateIndex
CREATE INDEX "PersonConnection_fromPersonId_idx" ON "PersonConnection"("fromPersonId");

-- CreateIndex
CREATE INDEX "PersonConnection_toPersonId_idx" ON "PersonConnection"("toPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonConnection_userId_fromPersonId_toPersonId_key" ON "PersonConnection"("userId", "fromPersonId", "toPersonId");
