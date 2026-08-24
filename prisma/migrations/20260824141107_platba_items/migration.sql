/*
  Warnings:

  - You are about to drop the column `bulkCompanionIds` on the `PaymentOrder` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PaymentOrder" DROP COLUMN "bulkCompanionIds",
ADD COLUMN     "items" JSONB;
