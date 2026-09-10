-- CreateTable
CREATE TABLE "ChildGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ChildGroup_inviteToken_key" ON "ChildGroup"("inviteToken");

-- CreateTable
CREATE TABLE "ChildGroupLeader" (
    "childGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    PRIMARY KEY ("childGroupId", "userId"),
    CONSTRAINT "ChildGroupLeader_childGroupId_fkey" FOREIGN KEY ("childGroupId") REFERENCES "ChildGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChildGroupLeader_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
-- SQLite/D1 can't add a foreign key constraint via ALTER TABLE (same
-- limitation the existing navStyle/birthDate columns already live with) —
-- referential integrity for this column is Prisma/application-level only,
-- same as those.
ALTER TABLE "User" ADD COLUMN "childGroupId" TEXT;

-- CreateIndex
CREATE INDEX "User_childGroupId_idx" ON "User"("childGroupId");
