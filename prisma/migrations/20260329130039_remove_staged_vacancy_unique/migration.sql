-- DropIndex
DROP INDEX "StagedVacancy_userId_sourceBoard_externalId_key";

-- CreateIndex
CREATE INDEX "StagedVacancy_userId_sourceBoard_externalId_idx" ON "StagedVacancy"("userId", "sourceBoard", "externalId");
