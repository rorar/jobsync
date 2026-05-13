-- DropIndex
DROP INDEX "StagedVacancy_trashedAt_idx";

-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "Activity"("userId");

-- CreateIndex
CREATE INDEX "Activity_activityTypeId_idx" ON "Activity"("activityTypeId");

-- CreateIndex
CREATE INDEX "Automation_resumeId_idx" ON "Automation"("resumeId");

-- CreateIndex
CREATE INDEX "Contact_createdBy_idx" ON "Contact"("createdBy");

-- CreateIndex
CREATE INDEX "Contact_interviewId_idx" ON "Contact"("interviewId");

-- CreateIndex
CREATE INDEX "CrmActivityLog_targetCompanyId_idx" ON "CrmActivityLog"("targetCompanyId");

-- CreateIndex
CREATE INDEX "Education_locationId_idx" ON "Education"("locationId");

-- CreateIndex
CREATE INDEX "Education_resumeSectionId_idx" ON "Education"("resumeSectionId");

-- CreateIndex
CREATE INDEX "EnrichmentLog_enrichmentResultId_idx" ON "EnrichmentLog"("enrichmentResultId");

-- CreateIndex
CREATE INDEX "Job_jobTitleId_idx" ON "Job"("jobTitleId");

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "Job_jobSourceId_idx" ON "Job"("jobSourceId");

-- CreateIndex
CREATE INDEX "Job_locationId_idx" ON "Job"("locationId");

-- CreateIndex
CREATE INDEX "Job_resumeId_idx" ON "Job"("resumeId");

-- CreateIndex
CREATE INDEX "Job_automationId_idx" ON "Job"("automationId");

-- CreateIndex
CREATE INDEX "Job_statusId_idx" ON "Job"("statusId");

-- CreateIndex
CREATE INDEX "JobStatusHistory_previousStatusId_idx" ON "JobStatusHistory"("previousStatusId");

-- CreateIndex
CREATE INDEX "JobStatusHistory_newStatusId_idx" ON "JobStatusHistory"("newStatusId");

-- CreateIndex
CREATE INDEX "LicenseOrCertification_resumeSectionId_idx" ON "LicenseOrCertification"("resumeSectionId");

-- CreateIndex
CREATE INDEX "LogoAsset_companyId_idx" ON "LogoAsset"("companyId");

-- CreateIndex
CREATE INDEX "OtherSection_resumeSectionId_idx" ON "OtherSection"("resumeSectionId");

-- CreateIndex
CREATE INDEX "Profile_userId_idx" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Resume_profileId_idx" ON "Resume"("profileId");

-- CreateIndex
CREATE INDEX "ResumeSection_resumeId_idx" ON "ResumeSection"("resumeId");

-- CreateIndex
CREATE INDEX "StagedVacancy_userId_trashedAt_idx" ON "StagedVacancy"("userId", "trashedAt");

-- CreateIndex
CREATE INDEX "WorkExperience_companyId_idx" ON "WorkExperience"("companyId");

-- CreateIndex
CREATE INDEX "WorkExperience_jobTitleId_idx" ON "WorkExperience"("jobTitleId");

-- CreateIndex
CREATE INDEX "WorkExperience_locationId_idx" ON "WorkExperience"("locationId");

-- CreateIndex
CREATE INDEX "WorkExperience_resumeSectionId_idx" ON "WorkExperience"("resumeSectionId");
