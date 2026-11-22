export type MonitorStatus = "UNKNOWN" | "UP" | "DOWN" | "PAUSED";

export interface Monitor {
	id: string;
	name: string;
	url: string;
	method: "GET" | "HEAD";
	status: MonitorStatus;
	enabled: boolean;
	intervalSeconds: number;
	lastCheckedAt: string | null;
	nextCheckAt: string | null;
	createdAt: string;
	_count?: {
		checkResults: number;
		incidents: number;
	};
}

export interface CheckResult {
	id: string;
	statusCode: number | null;
	latencyMs: number | null;
	success: boolean;
	errorMessage: string | null;
	checkedAt: string;
}

export interface Incident {
	id: string;
	status: "OPEN" | "RESOLVED";
	failureCount: number;
	startedAt: string;
	resolvedAt: string | null;
	monitor: {
		id: string;
		name: string;
		url: string;
	};
}

export interface UptimeData {
	monitor: Monitor;
	periodHours: number;
	totalChecks: number;
	successfulChecks: number;
	failedChecks: number;
	uptimePercentage: number | null;
}
