import { describe, expect, it } from "vitest";

import {
	createMonitorSchema,
	updateMonitorSchema,
	monitorIdSchema,
} from "../../src/modules/monitors/monitor.schemas";

describe("createMonitorSchema", () => {
	const validMonitor = {
		name: "Google Homepage",
		url: "https://google.com",
	};

	it("accepts a valid monitor", () => {
		const result = createMonitorSchema.safeParse(validMonitor);

		expect(result.success).toBe(true);
	});

	it("applies default values", () => {
		const result = createMonitorSchema.safeParse(validMonitor);

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.data.method).toBe("GET");
			expect(result.data.intervalSeconds).toBe(60);
			expect(result.data.timeoutMs).toBe(10000);
			expect(result.data.failureThreshold).toBe(3);
			expect(result.data.recoveryThreshold).toBe(2);
		}
	});

	it("trims whitespace from the monitor name", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			name: "  Google Homepage  ",
		});

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.data.name).toBe("Google Homepage");
		}
	});

	it("rejects names shorter than 2 characters", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			name: "A",
		});

		expect(result.success).toBe(false);
	});

	it("rejects names longer than 80 characters", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			name: "A".repeat(81),
		});

		expect(result.success).toBe(false);
	});

	it("rejects an empty URL", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			url: "",
		});

		expect(result.success).toBe(false);
	});

	it("rejects URLs longer than 2048 characters", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			url: `https://example.com/${"a".repeat(2048)}`,
		});

		expect(result.success).toBe(false);
	});

	it("rejects unsupported HTTP methods", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			method: "POST",
		});

		expect(result.success).toBe(false);
	});

	it("rejects intervals below 30 seconds", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			intervalSeconds: 29,
		});

		expect(result.success).toBe(false);
	});

	it("rejects intervals above 86400 seconds", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			intervalSeconds: 86401,
		});

		expect(result.success).toBe(false);
	});

	it("rejects timeouts below 1000 milliseconds", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			timeoutMs: 999,
		});

		expect(result.success).toBe(false);
	});

	it("rejects timeouts above 30000 milliseconds", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			timeoutMs: 30001,
		});

		expect(result.success).toBe(false);
	});

	it("rejects failure thresholds outside 1 to 10", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			failureThreshold: 11,
		});

		expect(result.success).toBe(false);
	});

	it("rejects recovery thresholds outside 1 to 10", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			recoveryThreshold: 0,
		});

		expect(result.success).toBe(false);
	});

	it("rejects non-integer intervals", () => {
		const result = createMonitorSchema.safeParse({
			...validMonitor,
			intervalSeconds: 60.5,
		});

		expect(result.success).toBe(false);
	});
});

describe("updateMonitorSchema", () => {
	it("accepts a valid partial update", () => {
		const result = updateMonitorSchema.safeParse({
			name: "Updated Monitor",
		});

		expect(result.success).toBe(true);
	});

	it("accepts multiple updated fields", () => {
		const result = updateMonitorSchema.safeParse({
			name: "Updated Monitor",
			intervalSeconds: 120,
			timeoutMs: 5000,
		});

		expect(result.success).toBe(true);
	});

	it("rejects an empty update", () => {
		const result = updateMonitorSchema.safeParse({});

		expect(result.success).toBe(false);
	});

	it("rejects an invalid update field", () => {
		const result = updateMonitorSchema.safeParse({
			intervalSeconds: 10,
		});

		expect(result.success).toBe(false);
	});
});

describe("monitorIdSchema", () => {
	it("accepts a valid UUID", () => {
		const result = monitorIdSchema.safeParse(
			"550e8400-e29b-41d4-a716-446655440000",
		);

		expect(result.success).toBe(true);
	});

	it("rejects an invalid UUID", () => {
		const result = monitorIdSchema.safeParse("not-a-uuid");

		expect(result.success).toBe(false);
	});
});
