-- CreateTable
CREATE TABLE "EnrichmentResult" (
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
    CONSTRAINT "EnrichmentResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EnrichmentResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnrichmentLog" (
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
    CONSTRAINT "EnrichmentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EnrichmentLog_enrichmentResultId_fkey" FOREIGN KEY ("enrichmentResultId") REFERENCES "EnrichmentResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EnrichmentResult_userId_dimension_status_idx" ON "EnrichmentResult"("userId", "dimension", "status");

-- CreateIndex
CREATE INDEX "EnrichmentResult_expiresAt_idx" ON "EnrichmentResult"("expiresAt");

-- CreateIndex
CREATE INDEX "EnrichmentResult_companyId_idx" ON "EnrichmentResult"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentResult_userId_dimension_domainKey_key" ON "EnrichmentResult"("userId", "dimension", "domainKey");

-- CreateIndex
CREATE INDEX "EnrichmentLog_userId_dimension_domainKey_idx" ON "EnrichmentLog"("userId", "dimension", "domainKey");

-- CreateIndex
CREATE INDEX "EnrichmentLog_moduleId_outcome_idx" ON "EnrichmentLog"("moduleId", "outcome");

-- CreateIndex
CREATE INDEX "EnrichmentLog_createdAt_idx" ON "EnrichmentLog"("createdAt");
