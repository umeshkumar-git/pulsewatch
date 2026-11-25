import { describe, it, expect } from "vitest";
import request from "supertest";

import app from "../../src/app";

describe("Refresh token and logout integration tests", () => {
	it("refreshes a session and rotates the refresh cookie", async () => {
		const agent = request.agent(app);

		const registration = await agent.post("/api/v1/auth/register").send({
			name: "Refresh Test",
			email: `refresh-${crypto.randomUUID()}@example.com`,
			password: "TestPassword123!",
		});

		expect(registration.status).toBe(201);

		const originalCookie = registration.headers["set-cookie"];

		expect(originalCookie).toBeDefined();

		const refreshResponse = await agent.post("/api/v1/auth/refresh");

		expect(refreshResponse.status).toBe(200);
		expect(refreshResponse.body.success).toBe(true);
		expect(refreshResponse.body.data.accessToken).toBeTruthy();
		expect(refreshResponse.headers["set-cookie"]).toBeDefined();

		expect(refreshResponse.headers["set-cookie"]).not.toEqual(
			originalCookie,
		);
	});

	it("rejects refresh requests without a refresh cookie", async () => {
		const response = await request(app).post("/api/v1/auth/refresh");

		expect(response.status).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe("Refresh token missing");
	});

	it("logs out and revokes the refresh session", async () => {
		const agent = request.agent(app);

		const registration = await agent.post("/api/v1/auth/register").send({
			name: "Logout Test",
			email: `logout-${crypto.randomUUID()}@example.com`,
			password: "TestPassword123!",
		});

		expect(registration.status).toBe(201);

		const logoutResponse = await agent.post("/api/v1/auth/logout");

		expect(logoutResponse.status).toBe(200);
		expect(logoutResponse.body.success).toBe(true);
		expect(logoutResponse.body.message).toBe("Logged out successfully");

		const refreshResponse = await agent.post("/api/v1/auth/refresh");

		expect(refreshResponse.status).toBe(401);
		expect(refreshResponse.body.success).toBe(false);
	});
});
