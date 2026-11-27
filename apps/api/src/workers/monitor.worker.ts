import { Worker } from "bullmq";

import { redisConnection } from "../config/redis";
import { prisma } from "../config/database";

import {
        monitorQueue,
        scheduleMonitorCheck,
        type MonitorJobData,
} from "../queues/monitor.queue";

import { notificationQueue } from "../queues/notification.queue";
import { processMonitorCheck } from "./monitor.processor";

let worker: Worker<MonitorJobData> | undefined;
let shuttingDown = false;

/**
 * Restore recurring schedules for all enabled monitors.
 *
 * upsertJobScheduler is idempotent:
 * - Creates missing schedules.
 * - Updates schedules when the interval changes.
 */
async function reconcileMonitorSchedulers(): Promise<void> {
        console.log("[Worker] Starting monitor scheduler reconciliation...");

        const monitors = await prisma.monitor.findMany({
                where: {
                        enabled: true,
                },
                select: {
                        id: true,
                        name: true,
                        intervalSeconds: true,
                },
        });

        let reconciled = 0;

        for (const monitor of monitors) {
                await scheduleMonitorCheck(
                        monitor.id,
                        monitor.intervalSeconds,
                );

                reconciled++;

                console.log(
                        `[Worker] Scheduler restored: ${monitor.name} (${monitor.intervalSeconds}s)`,
                );
        }

        console.log(
                `[Worker] Scheduler reconciliation complete. ${reconciled} enabled monitor(s) processed.`,
        );
}

/**
 * Start the worker only after scheduler reconciliation succeeds.
 */
async function startWorker(): Promise<void> {
        await reconcileMonitorSchedulers();

        if (shuttingDown) {
                return;
        }

        worker = new Worker<MonitorJobData>(
                "monitor-checks",

                async (job) => {
                        if (job.name !== "check-monitor") {
                                throw new Error(`Unknown job type: ${job.name}`);
                        }

                        await processMonitorCheck(job.data);
                },

                {
                        connection: redisConnection,
                        concurrency: 10,
                },
        );

        worker.on("ready", () => {
                console.log("[Worker] Monitoring worker is ready");
        });

        worker.on("active", (job) => {
                console.log(`[Worker] Started job ${job.id}`);
        });

        worker.on("completed", (job) => {
                console.log(`[Worker] Completed job ${job.id}`);
        });

        worker.on("failed", (job, error) => {
                console.error(`[Worker] Job ${job?.id} failed:`, error.message);
        });

        worker.on("error", (error) => {
                console.error("[Worker] Redis/worker error:", error);
        });
}

async function shutdown(signal: string): Promise<void> {
        if (shuttingDown) {
                return;
        }

        shuttingDown = true;

        console.log(`[Worker] Received ${signal}. Shutting down...`);

        try {
                if (worker) {
                        await worker.close();
                }

                await monitorQueue.close();
                await notificationQueue.close();
                await prisma.$disconnect();

                console.log("[Worker] Shutdown complete");
                process.exit(0);
        } catch (error) {
                console.error("[Worker] Shutdown failed:", error);
                process.exit(1);
        }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

startWorker().catch(async (error: unknown) => {
        console.error(
                "[Worker] Startup failed. Monitoring worker was not started:",
                error,
        );

        try {
                await monitorQueue.close();
                await notificationQueue.close();
                await prisma.$disconnect();
        } catch (cleanupError) {
                console.error("[Worker] Startup cleanup failed:", cleanupError);
        }

        process.exit(1);
});
