import { evaluateMonitorState } from "./monitor-state";
import { enqueueNotification } from "../queues/notification.queue";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { performance } from "node:perf_hooks";

import ipaddr from "ipaddr.js";

import { prisma } from "../config/database";

import { acquireMonitorLock } from "./monitor-lock";
import type { MonitorJobData } from "../queues/monitor.queue";

export interface HttpCheckResult {
	success: boolean;
	statusCode: number | null;
	latencyMs: number;
	errorMessage: string | null;
}

type HttpCheckFunction = (
	url: string,
	method: "GET" | "HEAD",
	timeoutMs: number,
) => Promise<HttpCheckResult>;

export async function processMonitorCheck(
	data: MonitorJobData,
	checkHttp: HttpCheckFunction = performHttpCheck,
) {
	const lock = await acquireMonitorLock(data.monitorId);

	// Another worker is already checking this monitor.
	if (!lock) {
		console.log(
			`[Monitor] Skipping ${data.monitorId}: check already in progress`,
		);
		return;
	}

	try {
		const monitor = await prisma.monitor.findUnique({
			where: {
				id: data.monitorId,
			},
		});

		if (!monitor || !monitor.enabled) {
			return;
		}

		// Verify Redis lock ownership before claiming a generation.
		if (!(await lock.assertOwned())) {
			return;
		}

		// Claim a new generation before starting the HTTP request.
		const generations = await prisma.$transaction(async (tx) => {
			return tx.$queryRaw<{ check_generation: bigint }[]>`
                                UPDATE monitors
                                SET check_generation = check_generation + 1
                                WHERE id = ${monitor.id}::uuid
                                  AND enabled = true
                                RETURNING check_generation
                        `;
		});

		if (generations.length === 0) {
			return;
		}

		const generation = generations[0].check_generation;

		console.log(
			`[Monitor] Checking ${monitor.name} (${monitor.url}), generation ${generation}`,
		);

		const result = await checkHttp(
			monitor.url,
			monitor.method,
			monitor.timeoutMs,
		);

		// Do not save a result if this worker lost its Redis lock.
		if (!(await lock.assertOwned())) {
			console.warn(
				`[Monitor] Discarding result for ${monitor.name}: lock lost`,
			);
			return;
		}

		// Save the result only if this is still the latest generation.
		const notificationIds = await prisma.$transaction(async (tx) => {
			const createdNotificationIds: string[] = [];

			const lockedMonitors = await tx.$queryRaw<{ id: string }[]>`
                                SELECT id
                                FROM monitors
                                WHERE id = ${monitor.id}::uuid
                                FOR UPDATE
                        `;

			if (lockedMonitors.length === 0) {
				return [];
			}

			const currentMonitor = await tx.monitor.findFirst({
				where: {
					id: monitor.id,
					enabled: true,
				},
			});

			if (
				!currentMonitor ||
				currentMonitor.checkGeneration !== generation
			) {
				console.log(
					`[Monitor] Discarding stale result for ${monitor.name}`,
				);
				return [];
			}

			const checkedAt = new Date();

			const nextCheckAt = new Date(
				checkedAt.getTime() + currentMonitor.intervalSeconds * 1000,
			);

			await tx.checkResult.create({
				data: {
					monitorId: monitor.id,
					statusCode: result.statusCode,
					latencyMs: result.latencyMs,
					success: result.success,
					errorMessage: result.errorMessage,
					checkedAt,
				},
			});

			const requiredChecks = Math.max(
				currentMonitor.failureThreshold,
				currentMonitor.recoveryThreshold,
			);

			const recentResults = await tx.checkResult.findMany({
				where: {
					monitorId: monitor.id,
				},
				orderBy: {
					checkedAt: "desc",
				},
				take: requiredChecks,
			});

			const state = evaluateMonitorState({
				currentStatus: currentMonitor.status,
				failureThreshold: currentMonitor.failureThreshold,
				recoveryThreshold: currentMonitor.recoveryThreshold,
				recentResults: recentResults.map((check) => check.success),
			});

			const { nextStatus, consecutiveCount } = state;

			await tx.monitor.update({
				where: {
					id: monitor.id,
				},
				data: {
					status: nextStatus,
					lastCheckedAt: checkedAt,
					nextCheckAt,
				},
			});

			const openIncident = await tx.incident.findFirst({
				where: {
					monitorId: monitor.id,
					status: "OPEN",
				},
			});

			const owner = await tx.user.findUnique({
				where: {
					id: currentMonitor.userId,
				},
				select: {
					email: true,
				},
			});

			if (nextStatus === "DOWN" && !openIncident) {
				const incident = await tx.incident.create({
					data: {
						monitorId: monitor.id,
						status: "OPEN",
						failureCount: consecutiveCount,
						startedAt: checkedAt,
					},
				});

				if (owner?.email) {
					const notification = await tx.notification.create({
						data: {
							incidentId: incident.id,
							channel: "EMAIL",
							eventType: "INCIDENT_OPENED",
							recipient: owner.email,
							status: "PENDING",
						},
					});

					createdNotificationIds.push(notification.id);
				}
			} else if (
				nextStatus === "DOWN" &&
				openIncident &&
				!result.success
			) {
				await tx.incident.update({
					where: {
						id: openIncident.id,
					},
					data: {
						failureCount: {
							increment: 1,
						},
					},
				});
			}

			if (
				nextStatus === "UP" &&
				currentMonitor.status === "DOWN" &&
				openIncident
			) {
				await tx.incident.update({
					where: {
						id: openIncident.id,
					},
					data: {
						status: "RESOLVED",
						resolvedAt: checkedAt,
					},
				});

				if (owner?.email) {
					const notification = await tx.notification.create({
						data: {
							incidentId: openIncident.id,
							channel: "EMAIL",
							eventType: "INCIDENT_RESOLVED",
							recipient: owner.email,
							status: "PENDING",
						},
					});

					createdNotificationIds.push(notification.id);
				}
			}

			return createdNotificationIds;
		});

		// Enqueue notifications after the database transaction commits.
		for (const notificationId of notificationIds) {
			try {
				await enqueueNotification(notificationId);
			} catch (error) {
				console.error(
					`[Monitor] Could not enqueue notification ${notificationId}:`,
					error,
				);
			}
		}

		console.log(
			`[Monitor] ${monitor.name}: ${
				result.success ? "UP" : "DOWN"
			} | ${result.latencyMs}ms`,
		);
	} finally {
		try {
			await lock.release();
		} catch (error) {
			console.error(
				`[Monitor] Failed to release lock for monitor ${data.monitorId}:`,
				error,
			);
		}
	}
}

