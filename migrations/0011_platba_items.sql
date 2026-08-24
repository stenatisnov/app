-- AlterTable
ALTER TABLE "PaymentOrder" DROP COLUMN "bulkCompanionIds";
ALTER TABLE "PaymentOrder" ADD COLUMN "items" JSONB;
