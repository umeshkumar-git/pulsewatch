import { Queue } from "bullmq";

import { redisConnection } from "../config/redis";

export interface MonitorJobData {
	monitorId: string;
}


export const monitorQueue = new Queue<MonitorJobData>("monitor-checks", {
	connection: redisConnection,

	defaultJobOptions: {
		attempts: 3,

		backoff: {
			type: "exponential",
			delay: 2000,
		},

		removeOnComplete: 100,
		removeOnFail: 1000,
	},
});

// Create or update a recurring schedule.
export async function scheduleMonitorCheck(
	monitorId: string,
	intervalSeconds: number,
) {
	await monitorQueue.upsertJobScheduler(
		`monitor-${monitorId}`,

		{
			every: intervalSeconds * 1000,
			immediately: true,
		},

		{
			name: "check-monitor",

			data: { monitorId },

			opts: {
				removeOnComplete: 100,
				removeOnFail: 1000,
			},
		},
	);
}

// Remove the recurring schedule.
export async function unscheduleMonitorCheck(monitorId: string) {
	await monitorQueue.removeJobScheduler(`monitor-${monitorId}`);
}
