/*
  Warnings:

  - A unique constraint covering the columns `[incident_id,channel,recipient,event_type]` on the table `notifications` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "notification_event" AS ENUM ('INCIDENT_OPENED', 'INCIDENT_RESOLVED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "event_type" "notification_event" NOT NULL DEFAULT 'INCIDENT_OPENED';

-- CreateIndex
CREATE UNIQUE INDEX "notifications_incident_id_channel_recipient_event_type_key" ON "notifications"("incident_id", "channel", "recipient", "event_type");
