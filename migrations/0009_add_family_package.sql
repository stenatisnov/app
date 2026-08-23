-- AlterTable
ALTER TABLE "PersonType" ADD COLUMN "isChildCategory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN "familyCompanionIds" JSONB;
