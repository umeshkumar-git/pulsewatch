import { Worker } from "bullmq";

import { redisConnection } from "../config/redis";
import { prisma } from "../config/database";

import {
	notificationQueue,
	enqueueNotification,
	type NotificationJobData,
} from "../queues/notification.queue";

import { processNotification } from "./notification.processor";
import {
	closeEmailTransport,
	verifyEmailConnection,
} from "../services/email.service";
import { handleNotificationFailure } from "./notification-failure.handler";
async function recoverStaleSendingNotifications() {
        const staleBefore = new Date(Date.now() - 2 * 60 * 1000);

        const result = await prisma.notification.updateMany({
                where: {
                        status: "SENDING",
                        attemptStartedAt: {
                                lt: staleBefore,
                        },
                },
                data: {
                        status: "DELIVERY_UNKNOWN",
                        errorMessage:
                                "Worker stopped or timed out during SMTP delivery. Manual reconciliation required.",
                },
        });

        console.log(
                `[Email Worker] Marked ${result.count} stale SENDING notifications as DELIVERY_UNKNOWN`,
        );
}

async function enqueuePendingNotifications() {
	const batchSize = 500;
	let cursor: string | undefined;
	let totalRecovered = 0;

	while (true) {
		const pendingNotifications = await prisma.notification.findMany({
			where: {
				status: "PENDING",
			},
			select: {
				id: true,
			},
			take: batchSize,
			...(cursor
				? {
						cursor: { id: cursor },
						skip: 1,
					}
				: {}),
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		});

		if (pendingNotifications.length === 0) {
			break;
		}

		for (const notification of pendingNotifications) {
			await enqueueNotification(notification.id);
		}

		totalRecovered += pendingNotifications.length;
		cursor = pendingNotifications[pendingNotifications.length - 1].id;

		if (pendingNotifications.length < batchSize) {
			break;
		}
	}

	console.log(
		`[Email Worker] Recovered ${totalRecovered} pending notifications`,
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

	await recoverStaleSendingNotifications();
await enqueuePendingNotifications();

	const worker = new Worker<NotificationJobData>(
		"email-notifications",
		async (job) => {
			try {
				await processNotification(job.data);
			} catch (error) {
				await handleNotificationFailure(
					job.data.notificationId,
					error,
					job.attemptsMade,
					job.opts.attempts ?? 1,
				);
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
			closeEmailTransport();
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
	closeEmailTransport();
	await prisma.$disconnect();

	process.exit(1);
});