function isPublicIp(address: string): boolean {
	if (!ipaddr.isValid(address)) {
		return false;
	}

	const parsed = ipaddr.process(address);

	return parsed.range() === "unicast";
}

async function resolveSafeAddress(
	hostname: string,
): Promise<{ address: string; family: number }> {
	const cleanHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");

	if (
		cleanHostname === "localhost" ||
		cleanHostname.endsWith(".localhost") ||
		cleanHostname.endsWith(".local") ||
		cleanHostname.endsWith(".internal")
	) {
		throw new Error("Private hostname is not allowed");
	}

	// Direct IP address.
	if (ipaddr.isValid(cleanHostname)) {
		if (!isPublicIp(cleanHostname)) {
			throw new Error("Private or reserved IP is not allowed");
		}

		return {
			address: cleanHostname,
			family: ipaddr.parse(cleanHostname).kind() === "ipv4" ? 4 : 6,
		};
	}

	// Resolve the hostname immediately before making the request.
	const addresses = await lookup(cleanHostname, {
		all: true,
		verbatim: true,
	});

	if (addresses.length === 0) {
		throw new Error("Hostname could not be resolved");
	}

	// Reject the entire hostname if any resolved address is unsafe.
	for (const entry of addresses) {
		if (!isPublicIp(entry.address)) {
			throw new Error("Hostname resolves to a private or reserved IP");
		}
	}

	// Pin the connection to this exact validated address.
	return {
		address: addresses[0].address,
		family: addresses[0].family,
	};
}

async function performHttpCheck(
	url: string,
	method: "GET" | "HEAD",
	timeoutMs: number,
): Promise<HttpCheckResult> {
	const startedAt = performance.now();

	try {
		const parsedUrl = new URL(url);

		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			throw new Error("Unsupported URL protocol");
		}

		if (parsedUrl.username || parsedUrl.password) {
			throw new Error("URL credentials are not allowed");
		}

		const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "");

		const pinned = await resolveSafeAddress(hostname);

		const statusCode = await new Promise<number>((resolve, reject) => {
			let settled = false;

			const finish = (error?: Error, status?: number) => {
				if (settled) return;

				settled = true;
				clearTimeout(timeout);

				if (error) {
					reject(error);
				} else {
					resolve(status!);
				}
			};

			const options: https.RequestOptions = {
				hostname: pinned.address,
				family: pinned.family,

				port: parsedUrl.port
					? Number(parsedUrl.port)
					: parsedUrl.protocol === "https:"
						? 443
						: 80,

				path: `${parsedUrl.pathname}${parsedUrl.search}`,

				method,

				headers: {
					Host: parsedUrl.host,
					"User-Agent": "PulseWatch-Monitor/1.0",
					Accept: "*/*",
				},

				agent: false,
				rejectUnauthorized: true,

				// Keep TLS certificate verification tied to the
				// original hostname, not the pinned IP address.
				...(parsedUrl.protocol === "https:" && !ipaddr.isValid(hostname)
					? { servername: hostname }
					: {}),
			};

			const onResponse = (response: http.IncomingMessage) => {
				const code = response.statusCode ?? 0;

				// Do not follow redirects automatically.
				response.resume();

				response.once("end", () => {
					finish(undefined, code);
				});

				response.once("error", (error) => {
					finish(error);
				});
			};

			const request =
				parsedUrl.protocol === "https:"
					? https.request(options, onResponse)
					: http.request(options, onResponse);

			// Covers connection, response headers and body completion.
			const timeout = setTimeout(() => {
				request.destroy(new Error("Request timed out"));
			}, timeoutMs);

			request.once("error", (error) => {
				finish(error);
			});

			request.end();
		});

		const latencyMs = Math.round(performance.now() - startedAt);

		// 200–399 indicates a reachable HTTP endpoint.
		return {
			success: statusCode >= 200 && statusCode < 400,
			statusCode,
			latencyMs,
			errorMessage: statusCode >= 400 ? `HTTP ${statusCode}` : null,
		};
	} catch (error) {
		return {
			success: false,
			statusCode: null,
			latencyMs: Math.round(performance.now() - startedAt),
			errorMessage:
				error instanceof Error
					? error.message.slice(0, 500)
					: "Unknown network error",
		};
	}
}
