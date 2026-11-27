import { describe, expect, it } from "vitest";

import {
	classifyEmailError,
	isRetryableEmailError,
} from "../../src/services/email-error.classifier";

describe("classifyEmailError", () => {
	it("classifies missing SMTP configuration as FAILED", () => {
		expect(
			classifyEmailError(new Error("SMTP_CONFIGURATION_MISSING")),
		).toBe("FAILED");
	});
	it("classifies explicit SMTP recipient rejection as FAILED", () => {
		expect(classifyEmailError(new Error("EMAIL_DELIVERY_REJECTED"))).toBe(
			"FAILED",
		);
	});

	it("classifies authentication failures as FAILED", () => {
		const error = Object.assign(new Error("Authentication failed"), {
			code: "EAUTH",
		});

		expect(classifyEmailError(error)).toBe("FAILED");
	});

	it("classifies SMTP 4xx responses as RETRY", () => {
		const error = Object.assign(new Error("Temporary SMTP failure"), {
			responseCode: 451,
		});

		expect(classifyEmailError(error)).toBe("RETRY");
	});

	it("classifies SMTP 5xx responses as FAILED", () => {
		const error = Object.assign(new Error("Mailbox unavailable"), {
			responseCode: 550,
		});

		expect(classifyEmailError(error)).toBe("FAILED");
	});

	it("retries connection refused because SMTP was not reached", () => {
		const error = Object.assign(new Error("Connection refused"), {
			code: "ECONNREFUSED",
		});

		expect(classifyEmailError(error)).toBe("RETRY");
	});

	it("retries network errors with known pre-DATA SMTP commands", () => {
		const error = Object.assign(new Error("Connection reset"), {
			code: "ECONNRESET",
			command: "EHLO",
		});

		expect(classifyEmailError(error)).toBe("RETRY");
	});

	it("classifies a timeout without SMTP command metadata as UNKNOWN", () => {
		const error = Object.assign(new Error("Connection timed out"), {
			code: "ETIMEDOUT",
		});

		expect(classifyEmailError(error)).toBe("UNKNOWN");
	});

	it("classifies DATA-stage connection failures as UNKNOWN", () => {
		const error = Object.assign(new Error("Connection reset"), {
			code: "ECONNRESET",
			command: "DATA",
		});

		expect(classifyEmailError(error)).toBe("UNKNOWN");
	});

	it("classifies unknown provider errors as UNKNOWN", () => {
		expect(classifyEmailError(new Error("Unexpected provider error"))).toBe(
			"UNKNOWN",
		);
	});

	it("classifies non-Error values as UNKNOWN", () => {
		expect(classifyEmailError("unexpected failure")).toBe("UNKNOWN");
	});
});

describe("isRetryableEmailError", () => {
	it("returns true only for RETRY outcomes", () => {
		const error = Object.assign(new Error("Connection reset"), {
			code: "ECONNRESET",
			command: "EHLO",
		});

		expect(isRetryableEmailError(error)).toBe(true);
		expect(
			isRetryableEmailError(new Error("Unexpected provider error")),
		).toBe(false);
	});
});
