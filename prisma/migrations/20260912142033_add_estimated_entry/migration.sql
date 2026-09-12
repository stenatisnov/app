-- Estimated entries from off-app bank transfers, independent of AuditLog.
--
-- The statistics' estimate of how many entries an unmatched transfer paid for
-- used to be derived from that transfer's `payment.fio.unmatched` audit row on
-- every page load, so the log cleanup (`LogCleanupSettings.maxAgeDays`, which
-- does `AuditLog.deleteMany({ createdAt: { lt: cutoff } })`) silently erased the
-- estimate history along with the logs — the same failure the previous
-- migration fixed for measured entries. `EstimatedEntry` is written by the Fio
-- poll (src/lib/fio.ts -> src/lib/payment-entry-estimate.ts) and is never
-- cleaned up.
--
-- Deliberately no backfill statement here, unlike `GateEntry`: the estimate is
-- an unbounded-knapsack over the current price list, which SQL can't express.
-- `backfillEstimatedEntries` seeds it from the unmatched audit rows still on
-- hand, in app code, before the stats read — idempotent, so it's safe on every
-- view. It can't recover transfers whose audit rows are already deleted.
--
-- One row per transfer, not per entry, and no foreign key: the payer usually
-- has no account here at all (that's why the transfer couldn't be matched), and
-- the table holds nothing identifying — Fio's transaction id only, so the same
-- transfer can't be recorded twice.

-- CreateTable
CREATE TABLE "EstimatedEntry" (
    "id" TEXT NOT NULL,
    "fioIdPohyb" TEXT NOT NULL,
    "amountCzk" INTEGER NOT NULL,
    "entries" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimatedEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstimatedEntry_fioIdPohyb_key" ON "EstimatedEntry"("fioIdPohyb");

-- CreateIndex
CREATE INDEX "EstimatedEntry_createdAt_idx" ON "EstimatedEntry"("createdAt");
