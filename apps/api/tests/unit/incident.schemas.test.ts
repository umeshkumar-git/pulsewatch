import { describe, it, expect } from "vitest";
import {
	incidentIdSchema,
	incidentListQuerySchema,
} from "../../src/modules/incidents/incident.schemas";

describe("incidentIdSchema", () => {
	it("accepts a valid UUID", () => {
		expect(
			incidentIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000")
				.success,
		).toBe(true);
	});

	it("rejects an invalid UUID", () => {
		expect(incidentIdSchema.safeParse("invalid-id").success).toBe(false);
	});
});

describe("incidentListQuerySchema", () => {
	it("applies default pagination values", () => {
		const result = incidentListQuerySchema.safeParse({});

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.data.page).toBe(1);
			expect(result.data.limit).toBe(20);
		}
	});

	it("converts query string values into numbers", () => {
		const result = incidentListQuerySchema.safeParse({
			page: "3",
			limit: "50",
		});

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.data.page).toBe(3);
			expect(result.data.limit).toBe(50);
		}
	});

	it("accepts OPEN status", () => {
		expect(
			incidentListQuerySchema.safeParse({
				status: "OPEN",
			}).success,
		).toBe(true);
	});

	it("accepts RESOLVED status", () => {
		expect(
			incidentListQuerySchema.safeParse({
				status: "RESOLVED",
			}).success,
		).toBe(true);
	});

	it("rejects unsupported incident status", () => {
		expect(
			incidentListQuerySchema.safeParse({
				status: "PENDING",
			}).success,
		).toBe(false);
	});

	it("rejects page numbers below 1", () => {
		expect(
			incidentListQuerySchema.safeParse({
				page: "0",
			}).success,
		).toBe(false);
	});

	it("rejects limits below 1", () => {
		expect(
			incidentListQuerySchema.safeParse({
				limit: "0",
			}).success,
		).toBe(false);
	});

	it("rejects limits above 100", () => {
		expect(
			incidentListQuerySchema.safeParse({
				limit: "101",
			}).success,
		).toBe(false);
	});

	it("rejects non-integer page numbers", () => {
		expect(
			incidentListQuerySchema.safeParse({
				page: "1.5",
			}).success,
		).toBe(false);
	});
});
