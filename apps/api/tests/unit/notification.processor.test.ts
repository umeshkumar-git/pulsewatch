import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, sendEmailMock } = vi.hoisted(() => ({
	prismaMock: {
		notification: {
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
	sendEmailMock: vi.fn(),
}));

vi.mock("../../src/config/database", () => ({
	prisma: prismaMock,
}));

vi.mock("../../src/services/email.service", () => ({
	sendEmail: sendEmailMock,
}));

import { processNotification } from "../../src/workers/notification.processor";

const startedAt = new Date("2026-01-01T10:00:00.000Z");
const resolvedAt = new Date("2026-01-01T10:05:00.000Z");

const notification = {
	id: "notification-123",
	recipient: "test@example.com",
	status: "PENDING",
	eventType: "INCIDENT_OPENED",
	incident: {
		id: "incident-123",
		startedAt,
		resolvedAt: null,
		monitor: {
			name: "Test Website",
			url: "https://example.com",
			user: {
				email: "test@example.com",
			},
		},
	},
};

describe("processNotification", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		prismaMock.notification.findUnique.mockResolvedValue(notification);
		prismaMock.notification.update.mockResolvedValue({});

		sendEmailMock.mockResolvedValue({
			messageId: "message-123",
			accepted: ["test@example.com"],
			rejected: [],
		});
	});

	it("throws when the notification does not exist", async () => {
		prismaMock.notification.findUnique.mockResolvedValue(null);

		await expect(
			processNotification({ notificationId: "missing-id" }),
		).rejects.toThrow("NOTIFICATION_NOT_FOUND");

		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it("does not resend an already sent notification", async () => {
		prismaMock.notification.findUnique.mockResolvedValue({
			...notification,
			status: "SENT",
		});

		await processNotification({
			notificationId: notification.id,
		});

		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(prismaMock.notification.update).not.toHaveBeenCalled();
	});

	it("sends an incident-opened email", async () => {
		await processNotification({
			notificationId: notification.id,
		});

		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "test@example.com",
				subject: "Incident detected: Test Website",
			}),
		);

		expect(prismaMock.notification.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: notification.id },
				data: expect.objectContaining({
					status: "SENT",
					errorMessage: null,
				}),
			}),
		);
	});

	it("sends an incident-recovered email", async () => {
		prismaMock.notification.findUnique.mockResolvedValue({
			...notification,
			eventType: "INCIDENT_RESOLVED",
			incident: {
				...notification.incident,
				resolvedAt,
			},
		});

		await processNotification({
			notificationId: notification.id,
		});

		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "test@example.com",
				subject: "Service recovered: Test Website",
			}),
		);

		expect(prismaMock.notification.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: "SENT",
				}),
			}),
		);
	});

	it("throws when the email provider rejects delivery", async () => {
		sendEmailMock.mockResolvedValue({
			messageId: "message-123",
			accepted: [],
			rejected: ["test@example.com"],
		});

		await expect(
			processNotification({
				notificationId: notification.id,
			}),
		).rejects.toThrow("EMAIL_DELIVERY_REJECTED");

		expect(prismaMock.notification.update).not.toHaveBeenCalled();
	});

	it("throws when the provider accepts no recipients", async () => {
		sendEmailMock.mockResolvedValue({
			messageId: "message-123",
			accepted: undefined,
			rejected: undefined,
		});

		await expect(
			processNotification({
				notificationId: notification.id,
			}),
		).rejects.toThrow("EMAIL_DELIVERY_REJECTED");
	});
});
