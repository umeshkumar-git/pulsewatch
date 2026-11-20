import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { performance } from "node:perf_hooks";

import ipaddr from "ipaddr.js";

import { prisma } from "../config/database";

import type { MonitorJobData } from "../queues/monitor.queue";

interface HttpCheckResult {
	success: boolean;
	statusCode: number | null;
	latencyMs: number;
	errorMessage: string | null;
}
export async function processMonitorCheck(data: MonitorJobData) {
	const monitor = await prisma.monitor.findUnique({
		where: {
			id: data.monitorId,
		},
	});

	// The monitor may have been deleted.
	if (!monitor) {
		return;
	}

	// Do not execute checks for paused monitors.
	if (!monitor.enabled) {
		return;
	}

	console.log(`[Monitor] Checking ${monitor.name} (${monitor.url})`);

	const result = await performHttpCheck(
		monitor.url,
		monitor.method,
		monitor.timeoutMs,
	);

	const checkedAt = new Date();

	const nextCheckAt = new Date(
		checkedAt.getTime() + monitor.intervalSeconds * 1000,
	);

	// Store the result and update monitor state together.
	
await prisma.$transaction(async (tx) => {
    const stillEnabled = await tx.monitor.findFirst({
        where: {
            id: monitor.id,
            enabled: true,
        },
        select: {
            id: true,
        },
    });

    if (!stillEnabled) {
        return;
    }

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
        monitor.failureThreshold,
        monitor.recoveryThreshold,
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

    // Count consecutive results matching the current result.
    const firstDifferentResult = recentResults.findIndex(
        (check) => check.success !== result.success,
    );

    const consecutiveCount =
        firstDifferentResult === -1
            ? recentResults.length
            : firstDifferentResult;

    let nextStatus = monitor.status;

    if (result.success) {
        if (monitor.status === "DOWN") {
            if (consecutiveCount >= monitor.recoveryThreshold) {
                nextStatus = "UP";
            }
        } else {
            // An UNKNOWN monitor becomes UP after its first success.
            nextStatus = "UP";
        }
    } else {
        if (consecutiveCount >= monitor.failureThreshold) {
            nextStatus = "DOWN";
        }
    }

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


		// The monitor may have been paused or deleted while
		// its HTTP request was in progress.
		if (!stillEnabled) {
			return;
		}

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

		await tx.monitor.update({
			where: {
				id: monitor.id,
			},
			data: {
				status: result.success ? "UP" : "DOWN",
				lastCheckedAt: checkedAt,
				nextCheckAt,
			},
		});
	});

	console.log(
		`[Monitor] ${monitor.name}: ${
			result.success ? "UP" : "DOWN"
		} | ${result.latencyMs}ms`,
	);
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

		const transport = parsedUrl.protocol === "https:" ? https : http;

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

			const request = transport.request(options, (response) => {
				const code = response.statusCode ?? 0;

				// Do not follow redirects automatically.
				response.resume();

				response.once("end", () => {
					finish(undefined, code);
				});

				response.once("error", (error) => {
					finish(error);
				});
			});

			// Covers DNS-independent request time, connection,
			// response headers and response body completion.
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
