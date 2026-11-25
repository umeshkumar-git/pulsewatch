import { afterAll, afterEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app";
import { prisma } from "../../src/config/database";
import { redisClient } from "../../src/config/redis";
import { processMonitorCheck } from "../../src/workers/monitor.processor";

const createdUserIds: string[] = [];
const createdMonitorIds: string[] = [];

describe("Real Redis monitor concurrency integration tests", () => {
	afterEach(async () => {
		for (const monitorId of createdMonitorIds.splice(0)) {
			await redisClient.del(`pulsewatch:monitor-lock:${monitorId}`);
		}

		for (const userId of createdUserIds.splice(0)) {
			await prisma.user.deleteMany({
				where: { id: userId },
			});
		}
	});

	afterAll(async () => {
		// Keep shared Prisma and Redis clients available to other tests.
	});

	it("allows only one simultaneous processor execution per monitor", async () => {
		const email = `concurrency-${crypto.randomUUID()}@example.com`;

		const registration = await request(app)
			.post("/api/v1/auth/register")
			.send({
				name: "Concurrency Test User",
				email,
				password: "TestPassword123!",
			});

		expect(registration.status).toBe(201);

		const accessToken = registration.body.data.accessToken as string;

		const monitorResponse = await request(app)
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Redis Concurrency Test",
				url: "https://example.com",
			});

		expect(monitorResponse.status).toBe(201);

		const monitorId = monitorResponse.body.data.monitor.id as string;
		createdMonitorIds.push(monitorId);

		const storedMonitor = await prisma.monitor.findUnique({
			where: { id: monitorId },
			select: { userId: true },
		});

		expect(storedMonitor).not.toBeNull();

		createdUserIds.push(storedMonitor!.userId);

		let signalHttpStarted!: () => void;

		const httpStarted = new Promise<void>((resolve) => {
			signalHttpStarted = resolve;
		});

		let finishHttpCheck!: (result: {
			success: boolean;
			statusCode: number;
			latencyMs: number;
			errorMessage: string | null;
		}) => void;

		const pendingHttpCheck = new Promise<{
			success: boolean;
			statusCode: number;
			latencyMs: number;
			errorMessage: string | null;
		}>((resolve) => {
			finishHttpCheck = resolve;
		});

		const firstHttpCheck = async () => {
			signalHttpStarted();
			return pendingHttpCheck;
		};

		const secondHttpCheck = async () => ({
			success: true,
			statusCode: 200,
			latencyMs: 50,
			errorMessage: null,
		});

		// Start the first processor and hold its HTTP check open.
		const firstExecution = processMonitorCheck(
			{ monitorId },
			firstHttpCheck,
		);

		await httpStarted;

		// The second processor must be rejected by actual Redis.
		await processMonitorCheck({ monitorId }, secondHttpCheck);

		// Only the first execution should have claimed a generation.
		const duringFirstCheck = await prisma.monitor.findUnique({
			where: { id: monitorId },
			select: { checkGeneration: true },
		});

		expect(duringFirstCheck?.checkGeneration).toBe(1n);

		// Finish the first HTTP check.
		finishHttpCheck({
			success: true,
			statusCode: 200,
			latencyMs: 100,
			errorMessage: null,
		});

		await firstExecution;

		// Verify the first accepted check was retained.
		const firstMonitor = await prisma.monitor.findUnique({
			where: { id: monitorId },
			select: {
				checkGeneration: true,
				status: true,
			},
		});

		expect(firstMonitor?.checkGeneration).toBe(1n);
		expect(firstMonitor?.status).toBe("UP");

		const firstResults = await prisma.checkResult.findMany({
			where: { monitorId },
			orderBy: { checkedAt: "asc" },
		});

		expect(firstResults).toHaveLength(1);
		expect(firstResults[0].success).toBe(true);
		expect(firstResults[0].latencyMs).toBe(100);

		// Run the second accepted check after the first lock is released.
		await processMonitorCheck({ monitorId }, async () => ({
			success: true,
			statusCode: 200,
			latencyMs: 150,
			errorMessage: null,
		}));

		// Verify the final monitor state.
		const finalMonitor = await prisma.monitor.findUnique({
			where: { id: monitorId },
			select: {
				checkGeneration: true,
				status: true,
			},
		});

		// Verify both accepted checks remain in history.
		const savedResults = await prisma.checkResult.findMany({
			where: { monitorId },
			orderBy: { checkedAt: "asc" },
		});

		expect(finalMonitor?.checkGeneration).toBe(2n);
		expect(finalMonitor?.status).toBe("UP");

		expect(savedResults).toHaveLength(2);
		expect(savedResults[0].success).toBe(true);
		expect(savedResults[0].latencyMs).toBe(100);
		expect(savedResults[1].success).toBe(true);
		expect(savedResults[1].latencyMs).toBe(150);
	});
	it("discards an older HTTP response after a newer generation completes", async () => {
		const email = `out-of-order-${crypto.randomUUID()}@example.com`;

		const registration = await request(app)
			.post("/api/v1/auth/register")
			.send({
				name: "Out Of Order Test User",
				email,
				password: "TestPassword123!",
			});

		expect(registration.status).toBe(201);

		const accessToken = registration.body.data.accessToken as string;

		const monitorResponse = await request(app)
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Out Of Order Test Monitor",
				url: "https://example.com",
			});

		expect(monitorResponse.status).toBe(201);

		const monitorId = monitorResponse.body.data.monitor.id as string;
		createdMonitorIds.push(monitorId);

		const storedMonitor = await prisma.monitor.findUnique({
			where: { id: monitorId },
			select: { userId: true },
		});

		expect(storedMonitor).not.toBeNull();
		createdUserIds.push(storedMonitor!.userId);

		let finishFirstHttpCheck!: (result: {
			success: boolean;
			statusCode: number | null;
			latencyMs: number;
			errorMessage: string | null;
		}) => void;

		let signalFirstHttpStarted!: () => void;

		const firstHttpStarted = new Promise<void>((resolve) => {
			signalFirstHttpStarted = resolve;
		});

		const pendingFirstHttpCheck = new Promise<{
			success: boolean;
			statusCode: number | null;
			latencyMs: number;
			errorMessage: string | null;
		}>((resolve) => {
			finishFirstHttpCheck = resolve;
		});

		// Worker A claims generation 1 and waits for its HTTP response.
		const firstExecution = processMonitorCheck({ monitorId }, async () => {
			signalFirstHttpStarted();
			return pendingFirstHttpCheck;
		});

		await firstHttpStarted;

		const lockKey = `pulsewatch:monitor-lock:${monitorId}`;

		// Expire Worker A's real Redis lock before its renewal interval.
		await redisClient.pexpire(lockKey, 200);

		await new Promise((resolve) => setTimeout(resolve, 350));

		expect(await redisClient.get(lockKey)).toBeNull();

		// Worker B acquires the lock, claims generation 2, and completes first.
		await processMonitorCheck({ monitorId }, async () => ({
			success: true,
			statusCode: 200,
			latencyMs: 200,
			errorMessage: null,
		}));

		// Confirm Worker B's result was accepted.
		const afterSecondExecution = await prisma.monitor.findUnique({
			where: { id: monitorId },
			select: {
				checkGeneration: true,
				status: true,
			},
		});

		expect(afterSecondExecution?.checkGeneration).toBe(2n);
		expect(afterSecondExecution?.status).toBe("UP");

		// Worker A now finishes late with an older failure result.
		finishFirstHttpCheck({
			success: false,
			statusCode: 500,
			latencyMs: 500,
			errorMessage: "Older delayed response",
		});

		await firstExecution;

		// Worker A must not overwrite Worker B's accepted result.
		const finalMonitor = await prisma.monitor.findUnique({
			where: { id: monitorId },
			select: {
				checkGeneration: true,
				status: true,
			},
		});

		const savedResults = await prisma.checkResult.findMany({
			where: { monitorId },
			orderBy: { checkedAt: "asc" },
		});

		expect(finalMonitor?.checkGeneration).toBe(2n);
		expect(finalMonitor?.status).toBe("UP");

		// Only the newer accepted result should be retained.
		expect(savedResults).toHaveLength(1);
		expect(savedResults[0].success).toBe(true);
		expect(savedResults[0].latencyMs).toBe(200);
	});
});
