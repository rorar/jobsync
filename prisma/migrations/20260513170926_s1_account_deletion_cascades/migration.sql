-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "duration" INTEGER,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "taskId" TEXT,
    CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Activity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Activity" ("activityName", "activityTypeId", "createdAt", "description", "duration", "endTime", "id", "startTime", "taskId", "updatedAt", "userId") SELECT "activityName", "activityTypeId", "createdAt", "description", "duration", "endTime", "id", "startTime", "taskId", "updatedAt", "userId" FROM "Activity";
DROP TABLE "Activity";
ALTER TABLE "new_Activity" RENAME TO "Activity";
CREATE UNIQUE INDEX "Activity_taskId_key" ON "Activity"("taskId");
CREATE INDEX "Activity_userId_idx" ON "Activity"("userId");
CREATE INDEX "Activity_activityTypeId_idx" ON "Activity"("activityTypeId");
CREATE TABLE "new_ActivityType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActivityType_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ActivityType" ("createdAt", "createdBy", "description", "id", "label", "updatedAt", "value") SELECT "createdAt", "createdBy", "description", "id", "label", "updatedAt", "value" FROM "ActivityType";
DROP TABLE "ActivityType";
ALTER TABLE "new_ActivityType" RENAME TO "ActivityType";
CREATE UNIQUE INDEX "ActivityType_value_createdBy_key" ON "ActivityType"("value", "createdBy");
CREATE TABLE "new_ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ApiKey" ("createdAt", "encryptedKey", "id", "iv", "label", "last4", "lastUsedAt", "provider", "updatedAt", "userId") SELECT "createdAt", "encryptedKey", "id", "iv", "label", "last4", "lastUsedAt", "provider", "updatedAt", "userId" FROM "ApiKey";
DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE UNIQUE INDEX "ApiKey_userId_provider_key" ON "ApiKey"("userId", "provider");
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
    CONSTRAINT "Automation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Automation_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Automation" ("connectorParams", "createdAt", "id", "jobBoard", "keywords", "lastRunAt", "location", "matchThreshold", "name", "nextRunAt", "pauseReason", "resumeId", "scheduleFrequency", "scheduleHour", "status", "updatedAt", "userId") SELECT "connectorParams", "createdAt", "id", "jobBoard", "keywords", "lastRunAt", "location", "matchThreshold", "name", "nextRunAt", "pauseReason", "resumeId", "scheduleFrequency", "scheduleHour", "status", "updatedAt", "userId" FROM "Automation";
DROP TABLE "Automation";
ALTER TABLE "new_Automation" RENAME TO "Automation";
CREATE INDEX "Automation_userId_idx" ON "Automation"("userId");
CREATE INDEX "Automation_status_nextRunAt_idx" ON "Automation"("status", "nextRunAt");
CREATE INDEX "Automation_resumeId_idx" ON "Automation"("resumeId");
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "domain" TEXT,
    "logoUrl" TEXT,
    "logoAssetId" TEXT,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "Company_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "LogoAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Company_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Company" ("createdBy", "domain", "id", "label", "logoAssetId", "logoUrl", "value") SELECT "createdBy", "domain", "id", "label", "logoAssetId", "logoUrl", "value" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_logoAssetId_key" ON "Company"("logoAssetId");
