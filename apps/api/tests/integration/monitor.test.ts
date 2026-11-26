import request from "supertest";
import { afterEach, describe, it, expect } from "vitest";
import app from "../../src/app";
import { prisma } from "../../src/config/database";
const createdUserIds: string[] = [];
async function createTestUser() {
	const agent = request.agent(app);
	const email = `monitor-${crypto.randomUUID()}@example.com`;

	const response = await agent.post("/api/v1/auth/register").send({
		name: "Monitor Test User",
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
		agent,
		accessToken: response.body.data.accessToken as string,
	};
}

describe("Monitor API integration tests", () => {
	it("rejects monitor requests without authentication", async () => {
		const response = await request(app).get("/api/v1/monitors");

		expect(response.status).toBe(401);
		expect(response.body.success).toBe(false);
	});

	it("updates a monitor name", async () => {
		const { agent, accessToken } = await createTestUser();

		const created = await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Original Monitor",
				url: "https://example.com",
			});

		expect(created.status).toBe(201);

		const monitorId = created.body.data.monitor.id;

		const response = await agent
			.patch(`/api/v1/monitors/${monitorId}`)
			.set("Authorization", `Bearer ${accessToken}`)
			.send({ name: "Updated Monitor" });

		expect(response.status).toBe(200);
		expect(response.body.data.monitor.name).toBe("Updated Monitor");
	});

	it("pauses and resumes a monitor", async () => {
		const { agent, accessToken } = await createTestUser();

		const created = await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Lifecycle Monitor",
				url: "https://example.com",
			});

		expect(created.status).toBe(201);

		const monitorId = created.body.data.monitor.id;

		const paused = await agent
			.post(`/api/v1/monitors/${monitorId}/pause`)
			.set("Authorization", `Bearer ${accessToken}`);

		expect(paused.status).toBe(200);
		expect(paused.body.data.monitor.enabled).toBe(false);
		expect(paused.body.data.monitor.status).toBe("PAUSED");

		const resumed = await agent
			.post(`/api/v1/monitors/${monitorId}/resume`)
			.set("Authorization", `Bearer ${accessToken}`);

		expect(resumed.status).toBe(200);
		expect(resumed.body.data.monitor.enabled).toBe(true);
		expect(resumed.body.data.monitor.status).toBe("UNKNOWN");
	});

	it("returns uptime information for a monitor", async () => {
		const { agent, accessToken } = await createTestUser();

		const created = await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Uptime Monitor",
				url: "https://example.com",
			});

		expect(created.status).toBe(201);

		const monitorId = created.body.data.monitor.id;

		const response = await agent
			.get(`/api/v1/monitors/${monitorId}/uptime`)
			.set("Authorization", `Bearer ${accessToken}`);

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(response.body.data.periodHours).toBe(24);
		expect(response.body.data.totalChecks).toBe(0);
		expect(response.body.data.uptimePercentage).toBeNull();
	});
	it("calculates uptime and latency statistics correctly", async () => {
		const { agent, accessToken } = await createTestUser();

		const created = await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Analytics Monitor",
				url: "https://example.com",
			});

		expect(created.status).toBe(201);

		const monitorId = created.body.data.monitor.id;
		const checkedAt = new Date();

		await prisma.checkResult.createMany({
			data: [
				{ monitorId, success: true, latencyMs: 10, checkedAt },
				{ monitorId, success: true, latencyMs: 20, checkedAt },
				{ monitorId, success: true, latencyMs: 30, checkedAt },
				{ monitorId, success: true, latencyMs: 40, checkedAt },
				{ monitorId, success: true, latencyMs: 50, checkedAt },
				{ monitorId, success: false, latencyMs: 999, checkedAt },
			],
		});

		const response = await agent
			.get(`/api/v1/monitors/${monitorId}/uptime?hours=24`)
			.set("Authorization", `Bearer ${accessToken}`);

		expect(response.status).toBe(200);

		const data = response.body.data;

		expect(data.totalChecks).toBe(6);
		expect(data.successfulChecks).toBe(5);
		expect(data.failedChecks).toBe(1);
		expect(data.uptimePercentage).toBe(83.33);

		expect(data.latency).toEqual({
			sampleCount: 5,
			averageMs: 30,
			minMs: 10,
			maxMs: 50,
			p50Ms: 30,
			p95Ms: 50,
			p99Ms: 50,
		});
	});

	it("rejects unsupported uptime periods", async () => {
		const { agent, accessToken } = await createTestUser();

		const response = await agent
			.get(`/api/v1/monitors/${crypto.randomUUID()}/uptime?hours=48`)
			.set("Authorization", `Bearer ${accessToken}`);

		expect(response.status).toBe(400);
		expect(response.body.message).toBe(
			"Invalid hours. Allowed values: 1, 24, 168, 720",
		);
	});

	it("deletes a monitor", async () => {
		const { agent, accessToken } = await createTestUser();

		const created = await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Delete Test Monitor",
				url: "https://example.com",
			});

		expect(created.status).toBe(201);

		const monitorId = created.body.data.monitor.id;

		const deleted = await agent
			.delete(`/api/v1/monitors/${monitorId}`)
			.set("Authorization", `Bearer ${accessToken}`);

		expect(deleted.status).toBe(200);
		expect(deleted.body.message).toBe("Monitor deleted successfully");

		const retrieved = await agent
			.get(`/api/v1/monitors/${monitorId}`)
			.set("Authorization", `Bearer ${accessToken}`);

		expect(retrieved.status).toBe(404);
	});

	it("creates a monitor for an authenticated user", async () => {
		const { agent, accessToken } = await createTestUser();

		const response = await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "Integration Test Monitor",
				url: "https://example.com",
			});

		expect(response.status).toBe(201);
		expect(response.body.success).toBe(true);
		expect(response.body.data.monitor.name).toBe(
			"Integration Test Monitor",
		);
		expect(response.body.data.monitor.url).toBe("https://example.com/");
	});

	it("rejects invalid monitor creation data", async () => {
		const { agent, accessToken } = await createTestUser();

		const response = await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "A",
				url: "https://example.com",
				intervalSeconds: 10,
			});

		expect(response.status).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe("Invalid monitor data");
	});

	it("returns only the authenticated user's monitors", async () => {
		const { agent, accessToken } = await createTestUser();

		await agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`)
			.send({
				name: "User One Monitor",
				url: "https://example.com",
			});

		const response = await agent
			.get("/api/v1/monitors")
			.set("Authorization", `Bearer ${accessToken}`);

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);

		expect(
			response.body.data.monitors.some(
				(monitor: { name: string }) =>
					monitor.name === "User One Monitor",
			),
		).toBe(true);
	});

	it("prevents one user from accessing another user's monitor", async () => {
		const userOne = await createTestUser();
		const userTwo = await createTestUser();

		const createResponse = await userOne.agent
			.post("/api/v1/monitors")
			.set("Authorization", `Bearer ${userOne.accessToken}`)
			.send({
				name: "Private Monitor",
				url: "https://example.com",
			});

		expect(createResponse.status).toBe(201);

		const monitorId = createResponse.body.data.monitor.id;

		const response = await userTwo.agent
			.get(`/api/v1/monitors/${monitorId}`)
			.set("Authorization", `Bearer ${userTwo.accessToken}`);

		expect(response.status).toBe(404);
		expect(response.body.success).toBe(false);
	});
});
