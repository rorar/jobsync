-- Welle 4 — Custom JobStatus (F-AJ-09).
-- Converts the global, fixed JobStatus set into PER-USER statuses grouped into
-- seven fixed "stage" categories. Seeds each user's categories + statuses,
-- repoints every Job and JobStatusHistory reference from the old global rows
-- onto the equivalent per-user status (legacy draft/saved/new -> bookmarked),
-- backfills the applied flag/date from the new category semantics, then drops
-- the global JobStatus rows. No job loses its status.
--
-- Spec: specs/job-status.allium. Verified against a copy of dev.db before apply.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 1) Stage categories (per user) ------------------------------------------------
CREATE TABLE "JobStatusCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isAppliedStage" BOOLEAN NOT NULL,
    "isTerminal" BOOLEAN NOT NULL,
    "defaultCollapsed" BOOLEAN NOT NULL,
    "allowsSelfTransition" BOOLEAN NOT NULL,
    CONSTRAINT "JobStatusCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "JobStatusCategory" ("id","userId","kind","label","colour","sortOrder","isAppliedStage","isTerminal","defaultCollapsed","allowsSelfTransition")
SELECT lower(hex(randomblob(16))), u."id", 'lead',         'Lead',         'blue',    0, false, false, false, false FROM "User" u
UNION ALL SELECT lower(hex(randomblob(16))), u."id", 'applied',      'Applied',      'indigo',  1, true,  false, false, false FROM "User" u
UNION ALL SELECT lower(hex(randomblob(16))), u."id", 'interviewing', 'Interviewing', 'purple',  2, true,  false, false, true  FROM "User" u
UNION ALL SELECT lower(hex(randomblob(16))), u."id", 'offer',        'Offer',        'green',   3, true,  false, false, false FROM "User" u
UNION ALL SELECT lower(hex(randomblob(16))), u."id", 'won',          'Won',          'emerald', 4, true,  true,  false, false FROM "User" u
UNION ALL SELECT lower(hex(randomblob(16))), u."id", 'lost',         'Lost',         'red',     5, false, false, true,  false FROM "User" u
UNION ALL SELECT lower(hex(randomblob(16))), u."id", 'archived',     'Archived',     'gray',    6, false, false, true,  false FROM "User" u;

-- 2) Per-user statuses (new JobStatus table) -----------------------------------
CREATE TABLE "new_JobStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "JobStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobStatus_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "JobStatusCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Seed the eight default statuses per user, each linked to its stage category.
INSERT INTO "new_JobStatus" ("id","userId","categoryId","label","value","sortOrder","isDefault")
          SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Bookmarked','bookmarked',0,true  FROM "JobStatusCategory" c WHERE c."kind"='lead'
UNION ALL SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Applied',   'applied',   0,false FROM "JobStatusCategory" c WHERE c."kind"='applied'
UNION ALL SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Interview', 'interview', 0,false FROM "JobStatusCategory" c WHERE c."kind"='interviewing'
UNION ALL SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Offer',     'offer',     0,false FROM "JobStatusCategory" c WHERE c."kind"='offer'
UNION ALL SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Accepted',  'accepted',  0,false FROM "JobStatusCategory" c WHERE c."kind"='won'
UNION ALL SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Rejected',  'rejected',  0,false FROM "JobStatusCategory" c WHERE c."kind"='lost'
UNION ALL SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Archived',  'archived',  0,false FROM "JobStatusCategory" c WHERE c."kind"='archived'
UNION ALL SELECT lower(hex(randomblob(16))), c."userId", c."id", 'Expired',   'expired',   1,false FROM "JobStatusCategory" c WHERE c."kind"='archived';

-- 3) Repoint Job.statusId from the old global status onto the per-user status ---
-- Legacy value mapping (draft/saved/new -> bookmarked); unknown -> user default.
UPDATE "Job" SET "statusId" = COALESCE(
    (SELECT ns."id" FROM "new_JobStatus" ns
       WHERE ns."userId" = "Job"."userId"
         AND ns."value" = (CASE (SELECT os."value" FROM "JobStatus" os WHERE os."id" = "Job"."statusId")
                             WHEN 'draft' THEN 'bookmarked'
                             WHEN 'saved' THEN 'bookmarked'
                             WHEN 'new'   THEN 'bookmarked'
                             ELSE (SELECT os2."value" FROM "JobStatus" os2 WHERE os2."id" = "Job"."statusId")
                           END)),
    (SELECT d."id" FROM "new_JobStatus" d WHERE d."userId" = "Job"."userId" AND d."isDefault" = true));

