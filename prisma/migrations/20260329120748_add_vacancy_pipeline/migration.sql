-- CreateTable
CREATE TABLE "StagedVacancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceBoard" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "employerName" TEXT,
    "location" TEXT,
    "description" TEXT,
    "salary" TEXT,
    "employmentType" TEXT,
    "postedAt" DATETIME,
    "applicationDeadline" TEXT,
    "applicationInstructions" TEXT,
    "source" TEXT NOT NULL DEFAULT 'automation',
    "automationId" TEXT,
    "matchScore" INTEGER,
    "matchData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'staged',
    "promotedToJobId" TEXT,
    "archivedAt" DATETIME,
    "trashedAt" DATETIME,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StagedVacancy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StagedVacancy_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StagedVacancy_promotedToJobId_fkey" FOREIGN KEY ("promotedToJobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DedupHash" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "sourceBoard" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DedupHash_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StagedVacancy_promotedToJobId_key" ON "StagedVacancy"("promotedToJobId");

-- CreateIndex
CREATE INDEX "StagedVacancy_userId_status_idx" ON "StagedVacancy"("userId", "status");

-- CreateIndex
CREATE INDEX "StagedVacancy_userId_automationId_idx" ON "StagedVacancy"("userId", "automationId");

-- CreateIndex
CREATE INDEX "StagedVacancy_userId_createdAt_idx" ON "StagedVacancy"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StagedVacancy_trashedAt_idx" ON "StagedVacancy"("trashedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StagedVacancy_userId_sourceBoard_externalId_key" ON "StagedVacancy"("userId", "sourceBoard", "externalId");

-- CreateIndex
CREATE INDEX "DedupHash_userId_sourceBoard_idx" ON "DedupHash"("userId", "sourceBoard");

-- CreateIndex
CREATE UNIQUE INDEX "DedupHash_userId_hash_key" ON "DedupHash"("userId", "hash");
