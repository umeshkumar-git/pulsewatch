
import { describe, it, expect } from "vitest";
import request from "supertest";

import app from "../../src/app";

async function createTestUser() {
        const agent = request.agent(app);

        const response = await agent.post("/api/v1/auth/register").send({
                name: "Status Page Test User",
                email: `status-page-${crypto.randomUUID()}@example.com`,
                password: "TestPassword123!",
        });

        expect(response.status).toBe(201);

        return {
                agent,
                accessToken: response.body.data.accessToken as string,
        };
}

async function createTestMonitor(
        agent: ReturnType<typeof request.agent>,
        accessToken: string,
) {
        const response = await agent
                .post("/api/v1/monitors")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                        name: "Status Page Test Monitor",
                        url: "https://example.com",
                });

        expect(response.status).toBe(201);

        return response.body.data.monitor.id as string;
}

async function createTestStatusPage(
        agent: ReturnType<typeof request.agent>,
        accessToken: string,
        monitorId: string,
) {
        const response = await agent
                .post("/api/v1/status-pages")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                        title: "Integration Test Status Page",
                        monitorIds: [monitorId],
                });

        expect(response.status).toBe(201);

        return response.body.data.page;
}

describe("Status Page API integration tests", () => {
        it("allows public access to a public status page without authentication", async () => {
                const { agent, accessToken } = await createTestUser();
                const monitorId = await createTestMonitor(agent, accessToken);
                const page = await createTestStatusPage(
                        agent,
                        accessToken,
                        monitorId,
                );

                const response = await request(app).get(
                        `/api/v1/status-pages/public/${page.slug}`,
                );

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.page.slug).toBe(page.slug);
                expect(response.body.data.page.monitors).toHaveLength(1);
        });

        it("returns 404 for an unknown public status page slug", async () => {
                const response = await request(app).get(
                        "/api/v1/status-pages/public/unknown-status-page-123",
                );

                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
        });

        it("does not expose a private status page through its known public slug", async () => {
                const { agent, accessToken } = await createTestUser();
                const monitorId = await createTestMonitor(agent, accessToken);
                const page = await createTestStatusPage(
                        agent,
                        accessToken,
                        monitorId,
                );

                const updated = await agent
                        .patch(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${accessToken}`)
                        .send({ isPublic: false });

                expect(updated.status).toBe(200);
                expect(updated.body.data.page.isPublic).toBe(false);

                const response = await request(app).get(
                        `/api/v1/status-pages/public/${page.slug}`,
                );

                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
        });

        it("allows the owner to retrieve their private page through the management endpoint", async () => {
                const { agent, accessToken } = await createTestUser();
                const monitorId = await createTestMonitor(agent, accessToken);
                const page = await createTestStatusPage(
                        agent,
                        accessToken,
                        monitorId,
                );

                await agent
                        .patch(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${accessToken}`)
                        .send({ isPublic: false });

                const response = await agent
                        .get(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${accessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.data.page.id).toBe(page.id);
                expect(response.body.data.page.isPublic).toBe(false);
        });

        it("prevents another user from retrieving a private status page", async () => {
                const owner = await createTestUser();
                const otherUser = await createTestUser();

                const monitorId = await createTestMonitor(
                        owner.agent,
                        owner.accessToken,
                );

                const page = await createTestStatusPage(
                        owner.agent,
                        owner.accessToken,
                        monitorId,
                );

                await owner.agent
                        .patch(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${owner.accessToken}`)
                        .send({ isPublic: false });

                const response = await otherUser.agent
                        .get(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${otherUser.accessToken}`);

                expect(response.status).toBe(404);
        });

        it("prevents another user from updating a status page", async () => {
                const owner = await createTestUser();
                const otherUser = await createTestUser();

                const monitorId = await createTestMonitor(
                        owner.agent,
                        owner.accessToken,
                );

                const page = await createTestStatusPage(
                        owner.agent,
                        owner.accessToken,
                        monitorId,
                );

                const response = await otherUser.agent
                        .patch(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${otherUser.accessToken}`)
                        .send({ title: "Unauthorized Update" });

                expect(response.status).toBe(404);
        });

        it("prevents another user from deleting a status page", async () => {
                const owner = await createTestUser();
                const otherUser = await createTestUser();

                const monitorId = await createTestMonitor(
                        owner.agent,
                        owner.accessToken,
                );

                const page = await createTestStatusPage(
                        owner.agent,
                        owner.accessToken,
                        monitorId,
                );

                const response = await otherUser.agent
                        .delete(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${otherUser.accessToken}`);

                expect(response.status).toBe(404);

                const ownerCheck = await owner.agent
                        .get(`/api/v1/status-pages/${page.id}`)
                        .set("Authorization", `Bearer ${owner.accessToken}`);

                expect(ownerCheck.status).toBe(200);
        });

        it("rejects monitors belonging to another user when creating a status page", async () => {
                const owner = await createTestUser();
                const otherUser = await createTestUser();

                const monitorId = await createTestMonitor(
                        owner.agent,
                        owner.accessToken,
                );

                const response = await otherUser.agent
                        .post("/api/v1/status-pages")
                        .set("Authorization", `Bearer ${otherUser.accessToken}`)
                        .send({
                                title: "Unauthorized Monitor Page",
                                monitorIds: [monitorId],
                        });

                expect(response.status).toBe(400);
        });

        it("prevents another user from attaching their monitors to someone else's page", async () => {
                const owner = await createTestUser();
                const otherUser = await createTestUser();

                const ownerMonitorId = await createTestMonitor(
                        owner.agent,
                        owner.accessToken,
                );

                const otherMonitorId = await createTestMonitor(
                        otherUser.agent,
                        otherUser.accessToken,
                );

                const page = await createTestStatusPage(
                        owner.agent,
                        owner.accessToken,
                        ownerMonitorId,
                );

                const response = await otherUser.agent
                        .put(`/api/v1/status-pages/${page.id}/monitors`)
                        .set("Authorization", `Bearer ${otherUser.accessToken}`)
                        .send({ monitorIds: [otherMonitorId] });

                expect(response.status).toBe(404);
        });

        it("requires authentication for status page management", async () => {
                const endpoints = [
                        request(app).post("/api/v1/status-pages"),
                        request(app).get("/api/v1/status-pages"),
                        request(app).get(
                                "/api/v1/status-pages/00000000-0000-4000-8000-000000000001",
                        ),
                        request(app).patch(
                                "/api/v1/status-pages/00000000-0000-4000-8000-000000000001",
                        ),
                        request(app).put(
                                "/api/v1/status-pages/00000000-0000-4000-8000-000000000001/monitors",
                        ),
                        request(app).delete(
                                "/api/v1/status-pages/00000000-0000-4000-8000-000000000001",
                        ),
                ];

                for (const endpoint of endpoints) {
                        const response = await endpoint;
                        expect(response.status).toBe(401);
                }
        });
});