-- 4) Repoint JobStatusHistory FK columns ---------------------------------------
UPDATE "JobStatusHistory" SET "newStatusId" = COALESCE(
    (SELECT ns."id" FROM "new_JobStatus" ns
       WHERE ns."userId" = "JobStatusHistory"."userId"
         AND ns."value" = (CASE (SELECT os."value" FROM "JobStatus" os WHERE os."id" = "JobStatusHistory"."newStatusId")
                             WHEN 'draft' THEN 'bookmarked'
                             WHEN 'saved' THEN 'bookmarked'
                             WHEN 'new'   THEN 'bookmarked'
                             ELSE (SELECT os2."value" FROM "JobStatus" os2 WHERE os2."id" = "JobStatusHistory"."newStatusId")
                           END)),
    (SELECT d."id" FROM "new_JobStatus" d WHERE d."userId" = "JobStatusHistory"."userId" AND d."isDefault" = true));

UPDATE "JobStatusHistory" SET "previousStatusId" = COALESCE(
    (SELECT ns."id" FROM "new_JobStatus" ns
       WHERE ns."userId" = "JobStatusHistory"."userId"
         AND ns."value" = (CASE (SELECT os."value" FROM "JobStatus" os WHERE os."id" = "JobStatusHistory"."previousStatusId")
                             WHEN 'draft' THEN 'bookmarked'
                             WHEN 'saved' THEN 'bookmarked'
                             WHEN 'new'   THEN 'bookmarked'
                             ELSE (SELECT os2."value" FROM "JobStatus" os2 WHERE os2."id" = "JobStatusHistory"."previousStatusId")
                           END)),
    (SELECT d."id" FROM "new_JobStatus" d WHERE d."userId" = "JobStatusHistory"."userId" AND d."isDefault" = true))
WHERE "previousStatusId" IS NOT NULL;

-- 5) Swap tables ---------------------------------------------------------------
DROP TABLE "JobStatus";
ALTER TABLE "new_JobStatus" RENAME TO "JobStatus";

CREATE UNIQUE INDEX "JobStatus_userId_value_key" ON "JobStatus"("userId", "value");
CREATE INDEX "JobStatus_userId_sortOrder_idx" ON "JobStatus"("userId", "sortOrder");
CREATE INDEX "JobStatus_categoryId_idx" ON "JobStatus"("categoryId");
CREATE UNIQUE INDEX "JobStatusCategory_userId_kind_key" ON "JobStatusCategory"("userId", "kind");
CREATE INDEX "JobStatusCategory_userId_sortOrder_idx" ON "JobStatusCategory"("userId", "sortOrder");

-- 6) Backfill applied / appliedDate from the new category semantics ------------
-- Old logic only flagged applied for applied/interview values; offer/accepted
-- jobs may have applied=false. Set applied=true for any job now in an
-- applied-stage status.
UPDATE "Job" SET "applied" = true
 WHERE "applied" = false
   AND "statusId" IN (SELECT s."id" FROM "JobStatus" s JOIN "JobStatusCategory" c ON c."id" = s."categoryId" WHERE c."isAppliedStage" = true);

UPDATE "Job" SET "appliedDate" = COALESCE(
    "appliedDate",
    (SELECT MIN(h."changedAt") FROM "JobStatusHistory" h
        JOIN "JobStatus" s ON s."id" = h."newStatusId"
        JOIN "JobStatusCategory" c ON c."id" = s."categoryId"
       WHERE h."jobId" = "Job"."id" AND c."isAppliedStage" = true),
    CURRENT_TIMESTAMP)
 WHERE "applied" = true AND "appliedDate" IS NULL;

PRAGMA foreign_keys=ON;
