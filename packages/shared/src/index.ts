export type MonitorStatus = "UP" | "DOWN" | "PAUSED";

export interface MonitorSummary {
	id: string;
	name: string;
	url: string;
	status: MonitorStatus;
	responseTime: number | null;
}

export interface ApiResponse<T> {
	success: boolean;
	message: string;
	data?: T;
}
