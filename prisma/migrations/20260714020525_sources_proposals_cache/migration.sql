-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('UPLOAD', 'EMAIL');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('PENDING', 'EXTRACTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('TASK', 'EVENT');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "fileKey" TEXT,
    "mimeType" TEXT,
    "originalName" TEXT,
    "gmailMessageId" TEXT,
    "excerpt" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" "ProposalKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionCache" (
    "contentHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionCache_pkey" PRIMARY KEY ("contentHash")
);

-- CreateIndex
CREATE INDEX "Source_userId_status_idx" ON "Source"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Source_userId_gmailMessageId_key" ON "Source"("userId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "Proposal_userId_status_idx" ON "Proposal"("userId", "status");

-- CreateIndex
CREATE INDEX "Proposal_sourceId_status_idx" ON "Proposal"("sourceId", "status");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
