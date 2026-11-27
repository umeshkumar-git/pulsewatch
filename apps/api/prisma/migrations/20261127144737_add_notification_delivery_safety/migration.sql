-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationStatus" ADD VALUE 'SENDING';
ALTER TYPE "NotificationStatus" ADD VALUE 'DELIVERY_UNKNOWN';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "attempt_started_at" TIMESTAMPTZ(3),
ADD COLUMN     "provider_message_id" TEXT;
