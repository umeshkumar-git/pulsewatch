-- AlterEnum
ALTER TYPE "MonitorStatus" ADD VALUE 'UNKNOWN';

-- AlterTable
ALTER TABLE "monitors" ALTER COLUMN "status" SET DEFAULT 'UNKNOWN';

CREATE UNIQUE INDEX "incidents_one_open_per_monitor"
ON "incidents" ("monitor_id")
WHERE "status" = 'OPEN';