CREATE UNIQUE INDEX "Company_value_createdBy_key" ON "Company"("value", "createdBy");
CREATE TABLE "new_CompanyBlacklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyBlacklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CompanyBlacklist" ("createdAt", "id", "matchType", "pattern", "reason", "updatedAt", "userId") SELECT "createdAt", "id", "matchType", "pattern", "reason", "updatedAt", "userId" FROM "CompanyBlacklist";
DROP TABLE "CompanyBlacklist";
ALTER TABLE "new_CompanyBlacklist" RENAME TO "CompanyBlacklist";
CREATE INDEX "CompanyBlacklist_userId_idx" ON "CompanyBlacklist"("userId");
CREATE UNIQUE INDEX "CompanyBlacklist_userId_pattern_matchType_key" ON "CompanyBlacklist"("userId", "pattern", "matchType");
CREATE TABLE "new_ConnectedAccount" (
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
    CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ConnectedAccount" ("accessToken", "authFailedAt", "createdAt", "handle", "id", "isSyncEnabled", "iv", "lastSyncedAt", "provider", "refreshToken", "updatedAt", "userId") SELECT "accessToken", "authFailedAt", "createdAt", "handle", "id", "isSyncEnabled", "iv", "lastSyncedAt", "provider", "refreshToken", "updatedAt", "userId" FROM "ConnectedAccount";
DROP TABLE "ConnectedAccount";
ALTER TABLE "new_ConnectedAccount" RENAME TO "ConnectedAccount";
CREATE INDEX "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");
CREATE UNIQUE INDEX "ConnectedAccount_userId_provider_handle_key" ON "ConnectedAccount"("userId", "provider", "handle");
CREATE TABLE "new_Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    "interviewId" TEXT,
    CONSTRAINT "Contact_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contact_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contact" ("createdAt", "createdBy", "email", "id", "interviewId", "name") SELECT "createdAt", "createdBy", "email", "id", "interviewId", "name" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE INDEX "Contact_createdBy_idx" ON "Contact"("createdBy");
CREATE INDEX "Contact_interviewId_idx" ON "Contact"("interviewId");
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
    CONSTRAINT "CrmActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
CREATE INDEX "CrmActivityLog_targetCompanyId_idx" ON "CrmActivityLog"("targetCompanyId");
CREATE TABLE "new_CrmBlocklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmBlocklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CrmBlocklist" ("createdAt", "handle", "id", "reason", "type", "userId") SELECT "createdAt", "handle", "id", "reason", "type", "userId" FROM "CrmBlocklist";
DROP TABLE "CrmBlocklist";
ALTER TABLE "new_CrmBlocklist" RENAME TO "CrmBlocklist";
CREATE INDEX "CrmBlocklist_userId_idx" ON "CrmBlocklist"("userId");
CREATE INDEX "CrmBlocklist_userId_type_idx" ON "CrmBlocklist"("userId", "type");
CREATE UNIQUE INDEX "CrmBlocklist_userId_handle_key" ON "CrmBlocklist"("userId", "handle");
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
    CONSTRAINT "CrmInterview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
CREATE TABLE "new_CrmNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CrmNote" ("body", "createdAt", "id", "title", "updatedAt", "userId") SELECT "body", "createdAt", "id", "title", "updatedAt", "userId" FROM "CrmNote";
DROP TABLE "CrmNote";
ALTER TABLE "new_CrmNote" RENAME TO "CrmNote";
CREATE INDEX "CrmNote_userId_idx" ON "CrmNote"("userId");
CREATE TABLE "new_CrmTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CrmTask" ("completedAt", "createdAt", "description", "dueDate", "id", "status", "title", "updatedAt", "userId") SELECT "completedAt", "createdAt", "description", "dueDate", "id", "status", "title", "updatedAt", "userId" FROM "CrmTask";
DROP TABLE "CrmTask";
ALTER TABLE "new_CrmTask" RENAME TO "CrmTask";
CREATE INDEX "CrmTask_userId_idx" ON "CrmTask"("userId");
CREATE INDEX "CrmTask_userId_status_idx" ON "CrmTask"("userId", "status");
CREATE INDEX "CrmTask_userId_dueDate_idx" ON "CrmTask"("userId", "dueDate");
CREATE TABLE "new_DedupHash" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "sourceBoard" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DedupHash_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DedupHash" ("createdAt", "hash", "id", "sourceBoard", "userId") SELECT "createdAt", "hash", "id", "sourceBoard", "userId" FROM "DedupHash";
DROP TABLE "DedupHash";
ALTER TABLE "new_DedupHash" RENAME TO "DedupHash";
CREATE INDEX "DedupHash_userId_sourceBoard_idx" ON "DedupHash"("userId", "sourceBoard");
CREATE UNIQUE INDEX "DedupHash_userId_hash_key" ON "DedupHash"("userId", "hash");
CREATE TABLE "new_EnrichmentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "enrichmentResultId" TEXT,
    "dimension" TEXT NOT NULL,
    "domainKey" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "chainPosition" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnrichmentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnrichmentLog_enrichmentResultId_fkey" FOREIGN KEY ("enrichmentResultId") REFERENCES "EnrichmentResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EnrichmentLog" ("chainPosition", "createdAt", "dimension", "domainKey", "enrichmentResultId", "errorMessage", "id", "latencyMs", "moduleId", "outcome", "userId") SELECT "chainPosition", "createdAt", "dimension", "domainKey", "enrichmentResultId", "errorMessage", "id", "latencyMs", "moduleId", "outcome", "userId" FROM "EnrichmentLog";
