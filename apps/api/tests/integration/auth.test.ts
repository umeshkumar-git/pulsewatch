import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { prisma } from "../../src/config/database";

describe("Authentication API integration tests", () => {
	let testEmail: string;

	beforeEach(() => {
		testEmail = `test-${crypto.randomUUID()}@example.com`;
	});

	it("registers a new user", async () => {
		const response = await request(app).post("/api/v1/auth/register").send({
			name: "Integration Test",
			email: testEmail,
			password: "TestPassword123!",
		});

		expect(response.status).toBe(201);
		expect(response.body.success).toBe(true);
		expect(response.body.data.user.email).toBe(testEmail);
		expect(response.body.data.accessToken).toBeTruthy();
		expect(response.headers["set-cookie"]).toBeDefined();
	});

	it("rejects duplicate email registration", async () => {
		const user = {
			name: "Duplicate Test",
			email: testEmail,
			password: "TestPassword123!",
		};

		await request(app).post("/api/v1/auth/register").send(user);

		const response = await request(app)
			.post("/api/v1/auth/register")
			.send(user);

		expect(response.status).toBe(409);
		expect(response.body.success).toBe(false);
	});

	it("rejects invalid registration data", async () => {
		const response = await request(app).post("/api/v1/auth/register").send({
			name: "A",
			email: "invalid-email",
			password: "123",
		});

		expect(response.status).toBe(400);
		expect(response.body.success).toBe(false);
	});

	it("logs in an existing user", async () => {
		await request(app).post("/api/v1/auth/register").send({
			name: "Login Test",
			email: testEmail,
			password: "TestPassword123!",
		});

		const response = await request(app).post("/api/v1/auth/login").send({
			email: testEmail,
			password: "TestPassword123!",
		});

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(response.body.data.user.email).toBe(testEmail);
		expect(response.body.data.accessToken).toBeTruthy();
		expect(response.headers["set-cookie"]).toBeDefined();
	});

	it("rejects incorrect login credentials", async () => {
		await request(app).post("/api/v1/auth/register").send({
			name: "Wrong Password Test",
			email: testEmail,
			password: "TestPassword123!",
		});

		const response = await request(app).post("/api/v1/auth/login").send({
			email: testEmail,
			password: "WrongPassword123!",
		});

		expect(response.status).toBe(401);
		expect(response.body.success).toBe(false);
	});
});
