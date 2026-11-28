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
	loading?: boolean;
}

export default function ResponseTimeChart({ checks, loading = false }: Props) {
	const data = [...checks]
		.filter(
			(check) =>
				check.success &&
				check.latencyMs !== null &&
				Number.isFinite(check.latencyMs),
		)
		.sort(
			(a, b) =>
				new Date(a.checkedAt).getTime() -
				new Date(b.checkedAt).getTime(),
		)
		.map((check) => ({
			id: check.id,
			timestamp: new Date(check.checkedAt).getTime(),
			time: new Date(check.checkedAt).toLocaleString([], {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			}),
			latency: check.latencyMs,
		}));

	if (loading) {
		return (
			<div className="flex h-72 items-center justify-center text-sm text-slate-400">
				Loading response-time data...
			</div>
		);
	}

	if (data.length === 0) {
		return (
			<div className="flex h-72 items-center justify-center text-center text-sm text-slate-400">
				No successful response-time data available for this period.
			</div>
		);
	}

	return (
		<div className="h-72 min-w-0 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart
					data={data}
					margin={{ top: 10, right: 20, left: 5, bottom: 5 }}
				>
					<CartesianGrid stroke="#263449" strokeDasharray="3 3" />
					<XAxis
						dataKey="timestamp"
						type="number"
						scale="time"
						domain={["dataMin", "dataMax"]}
						tickFormatter={(value) =>
							new Date(value).toLocaleDateString([], {
								month: "short",
								day: "numeric",
							})
						}
						stroke="#94a3b8"
						tick={{ fontSize: 11 }}
						minTickGap={30}
					/>
					<YAxis
						stroke="#94a3b8"
						tick={{ fontSize: 11 }}
						unit=" ms"
						width={65}
					/>
					<Tooltip
						labelFormatter={(value) =>
							new Date(Number(value)).toLocaleString()
						}
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
						dot={false}
						activeDot={{ r: 5 }}
						connectNulls={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
