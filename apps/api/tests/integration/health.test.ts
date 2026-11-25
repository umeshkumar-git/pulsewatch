import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Prevent monitor scheduling from opening Redis connections in this test.
vi.mock("../../src/queues/monitor.queue", () => ({
	scheduleMonitorCheck: vi.fn(),
	unscheduleMonitorCheck: vi.fn(),
}));

import app from "../../src/app";
import { prisma } from "../../src/config/database";

describe("GET /api/v1/health", () => {
	it("returns healthy when the API and database are available", async () => {
		const response = await request(app)
			.get("/api/v1/health")
			.expect("Content-Type", /json/)
			.expect(200);

		expect(response.body.success).toBe(true);
	});
});

afterAll(async () => {
	await prisma.$disconnect();
});
