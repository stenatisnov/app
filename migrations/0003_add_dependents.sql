-- CreateTable
CREATE TABLE "Dependent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personTypeId" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dependent_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Dependent_personTypeId_fkey" FOREIGN KEY ("personTypeId") REFERENCES "PersonType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Dependent_parentUserId_idx" ON "Dependent"("parentUserId");

-- AlterTable
ALTER TABLE "CreditLedger" ADD COLUMN "dependentId" TEXT REFERENCES "Dependent" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CreditLedger_dependentId_createdAt_idx" ON "CreditLedger"("dependentId", "createdAt");

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN "dependentId" TEXT REFERENCES "Dependent" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
