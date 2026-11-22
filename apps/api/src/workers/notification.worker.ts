import { Worker } from "bullmq";

import { redisConnection } from "../config/redis";
import { prisma } from "../config/database";

import {
	notificationQueue,
	enqueueNotification,
	type NotificationJobData,
} from "../queues/notification.queue";

import { processNotification } from "./notification.processor";
import { verifyEmailConnection } from "../services/email.service";

async function enqueuePendingNotifications() {
	const pendingNotifications = await prisma.notification.findMany({
		where: {
			status: "PENDING",
		},
		select: {
			id: true,
		},
		take: 500,
		orderBy: {
			createdAt: "asc",
		},
	});

	for (const notification of pendingNotifications) {
		await enqueueNotification(notification.id);
	}

	console.log(
		`[Email Worker] Recovered ${pendingNotifications.length} pending notifications`,
	);
}

async function main() {
	try {
		await verifyEmailConnection();
		console.log("[Email Worker] SMTP connection verified");
	} catch (error) {
		console.error(
			"[Email Worker] SMTP unavailable; starting worker anyway:",
			error instanceof Error ? error.message : error,
		);
	}

	await enqueuePendingNotifications();

	const worker = new Worker<NotificationJobData>(
		"email-notifications",

		async (job) => {
			try {
				await processNotification(job.data);
			} catch (error) {
				const attempts = job.opts.attempts ?? 1;
				const willRetry = job.attemptsMade + 1 < attempts;

				await prisma.notification.updateMany({
					where: {
						id: job.data.notificationId,
						status: {
							not: "SENT",
						},
					},
					data: {
						status: willRetry ? "PENDING" : "FAILED",
						errorMessage:
							error instanceof Error
								? error.message.slice(0, 500)
								: "Email delivery failed",
					},
				});

				throw error;
			}
		},

		{
			connection: redisConnection,
			concurrency: 5,
		},
	);

	worker.on("ready", () => {
		console.log("[Email Worker] Ready");
	});

	worker.on("completed", (job) => {
		console.log(`[Email Worker] Completed ${job.id}`);
	});

	worker.on("failed", (job, error) => {
		console.error(`[Email Worker] Failed ${job?.id}: ${error.message}`);
	});

	worker.on("error", (error) => {
		console.error("[Email Worker] Error:", error);
	});

	async function shutdown(signal: string) {
		console.log(`[Email Worker] Received ${signal}`);

		try {
			await worker.close();
			await notificationQueue.close();
			await prisma.$disconnect();

			process.exit(0);
		} catch (error) {
			console.error("[Email Worker] Shutdown error:", error);
			process.exit(1);
		}
	}

	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
	console.error("[Email Worker] Startup failed:", error);

	await notificationQueue.close();
	await prisma.$disconnect();

	process.exit(1);
});
