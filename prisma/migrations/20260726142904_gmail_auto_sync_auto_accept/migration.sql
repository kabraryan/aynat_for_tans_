-- AlterTable
ALTER TABLE "GmailSyncState" ADD COLUMN     "autoAccept" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoSync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAutoSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncError" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "acceptedItemId" TEXT,
ADD COLUMN     "autoAccepted" BOOLEAN NOT NULL DEFAULT false;
