import { prisma } from "../config/database";
import { sendEmail } from "../services/email.service";
import {
        incidentOpenedTemplate,
        incidentResolvedTemplate,
} from "../templates/incident-email.template";
import type { NotificationJobData } from "../queues/notification.queue";

export async function processNotification(data: NotificationJobData) {
        const notification = await prisma.notification.findUnique({
                where: { id: data.notificationId },
                include: {
                        incident: {
                                include: {
                                        monitor: {
                                                include: { user: true },
                                        },
                                },
                        },
                },
        });

        if (!notification) {
                throw new Error("NOTIFICATION_NOT_FOUND");
        }

        if (notification.status !== "PENDING") {
                return;
        }

        const incident = notification.incident;
        const monitor = incident.monitor;

        const templateInput = {
                monitorName: monitor.name,
                monitorUrl: monitor.url,
                incidentId: incident.id,
                startedAt: incident.startedAt,
                resolvedAt: incident.resolvedAt,
                durationMs:
                        (incident.resolvedAt ?? new Date()).getTime() -
                        incident.startedAt.getTime(),
        };

        const email =
                notification.eventType === "INCIDENT_OPENED"
                        ? incidentOpenedTemplate(templateInput)
                        : incidentResolvedTemplate(templateInput);

        // Atomically claim the notification before contacting SMTP.
        const claim = await prisma.notification.updateMany({
                where: {
                        id: notification.id,
                        status: "PENDING",
                },
                data: {
                        status: "SENDING",
                        attemptStartedAt: new Date(),
                        errorMessage: null,
                },
        });

        if (claim.count !== 1) {
                return;
        }

        const result = await sendEmail({
                to: notification.recipient,
                subject: email.subject,
                text: email.text,
                html: email.html,
        });

        if (
                !result.accepted?.length ||
                (result.rejected?.length ?? 0) > 0
        ) {
                throw new Error("EMAIL_DELIVERY_REJECTED");
        }

        const completed = await prisma.notification.updateMany({
                where: {
                        id: notification.id,
                        status: "SENDING",
                },
                data: {
                        status: "SENT",
                        sentAt: new Date(),
                        providerMessageId: result.messageId ?? null,
                        errorMessage: null,
                },
        });

        if (completed.count !== 1) {
                console.error(
                        `[Email Worker] SMTP accepted notification ${notification.id}, but its database state changed before SENT could be recorded. Manual reconciliation required.`,
                );
                return;
        }

        console.log(
                `[Email] Sent ${notification.eventType} notification ${notification.id}`,
        );
}