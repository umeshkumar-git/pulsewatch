const RETRYABLE_NETWORK_ERRORS = new Set([
	"ETIMEDOUT",
	"ECONNECTION",
	"ESOCKET",
	"EDNS",
	"ECONNRESET",
	"ECONNREFUSED",
	"EHOSTUNREACH",
	"ENETUNREACH",
]);

const DEFINITELY_PRE_DELIVERY_ERRORS = new Set([
	"EDNS",
	"ECONNREFUSED",
	"EHOSTUNREACH",
	"ENETUNREACH",
]);

const PRE_DATA_COMMANDS = new Set([
	"CONN",
	"EHLO",
	"HELO",
	"AUTH",
	"MAIL FROM",
	"RCPT TO",
]);

export type EmailErrorOutcome = "RETRY" | "FAILED" | "UNKNOWN";

export function classifyEmailError(error: unknown): EmailErrorOutcome {
	if (!(error instanceof Error)) {
		return "UNKNOWN";
	}

	if (
		error.message === "SMTP_CONFIGURATION_MISSING" ||
		error.message === "EMAIL_DELIVERY_REJECTED"
	) {
		return "FAILED";
	}

	const smtpError = error as Error & {
		code?: string;
		command?: string;
		responseCode?: number;
	};

	// An explicit SMTP response confirms the server rejected the command.
	if (smtpError.responseCode !== undefined) {
		return smtpError.responseCode >= 400 && smtpError.responseCode < 500
			? "RETRY"
			: "FAILED";
	}

	if (smtpError.code === "EAUTH") {
		return "FAILED";
	}

	if (smtpError.code && DEFINITELY_PRE_DELIVERY_ERRORS.has(smtpError.code)) {
		return "RETRY";
	}

	if (
		smtpError.code &&
		RETRYABLE_NETWORK_ERRORS.has(smtpError.code) &&
		smtpError.command &&
		PRE_DATA_COMMANDS.has(smtpError.command.toUpperCase())
	) {
		return "RETRY";
	}

	// DATA-stage, unclassified, or metadata-free failures are ambiguous.
	return "UNKNOWN";
}

export function isRetryableEmailError(error: unknown): boolean {
	return classifyEmailError(error) === "RETRY";
}
