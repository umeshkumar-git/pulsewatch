import { notificationQueue } from "../queues/notification.queue";
import { Worker } from "bullmq";

import { redisConnection } from "../config/redis";
import { prisma } from "../config/database";

import { processMonitorCheck } from "./monitor.processor";

import type { MonitorJobData } from "../queues/monitor.queue";

const worker = new Worker<MonitorJobData>(
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

async function shutdown(signal: string) {
	console.log(`[Worker] Received ${signal}. Shutting down...`);

	try {
		await worker.close();
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
