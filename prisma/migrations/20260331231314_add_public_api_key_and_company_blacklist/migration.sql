-- CreateTable
CREATE TABLE "CompanyBlacklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyBlacklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublicApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "PublicApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompanyBlacklist_userId_idx" ON "CompanyBlacklist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBlacklist_userId_pattern_matchType_key" ON "CompanyBlacklist"("userId", "pattern", "matchType");

-- CreateIndex
CREATE UNIQUE INDEX "PublicApiKey_keyHash_key" ON "PublicApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "PublicApiKey_userId_idx" ON "PublicApiKey"("userId");
