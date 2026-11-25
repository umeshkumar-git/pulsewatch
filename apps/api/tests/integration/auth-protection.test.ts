import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../../src/app";
import { env } from "../../src/config/env";

describe("Authentication protection integration tests", () => {
	it("rejects requests without an access token", async () => {
		const response = await request(app).get("/api/v1/auth/me");

		expect(response.status).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe("Authentication required");
	});

	it("rejects an invalid access token", async () => {
		const response = await request(app)
			.get("/api/v1/auth/me")
			.set("Authorization", "Bearer invalid-token");

		expect(response.status).toBe(401);
		expect(response.body.success).toBe(false);
	});

	it("rejects an expired access token", async () => {
		const expiredToken = jwt.sign(
			{ sub: "test-user-id" },
			env.ACCESS_TOKEN_SECRET,
			{ expiresIn: "-1s" },
		);

		const response = await request(app)
			.get("/api/v1/auth/me")
			.set("Authorization", `Bearer ${expiredToken}`);

		expect(response.status).toBe(401);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toBe("Invalid or expired access token");
	});

	it("accepts a valid token for a registered user", async () => {
		const email = `protection-${crypto.randomUUID()}@example.com`;

		const registration = await request(app)
			.post("/api/v1/auth/register")
			.send({
				name: "Protected User",
				email,
				password: "TestPassword123!",
			});

		expect(registration.status).toBe(201);

		const token = registration.body.data.accessToken;

		const response = await request(app)
			.get("/api/v1/auth/me")
			.set("Authorization", `Bearer ${token}`);

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(response.body.data.user.email).toBe(email);
	});
});
