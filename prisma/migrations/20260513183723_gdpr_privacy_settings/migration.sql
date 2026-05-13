-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletionScheduledAt" DATETIME;

-- CreateTable
CREATE TABLE "DeletionConfirmationToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletionConfirmationToken_userId_key" ON "DeletionConfirmationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeletionConfirmationToken_tokenHash_key" ON "DeletionConfirmationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeletionConfirmationToken_expiresAt_idx" ON "DeletionConfirmationToken"("expiresAt");
