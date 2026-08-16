-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerified" DATETIME,
    "name" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "navStyle" TEXT NOT NULL DEFAULT 'BUTTONS',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "cooldownUntil" DATETIME,
    "personTypeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_personTypeId_fkey" FOREIGN KEY ("personTypeId") REFERENCES "PersonType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("cooldownUntil", "createdAt", "credits", "email", "emailVerified", "id", "image", "name", "passwordHash", "personTypeId", "phone", "role", "status", "suspended", "updatedAt") SELECT "cooldownUntil", "createdAt", "credits", "email", "emailVerified", "id", "image", "name", "passwordHash", "personTypeId", "phone", "role", "status", "suspended", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
