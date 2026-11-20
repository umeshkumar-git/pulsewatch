
CREATE UNIQUE INDEX "incidents_one_open_per_monitor"
ON "incidents" ("monitor_id")
WHERE "status" = 'OPEN';