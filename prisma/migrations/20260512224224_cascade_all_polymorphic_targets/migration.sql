-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CrmNoteTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "targetPersonId" TEXT,
    "targetCompanyId" TEXT,
    "targetJobId" TEXT,
    CONSTRAINT "CrmNoteTarget_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CrmNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmNoteTarget_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmNoteTarget_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmNoteTarget_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CrmNoteTarget" ("id", "noteId", "targetCompanyId", "targetJobId", "targetPersonId") SELECT "id", "noteId", "targetCompanyId", "targetJobId", "targetPersonId" FROM "CrmNoteTarget";
DROP TABLE "CrmNoteTarget";
ALTER TABLE "new_CrmNoteTarget" RENAME TO "CrmNoteTarget";
CREATE INDEX "CrmNoteTarget_noteId_idx" ON "CrmNoteTarget"("noteId");
CREATE INDEX "CrmNoteTarget_targetPersonId_idx" ON "CrmNoteTarget"("targetPersonId");
CREATE INDEX "CrmNoteTarget_targetJobId_idx" ON "CrmNoteTarget"("targetJobId");
CREATE TABLE "new_CrmTaskTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetPersonId" TEXT,
    "targetCompanyId" TEXT,
    "targetJobId" TEXT,
    CONSTRAINT "CrmTaskTarget_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CrmTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmTaskTarget_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmTaskTarget_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmTaskTarget_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CrmTaskTarget" ("id", "targetCompanyId", "targetJobId", "targetPersonId", "taskId") SELECT "id", "targetCompanyId", "targetJobId", "targetPersonId", "taskId" FROM "CrmTaskTarget";
DROP TABLE "CrmTaskTarget";
ALTER TABLE "new_CrmTaskTarget" RENAME TO "CrmTaskTarget";
CREATE INDEX "CrmTaskTarget_taskId_idx" ON "CrmTaskTarget"("taskId");
CREATE INDEX "CrmTaskTarget_targetPersonId_idx" ON "CrmTaskTarget"("targetPersonId");
CREATE INDEX "CrmTaskTarget_targetJobId_idx" ON "CrmTaskTarget"("targetJobId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
