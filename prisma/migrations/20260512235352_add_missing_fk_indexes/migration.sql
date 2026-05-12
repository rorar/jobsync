-- CreateIndex
CREATE INDEX "CrmNoteTarget_targetCompanyId_idx" ON "CrmNoteTarget"("targetCompanyId");

-- CreateIndex
CREATE INDEX "CrmTaskTarget_targetCompanyId_idx" ON "CrmTaskTarget"("targetCompanyId");

-- CreateIndex
CREATE INDEX "Interview_jobId_idx" ON "Interview"("jobId");
