import { describe, it, expect } from "vitest";
import {
	createStatusPageSchema,
	updateStatusPageSchema,
	updateStatusPageMonitorsSchema,
	statusPageIdSchema,
	statusPageSlugSchema,
} from "../../src/modules/status-pages/status-page.schemas";

const validMonitorId = "550e8400-e29b-41d4-a716-446655440000";

describe("createStatusPageSchema", () => {
	it("accepts valid status page data", () => {
		const result = createStatusPageSchema.safeParse({
			title: "Production Status",
			monitorIds: [validMonitorId],
		});

		expect(result.success).toBe(true);
	});

	it("trims title whitespace", () => {
		const result = createStatusPageSchema.safeParse({
			title: "  Production Status  ",
			monitorIds: [validMonitorId],
		});

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.data.title).toBe("Production Status");
		}
	});

	it("rejects titles shorter than 2 characters", () => {
		expect(
			createStatusPageSchema.safeParse({
				title: "A",
				monitorIds: [validMonitorId],
			}).success,
		).toBe(false);
	});

	it("rejects titles longer than 80 characters", () => {
		expect(
			createStatusPageSchema.safeParse({
				title: "A".repeat(81),
				monitorIds: [validMonitorId],
			}).success,
		).toBe(false);
	});

	it("rejects an empty monitor list", () => {
		expect(
			createStatusPageSchema.safeParse({
				title: "Production",
				monitorIds: [],
			}).success,
		).toBe(false);
	});

	it("rejects more than 50 monitors", () => {
		expect(
			createStatusPageSchema.safeParse({
				title: "Production",
				monitorIds: Array(51).fill(validMonitorId),
			}).success,
		).toBe(false);
	});

	it("rejects invalid monitor UUIDs", () => {
		expect(
			createStatusPageSchema.safeParse({
				title: "Production",
				monitorIds: ["invalid-id"],
			}).success,
		).toBe(false);
	});
});

describe("updateStatusPageSchema", () => {
	it("accepts a title update", () => {
		expect(
			updateStatusPageSchema.safeParse({
				title: "Updated Status",
			}).success,
		).toBe(true);
	});

	it("accepts a visibility update", () => {
		expect(
			updateStatusPageSchema.safeParse({
				isPublic: true,
			}).success,
		).toBe(true);
	});

	it("accepts multiple update fields", () => {
		expect(
			updateStatusPageSchema.safeParse({
				title: "Updated Status",
				isPublic: false,
			}).success,
		).toBe(true);
	});

	it("rejects an empty update", () => {
		expect(updateStatusPageSchema.safeParse({}).success).toBe(false);
	});

	it("rejects a non-boolean visibility value", () => {
		expect(
			updateStatusPageSchema.safeParse({
				isPublic: "true",
			}).success,
		).toBe(false);
	});
});

describe("updateStatusPageMonitorsSchema", () => {
	it("accepts valid monitor IDs", () => {
		expect(
			updateStatusPageMonitorsSchema.safeParse({
				monitorIds: [validMonitorId],
			}).success,
		).toBe(true);
	});

	it("rejects an empty monitor list", () => {
		expect(
			updateStatusPageMonitorsSchema.safeParse({
				monitorIds: [],
			}).success,
		).toBe(false);
	});

	it("rejects invalid UUIDs", () => {
		expect(
			updateStatusPageMonitorsSchema.safeParse({
				monitorIds: ["invalid-id"],
			}).success,
		).toBe(false);
	});
});

describe("statusPageIdSchema", () => {
	it("accepts a valid UUID", () => {
		expect(statusPageIdSchema.safeParse(validMonitorId).success).toBe(true);
	});

	it("rejects an invalid UUID", () => {
		expect(statusPageIdSchema.safeParse("invalid-id").success).toBe(false);
	});
});

describe("statusPageSlugSchema", () => {
	it("accepts a valid lowercase slug", () => {
		expect(
			statusPageSlugSchema.safeParse("production-status").success,
		).toBe(true);
	});

	it("rejects uppercase characters", () => {
		expect(
			statusPageSlugSchema.safeParse("Production-Status").success,
		).toBe(false);
	});

	it("rejects spaces", () => {
		expect(
			statusPageSlugSchema.safeParse("production status").success,
		).toBe(false);
	});

	it("rejects leading or trailing hyphens", () => {
		expect(statusPageSlugSchema.safeParse("-production").success).toBe(
			false,
		);
		expect(statusPageSlugSchema.safeParse("production-").success).toBe(
			false,
		);
	});

	it("rejects consecutive hyphens", () => {
		expect(
			statusPageSlugSchema.safeParse("production--status").success,
		).toBe(false);
	});

	it("rejects slugs shorter than 3 characters", () => {
		expect(statusPageSlugSchema.safeParse("ab").success).toBe(false);
	});

	it("rejects slugs longer than 100 characters", () => {
		expect(statusPageSlugSchema.safeParse("a".repeat(101)).success).toBe(
			false,
		);
	});
});
