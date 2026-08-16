-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- Grandfather in every account that predates the email-verification
-- requirement: "emailVerified IS NULL" is also the normal state for a
-- brand-new, legitimately-unverified registration, so it can't be used to
-- tell old accounts apart from new ones. Stamping existing rows with their
-- own createdAt (rather than leaving them NULL) keeps the auto-suspend job
-- from sweeping up the entire pre-existing user base the first time it runs.
UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;