DROP TABLE "EnrichmentLog";
ALTER TABLE "new_EnrichmentLog" RENAME TO "EnrichmentLog";
CREATE INDEX "EnrichmentLog_userId_dimension_domainKey_idx" ON "EnrichmentLog"("userId", "dimension", "domainKey");
CREATE INDEX "EnrichmentLog_moduleId_outcome_idx" ON "EnrichmentLog"("moduleId", "outcome");
CREATE INDEX "EnrichmentLog_createdAt_idx" ON "EnrichmentLog"("createdAt");
CREATE INDEX "EnrichmentLog_enrichmentResultId_idx" ON "EnrichmentLog"("enrichmentResultId");
CREATE TABLE "new_EnrichmentResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "domainKey" TEXT NOT NULL,
    "companyId" TEXT,
    "status" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "sourceModuleId" TEXT NOT NULL,
    "ttlSeconds" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EnrichmentResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnrichmentResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EnrichmentResult" ("companyId", "createdAt", "data", "dimension", "domainKey", "expiresAt", "id", "sourceModuleId", "status", "ttlSeconds", "updatedAt", "userId") SELECT "companyId", "createdAt", "data", "dimension", "domainKey", "expiresAt", "id", "sourceModuleId", "status", "ttlSeconds", "updatedAt", "userId" FROM "EnrichmentResult";
DROP TABLE "EnrichmentResult";
ALTER TABLE "new_EnrichmentResult" RENAME TO "EnrichmentResult";
CREATE INDEX "EnrichmentResult_userId_dimension_status_idx" ON "EnrichmentResult"("userId", "dimension", "status");
CREATE INDEX "EnrichmentResult_expiresAt_idx" ON "EnrichmentResult"("expiresAt");
CREATE INDEX "EnrichmentResult_companyId_idx" ON "EnrichmentResult"("companyId");
CREATE UNIQUE INDEX "EnrichmentResult_userId_dimension_domainKey_key" ON "EnrichmentResult"("userId", "dimension", "domainKey");
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
    "jobSourceId" TEXT,
    "salaryRange" TEXT,
    "locationId" TEXT,
    "resumeId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" REAL NOT NULL DEFAULT 0,
    "automationId" TEXT,
    "matchScore" INTEGER,
    "matchData" TEXT,
    "discoveryStatus" TEXT,
    "discoveredAt" DATETIME,
    CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Job_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "JobStatus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("applied", "appliedDate", "automationId", "companyId", "createdAt", "description", "discoveredAt", "discoveryStatus", "dueDate", "id", "jobSourceId", "jobTitleId", "jobType", "jobUrl", "locationId", "matchData", "matchScore", "resumeId", "salaryRange", "sortOrder", "statusId", "userId", "version") SELECT "applied", "appliedDate", "automationId", "companyId", "createdAt", "description", "discoveredAt", "discoveryStatus", "dueDate", "id", "jobSourceId", "jobTitleId", "jobType", "jobUrl", "locationId", "matchData", "matchScore", "resumeId", "salaryRange", "sortOrder", "statusId", "userId", "version" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_userId_automationId_idx" ON "Job"("userId", "automationId");
