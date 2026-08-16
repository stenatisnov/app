-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PersonType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "visibleToUsers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_PersonType" ("createdAt", "id", "isDefault", "name") SELECT "createdAt", "id", "isDefault", "name" FROM "PersonType";
DROP TABLE "PersonType";
ALTER TABLE "new_PersonType" RENAME TO "PersonType";
CREATE UNIQUE INDEX "PersonType_name_key" ON "PersonType"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
