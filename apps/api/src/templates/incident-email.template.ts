interface IncidentEmailInput {
	monitorName: string;
	monitorUrl: string;
	incidentId: string;
	startedAt: Date;
	resolvedAt: Date | null;
	durationMs: number;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		const entities: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		};

		return entities[character];
	});
}

function formatDuration(durationMs: number): string {
	const totalSeconds = Math.floor(durationMs / 1000);

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	return `${hours}h ${minutes}m ${seconds}s`;
}

export function incidentOpenedTemplate(input: IncidentEmailInput) {
	const monitorName = escapeHtml(input.monitorName);
	const monitorUrl = escapeHtml(input.monitorUrl);

	return {
		subject: `Incident detected: ${input.monitorName}`,

		text: `
PulseWatch Incident Alert

Your monitored service is DOWN.

Monitor: ${input.monitorName}
URL: ${input.monitorUrl}
Incident ID: ${input.incidentId}
Started: ${input.startedAt.toISOString()}

PulseWatch will notify you when the service recovers.
    `.trim(),

		html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
        <h2 style="color:#dc2626">Service outage detected</h2>

        <p>Your monitored service is currently unavailable.</p>

        <p><strong>Monitor:</strong> ${monitorName}</p>
        <p><strong>URL:</strong> ${monitorUrl}</p>
        <p><strong>Incident ID:</strong> ${escapeHtml(input.incidentId)}</p>
        <p><strong>Started:</strong> ${input.startedAt.toISOString()}</p>

        <p>PulseWatch will notify you when the service recovers.</p>
      </div>
    `,
	};
}

export function incidentResolvedTemplate(input: IncidentEmailInput) {
	const monitorName = escapeHtml(input.monitorName);
	const monitorUrl = escapeHtml(input.monitorUrl);

	const duration = formatDuration(input.durationMs);

	return {
		subject: `Service recovered: ${input.monitorName}`,

		text: `
PulseWatch Recovery Notification

Your monitored service is back UP.

Monitor: ${input.monitorName}
URL: ${input.monitorUrl}
Incident ID: ${input.incidentId}
Started: ${input.startedAt.toISOString()}
Resolved: ${input.resolvedAt?.toISOString() ?? "Unknown"}
Incident duration: ${duration}

Your service is responding successfully again.
    `.trim(),

		html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
        <h2 style="color:#16a34a">Service recovered</h2>

        <p>Your monitored service is responding successfully again.</p>

        <p><strong>Monitor:</strong> ${monitorName}</p>
        <p><strong>URL:</strong> ${monitorUrl}</p>
        <p><strong>Incident ID:</strong> ${escapeHtml(input.incidentId)}</p>
        <p><strong>Started:</strong> ${input.startedAt.toISOString()}</p>
        <p><strong>Resolved:</strong> ${input.resolvedAt?.toISOString() ?? "Unknown"}</p>
        <p><strong>Incident duration:</strong> ${duration}</p>
      </div>
    `,
	};
}