CREATE INDEX "Job_userId_discoveryStatus_idx" ON "Job"("userId", "discoveryStatus");
CREATE INDEX "Job_userId_statusId_sortOrder_idx" ON "Job"("userId", "statusId", "sortOrder");
CREATE INDEX "Job_jobTitleId_idx" ON "Job"("jobTitleId");
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");
CREATE INDEX "Job_jobSourceId_idx" ON "Job"("jobSourceId");
CREATE INDEX "Job_locationId_idx" ON "Job"("locationId");
CREATE INDEX "Job_resumeId_idx" ON "Job"("resumeId");
CREATE INDEX "Job_automationId_idx" ON "Job"("automationId");
CREATE INDEX "Job_statusId_idx" ON "Job"("statusId");
CREATE TABLE "new_JobContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
CREATE TABLE "new_JobSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "JobSource_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobSource" ("createdBy", "id", "label", "value") SELECT "createdBy", "id", "label", "value" FROM "JobSource";
DROP TABLE "JobSource";
ALTER TABLE "new_JobSource" RENAME TO "JobSource";
CREATE UNIQUE INDEX "JobSource_value_createdBy_key" ON "JobSource"("value", "createdBy");
CREATE TABLE "new_JobStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousStatusId" TEXT,
    "newStatusId" TEXT NOT NULL,
    "note" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobStatusHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobStatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobStatusHistory_previousStatusId_fkey" FOREIGN KEY ("previousStatusId") REFERENCES "JobStatus" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JobStatusHistory_newStatusId_fkey" FOREIGN KEY ("newStatusId") REFERENCES "JobStatus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JobStatusHistory" ("changedAt", "id", "jobId", "newStatusId", "note", "previousStatusId", "userId") SELECT "changedAt", "id", "jobId", "newStatusId", "note", "previousStatusId", "userId" FROM "JobStatusHistory";
DROP TABLE "JobStatusHistory";
ALTER TABLE "new_JobStatusHistory" RENAME TO "JobStatusHistory";
CREATE INDEX "JobStatusHistory_jobId_changedAt_idx" ON "JobStatusHistory"("jobId", "changedAt");
CREATE INDEX "JobStatusHistory_userId_changedAt_idx" ON "JobStatusHistory"("userId", "changedAt");
CREATE INDEX "JobStatusHistory_jobId_userId_idx" ON "JobStatusHistory"("jobId", "userId");
CREATE INDEX "JobStatusHistory_previousStatusId_idx" ON "JobStatusHistory"("previousStatusId");
CREATE INDEX "JobStatusHistory_newStatusId_idx" ON "JobStatusHistory"("newStatusId");
CREATE TABLE "new_JobTitle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "JobTitle_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobTitle" ("createdBy", "id", "label", "value") SELECT "createdBy", "id", "label", "value" FROM "JobTitle";
DROP TABLE "JobTitle";
ALTER TABLE "new_JobTitle" RENAME TO "JobTitle";
CREATE UNIQUE INDEX "JobTitle_value_createdBy_key" ON "JobTitle"("value", "createdBy");
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "stateProv" TEXT,
    "country" TEXT,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "Location_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Location" ("country", "createdBy", "id", "label", "stateProv", "value") SELECT "country", "createdBy", "id", "label", "stateProv", "value" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE UNIQUE INDEX "Location_value_createdBy_key" ON "Location"("value", "createdBy");
