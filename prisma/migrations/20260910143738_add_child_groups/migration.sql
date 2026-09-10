-- AlterTable
ALTER TABLE "User" ADD COLUMN     "childGroupId" TEXT;

-- CreateTable
CREATE TABLE "ChildGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildGroupLeader" (
    "childGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ChildGroupLeader_pkey" PRIMARY KEY ("childGroupId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChildGroup_inviteToken_key" ON "ChildGroup"("inviteToken");

-- CreateIndex
CREATE INDEX "User_childGroupId_idx" ON "User"("childGroupId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_childGroupId_fkey" FOREIGN KEY ("childGroupId") REFERENCES "ChildGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildGroupLeader" ADD CONSTRAINT "ChildGroupLeader_childGroupId_fkey" FOREIGN KEY ("childGroupId") REFERENCES "ChildGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildGroupLeader" ADD CONSTRAINT "ChildGroupLeader_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
