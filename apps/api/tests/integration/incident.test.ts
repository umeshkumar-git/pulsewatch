import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import app from "../../src/app";
import { prisma } from "../../src/config/database";

const createdUserIds: string[] = [];

async function createTestUser() {
        const email = `incident-${crypto.randomUUID()}@example.com`;

        const response = await request(app)
                .post("/api/v1/auth/register")
                .send({
                        name: "Incident Test User",
                        email,
                        password: "TestPassword123!",
                });

        expect(response.status).toBe(201);

        const user = await prisma.user.findUnique({
                where: { email },
                select: { id: true },
        });

        expect(user).not.toBeNull();
        createdUserIds.push(user!.id);

        return {
                accessToken: response.body.data.accessToken as string,
                userId: user!.id,
        };
}

async function createMonitor(userId: string, name: string) {
        return prisma.monitor.create({
                data: {
                        userId,
                        name,
                        url: "https://example.com",
                },
        });
}

async function createIncident(
        monitorId: string,
        status: "OPEN" | "RESOLVED",
        failureCount: number,
        startedAt: Date,
        resolvedAt: Date | null = null,
) {
        return prisma.incident.create({
                data: {
                        monitorId,
                        status,
                        failureCount,
                        startedAt,
                        resolvedAt,
                },
        });
}

afterEach(async () => {
        if (createdUserIds.length > 0) {
                await prisma.user.deleteMany({
                        where: {
                                id: { in: [...createdUserIds] },
                        },
                });

                createdUserIds.length = 0;
        }
});

