-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CrmInterview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "personId" TEXT,
    "interviewDate" DATETIME NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "outcome" TEXT,
    "outcomeNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmInterview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CrmInterview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmInterview_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CrmInterview" ("createdAt", "id", "interviewDate", "jobId", "location", "notes", "outcome", "outcomeNotes", "personId", "status", "updatedAt", "userId") SELECT "createdAt", "id", "interviewDate", "jobId", "location", "notes", "outcome", "outcomeNotes", "personId", "status", "updatedAt", "userId" FROM "CrmInterview";
DROP TABLE "CrmInterview";
ALTER TABLE "new_CrmInterview" RENAME TO "CrmInterview";
CREATE INDEX "CrmInterview_userId_idx" ON "CrmInterview"("userId");
CREATE INDEX "CrmInterview_userId_jobId_idx" ON "CrmInterview"("userId", "jobId");
CREATE INDEX "CrmInterview_userId_status_idx" ON "CrmInterview"("userId", "status");
CREATE INDEX "CrmInterview_userId_interviewDate_idx" ON "CrmInterview"("userId", "interviewDate");
CREATE TABLE "new_JobContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JobContact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JobContact" ("createdAt", "id", "jobId", "personId", "role", "userId") SELECT "createdAt", "id", "jobId", "personId", "role", "userId" FROM "JobContact";
DROP TABLE "JobContact";
ALTER TABLE "new_JobContact" RENAME TO "JobContact";
CREATE INDEX "JobContact_userId_idx" ON "JobContact"("userId");
CREATE INDEX "JobContact_personId_idx" ON "JobContact"("personId");
CREATE INDEX "JobContact_jobId_idx" ON "JobContact"("jobId");
CREATE UNIQUE INDEX "JobContact_jobId_personId_key" ON "JobContact"("jobId", "personId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
