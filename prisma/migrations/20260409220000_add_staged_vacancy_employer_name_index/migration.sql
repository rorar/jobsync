-- CreateIndex
-- Sprint 2 Stream C (H-P-02): accelerate CompanyBlacklist.addBlacklistEntry
-- retroactive-trash updateMany, which filters StagedVacancy.employerName via
-- equals / startsWith / endsWith / contains. Without this index Prisma scanned
-- the entire (userId, *) partition and LIKE-matched each row. The composite
-- (userId, employerName) satisfies the exact + starts_with match types as
-- index seeks; contains + ends_with still need a scan but now walk the b-tree
-- leaves instead of heap pages.
CREATE INDEX "StagedVacancy_userId_employerName_idx" ON "StagedVacancy"("userId", "employerName");
