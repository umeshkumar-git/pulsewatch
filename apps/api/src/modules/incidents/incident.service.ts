import { prisma } from "../../config/database";

import type { IncidentStatus } from "../../generated/prisma/client";

export async function getIncidents(
	userId: string,
	page: number,
	limit: number,
	status?: IncidentStatus,
) {
	const where = {
		monitor: {
			userId,
		},
		...(status ? { status } : {}),
	};

	const [incidents, total] = await prisma.$transaction([
		prisma.incident.findMany({
			where,

			include: {
				monitor: {
					select: {
						id: true,
						name: true,
						url: true,
						status: true,
					},
				},
			},

			orderBy: {
				startedAt: "desc",
			},

			skip: (page - 1) * limit,
			take: limit,
		}),

		prisma.incident.count({ where }),
	]);

	const incidentsWithDuration = incidents.map((incident) => {
		const endTime = incident.resolvedAt ?? new Date();

		return {
			...incident,
			durationMs: endTime.getTime() - incident.startedAt.getTime(),
		};
	});

	return {
		incidents: incidentsWithDuration,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

export async function getIncidentById(userId: string, incidentId: string) {
	const incident = await prisma.incident.findFirst({
		where: {
			id: incidentId,
			monitor: { userId },
		},
		include: {
			monitor: {
				select: {
					id: true,
					name: true,
					url: true,
					status: true,
				},
			},
		},
	});

	if (!incident) {
		return null;
	}

	const endTime = incident.resolvedAt ?? new Date();

	return {
		...incident,
		durationMs: endTime.getTime() - incident.startedAt.getTime(),
	};
}
