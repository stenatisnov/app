-- Dedicated gate-entry history, independent of AuditLog.
--
-- The entry statistics used to read the `gate.open`/success audit rows
-- directly, so the log cleanup (`LogCleanupSettings.maxAgeDays`, which does
-- `AuditLog.deleteMany({ createdAt: { lt: cutoff } })`) silently erased the
-- statistics' history along with the logs — the yearly chart lost everything
-- past the retention window. `GateEntry` is written alongside those audit
-- rows by `openGateForUser` (src/lib/gate.ts via src/lib/gate-entry.ts) and
-- is never cleaned up.
--
-- SQLite/D1 can't add a foreign key constraint via ALTER TABLE, and this
-- table is created fresh in one piece anyway — the FK to User is included
-- below (ON DELETE SET NULL, matching AuditLog.userId) so an account
-- deletion doesn't take its entry history with it.

-- CreateTable
CREATE TABLE "GateEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "verifiedByStaffId" TEXT,
    "message" TEXT,
    "gateOpened" BOOLEAN NOT NULL DEFAULT true,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "usedPass" BOOLEAN NOT NULL DEFAULT false,
    "usedAdmin" BOOLEAN NOT NULL DEFAULT false,
    "creditsUsed" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GateEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GateEntry_createdAt_idx" ON "GateEntry"("createdAt");

-- CreateIndex
CREATE INDEX "GateEntry_userId_createdAt_idx" ON "GateEntry"("userId", "createdAt");

-- Backfill: every successful `gate.open` audit row so far is a real entry, so
-- copy the history over rather than starting the statistics from zero. The
-- meta shape differs between the two write sites in `openGateForUser` (the
-- "enter without opening the gate" branch carries gateOpened/verifiedByStaffId,
-- the lock-success branch carries lockResult.simulated), hence the COALESCE
-- defaults matching each column's Prisma default. The NOT EXISTS guard makes
-- this re-runnable: backfilled ids are the audit id prefixed with 'ge_'.
INSERT INTO "GateEntry" (
    "id", "userId", "verifiedByStaffId", "message", "gateOpened",
    "simulated", "usedPass", "usedAdmin", "creditsUsed", "meta", "createdAt"
)
SELECT
    'ge_' || "id",
    "userId",
    json_extract("meta", '$.verifiedByStaffId'),
    "message",
    COALESCE(json_extract("meta", '$.gateOpened'), 1),
    COALESCE(json_extract("meta", '$.lockResult.simulated'), 0),
    COALESCE(json_extract("meta", '$.usedPass'), 0),
    COALESCE(json_extract("meta", '$.usedAdmin'), 0),
    COALESCE(json_extract("meta", '$.creditsUsed'), 0),
    "meta",
    "createdAt"
FROM "AuditLog"
WHERE "action" = 'gate.open'
  AND "success" = 1
  AND NOT EXISTS (SELECT 1 FROM "GateEntry" g WHERE g."id" = 'ge_' || "AuditLog"."id");
