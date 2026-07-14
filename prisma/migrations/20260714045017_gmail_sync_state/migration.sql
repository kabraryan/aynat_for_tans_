-- CreateTable
CREATE TABLE "GmailSyncState" (
    "userId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "historyId" TEXT,

    CONSTRAINT "GmailSyncState_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "GmailSyncState" ADD CONSTRAINT "GmailSyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
