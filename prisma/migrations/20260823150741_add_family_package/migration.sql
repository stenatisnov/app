-- AlterEnum
ALTER TYPE "PackageKind" ADD VALUE 'FAMILY';

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "familyCompanionIds" JSONB;

-- AlterTable
ALTER TABLE "PersonType" ADD COLUMN     "isChildCategory" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LogbookHandoffCode" (
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogbookHandoffCode_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "LogbookHandoffCode" ADD CONSTRAINT "LogbookHandoffCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
