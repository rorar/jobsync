-- CreateTable
CREATE TABLE "Person" (
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
    "companyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dataSource" TEXT NOT NULL DEFAULT 'manual',
    "processingBasis" TEXT NOT NULL DEFAULT 'legitimate_interest',
    "retentionExpiresAt" DATETIME,
    "createdBySource" TEXT NOT NULL DEFAULT 'manual',
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Person_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmInterview" (
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
    CONSTRAINT "CrmInterview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CrmInterview_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmTaskTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetPersonId" TEXT,
    "targetCompanyId" TEXT,
    "targetJobId" TEXT,
    CONSTRAINT "CrmTaskTarget_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CrmTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmTaskTarget_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmTaskTarget_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmTaskTarget_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmNoteTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "targetPersonId" TEXT,
    "targetCompanyId" TEXT,
    "targetJobId" TEXT,
    CONSTRAINT "CrmNoteTarget_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CrmNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrmNoteTarget_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmNoteTarget_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmNoteTarget_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmActivityLog" (
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
    CONSTRAINT "CrmActivityLog_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmBlocklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmBlocklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "iv" TEXT NOT NULL,
    "isSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME,
    "authFailedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "Person_userId_status_idx" ON "Person"("userId", "status");

-- CreateIndex
CREATE INDEX "Person_userId_companyId_idx" ON "Person"("userId", "companyId");

-- CreateIndex
CREATE INDEX "CrmInterview_userId_idx" ON "CrmInterview"("userId");

-- CreateIndex
CREATE INDEX "CrmInterview_userId_jobId_idx" ON "CrmInterview"("userId", "jobId");

-- CreateIndex
CREATE INDEX "CrmInterview_userId_status_idx" ON "CrmInterview"("userId", "status");

-- CreateIndex
CREATE INDEX "CrmInterview_userId_interviewDate_idx" ON "CrmInterview"("userId", "interviewDate");

-- CreateIndex
CREATE INDEX "CrmTask_userId_idx" ON "CrmTask"("userId");

-- CreateIndex
CREATE INDEX "CrmTask_userId_status_idx" ON "CrmTask"("userId", "status");

-- CreateIndex
CREATE INDEX "CrmTask_userId_dueDate_idx" ON "CrmTask"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "CrmTaskTarget_taskId_idx" ON "CrmTaskTarget"("taskId");

-- CreateIndex
CREATE INDEX "CrmTaskTarget_targetPersonId_idx" ON "CrmTaskTarget"("targetPersonId");

-- CreateIndex
CREATE INDEX "CrmTaskTarget_targetJobId_idx" ON "CrmTaskTarget"("targetJobId");

-- CreateIndex
CREATE INDEX "CrmNote_userId_idx" ON "CrmNote"("userId");

-- CreateIndex
CREATE INDEX "CrmNoteTarget_noteId_idx" ON "CrmNoteTarget"("noteId");

-- CreateIndex
CREATE INDEX "CrmNoteTarget_targetPersonId_idx" ON "CrmNoteTarget"("targetPersonId");

-- CreateIndex
CREATE INDEX "CrmNoteTarget_targetJobId_idx" ON "CrmNoteTarget"("targetJobId");

-- CreateIndex
CREATE INDEX "CrmActivityLog_userId_happenedAt_idx" ON "CrmActivityLog"("userId", "happenedAt");

-- CreateIndex
CREATE INDEX "CrmActivityLog_targetPersonId_happenedAt_idx" ON "CrmActivityLog"("targetPersonId", "happenedAt");

-- CreateIndex
CREATE INDEX "CrmActivityLog_targetJobId_happenedAt_idx" ON "CrmActivityLog"("targetJobId", "happenedAt");

-- CreateIndex
CREATE INDEX "CrmActivityLog_userId_activityType_idx" ON "CrmActivityLog"("userId", "activityType");

-- CreateIndex
CREATE INDEX "CrmBlocklist_userId_idx" ON "CrmBlocklist"("userId");

-- CreateIndex
CREATE INDEX "CrmBlocklist_userId_type_idx" ON "CrmBlocklist"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CrmBlocklist_userId_handle_key" ON "CrmBlocklist"("userId", "handle");

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_userId_provider_handle_key" ON "ConnectedAccount"("userId", "provider", "handle");