CREATE TABLE "new_LogoAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LogoAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LogoAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LogoAsset" ("companyId", "createdAt", "errorMessage", "filePath", "fileSize", "height", "id", "mimeType", "sourceUrl", "status", "updatedAt", "userId", "width") SELECT "companyId", "createdAt", "errorMessage", "filePath", "fileSize", "height", "id", "mimeType", "sourceUrl", "status", "updatedAt", "userId", "width" FROM "LogoAsset";
DROP TABLE "LogoAsset";
ALTER TABLE "new_LogoAsset" RENAME TO "LogoAsset";
CREATE INDEX "LogoAsset_userId_status_idx" ON "LogoAsset"("userId", "status");
CREATE INDEX "LogoAsset_companyId_idx" ON "LogoAsset"("companyId");
CREATE UNIQUE INDEX "LogoAsset_userId_companyId_key" ON "LogoAsset"("userId", "companyId");
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("content", "createdAt", "id", "jobId", "updatedAt", "userId") SELECT "content", "createdAt", "id", "jobId", "updatedAt", "userId" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_jobId_idx" ON "Note"("jobId");
CREATE INDEX "Note_userId_idx" ON "Note"("userId");
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "moduleId" TEXT,
    "automationId" TEXT,
    "data" JSONB,
    "severity" TEXT,
    "actorType" TEXT,
    "actorId" TEXT,
    "titleKey" TEXT,
    "titleParams" JSONB,
    "reasonKey" TEXT,
    "reasonParams" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("actorId", "actorType", "automationId", "createdAt", "data", "id", "message", "moduleId", "read", "reasonKey", "reasonParams", "severity", "titleKey", "titleParams", "type", "userId") SELECT "actorId", "actorType", "automationId", "createdAt", "data", "id", "message", "moduleId", "read", "reasonKey", "reasonParams", "severity", "titleKey", "titleParams", "type", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "emails" TEXT NOT NULL DEFAULT '[]',
    "phones" TEXT NOT NULL DEFAULT '[]',
    "headline" TEXT,
    "socialProfiles" TEXT NOT NULL DEFAULT '[]',
    "avatarUrl" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressPostalCode" TEXT,
    "addressCountry" TEXT,
    "companies" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "dataSource" TEXT NOT NULL DEFAULT 'manual',
    "processingBasis" TEXT NOT NULL DEFAULT 'legitimate_interest',
    "retentionExpiresAt" DATETIME,
    "createdBySource" TEXT NOT NULL DEFAULT 'manual',
    "createdByName" TEXT,
    "updatedBySource" TEXT NOT NULL DEFAULT 'manual',
    "updatedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Person" ("addressCity", "addressCountry", "addressPostalCode", "addressStreet", "avatarUrl", "companies", "createdAt", "createdByName", "createdBySource", "dataSource", "emails", "firstName", "headline", "id", "lastName", "phones", "processingBasis", "retentionExpiresAt", "socialProfiles", "status", "updatedAt", "updatedByName", "updatedBySource", "userId") SELECT "addressCity", "addressCountry", "addressPostalCode", "addressStreet", "avatarUrl", "companies", "createdAt", "createdByName", "createdBySource", "dataSource", "emails", "firstName", "headline", "id", "lastName", "phones", "processingBasis", "retentionExpiresAt", "socialProfiles", "status", "updatedAt", "updatedByName", "updatedBySource", "userId" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE INDEX "Person_userId_idx" ON "Person"("userId");
