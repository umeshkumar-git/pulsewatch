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

export function isRetryableEmailError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return true;
	}

	if (error.message === "SMTP_CONFIGURATION_MISSING") {
		return false;
	}

	const smtpError = error as Error & {
		code?: string;
		responseCode?: number;
	};

	if (smtpError.responseCode !== undefined) {
		return smtpError.responseCode >= 400 && smtpError.responseCode < 500;
	}

	if (smtpError.code === "EAUTH") {
		return false;
	}

	if (smtpError.code && RETRYABLE_NETWORK_ERRORS.has(smtpError.code)) {
		return true;
	}

	// Unknown errors are retried conservatively.
	return true;
}
