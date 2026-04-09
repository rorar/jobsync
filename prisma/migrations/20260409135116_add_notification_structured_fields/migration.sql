-- AlterTable
-- Promote 5W+H structured notification fields from `data` JSON to top-level columns (ADR-030).
-- All columns are nullable so existing rows remain valid; writers dual-write during rollout.
ALTER TABLE "Notification" ADD COLUMN "severity" TEXT;
ALTER TABLE "Notification" ADD COLUMN "actorType" TEXT;
ALTER TABLE "Notification" ADD COLUMN "actorId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "titleKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "titleParams" JSONB;
ALTER TABLE "Notification" ADD COLUMN "reasonKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "reasonParams" JSONB;
