-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CrmActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "happenedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "targetPersonId" TEXT,
    "targetCompanyId" TEXT,
    "targetJobId" TEXT,
    "details" TEXT,
    "linkedRecordName" TEXT,
    CONSTRAINT "CrmActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CrmActivityLog_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmActivityLog_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmActivityLog_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CrmActivityLog" ("activityType", "actorId", "details", "happenedAt", "id", "linkedRecordName", "targetCompanyId", "targetJobId", "targetPersonId", "userId") SELECT "activityType", "actorId", "details", "happenedAt", "id", "linkedRecordName", "targetCompanyId", "targetJobId", "targetPersonId", "userId" FROM "CrmActivityLog";
DROP TABLE "CrmActivityLog";
ALTER TABLE "new_CrmActivityLog" RENAME TO "CrmActivityLog";
CREATE INDEX "CrmActivityLog_userId_happenedAt_idx" ON "CrmActivityLog"("userId", "happenedAt");
CREATE INDEX "CrmActivityLog_targetPersonId_happenedAt_idx" ON "CrmActivityLog"("targetPersonId", "happenedAt");
CREATE INDEX "CrmActivityLog_targetJobId_happenedAt_idx" ON "CrmActivityLog"("targetJobId", "happenedAt");
CREATE INDEX "CrmActivityLog_userId_activityType_idx" ON "CrmActivityLog"("userId", "activityType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
