-- AlterTable
ALTER TABLE "CrmInterview" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "CrmInterview" ADD COLUMN "updatedByType" TEXT;

-- AlterTable
ALTER TABLE "CrmNote" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "CrmNote" ADD COLUMN "updatedByType" TEXT;

-- AlterTable
ALTER TABLE "CrmTask" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "CrmTask" ADD COLUMN "updatedByType" TEXT;
