import {
	scheduleMonitorCheck,
	unscheduleMonitorCheck,
} from "../../queues/monitor.queue";
import { calculateLatencyStatistics } from "./monitor-analytics";

import { prisma } from "../../config/database";

import type { CreateMonitorInput, UpdateMonitorInput } from "./monitor.schemas";

import { validateMonitorUrl } from "./monitor-url";

export class MonitorError extends Error {
	constructor(
		message: string,
		public statusCode: number,
	) {
		super(message);
		this.name = "MonitorError";
	}
}
function toPublicMonitor<T extends { checkGeneration: bigint }>(
	monitor: T,
): Omit<T, "checkGeneration"> {
	const { checkGeneration, ...publicMonitor } = monitor;
	void checkGeneration;
	return publicMonitor;
}

// CREATE MONITOR
export async function createMonitor(userId: string, input: CreateMonitorInput) {
	let url: string;

	try {
		url = await validateMonitorUrl(input.url);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		throw new MonitorError(message, 400);
	}

	const monitor = await prisma.monitor.create({
		data: {
			userId,
			name: input.name,
			url,
			method: input.method,
			intervalSeconds: input.intervalSeconds,
			timeoutMs: input.timeoutMs,
			failureThreshold: input.failureThreshold,
			recoveryThreshold: input.recoveryThreshold,
			enabled: true,
			nextCheckAt: new Date(),
		},
	});

	await scheduleMonitorCheck(monitor.id, monitor.intervalSeconds);

	return toPublicMonitor(monitor);
}

