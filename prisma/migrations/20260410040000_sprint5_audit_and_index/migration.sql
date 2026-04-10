-- Sprint 5 Stream D — closes 3 deferred items in one migration:
--   1. Sprint 1.5 CRIT-S-04 deferred AdminAuditLog Prisma model.
--      `writeAdminAuditLog()` previously could only write to stderr because
--      the hotfix pipeline could not run migrations. This promotes the same
--      schema to a Prisma table. The stderr line is kept as the always-
--      available fallback port (Hexagonal Architecture); the DB row is the
--      query/retention adapter. The adapter write is fire-and-forget so a
--      transient DB outage cannot stall an admin action — the stderr line
--      remains the source of truth for the audit trail.
--      No foreign key to "User": rows must outlive a deleted actor for
--      forensic purposes. `actorEmail` is denormalised so the row stays
--      self-describing after the User row disappears.
--      `extra` is TEXT (SQLite has no jsonb) — readers JSON.parse() it.
--   2. Sprint 3 Stream D deferred index: getStagedVacancies sorts
--      ORDER BY discoveredAt DESC and the existing (userId, createdAt)
--      composite does not match. A dedicated (userId, discoveredAt) index
--      lets the staging list query be served as an index range scan
--      instead of a heap sort.

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "allowed" BOOLEAN NOT NULL,
    "tier" TEXT,
    "reason" TEXT,
    "extra" TEXT
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_timestamp_idx" ON "AdminAuditLog"("actorId", "timestamp");

-- CreateIndex
CREATE INDEX "AdminAuditLog_timestamp_idx" ON "AdminAuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "StagedVacancy_userId_discoveredAt_idx" ON "StagedVacancy"("userId", "discoveredAt");
