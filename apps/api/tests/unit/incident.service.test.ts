import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
        prismaMock: {
                $transaction: vi.fn(),
                incident: {
                        findMany: vi.fn(),
                        count: vi.fn(),
                        findFirst: vi.fn(),
                },
        },
}));

vi.mock("../../src/config/database", () => ({
        prisma: prismaMock,
}));

import {
        getIncidentById,
        getIncidents,
} from "../../src/modules/incidents/incident.service";

const userId = "11111111-1111-4111-8111-111111111111";
const monitorId = "22222222-2222-4222-8222-222222222222";
const incidentId = "33333333-3333-4333-8333-333333333333";

const startedAt = new Date("2026-01-01T10:00:00.000Z");
const resolvedAt = new Date("2026-01-01T10:05:00.000Z");

const incident = {
        id: incidentId,
        monitorId,
        status: "RESOLVED",
        failureCount: 3,
        startedAt,
        resolvedAt,
        createdAt: startedAt,
        updatedAt: resolvedAt,
        monitor: {
                id: monitorId,
                name: "Test Monitor",
                url: "https://example.com",
                status: "UP",
        },
};

describe("Incident service", () => {
        beforeEach(() => {
                vi.clearAllMocks();

                prismaMock.$transaction.mockImplementation(
                        async (queries: Promise<unknown>[]) => Promise.all(queries),
                );

                prismaMock.incident.findMany.mockResolvedValue([incident]);
                prismaMock.incident.count.mockResolvedValue(1);
                prismaMock.incident.findFirst.mockResolvedValue(incident);
        });

        describe("getIncidents", () => {
                it("filters incidents by authenticated user", async () => {
                        await getIncidents(userId, 1, 20);

                        expect(prismaMock.incident.findMany).toHaveBeenCalledWith(
                                expect.objectContaining({
                                        where: {
                                                monitor: { userId },
                                        },
                                }),
                        );
                });

                it("filters incidents by status", async () => {
                        await getIncidents(userId, 1, 20, "OPEN");

                        expect(prismaMock.incident.findMany).toHaveBeenCalledWith(
                                expect.objectContaining({
                                        where: {
                                                monitor: { userId },
                                                status: "OPEN",
                                        },
                                }),
                        );
                });

                it("applies pagination and newest-first ordering", async () => {
                        await getIncidents(userId, 2, 10);

                        expect(prismaMock.incident.findMany).toHaveBeenCalledWith(
                                expect.objectContaining({
                                        orderBy: { startedAt: "desc" },
                                        skip: 10,
                                        take: 10,
                                }),
                        );
                });

                it("calculates resolved incident duration", async () => {
                        const result = await getIncidents(userId, 1, 20);

                        expect(result.incidents[0].durationMs).toBe(300000);
                });

                it("returns pagination metadata", async () => {
                        prismaMock.incident.count.mockResolvedValue(45);

                        const result = await getIncidents(userId, 2, 20);

                        expect(result.pagination).toEqual({
                                page: 2,
                                limit: 20,
                                total: 45,
                                totalPages: 3,
                        });
                });
        });

        describe("getIncidentById", () => {
                it("retrieves an incident belonging to the authenticated user", async () => {
                        await getIncidentById(userId, incidentId);

                        expect(prismaMock.incident.findFirst).toHaveBeenCalledWith(
                                expect.objectContaining({
                                        where: {
                                                id: incidentId,
                                                monitor: { userId },
                                        },
                                }),
                        );
                });

                it("calculates resolved incident duration", async () => {
                        const result = await getIncidentById(userId, incidentId);

                        expect(result?.durationMs).toBe(300000);
                });

                it("calculates duration for an open incident", async () => {
                        const now = new Date("2026-01-01T10:10:00.000Z");

                        vi.useFakeTimers();
                        vi.setSystemTime(now);

                        try {
                                prismaMock.incident.findFirst.mockResolvedValue({
                                        ...incident,
                                        status: "OPEN",
                                        resolvedAt: null,
                                });

                                const result = await getIncidentById(
                                        userId,
                                        incidentId,
                                );

                                expect(result?.durationMs).toBe(600000);
                        } finally {
                                vi.useRealTimers();
                        }
                });

                it("returns null when the incident does not exist", async () => {
                        prismaMock.incident.findFirst.mockResolvedValue(null);

                        const result = await getIncidentById(userId, incidentId);

                        expect(result).toBeNull();
                });
        });
});
