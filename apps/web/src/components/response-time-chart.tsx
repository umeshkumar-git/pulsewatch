"use client";

import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface Check {
	id: string;
	latencyMs: number | null;
	success: boolean;
	checkedAt: string;
}

interface Props {
	checks: Check[];
}

export default function ResponseTimeChart({ checks }: Props) {
	const data = [...checks]
		.filter(
			(check) =>
				check.success &&
				check.latencyMs !== null &&
				Number.isFinite(check.latencyMs),
		)
		.reverse()
		.map((check) => ({
			time: new Date(check.checkedAt).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			}),
			latency: check.latencyMs,
		}));

	if (data.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-sm text-slate-400">
				No successful response-time data available yet.
			</div>
		);
	}

	return (
		<div className="h-72 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart
					data={data}
					margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
				>
					<CartesianGrid stroke="#263449" strokeDasharray="3 3" />
					<XAxis
						dataKey="time"
						stroke="#94a3b8"
						tick={{ fontSize: 12 }}
					/>
					<YAxis
						stroke="#94a3b8"
						tick={{ fontSize: 12 }}
						unit=" ms"
					/>
					<Tooltip
						contentStyle={{
							backgroundColor: "#0f172a",
							border: "1px solid #334155",
							borderRadius: "8px",
							color: "#fff",
						}}
						formatter={(value) => [`${value} ms`, "Response time"]}
					/>
					<Line
						type="monotone"
						dataKey="latency"
						stroke="#06b6d4"
						strokeWidth={2}
						dot={{ r: 3, fill: "#06b6d4" }}
						activeDot={{ r: 6 }}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
