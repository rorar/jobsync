-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Automation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobBoard" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "connectorParams" TEXT,
    "resumeId" TEXT NOT NULL,
    "matchThreshold" INTEGER NOT NULL DEFAULT 80,
    "scheduleHour" INTEGER NOT NULL,
    "scheduleFrequency" TEXT NOT NULL DEFAULT 'daily',
    "nextRunAt" DATETIME,
    "lastRunAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pauseReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Automation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Automation_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Automation" ("connectorParams", "createdAt", "id", "jobBoard", "keywords", "lastRunAt", "location", "matchThreshold", "name", "nextRunAt", "pauseReason", "resumeId", "scheduleHour", "status", "updatedAt", "userId") SELECT "connectorParams", "createdAt", "id", "jobBoard", "keywords", "lastRunAt", "location", "matchThreshold", "name", "nextRunAt", "pauseReason", "resumeId", "scheduleHour", "status", "updatedAt", "userId" FROM "Automation";
DROP TABLE "Automation";
ALTER TABLE "new_Automation" RENAME TO "Automation";
CREATE INDEX "Automation_userId_idx" ON "Automation"("userId");
CREATE INDEX "Automation_status_nextRunAt_idx" ON "Automation"("status", "nextRunAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
