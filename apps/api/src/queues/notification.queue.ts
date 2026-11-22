import { Queue } from "bullmq";

import { redisConnection } from "../config/redis";

export interface NotificationJobData {
	notificationId: string;
}

export const notificationQueue = new Queue<NotificationJobData>(
	"email-notifications",
	{
		connection: redisConnection,

		defaultJobOptions: {
			attempts: 5,

			backoff: {
				type: "exponential",
				delay: 5000,
			},

			removeOnComplete: 100,
			removeOnFail: 1000,
		},
	},
);

export async function enqueueNotification(notificationId: string) {
	await notificationQueue.add(
		"send-email",
		{ notificationId },
		{
			jobId: `notification-${notificationId}`,
		},
	);
}
