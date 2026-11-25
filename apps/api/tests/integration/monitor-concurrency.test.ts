
import {
    afterAll,
    afterEach,
    describe,
    expect,
    it,
} from "vitest";
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
            await redisClient.del(
                `pulsewatch:monitor-lock:${monitorId}`,
            );
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
        await processMonitorCheck(
            { monitorId },
            secondHttpCheck,
        );

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

        const finalMonitor = await prisma.monitor.findUnique({
            where: { id: monitorId },
            select: {
                checkGeneration: true,
                status: true,
            },
        });

        const savedResults = await prisma.checkResult.count({
            where: { monitorId },
        });

        expect(finalMonitor?.checkGeneration).toBe(1n);
        expect(finalMonitor?.status).toBe("UP");
        expect(savedResults).toBe(1);
    });
});

