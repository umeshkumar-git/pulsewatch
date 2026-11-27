import { prisma } from "../config/database";
import { classifyEmailError } from "../services/email-error.classifier";

export async function handleNotificationFailure(
        notificationId: string,
        error: unknown,
        attemptsMade: number,
        attempts: number,
): Promise<void> {
        const outcome = classifyEmailError(error);

        const errorMessage =
                error instanceof Error
                        ? error.message.slice(0, 500)
                        : "Email delivery failed";

        let status: "PENDING" | "FAILED" | "DELIVERY_UNKNOWN";

        if (outcome === "UNKNOWN") {
                status = "DELIVERY_UNKNOWN";
        } else if (outcome === "FAILED") {
                status = "FAILED";
        } else {
                status =
                        attemptsMade + 1 < attempts ? "PENDING" : "FAILED";
        }

        const result = await prisma.notification.updateMany({
                where: {
                        id: notificationId,
                        status: "SENDING",
                },
                data: {
                        status,
                        errorMessage,
                },
        });

        if (result.count === 0) {
                console.warn(
                        `[Email Worker] Could not update ${notificationId}: it is no longer SENDING`,
                );
                return;
        }

        if (status === "DELIVERY_UNKNOWN") {
                console.error(
                        `[Email Worker] Delivery outcome unknown for ${notificationId}; manual reconciliation required`,
                );
                return;
        }

        if (status === "PENDING") {
                throw error;
        }

        console.error(
                `[Email Worker] Notification ${notificationId} marked FAILED: ${errorMessage}`,
        );
}