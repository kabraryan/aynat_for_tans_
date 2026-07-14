-- CreateEnum
CREATE TYPE "RepeatFreq" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "rrule" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "repeat" "RepeatFreq" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "repeatUntil" TIMESTAMP(3);
