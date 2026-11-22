"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import type { Incident, Monitor, UptimeData } from "@/lib/types";

function formatDate(value: string | null) {
	if (!value) return "Never checked";

	return new Date(value).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		UP: "bg-emerald-500/10 text-emerald-400",
		DOWN: "bg-red-500/10 text-red-400",
		PAUSED: "bg-amber-500/10 text-amber-400",
		UNKNOWN: "bg-slate-700 text-slate-300",
	};

	return (
		<span
			className={`rounded-full px-3 py-1 text-xs font-semibold ${
				styles[status] ?? styles.UNKNOWN
			}`}
		>
			{status}
		</span>
	);
}

function StatCard({
	label,
	value,
	description,
}: {
	label: string;
	value: string | number;
	description: string;
}) {
	return (
		<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
			<p className="text-sm text-slate-400">{label}</p>
			<p className="mt-3 text-3xl font-bold text-white">{value}</p>
			<p className="mt-2 text-xs text-slate-500">{description}</p>
		</div>
	);
}

export default function DashboardPage() {
	const router = useRouter();

	const [monitors, setMonitors] = useState<Monitor[]>([]);
	const [incidents, setIncidents] = useState<Incident[]>([]);
	const [uptime, setUptime] = useState<Record<string, UptimeData>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);
	const [refreshVersion, setRefreshVersion] = useState(0);

	useEffect(() => {
		let active = true;
		let inFlight = false;

		async function loadDashboard() {
			if (inFlight) return;

			inFlight = true;

			try {
				setError("");

				const [monitorData, incidentData] = await Promise.all([
					apiFetch<{ monitors: Monitor[]; pagination: unknown }>(
						"/monitors?page=1&limit=50",
					),
					apiFetch<{ incidents: Incident[]; pagination: unknown }>(
						"/incidents?status=OPEN&page=1&limit=5",
					),
				]);

				if (!active) return;

				setMonitors(monitorData.monitors);
				setIncidents(incidentData.incidents);

				const uptimeEntries = await Promise.all(
					monitorData.monitors
						.filter((monitor) => monitor.status !== "PAUSED")
						.map(async (monitor) => {
							try {
								const result = await apiFetch<UptimeData>(
									`/monitors/${monitor.id}/uptime?hours=24`,
								);

								return [monitor.id, result] as const;
							} catch {
								return [monitor.id, null] as const;
							}
						}),
				);

				if (!active) return;

				const uptimeMap: Record<string, UptimeData> = {};

				for (const [id, result] of uptimeEntries) {
					if (result) uptimeMap[id] = result;
				}

				setUptime(uptimeMap);
				setLastUpdated(new Date().toLocaleTimeString());
			} catch (err) {
				if (!active) return;

				if (err instanceof ApiError && err.status === 401) {
					router.replace("/login");
					return;
				}

				setError(
					err instanceof Error
						? err.message
						: "Unable to refresh dashboard.",
				);
			} finally {
				inFlight = false;

				if (active) {
					setLoading(false);
				}
			}
		}

		void loadDashboard();

		const intervalId = window.setInterval(() => {
			void loadDashboard();
		}, 30_000);

		return () => {
			active = false;
			window.clearInterval(intervalId);
		};
	}, [router, refreshVersion]);

	const upCount = monitors.filter((m) => m.status === "UP").length;
	const downCount = monitors.filter((m) => m.status === "DOWN").length;
	const pausedCount = monitors.filter((m) => m.status === "PAUSED").length;

	if (loading) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
				Loading PulseWatch dashboard...
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-slate-950 text-white">
			<div className="mx-auto max-w-7xl px-5 py-8">
				<header className="mb-8 flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-sm font-semibold tracking-widest text-cyan-400">
							PULSEWATCH
						</p>
						<h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
						<p className="mt-1 text-sm text-slate-400">
							Monitor your services and track availability.
						</p>
						{lastUpdated && (
							<p className="mt-2 text-xs text-slate-500">
								Last updated: {lastUpdated} · Refreshes every 30
								seconds
							</p>
						)}
					</div>

					<div className="flex items-center gap-3">
						<button
							onClick={() =>
								setRefreshVersion((version) => version + 1)
							}
							className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
						>
							Refresh
						</button>
					</div>
				</header>

				{error && (
					<div
						role="alert"
						className="mb-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
					>
						{error}
					</div>
				)}

				<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						label="Total monitors"
						value={monitors.length}
						description="Monitors on this page"
					/>
					<StatCard
						label="Operational"
						value={upCount}
						description="Currently reporting UP"
					/>
					<StatCard
						label="Down"
						value={downCount}
						description="Currently reporting DOWN"
					/>
					<StatCard
						label="Paused"
						value={pausedCount}
						description="Monitoring temporarily disabled"
					/>
				</section>

				<section className="mt-8 rounded-xl border border-slate-800 bg-slate-900">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
						<div>
							<h2 className="text-lg font-semibold">
								Your monitors
							</h2>
							<p className="mt-1 text-sm text-slate-400">
								Current status and recent availability.
							</p>
						</div>

						<Link
							href="/dashboard/monitors/new"
							className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
						>
							Add monitor
						</Link>
					</div>

					{monitors.length === 0 ? (
						<div className="p-10 text-center">
							<h3 className="font-semibold">No monitors yet</h3>
							<p className="mt-2 text-sm text-slate-400">
								Add your first website or API to start
								monitoring.
							</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead className="bg-slate-950/60 text-xs uppercase text-slate-500">
									<tr>
										<th className="px-5 py-4">Monitor</th>
										<th className="px-5 py-4">Status</th>
										<th className="px-5 py-4">
											24h uptime
										</th>
										<th className="px-5 py-4">
											Last checked
										</th>
										<th className="px-5 py-4">Interval</th>
									</tr>
								</thead>

								<tbody>
									{monitors.map((monitor) => (
										<tr
											key={monitor.id}
											className="border-t border-slate-800 hover:bg-slate-800/40"
										>
											<td className="px-5 py-4">
												<Link
													href={`/dashboard/monitors/${monitor.id}`}
													className="font-medium text-white hover:text-cyan-400"
												>
													{monitor.name}
												</Link>
												<p className="mt-1 max-w-xs truncate text-xs text-slate-500">
													{monitor.url}
												</p>
											</td>
											<td className="px-5 py-4">
												<StatusBadge
													status={monitor.status}
												/>
											</td>
											<td className="px-5 py-4 tabular-nums text-slate-300">
												{uptime[monitor.id]
													?.uptimePercentage != null
													? `${uptime[monitor.id]!.uptimePercentage!.toFixed(2)}%`
													: "—"}
											</td>
											<td className="px-5 py-4 text-slate-400">
												{formatDate(
													monitor.lastCheckedAt,
												)}
											</td>
											<td className="px-5 py-4 text-slate-400">
												Every {monitor.intervalSeconds}s
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				<section className="mt-8 rounded-xl border border-slate-800 bg-slate-900">
					<div className="border-b border-slate-800 p-5">
						<h2 className="text-lg font-semibold">
							Open incidents
						</h2>
						<p className="mt-1 text-sm text-slate-400">
							Services that are currently experiencing problems.
						</p>
					</div>

					{incidents.length === 0 ? (
						<p className="p-6 text-sm text-slate-400">
							No open incidents. Your monitored services have no
							recorded active incidents.
						</p>
					) : (
						<div className="divide-y divide-slate-800">
							{incidents.map((incident) => (
								<div
									key={incident.id}
									className="flex flex-wrap items-center justify-between gap-3 p-5"
								>
									<div>
										<p className="font-medium">
											{incident.monitor.name}
										</p>
										<p className="mt-1 text-xs text-slate-500">
											Started{" "}
											{formatDate(incident.startedAt)}
										</p>
									</div>
									<span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
										OPEN · {incident.failureCount} failures
									</span>
								</div>
							))}
						</div>
					)}
				</section>
			</div>
		</main>
	);
}
