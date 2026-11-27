import { prisma } from "../config/database";
import { isRetryableEmailError } from "../services/email-error.classifier";

export async function handleNotificationFailure(
	notificationId: string,
	error: unknown,
	attemptsMade: number,
	attempts: number,
): Promise<void> {
	const retryable = isRetryableEmailError(error);
	const shouldRetry = retryable && attemptsMade + 1 < attempts;

	await prisma.notification.updateMany({
		where: {
			id: notificationId,
			status: {
				not: "SENT",
			},
		},
		data: {
			status: shouldRetry ? "PENDING" : "FAILED",
			errorMessage:
				error instanceof Error
					? error.message.slice(0, 500)
					: "Email delivery failed",
		},
	});

	if (!retryable) {
		console.error(
			`[Email Worker] Permanent delivery failure for ${notificationId}`,
		);
		return;
	}

	throw error;
}