CREATE INDEX "Person_userId_status_idx" ON "Person"("userId", "status");
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("id", "userId") SELECT "id", "userId" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE INDEX "Profile_userId_idx" ON "Profile"("userId");
CREATE TABLE "new_PublicApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "PublicApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PublicApiKey" ("createdAt", "id", "keyHash", "keyPrefix", "lastUsedAt", "name", "permissions", "revokedAt", "userId") SELECT "createdAt", "id", "keyHash", "keyPrefix", "lastUsedAt", "name", "permissions", "revokedAt", "userId" FROM "PublicApiKey";
DROP TABLE "PublicApiKey";
ALTER TABLE "new_PublicApiKey" RENAME TO "PublicApiKey";
CREATE UNIQUE INDEX "PublicApiKey_keyHash_key" ON "PublicApiKey"("keyHash");
CREATE INDEX "PublicApiKey_userId_idx" ON "PublicApiKey"("userId");
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("answer", "createdAt", "createdBy", "id", "question", "updatedAt") SELECT "answer", "createdAt", "createdBy", "id", "question", "updatedAt" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_createdBy_idx" ON "Question"("createdBy");
CREATE TABLE "new_StagedVacancy" (
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
    "companyUrl" TEXT,
    "companyDescription" TEXT,
    "industryCodes" JSONB,
    "companySize" TEXT,
    "positionOfferingCode" TEXT,
    "numberOfPosts" INTEGER,
    "occupationUris" JSONB,
    "requiredEducationLevel" TEXT,
    "requiredExperienceYears" INTEGER,
    "workingLanguages" JSONB,
    "salaryMin" REAL,
    "salaryMax" REAL,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "immediateStart" BOOLEAN,
    "contractStartDate" TEXT,
    "contractEndDate" TEXT,
    "euresFlag" BOOLEAN,
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
    CONSTRAINT "StagedVacancy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StagedVacancy_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StagedVacancy_promotedToJobId_fkey" FOREIGN KEY ("promotedToJobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StagedVacancy" ("applicationDeadline", "applicationInstructions", "archivedAt", "automationId", "companyDescription", "companySize", "companyUrl", "contractEndDate", "contractStartDate", "createdAt", "description", "discoveredAt", "employerName", "employmentType", "euresFlag", "externalId", "id", "immediateStart", "industryCodes", "location", "matchData", "matchScore", "numberOfPosts", "occupationUris", "positionOfferingCode", "postedAt", "promotedToJobId", "requiredEducationLevel", "requiredExperienceYears", "salary", "salaryCurrency", "salaryMax", "salaryMin", "salaryPeriod", "source", "sourceBoard", "sourceUrl", "status", "title", "trashedAt", "updatedAt", "userId", "workingLanguages") SELECT "applicationDeadline", "applicationInstructions", "archivedAt", "automationId", "companyDescription", "companySize", "companyUrl", "contractEndDate", "contractStartDate", "createdAt", "description", "discoveredAt", "employerName", "employmentType", "euresFlag", "externalId", "id", "immediateStart", "industryCodes", "location", "matchData", "matchScore", "numberOfPosts", "occupationUris", "positionOfferingCode", "postedAt", "promotedToJobId", "requiredEducationLevel", "requiredExperienceYears", "salary", "salaryCurrency", "salaryMax", "salaryMin", "salaryPeriod", "source", "sourceBoard", "sourceUrl", "status", "title", "trashedAt", "updatedAt", "userId", "workingLanguages" FROM "StagedVacancy";
DROP TABLE "StagedVacancy";
ALTER TABLE "new_StagedVacancy" RENAME TO "StagedVacancy";
CREATE UNIQUE INDEX "StagedVacancy_promotedToJobId_key" ON "StagedVacancy"("promotedToJobId");
CREATE INDEX "StagedVacancy_userId_sourceBoard_externalId_idx" ON "StagedVacancy"("userId", "sourceBoard", "externalId");
CREATE INDEX "StagedVacancy_userId_status_idx" ON "StagedVacancy"("userId", "status");
CREATE INDEX "StagedVacancy_userId_automationId_idx" ON "StagedVacancy"("userId", "automationId");
CREATE INDEX "StagedVacancy_userId_createdAt_idx" ON "StagedVacancy"("userId", "createdAt");
CREATE INDEX "StagedVacancy_userId_trashedAt_idx" ON "StagedVacancy"("userId", "trashedAt");
CREATE INDEX "StagedVacancy_userId_employerName_idx" ON "StagedVacancy"("userId", "employerName");
CREATE INDEX "StagedVacancy_userId_discoveredAt_idx" ON "StagedVacancy"("userId", "discoveredAt");
CREATE TABLE "new_Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "Tag_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("createdBy", "id", "label", "value") SELECT "createdBy", "id", "label", "value" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE UNIQUE INDEX "Tag_value_createdBy_key" ON "Tag"("value", "createdBy");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in-progress',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "activityTypeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("activityTypeId", "createdAt", "description", "dueDate", "id", "percentComplete", "priority", "status", "title", "updatedAt", "userId") SELECT "activityTypeId", "createdAt", "description", "dueDate", "id", "percentComplete", "priority", "status", "title", "updatedAt", "userId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_idx" ON "Task"("userId");
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");
CREATE INDEX "Task_userId_activityTypeId_idx" ON "Task"("userId", "activityTypeId");
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("createdAt", "id", "settings", "updatedAt", "userId") SELECT "createdAt", "id", "settings", "updatedAt", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