describe("Incident API integration tests", () => {
        it("rejects incident requests without authentication", async () => {
                const listResponse = await request(app).get(
                        "/api/v1/incidents",
                );

                expect(listResponse.status).toBe(401);
                expect(listResponse.body.success).toBe(false);

                const detailResponse = await request(app).get(
                        `/api/v1/incidents/${crypto.randomUUID()}`,
                );

                expect(detailResponse.status).toBe(401);
                expect(detailResponse.body.success).toBe(false);
        });

        it("returns an empty incident list for a user without incidents", async () => {
                const user = await createTestUser();

                const response = await request(app)
                        .get("/api/v1/incidents")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.incidents).toEqual([]);
                expect(response.body.data.pagination).toEqual({
                        page: 1,
                        limit: 20,
                        total: 0,
                        totalPages: 0,
                });
        });

        it("returns only incidents belonging to the authenticated user", async () => {
                const userOne = await createTestUser();
                const userTwo = await createTestUser();

                const monitorOne = await createMonitor(
                        userOne.userId,
                        "User One Monitor",
                );

                const monitorTwo = await createMonitor(
                        userTwo.userId,
                        "User Two Monitor",
                );

                const incidentOne = await createIncident(
                        monitorOne.id,
                        "OPEN",
                        3,
                        new Date("2026-01-01T10:00:00.000Z"),
                );

                await createIncident(
                        monitorTwo.id,
                        "OPEN",
                        5,
                        new Date("2026-01-01T11:00:00.000Z"),
                );

                const response = await request(app)
                        .get("/api/v1/incidents")
                        .set("Authorization", `Bearer ${userOne.accessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.data.pagination.total).toBe(1);
                expect(response.body.data.incidents).toHaveLength(1);
                expect(response.body.data.incidents[0].id).toBe(
                        incidentOne.id,
                );
                expect(response.body.data.incidents[0].monitor.name).toBe(
                        "User One Monitor",
                );
        });

        it("filters incidents by OPEN and RESOLVED status", async () => {
                const user = await createTestUser();
                const monitor = await createMonitor(
                        user.userId,
                        "Status Filter Monitor",
                );

                await createIncident(
                        monitor.id,
                        "OPEN",
                        3,
                        new Date("2026-01-01T10:00:00.000Z"),
                );

                await createIncident(
                        monitor.id,
                        "RESOLVED",
                        4,
                        new Date("2026-01-01T11:00:00.000Z"),
                        new Date("2026-01-01T12:00:00.000Z"),
                );

                const openResponse = await request(app)
                        .get("/api/v1/incidents?status=OPEN")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(openResponse.status).toBe(200);
                expect(openResponse.body.data.pagination.total).toBe(1);
                expect(openResponse.body.data.incidents[0].status).toBe(
                        "OPEN",
                );

                const resolvedResponse = await request(app)
                        .get("/api/v1/incidents?status=RESOLVED")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(resolvedResponse.status).toBe(200);
                expect(resolvedResponse.body.data.pagination.total).toBe(1);
                expect(resolvedResponse.body.data.incidents[0].status).toBe(
                        "RESOLVED",
                );
        });

        it("supports pagination and newest-first ordering", async () => {
                const user = await createTestUser();
                const monitor = await createMonitor(
                        user.userId,
                        "Pagination Monitor",
                );

                const dates = [
                        new Date("2026-01-01T10:00:00.000Z"),
                        new Date("2026-01-02T10:00:00.000Z"),
                        new Date("2026-01-03T10:00:00.000Z"),
                ];

                for (const date of dates) {
                        await createIncident(
                                monitor.id,
                                "RESOLVED",
                                3,
                                date,
                                new Date(date.getTime() + 60_000),
                        );
                }

                const response = await request(app)
                        .get("/api/v1/incidents?page=1&limit=2")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.data.incidents).toHaveLength(2);
                expect(response.body.data.pagination).toEqual({
                        page: 1,
                        limit: 2,
                        total: 3,
                        totalPages: 2,
                });

                expect(
                        response.body.data.incidents[0].startedAt,
                ).toBe(dates[2].toISOString());

                expect(
                        response.body.data.incidents[1].startedAt,
                ).toBe(dates[1].toISOString());
        });

        it("returns incident details with monitor information and duration", async () => {
                const user = await createTestUser();
                const monitor = await createMonitor(
                        user.userId,
                        "Incident Detail Monitor",
                );

                const startedAt = new Date("2026-01-01T10:00:00.000Z");
                const resolvedAt = new Date("2026-01-01T10:05:00.000Z");

                const incident = await createIncident(
                        monitor.id,
                        "RESOLVED",
                        4,
                        startedAt,
                        resolvedAt,
                );

                const response = await request(app)
                        .get(`/api/v1/incidents/${incident.id}`)
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.id).toBe(incident.id);
                expect(response.body.data.status).toBe("RESOLVED");
                expect(response.body.data.failureCount).toBe(4);
                expect(response.body.data.durationMs).toBe(300_000);
                expect(response.body.data.monitor).toMatchObject({
                        id: monitor.id,
                        name: "Incident Detail Monitor",
                        url: "https://example.com",
                });
        });

        it("returns 404 for an incident belonging to another user", async () => {
                const userOne = await createTestUser();
                const userTwo = await createTestUser();

                const monitor = await createMonitor(
                        userOne.userId,
                        "Private Incident Monitor",
                );

                const incident = await createIncident(
                        monitor.id,
                        "OPEN",
                        3,
                        new Date(),
                );

                const response = await request(app)
                        .get(`/api/v1/incidents/${incident.id}`)
                        .set("Authorization", `Bearer ${userTwo.accessToken}`);

                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
                expect(response.body.message).toBe("Incident not found");
        });

        it("returns 404 for a nonexistent incident", async () => {
                const user = await createTestUser();

                const response = await request(app)
                        .get(`/api/v1/incidents/${crypto.randomUUID()}`)
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
        });

        it("rejects invalid incident IDs", async () => {
                const user = await createTestUser();

                const response = await request(app)
                        .get("/api/v1/incidents/invalid-id")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
        });

        it("rejects invalid pagination and status query parameters", async () => {
                const user = await createTestUser();

                const invalidPage = await request(app)
                        .get("/api/v1/incidents?page=0")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(invalidPage.status).toBe(400);

                const invalidLimit = await request(app)
                        .get("/api/v1/incidents?limit=101")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(invalidLimit.status).toBe(400);

                const invalidStatus = await request(app)
                        .get("/api/v1/incidents?status=UNKNOWN")
                        .set("Authorization", `Bearer ${user.accessToken}`);

                expect(invalidStatus.status).toBe(400);
        });
});
