import { randomBytes } from "node:crypto";
import { prisma } from "../../config/database";

export class StatusPageError extends Error {
	constructor(
		message: string,
		public statusCode: number,
	) {
		super(message);
		this.name = "StatusPageError";
	}
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 70);
}

async function generateUniqueSlug(title: string) {
	const base = slugify(title) || "status";

	for (let attempt = 0; attempt < 5; attempt++) {
		const suffix = randomBytes(3).toString("hex");
		const slug = `${base}-${suffix}`;

		const existing = await prisma.statusPage.findUnique({
			where: { slug },
			select: { id: true },
		});

		if (!existing) return slug;
	}

	throw new StatusPageError("Could not generate a unique slug", 500);
}

async function validateOwnedMonitors(userId: string, monitorIds: string[]) {
	const uniqueIds = [...new Set(monitorIds)];

	const count = await prisma.monitor.count({
		where: {
			id: { in: uniqueIds },
			userId,
		},
	});

	if (count !== uniqueIds.length) {
		throw new StatusPageError(
			"One or more monitors were not found or are not yours",
			400,
		);
	}

	return uniqueIds;
}

export async function createStatusPage(
	userId: string,
	input: { title: string; monitorIds: string[] },
) {
	const monitorIds = await validateOwnedMonitors(userId, input.monitorIds);

	const slug = await generateUniqueSlug(input.title);

	return prisma.statusPage.create({
		data: {
			userId,
			title: input.title,
			slug,
			isPublic: true,
			monitors: {
				create: monitorIds.map((monitorId) => ({
					monitorId,
				})),
			},
		},
		include: {
			monitors: {
				include: {
					monitor: {
						select: {
							id: true,
							name: true,
							url: true,
							status: true,
							enabled: true,
							lastCheckedAt: true,
						},
					},
				},
			},
		},
	});
}

export async function getStatusPages(userId: string) {
	return prisma.statusPage.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		include: {
			monitors: {
				include: {
					monitor: {
						select: {
							id: true,
							name: true,
							url: true,
							status: true,
							enabled: true,
							lastCheckedAt: true,
						},
					},
				},
			},
		},
	});
}

export async function getManagedStatusPage(userId: string, pageId: string) {
	const page = await prisma.statusPage.findFirst({
		where: {
			id: pageId,
			userId,
		},
		include: {
			monitors: {
				include: {
					monitor: {
						select: {
							id: true,
							name: true,
							url: true,
							status: true,
							enabled: true,
							lastCheckedAt: true,
						},
					},
				},
			},
		},
	});

	if (!page) {
		throw new StatusPageError("STATUS_PAGE_NOT_FOUND", 404);
	}

	return page;
}

export async function updateStatusPage(
	userId: string,
	pageId: string,
	input: { title?: string; isPublic?: boolean },
) {
	const result = await prisma.statusPage.updateMany({
		where: {
			id: pageId,
			userId,
		},
		data: input,
	});

	if (result.count === 0) {
		throw new StatusPageError("STATUS_PAGE_NOT_FOUND", 404);
	}

	return getManagedStatusPage(userId, pageId);
}

export async function updateStatusPageMonitors(
	userId: string,
	pageId: string,
	monitorIds: string[],
) {
	const page = await prisma.statusPage.findFirst({
		where: {
			id: pageId,
			userId,
		},
		select: { id: true },
	});

	if (!page) {
		throw new StatusPageError("STATUS_PAGE_NOT_FOUND", 404);
	}

	const uniqueIds = await validateOwnedMonitors(userId, monitorIds);

	return prisma.$transaction(async (tx) => {
		await tx.statusPageMonitor.deleteMany({
			where: { statusPageId: pageId },
		});

		await tx.statusPageMonitor.createMany({
			data: uniqueIds.map((monitorId) => ({
				statusPageId: pageId,
				monitorId,
			})),
		});

		return tx.statusPage.findUniqueOrThrow({
			where: { id: pageId },
			include: {
				monitors: {
					include: {
						monitor: {
							select: {
								id: true,
								name: true,
								url: true,
								status: true,
								enabled: true,
								lastCheckedAt: true,
							},
						},
					},
				},
			},
		});
	});
}

export async function deleteStatusPage(userId: string, pageId: string) {
	const result = await prisma.statusPage.deleteMany({
		where: {
			id: pageId,
			userId,
		},
	});

	if (result.count === 0) {
		throw new StatusPageError("STATUS_PAGE_NOT_FOUND", 404);
	}

	return { deleted: true };
}

export async function getPublicStatusPage(slug: string) {
	const page = await prisma.statusPage.findFirst({
		where: {
			slug,
			isPublic: true,
		},
		select: {
			id: true,
			title: true,
			slug: true,
			createdAt: true,
			monitors: {
				orderBy: { createdAt: "asc" },
				select: {
					monitor: {
						select: {
							id: true,
							name: true,
							url: true,
							status: true,
							enabled: true,
							lastCheckedAt: true,
							checkResults: {
								where: {
									checkedAt: {
										gte: new Date(
											Date.now() - 24 * 60 * 60 * 1000,
										),
									},
								},
								select: {
									success: true,
								},
							},
							incidents: {
								orderBy: {
									startedAt: "desc",
								},
								take: 5,
								select: {
									id: true,
									status: true,
									failureCount: true,
									startedAt: true,
									resolvedAt: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!page) {
		throw new StatusPageError("PUBLIC_STATUS_PAGE_NOT_FOUND", 404);
	}

	return {
		...page,
		monitors: page.monitors.map(({ monitor }) => {
			const totalChecks = monitor.checkResults.length;
			const successfulChecks = monitor.checkResults.filter(
				(check) => check.success,
			).length;

			return {
				id: monitor.id,
				name: monitor.name,
				url: monitor.url,
				status: monitor.enabled ? monitor.status : "PAUSED",
				lastCheckedAt: monitor.lastCheckedAt,
				uptimePercentage:
					totalChecks === 0
						? null
						: Number(
								(
									(successfulChecks / totalChecks) *
									100
								).toFixed(2),
							),
				totalChecks,
				incidents: monitor.incidents,
			};
		}),
	};
}
