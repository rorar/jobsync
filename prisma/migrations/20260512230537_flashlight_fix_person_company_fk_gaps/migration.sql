-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JobContact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
