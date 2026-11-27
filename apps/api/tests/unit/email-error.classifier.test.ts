import { describe, expect, it } from "vitest";

import { isRetryableEmailError } from "../../src/services/email-error.classifier";

describe("isRetryableEmailError", () => {
	it("does not retry when SMTP configuration is missing", () => {
		expect(
			isRetryableEmailError(new Error("SMTP_CONFIGURATION_MISSING")),
		).toBe(false);
	});

	it("does not retry authentication failures", () => {
		const error = Object.assign(new Error("Authentication failed"), {
			code: "EAUTH",
		});

		expect(isRetryableEmailError(error)).toBe(false);
	});

	it("retries temporary SMTP 4xx responses", () => {
		const error = Object.assign(new Error("Temporary SMTP failure"), {
			responseCode: 451,
		});

		expect(isRetryableEmailError(error)).toBe(true);
	});

	it("does not retry permanent SMTP 5xx responses", () => {
		const error = Object.assign(new Error("Mailbox unavailable"), {
			responseCode: 550,
		});

		expect(isRetryableEmailError(error)).toBe(false);
	});

	it("retries network timeouts", () => {
		const error = Object.assign(new Error("Connection timed out"), {
			code: "ETIMEDOUT",
		});

		expect(isRetryableEmailError(error)).toBe(true);
	});

	it("retries connection resets", () => {
		const error = Object.assign(new Error("Connection reset"), {
			code: "ECONNRESET",
		});

		expect(isRetryableEmailError(error)).toBe(true);
	});

	it("retries unknown errors conservatively", () => {
		expect(
			isRetryableEmailError(new Error("Unexpected provider error")),
		).toBe(true);
	});
});
