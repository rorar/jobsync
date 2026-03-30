-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutomationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "automationId" TEXT NOT NULL,
    "jobsSearched" INTEGER NOT NULL DEFAULT 0,
    "jobsDeduplicated" INTEGER NOT NULL DEFAULT 0,
    "jobsProcessed" INTEGER NOT NULL DEFAULT 0,
    "jobsMatched" INTEGER NOT NULL DEFAULT 0,
    "jobsSaved" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "runSource" TEXT NOT NULL DEFAULT 'scheduler',
    "errorMessage" TEXT,
    "blockedReason" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AutomationRun" ("automationId", "blockedReason", "completedAt", "errorMessage", "id", "jobsDeduplicated", "jobsMatched", "jobsProcessed", "jobsSaved", "jobsSearched", "startedAt", "status") SELECT "automationId", "blockedReason", "completedAt", "errorMessage", "id", "jobsDeduplicated", "jobsMatched", "jobsProcessed", "jobsSaved", "jobsSearched", "startedAt", "status" FROM "AutomationRun";
DROP TABLE "AutomationRun";
ALTER TABLE "new_AutomationRun" RENAME TO "AutomationRun";
CREATE INDEX "AutomationRun_automationId_idx" ON "AutomationRun"("automationId");
CREATE INDEX "AutomationRun_startedAt_idx" ON "AutomationRun"("startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
