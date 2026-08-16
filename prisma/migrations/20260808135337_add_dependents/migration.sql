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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreditLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dependentId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditLedger_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Dependent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreditLedger" ("createdAt", "delta", "id", "meta", "reason", "userId") SELECT "createdAt", "delta", "id", "meta", "reason", "userId" FROM "CreditLedger";
DROP TABLE "CreditLedger";
ALTER TABLE "new_CreditLedger" RENAME TO "CreditLedger";
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");
CREATE INDEX "CreditLedger_dependentId_createdAt_idx" ON "CreditLedger"("dependentId", "createdAt");
CREATE TABLE "new_PaymentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dependentId" TEXT,
    "packageId" TEXT,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "credits" INTEGER NOT NULL,
    "amountCzk" INTEGER NOT NULL,
    "variableSymbol" TEXT,
    "goPayPaymentId" TEXT,
    "note" TEXT,
    "confirmedAt" DATETIME,
    "confirmedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentOrder_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Dependent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PricePackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentOrder_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentOrder" ("amountCzk", "confirmedAt", "confirmedById", "createdAt", "credits", "goPayPaymentId", "id", "method", "note", "packageId", "status", "userId", "variableSymbol") SELECT "amountCzk", "confirmedAt", "confirmedById", "createdAt", "credits", "goPayPaymentId", "id", "method", "note", "packageId", "status", "userId", "variableSymbol" FROM "PaymentOrder";
DROP TABLE "PaymentOrder";
ALTER TABLE "new_PaymentOrder" RENAME TO "PaymentOrder";
CREATE INDEX "PaymentOrder_userId_status_idx" ON "PaymentOrder"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Dependent_parentUserId_idx" ON "Dependent"("parentUserId");
