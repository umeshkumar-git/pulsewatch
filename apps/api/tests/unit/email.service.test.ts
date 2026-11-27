import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTransportMock, sendMailMock, verifyMock, closeMock } = vi.hoisted(
	() => ({
		createTransportMock: vi.fn(),
		sendMailMock: vi.fn(),
		verifyMock: vi.fn(),
		closeMock: vi.fn(),
	}),
);

vi.mock("nodemailer", () => ({
	default: {
		createTransport: createTransportMock,
	},
}));

vi.mock("../../src/config/env", () => ({
	env: {
		SMTP_HOST: "smtp.example.com",
		SMTP_PORT: 465,
		SMTP_SECURE: true,
		SMTP_USER: "test-user",
		SMTP_PASS: "test-password",
		NOTIFICATION_FROM: "PulseWatch <alerts@example.com>",
	},
}));

import {
	closeEmailTransport,
	sendEmail,
	verifyEmailConnection,
} from "../../src/services/email.service";

describe("email service", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		closeEmailTransport();

		createTransportMock.mockReturnValue({
			sendMail: sendMailMock,
			verify: verifyMock,
			close: closeMock,
		});

		sendMailMock.mockResolvedValue({
			messageId: "message-123",
			accepted: ["recipient@example.com"],
			rejected: [],
		});

		verifyMock.mockResolvedValue(true);
	});

	it("creates the SMTP transporter and sends an email", async () => {
		const result = await sendEmail({
			to: "recipient@example.com",
			subject: "Test notification",
			text: "Test email content",
			html: "<p>Test email content</p>",
		});

		expect(createTransportMock).toHaveBeenCalledTimes(1);

		expect(createTransportMock).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "smtp.example.com",
				port: 465,
				secure: true,
			}),
		);

		expect(sendMailMock).toHaveBeenCalledWith({
			from: "PulseWatch <alerts@example.com>",
			to: "recipient@example.com",
			subject: "Test notification",
			text: "Test email content",
			html: "<p>Test email content</p>",
		});

		expect(result).toEqual({
			messageId: "message-123",
			accepted: ["recipient@example.com"],
			rejected: [],
		});
	});

	it("reuses the same transporter for multiple emails", async () => {
		const email = {
			to: "recipient@example.com",
			subject: "Test",
			text: "Test content",
			html: "<p>Test content</p>",
		};

		await sendEmail(email);
		await sendEmail(email);

		expect(createTransportMock).toHaveBeenCalledTimes(1);
		expect(sendMailMock).toHaveBeenCalledTimes(2);
	});

	it("verifies the existing SMTP connection", async () => {
		await sendEmail({
			to: "recipient@example.com",
			subject: "Test",
			text: "Test",
			html: "<p>Test</p>",
		});

		await verifyEmailConnection();

		expect(createTransportMock).toHaveBeenCalledTimes(1);
		expect(verifyMock).toHaveBeenCalledTimes(1);
	});

	it("closes and resets the transporter", async () => {
		const email = {
			to: "recipient@example.com",
			subject: "Test",
			text: "Test",
			html: "<p>Test</p>",
		};

		await sendEmail(email);

		closeMock.mockClear();
		closeEmailTransport();

		expect(closeMock).toHaveBeenCalledTimes(1);

		await sendEmail(email);

		expect(createTransportMock).toHaveBeenCalledTimes(2);
	});

	it("does not fail when closing an uninitialized transporter", () => {
		closeMock.mockClear();

		expect(() => closeEmailTransport()).not.toThrow();
		expect(closeMock).not.toHaveBeenCalled();
	});
});
