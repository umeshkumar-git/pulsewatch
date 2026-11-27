"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import type {
	DashboardSummary,
	DashboardMonitor,
	DashboardCheck,
	Incident,
} from "@/lib/types";
import ResponseTimeChart from "@/components/response-time-chart";
import CheckHistory from "@/components/check-history";

interface DashboardResponse {
	summary: DashboardSummary;
	monitors: DashboardMonitor[];
	incidents: (Incident & { durationMs?: number })[];
	recentChecks: DashboardCheck[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
	calculatedAt: string;
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "Never checked";

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) return "Unknown";

	return date.toLocaleString();
}

function formatPercentage(value: number | null | undefined): string {
	return value == null ? "—" : `${value.toFixed(2)}%`;
}

function formatLatency(value: number | null | undefined): string {
	return value == null ? "—" : `${value.toFixed(1)} ms`;
}

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		UP: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
		DOWN: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
		PAUSED: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
		UNKNOWN: "bg-slate-700/70 text-slate-300 ring-1 ring-slate-600/50",
	};

	const dotStyles: Record<string, string> = {
		UP: "bg-emerald-400",
		DOWN: "bg-red-400",
		PAUSED: "bg-amber-400",
		UNKNOWN: "bg-slate-400",
	};

	return (
		<span
			className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
				styles[status] ?? styles.UNKNOWN
			}`}
		>
			<span
				className={`h-1.5 w-1.5 rounded-full ${
					dotStyles[status] ?? dotStyles.UNKNOWN
				}`}
			/>
			{status}
		</span>
	);
}

function StatCard({
	label,
	value,
	description,
	accent = "cyan",
}: {
	label: string;
	value: string | number;
	description: string;
	accent?: "cyan" | "green" | "red" | "amber";
}) {
	const accents = {
		cyan: "text-cyan-400",
		green: "text-emerald-400",
		red: "text-red-400",
		amber: "text-amber-400",
	};

	return (
		<div className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-slate-700">
			<p className="text-sm font-medium text-slate-400">{label}</p>
			<p
				className={`mt-3 text-3xl font-bold tabular-nums ${accents[accent]}`}
			>
				{value}
			</p>
			<p className="mt-2 text-xs text-slate-500">{description}</p>
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
			<div className="mx-auto max-w-7xl animate-pulse space-y-8">
				<div className="space-y-3">
					<div className="h-3 w-28 rounded bg-slate-800" />
					<div className="h-9 w-56 rounded bg-slate-800" />
					<div className="h-4 w-72 rounded bg-slate-800" />
				</div>

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 8 }).map((_, index) => (
						<div
							key={index}
							className="h-32 rounded-xl border border-slate-800 bg-slate-900"
						/>
					))}
				</div>

				<div className="h-80 rounded-xl border border-slate-800 bg-slate-900" />
				<div className="h-72 rounded-xl border border-slate-800 bg-slate-900" />
			</div>
		</main>
	);
}

export default function DashboardPage() {
	const router = useRouter();

	const [data, setData] = useState<DashboardResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);
	const [refreshVersion, setRefreshVersion] = useState(0);
const [page, setPage] = useState(1);

	const loadDashboard = useCallback(
		async (active: () => boolean) => {
			try {
				setError("");

				const result = await apiFetch<DashboardResponse>(
					`/monitors/dashboard?page=${page}&limit=50`,
				);

				if (!active()) return;

				setData(result);
				setLastUpdated(new Date().toLocaleTimeString());
			} catch (err) {
				if (!active()) return;

				if (err instanceof ApiError && err.status === 401) {
					router.replace("/login");
					return;
				}

				setError(
					err instanceof Error
						? err.message
						: "Unable to load dashboard. Please try again.",
				);
			} finally {
				if (active()) {
					setLoading(false);
				}
			}
		},
		[router, page],
	);

	useEffect(() => {
		let active = true;
		let inFlight = false;

		const isActive = () => active;

		const refresh = async () => {
			if (inFlight) return;

			inFlight = true;

			try {
				await loadDashboard(isActive);
			} finally {
				inFlight = false;
			}
		};

		void refresh();

		const intervalId = window.setInterval(() => {
			void refresh();
		}, 30_000);

		return () => {
			active = false;
			window.clearInterval(intervalId);
		};
	}, [loadDashboard, refreshVersion]);

	if (loading && !data) {
		return <DashboardSkeleton />;
	}

	if (!data) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
				<div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
					<h1 className="text-xl font-semibold">
						Dashboard unavailable
					</h1>
					<p className="mt-3 text-sm text-slate-400">
						{error || "We could not load your monitoring data."}
					</p>
					<button
						onClick={() => {
							setLoading(true);
							setRefreshVersion((version) => version + 1);
						}}
						className="mt-6 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
					>
						Try again
					</button>
				</div>
			</main>
		);
	}

	const { summary, monitors, incidents, recentChecks, pagination } = data;

	return (
		<main className="min-h-screen bg-slate-950 text-white">
			<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
				<header className="mb-8 flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-sm font-semibold tracking-widest text-cyan-400">
							PULSEWATCH
						</p>
						<h1 className="mt-2 text-3xl font-bold tracking-tight">
							Dashboard
						</h1>
						<p className="mt-1 text-sm text-slate-400">
							Monitor your services, availability, and incidents.
						</p>
						{lastUpdated && (
							<p className="mt-2 text-xs text-slate-500">
								Updated {lastUpdated} · Auto-refresh every 30
								seconds
							</p>
						)}
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<Link
							href="/dashboard/status-pages"
							className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
						>
							Status pages
						</Link>
						<button
							onClick={() =>
								setRefreshVersion((version) => version + 1)
							}
							className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
						>
							Refresh
						</button>
						<Link
							href="/dashboard/monitors/new"
							className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
						>
							+ Add monitor
						</Link>
					</div>
				</header>

				{error && (
					<div
						role="alert"
						className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
					>
						<p>
							{error} Showing the last successfully loaded data.
						</p>
						<button
							onClick={() =>
								setRefreshVersion((version) => version + 1)
							}
							className="font-semibold underline underline-offset-4 hover:text-red-200"
						>
							Retry
						</button>
					</div>
				)}

				<section aria-label="Monitor overview">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-lg font-semibold">
							Monitor overview
						</h2>
						<span className="text-xs text-slate-500">
							Live status
						</span>
					</div>

					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<StatCard
							label="Total monitors"
							value={summary.totalMonitors}
							description="Across your account"
						/>
						<StatCard
							label="Operational"
							value={summary.upMonitors}
							description="Currently reporting UP"
							accent="green"
						/>
						<StatCard
							label="Down"
							value={summary.downMonitors}
							description="Currently reporting DOWN"
							accent="red"
						/>
						<StatCard
							label="Paused"
							value={summary.pausedMonitors}
							description="Monitoring disabled"
							accent="amber"
						/>
					</div>
				</section>

				<section className="mt-8">
					<h2 className="mb-4 text-lg font-semibold">
						Performance overview
					</h2>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<StatCard
							label="24-hour uptime"
							value={formatPercentage(summary.uptimePercentage)}
							description={`${summary.successfulChecks} successful checks`}
							accent="green"
						/>
						<StatCard
							label="Active incidents"
							value={summary.activeIncidents}
							description="Currently unresolved"
							accent={
								summary.activeIncidents > 0 ? "red" : "green"
							}
						/>
						<StatCard
							label="Average response"
							value={formatLatency(summary.latency.averageMs)}
							description={`${summary.latency.sampleCount} successful latency samples`}
						/>
						<StatCard
							label="P95 response"
							value={formatLatency(summary.latency.p95Ms)}
							description="95th percentile latency"
						/>
					</div>

					<div className="mt-4 grid gap-4 sm:grid-cols-3">
						<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
							<p className="text-sm text-slate-400">
								Total checks
							</p>
							<p className="mt-2 text-2xl font-bold tabular-nums">
								{summary.totalChecks}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
							<p className="text-sm text-slate-400">
								Successful checks
							</p>
							<p className="mt-2 text-2xl font-bold tabular-nums text-emerald-400">
								{summary.successfulChecks}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
							<p className="text-sm text-slate-400">
								Failed checks
							</p>
							<p className="mt-2 text-2xl font-bold tabular-nums text-red-400">
								{summary.failedChecks}
							</p>
						</div>
					</div>
				</section>

				<section className="mt-8 grid gap-6 lg:grid-cols-2">
					<div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-5">
						<div className="mb-5">
							<h2 className="text-lg font-semibold">
								Response time
							</h2>
							<p className="mt-1 text-sm text-slate-400">
								Recent successful monitor checks.
							</p>
						</div>
						<ResponseTimeChart checks={recentChecks} />
					</div>

					<div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-5">
						<div className="mb-5">
							<h2 className="text-lg font-semibold">
								Recent check history
							</h2>
							<p className="mt-1 text-sm text-slate-400">
								Latest monitoring results across your services.
							</p>
						</div>
						<CheckHistory checks={recentChecks} />
					</div>
				</section>

				<section className="mt-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
						<div>
							<h2 className="text-lg font-semibold">
								Your monitors
							</h2>
							<p className="mt-1 text-sm text-slate-400">
								Showing {monitors.length} of {pagination.total}{" "}
								monitors.
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
						<div className="px-6 py-14 text-center">
							<h3 className="text-lg font-semibold">
								No monitors yet
							</h3>
							<p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
								Add your first website or API to start
								monitoring availability and response times.
							</p>
							<Link
								href="/dashboard/monitors/new"
								className="mt-6 inline-flex rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
							>
								Create your first monitor
							</Link>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full min-w-[760px] text-left text-sm">
								<thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-500">
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
											className="border-t border-slate-800 transition hover:bg-slate-800/40"
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
												{formatPercentage(
													monitor.uptimePercentage,
												)}
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
{pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 px-5 py-4">
                <p className="text-sm text-slate-400">
                        Showing{" "}
                        {(pagination.page - 1) * pagination.limit + 1}
                        {"–"}
                        {Math.min(
                                pagination.page * pagination.limit,
                                pagination.total,
                        )}{" "}
                        of {pagination.total} monitors
                </p>

                <div className="flex items-center gap-3">
                        <button
                                type="button"
                                disabled={pagination.page <= 1}
                                onClick={() => setPage(pagination.page - 1)}
                                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                        >
                                Previous
                        </button>

                        <span className="text-sm text-slate-400">
                                Page {pagination.page} of {pagination.totalPages}
                        </span>

                        <button
                                type="button"
                                disabled={pagination.page >= pagination.totalPages}
                                onClick={() => setPage(pagination.page + 1)}
                                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                        >
                                Next
                        </button>
                </div>
        </div>
)}
				</section>

				<section className="mt-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
					<div className="border-b border-slate-800 p-5">
						<div className="flex items-center justify-between gap-3">
							<div>
								<h2 className="text-lg font-semibold">
									Open incidents
								</h2>
								<p className="mt-1 text-sm text-slate-400">
									Services currently experiencing problems.
								</p>
							</div>
							<span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
								{summary.activeIncidents} active
							</span>
						</div>
					</div>

					{incidents.length === 0 ? (
						<div className="p-8 text-center">
							<p className="font-medium text-emerald-400">
								No open incidents
							</p>
							<p className="mt-2 text-sm text-slate-400">
								No active incidents are currently recorded.
							</p>
						</div>
					) : (
						<div className="divide-y divide-slate-800">
							{incidents.map((incident) => (
								<div
									key={incident.id}
									className="flex flex-wrap items-center justify-between gap-4 p-5"
								>
									<div className="min-w-0">
										<p className="font-medium">
											{incident.monitor.name}
										</p>
										<p className="mt-1 truncate text-xs text-slate-500">
											{incident.monitor.url}
										</p>
										<p className="mt-2 text-xs text-slate-400">
											Started{" "}
											{formatDate(incident.startedAt)}
										</p>
									</div>
									<span className="shrink-0 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
										OPEN · {incident.failureCount} failures
									</span>
								</div>
							))}
						</div>
					)}
				</section>

				<footer className="mt-8 border-t border-slate-800 py-5 text-center text-xs text-slate-500">
					PulseWatch · Monitoring overview · Data refreshes every 30
					seconds
				</footer>
			</div>
		</main>
	);
}