// GET ALL MONITORS
export async function getMonitors(userId: string, page: number, limit: number) {
	const skip = (page - 1) * limit;

	const [monitors, total] = await Promise.all([
		prisma.monitor.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: {
				_count: {
					select: {
						checkResults: true,
						incidents: true,
					},
				},
			},
		}),

		prisma.monitor.count({
			where: { userId },
		}),
	]);

	return {
		monitors: monitors.map(toPublicMonitor),
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

// GET ONE MONITOR
export async function getMonitor(userId: string, monitorId: string) {
	const monitor = await prisma.monitor.findFirst({
		where: {
			id: monitorId,
			userId,
		},
		include: {
			checkResults: {
				orderBy: { checkedAt: "desc" },
				take: 20,
			},
			incidents: {
				orderBy: { startedAt: "desc" },
				take: 10,
			},
		},
	});

	if (!monitor) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	return {
		...toPublicMonitor(monitor),
		checkResults: monitor.checkResults,
		incidents: monitor.incidents,
	};
}

// UPDATE MONITOR
export async function updateMonitor(
	userId: string,
	monitorId: string,
	input: UpdateMonitorInput,
) {
	const data: UpdateMonitorInput = { ...input };

	if (data.url) {
		try {
			data.url = await validateMonitorUrl(data.url);
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			throw new MonitorError(message, 400);
		}
	}

	const result = await prisma.monitor.updateMany({
		where: {
			id: monitorId,
			userId,
		},
		data,
	});

	if (result.count === 0) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	const updatedMonitor = await prisma.monitor.findFirst({
		where: {
			id: monitorId,
			userId,
		},
	});

	if (!updatedMonitor) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	if (input.intervalSeconds !== undefined) {
		if (updatedMonitor.enabled) {
			await scheduleMonitorCheck(
				updatedMonitor.id,
				updatedMonitor.intervalSeconds,
			);
		} else {
			await unscheduleMonitorCheck(updatedMonitor.id);
		}
	}

	return toPublicMonitor(updatedMonitor);
}

// DELETE MONITOR
export async function deleteMonitor(userId: string, monitorId: string) {
	const result = await prisma.monitor.deleteMany({
		where: {
			id: monitorId,
			userId,
		},
	});

	if (result.count === 0) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	await unscheduleMonitorCheck(monitorId);

	return { deleted: true };
}

// PAUSE MONITOR
export async function pauseMonitor(userId: string, monitorId: string) {
	const result = await prisma.monitor.updateMany({
		where: {
			id: monitorId,
			userId,
		},
		data: {
			enabled: false,
			status: "PAUSED",
		},
	});

	if (result.count === 0) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	await unscheduleMonitorCheck(monitorId);

	const updatedMonitor = await prisma.monitor.findFirst({
		where: {
			id: monitorId,
			userId,
		},
	});

	if (!updatedMonitor) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	return toPublicMonitor(updatedMonitor);
}

// RESUME MONITOR
export async function resumeMonitor(userId: string, monitorId: string) {
	const result = await prisma.monitor.updateMany({
		where: {
			id: monitorId,
			userId,
		},
		data: {
			enabled: true,
			status: "UNKNOWN",
			nextCheckAt: new Date(),
		},
	});

	if (result.count === 0) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	const monitor = await prisma.monitor.findFirst({
		where: {
			id: monitorId,
			userId,
		},
	});

	if (!monitor) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	await scheduleMonitorCheck(monitor.id, monitor.intervalSeconds);

	return toPublicMonitor(monitor);
}
export async function getMonitorUptime(
	userId: string,
	monitorId: string,
	hours: number,
) {
	const monitor = await prisma.monitor.findFirst({
		where: {
			id: monitorId,
			userId,
		},
		select: {
			id: true,
			name: true,
			url: true,
			status: true,
		},
	});

	if (!monitor) {
		throw new MonitorError("MONITOR_NOT_FOUND", 404);
	}

	const calculatedAt = new Date();
	const since = new Date(calculatedAt.getTime() - hours * 60 * 60 * 1000);

	const checkWhere = {
		monitorId,
		checkedAt: {
			gte: since,
			lte: calculatedAt,
		},
	};

	const latencyWhere = {
		...checkWhere,
		success: true,
		latencyMs: {
			not: null,
		},
	};

	const [totalChecks, successfulChecks, latencyAggregate, latencyResults] =
		await Promise.all([
			prisma.checkResult.count({
				where: checkWhere,
			}),

			prisma.checkResult.count({
				where: {
					...checkWhere,
					success: true,
				},
			}),

			prisma.checkResult.aggregate({
				where: latencyWhere,
				_avg: {
					latencyMs: true,
				},
				_min: {
					latencyMs: true,
				},
				_max: {
					latencyMs: true,
				},
				_count: {
					latencyMs: true,
				},
			}),

			prisma.checkResult.findMany({
				where: latencyWhere,
				select: {
					latencyMs: true,
				},
				orderBy: {
					latencyMs: "asc",
				},
			}),
		]);

	const uptimePercentage =
		totalChecks === 0
			? null
			: Number(((successfulChecks / totalChecks) * 100).toFixed(2));

	const latencyStatistics = calculateLatencyStatistics(
		latencyResults
			.map((result) => result.latencyMs)
			.filter((value): value is number => value !== null),
	);

	return {
		monitor,
		periodHours: hours,
		totalChecks,
		successfulChecks,
		failedChecks: totalChecks - successfulChecks,
		uptimePercentage,
		latency: {
			...latencyStatistics,
			averageMs: latencyAggregate._avg?.latencyMs ?? null,
			minMs: latencyAggregate._min?.latencyMs ?? null,
			maxMs: latencyAggregate._max?.latencyMs ?? null,
			sampleCount: latencyAggregate._count.latencyMs,
		},
		calculatedAt,
	};
}

export async function getMonitorDashboard(
	userId: string,
	page = 1,
	limit = 50,
) {
	const calculatedAt = new Date();
	const since = new Date(calculatedAt.getTime() - 24 * 60 * 60 * 1000);

	const monitorWhere = { userId };
	const checkWhere = {
		monitor: { userId },
		checkedAt: {
			gte: since,
			lte: calculatedAt,
		},
	};

	const [
		monitors,
		totalMonitors,
		monitorStatusCounts,
		checkCounts,
		latencyAggregate,
		latencyResults,
		openIncidentCount,
		incidents,
		recentChecks,
		monitorUptimeGroups,
	] = await Promise.all([
		prisma.monitor.findMany({
			where: monitorWhere,
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
			include: {
				_count: {
					select: {
						checkResults: true,
						incidents: true,
					},
				},
			},
		}),

		prisma.monitor.count({ where: monitorWhere }),

		prisma.monitor.groupBy({
			by: ["status"],
			where: monitorWhere,
			_count: { _all: true },
		}),

		prisma.checkResult.groupBy({
			by: ["success"],
			where: checkWhere,
			_count: { _all: true },
		}),

		prisma.checkResult.aggregate({
			where: {
				...checkWhere,
				success: true,
				latencyMs: { not: null },
			},
			_avg: { latencyMs: true },
			_min: { latencyMs: true },
			_max: { latencyMs: true },
			_count: { latencyMs: true },
		}),

		prisma.checkResult.findMany({
			where: {
				...checkWhere,
				success: true,
				latencyMs: { not: null },
			},
			select: { latencyMs: true },
			orderBy: { checkedAt: "desc" },
			take: 1000,
		}),

		prisma.incident.count({
			where: {
				status: "OPEN",
				monitor: { userId },
			},
		}),

		prisma.incident.findMany({
			where: {
				status: "OPEN",
				monitor: { userId },
			},
			orderBy: { startedAt: "desc" },
			take: 5,
			include: {
				monitor: {
					select: {
						id: true,
						name: true,
						url: true,
					},
				},
			},
		}),

		prisma.checkResult.findMany({
			where: checkWhere,
			orderBy: { checkedAt: "desc" },
			take: 100,
			select: {
				id: true,
				monitorId: true,
				latencyMs: true,
				success: true,
				statusCode: true,
				checkedAt: true,
				errorMessage: true,
			},
		}),

		prisma.checkResult.groupBy({
			by: ["monitorId", "success"],
			where: checkWhere,
			_count: { _all: true },
		}),
	]);

	const statusCounts = {
		UP: 0,
		DOWN: 0,
		PAUSED: 0,
		UNKNOWN: 0,
	};

	for (const item of monitorStatusCounts) {
		statusCounts[item.status] = item._count._all;
	}

	const totalChecks = checkCounts.reduce(
		(total, item) => total + item._count._all,
		0,
	);

	const successfulChecks =
		checkCounts.find((item) => item.success)?._count._all ?? 0;

	const uptimePercentage =
		totalChecks === 0
			? null
			: Number(((successfulChecks / totalChecks) * 100).toFixed(2));

	const latency = calculateLatencyStatistics(
		latencyResults
			.map((result) => result.latencyMs)
			.filter((value): value is number => value !== null),
	);

	const monitorUptime = new Map<
		string,
		{ total: number; successful: number }
	>();

	for (const item of monitorUptimeGroups) {
		const current = monitorUptime.get(item.monitorId) ?? {
			total: 0,
			successful: 0,
		};

		current.total += item._count._all;

		if (item.success) {
			current.successful += item._count._all;
		}

		monitorUptime.set(item.monitorId, current);
	}

	const monitorsWithUptime = monitors.map((monitor) => {
		const counts = monitorUptime.get(monitor.id);
		const percentage =
			counts && counts.total > 0
				? Number(((counts.successful / counts.total) * 100).toFixed(2))
				: null;

		return {
			...toPublicMonitor(monitor),
			uptimePercentage: percentage,
		};
	});

	return {
		summary: {
			totalMonitors,
			upMonitors: statusCounts.UP,
			downMonitors: statusCounts.DOWN,
			pausedMonitors: statusCounts.PAUSED,
			unknownMonitors: statusCounts.UNKNOWN,
			activeIncidents: openIncidentCount,
			totalChecks,
			successfulChecks,
			failedChecks: totalChecks - successfulChecks,
			uptimePercentage,
			latency: {
				...latency,
				averageMs: latencyAggregate._avg.latencyMs,
				minMs: latencyAggregate._min.latencyMs,
				maxMs: latencyAggregate._max.latencyMs,
				sampleCount: latencyAggregate._count.latencyMs,
			},
		},
		monitors: monitorsWithUptime,
		incidents: incidents.map((incident) => ({
			...incident,
			durationMs: calculatedAt.getTime() - incident.startedAt.getTime(),
		})),
		recentChecks,
		pagination: {
			page,
			limit,
			total: totalMonitors,
			totalPages: Math.ceil(totalMonitors / limit),
		},
		calculatedAt,
	};
}
