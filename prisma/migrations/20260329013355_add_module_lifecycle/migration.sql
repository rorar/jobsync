-- AlterTable
ALTER TABLE "Automation" ADD COLUMN "pauseReason" TEXT;

-- CreateTable
CREATE TABLE "ModuleRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "activatedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleRegistration_moduleId_key" ON "ModuleRegistration"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleRegistration_moduleId_idx" ON "ModuleRegistration"("moduleId");

-- CreateIndex
CREATE INDEX "ModuleRegistration_connectorType_status_idx" ON "ModuleRegistration"("connectorType", "status");
