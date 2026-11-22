import { prisma } from "../config/database";

import { sendEmail } from "../services/email.service";

import {
	incidentOpenedTemplate,
	incidentResolvedTemplate,
} from "../templates/incident-email.template";

import type { NotificationJobData } from "../queues/notification.queue";

export async function processNotification(data: NotificationJobData) {
	const notification = await prisma.notification.findUnique({
		where: {
			id: data.notificationId,
		},

		include: {
			incident: {
				include: {
					monitor: {
						include: {
							user: true,
						},
					},
				},
			},
		},
	});

	if (!notification) {
		throw new Error("NOTIFICATION_NOT_FOUND");
	}

	// A completed email must never be sent again.
	if (notification.status === "SENT") {
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

	const result = await sendEmail({
		to: notification.recipient,
		subject: email.subject,
		text: email.text,
		html: email.html,
	});

	if (result.accepted.length === 0 || result.rejected.length > 0) {
		throw new Error("EMAIL_DELIVERY_REJECTED");
	}

	await prisma.notification.update({
		where: {
			id: notification.id,
		},

		data: {
			status: "SENT",
			sentAt: new Date(),
			errorMessage: null,
		},
	});

	console.log(
		`[Email] Sent ${notification.eventType} notification ${notification.id}`,
	);
}
