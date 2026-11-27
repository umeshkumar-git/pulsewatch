import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateManyMock } = vi.hoisted(() => ({
	updateManyMock: vi.fn(),
}));

vi.mock("../../src/config/database", () => ({
	prisma: {
		notification: {
			updateMany: updateManyMock,
		},
	},
}));

import { handleNotificationFailure } from "../../src/workers/notification-failure.handler";

describe("handleNotificationFailure", () => {
	beforeEach(() => {
		updateManyMock.mockReset();
		updateManyMock.mockResolvedValue({ count: 1 });
	});

	it("marks a retryable error as PENDING when attempts remain", async () => {
		const error = Object.assign(new Error("Connection timed out"), {
			code: "ETIMEDOUT",
		});

		await expect(
			handleNotificationFailure("notification-1", error, 0, 5),
		).rejects.toBe(error);

		expect(updateManyMock).toHaveBeenCalledWith({
			where: {
				id: "notification-1",
				status: { not: "SENT" },
			},
			data: {
				status: "PENDING",
				errorMessage: "Connection timed out",
			},
		});
	});

	it("marks a retryable error as FAILED when attempts are exhausted", async () => {
		const error = Object.assign(new Error("Connection reset"), {
			code: "ECONNRESET",
		});

		await expect(
			handleNotificationFailure("notification-2", error, 4, 5),
		).rejects.toBe(error);

		expect(updateManyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					id: "notification-2",
					status: { not: "SENT" },
				},
				data: {
					status: "FAILED",
					errorMessage: "Connection reset",
				},
			}),
		);
	});

	it("marks permanent errors as FAILED without retrying", async () => {
		const error = new Error("SMTP_CONFIGURATION_MISSING");

		await expect(
			handleNotificationFailure("notification-3", error, 0, 5),
		).resolves.toBeUndefined();

		expect(updateManyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					status: "FAILED",
					errorMessage: "SMTP_CONFIGURATION_MISSING",
				},
			}),
		);
	});

	it("does not retry an SMTP authentication error", async () => {
		const error = Object.assign(new Error("Authentication failed"), {
			code: "EAUTH",
		});

		await expect(
			handleNotificationFailure("notification-4", error, 0, 5),
		).resolves.toBeUndefined();

		expect(updateManyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					status: "FAILED",
					errorMessage: "Authentication failed",
				},
			}),
		);
	});

	it("limits stored error messages to 500 characters", async () => {
		const error = new Error("x".repeat(600));

		await expect(
			handleNotificationFailure("notification-5", error, 0, 5),
		).rejects.toBe(error);

		expect(updateManyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					status: "PENDING",
					errorMessage: "x".repeat(500),
				},
			}),
		);
	});

	it("uses a fallback message for non-Error failures", async () => {
		await expect(
			handleNotificationFailure(
				"notification-6",
				"unexpected failure",
				0,
				5,
			),
		).rejects.toBe("unexpected failure");

		expect(updateManyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					status: "PENDING",
					errorMessage: "Email delivery failed",
				},
			}),
		);
	});
});
