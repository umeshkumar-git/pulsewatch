"use client";

import CheckHistory from "@/components/check-history";
import ResponseTimeChart from "@/components/response-time-chart";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import type { CheckResult, Incident, Monitor, UptimeData } from "@/lib/types";

interface MonitorDetails extends Monitor {
	checkResults: CheckResult[];
	incidents: Incident[];
}

function formatDate(value: string | null) {
	return value ? new Date(value).toLocaleString() : "Never";
}

function MonitorDetailsContent() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();

	const [monitor, setMonitor] = useState<MonitorDetails | null>(null);
	const [uptime, setUptime] = useState<UptimeData | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;

		async function load() {
			try {
				const [detailData, uptimeData] = await Promise.all([
					apiFetch<{ monitor: MonitorDetails }>(`/monitors/${id}`),
					apiFetch<UptimeData>(`/monitors/${id}/uptime?hours=24`),
				]);

				if (!active) return;

				setMonitor(detailData.monitor);
				setUptime(uptimeData);
			} catch (err) {
				if (!active) return;

				if (err instanceof ApiError && err.status === 401) {
					router.replace("/login");
					return;
				}

				setError(
					err instanceof Error
						? err.message
						: "Unable to load monitor.",
				);
			} finally {
				if (active) setLoading(false);
			}
		}

		load();

		return () => {
			active = false;
		};
	}, [id, router]);

	if (loading) {
		return (
			<main className="min-h-screen bg-slate-950 p-8 text-slate-300">
				Loading monitor...
			</main>
		);
	}

	if (error || !monitor) {
		return (
			<main className="min-h-screen bg-slate-950 p-8 text-white">
				<p className="text-red-400">{error || "Monitor not found."}</p>
				<Link
					href="/dashboard"
					className="mt-4 inline-block text-cyan-400"
				>
					Back to dashboard
				</Link>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
			<div className="mx-auto max-w-6xl">
				<Link
					href="/dashboard"
					className="text-sm text-cyan-400 hover:underline"
				>
					← Back to dashboard
				</Link>

				<div className="mt-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-3xl font-bold">{monitor.name}</h1>
						<p className="mt-2 break-all text-sm text-slate-400">
							{monitor.url}
						</p>
					</div>

					<span className="rounded-full bg-slate-800 px-3 py-2 text-sm">
						{monitor.status}
					</span>
				</div>

				<section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{[
						[
							"24-hour uptime",
							uptime?.uptimePercentage == null
								? "—"
								: `${uptime.uptimePercentage.toFixed(2)}%`,
						],
						["Total checks", uptime?.totalChecks ?? "—"],
						["Successful checks", uptime?.successfulChecks ?? "—"],
						["Failed checks", uptime?.failedChecks ?? "—"],
					].map(([label, value]) => (
						<div
							key={label}
							className="rounded-xl border border-slate-800 bg-slate-900 p-5"
						>
							<p className="text-sm text-slate-400">{label}</p>
							<p className="mt-3 text-2xl font-bold">{value}</p>
						</div>
					))}
				</section>

				<section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="mb-5">
						<h2 className="text-lg font-semibold">Response time</h2>
						<p className="mt-1 text-sm text-slate-400">
							Recent successful checks, measured in milliseconds.
						</p>
					</div>

					<ResponseTimeChart checks={monitor.checkResults} />
				</section>
				<section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
					<h2 className="mb-5 text-lg font-semibold">
						Availability history
					</h2>

					<CheckHistory checks={monitor.checkResults} />
				</section>

				<section className="mt-8 rounded-xl border border-slate-800 bg-slate-900">
					<div className="border-b border-slate-800 p-5">
						<h2 className="font-semibold">Recent check history</h2>
						<p className="mt-1 text-sm text-slate-400">
							Latest results recorded by the monitoring worker.
						</p>
					</div>

					{monitor.checkResults.length === 0 ? (
						<p className="p-5 text-sm text-slate-400">
							No check results yet.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead className="text-xs uppercase text-slate-500">
									<tr>
										<th className="px-5 py-3">Result</th>
										<th className="px-5 py-3">
											HTTP status
										</th>
										<th className="px-5 py-3">Latency</th>
										<th className="px-5 py-3">
											Checked at
										</th>
									</tr>
								</thead>
								<tbody>
									{monitor.checkResults.map((check) => (
										<tr
											key={check.id}
											className="border-t border-slate-800"
										>
											<td className="px-5 py-4">
												<span
													className={
														check.success
															? "text-emerald-400"
															: "text-red-400"
													}
												>
													{check.success
														? "Success"
														: "Failed"}
												</span>
												{check.errorMessage && (
													<p className="mt-1 max-w-xs text-xs text-slate-500">
														{check.errorMessage}
													</p>
												)}
											</td>
											<td className="px-5 py-4 text-slate-300">
												{check.statusCode ?? "—"}
											</td>
											<td className="px-5 py-4 text-slate-300">
												{check.latencyMs == null
													? "—"
													: `${check.latencyMs} ms`}
											</td>
											<td className="px-5 py-4 text-slate-400">
												{formatDate(check.checkedAt)}
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
						<h2 className="font-semibold">Recent incidents</h2>
					</div>

					{monitor.incidents.length === 0 ? (
						<p className="p-5 text-sm text-slate-400">
							No incidents recorded.
						</p>
					) : (
						<div className="divide-y divide-slate-800">
							{monitor.incidents.map((incident) => (
								<div
									key={incident.id}
									className="flex flex-wrap justify-between gap-3 p-5"
								>
									<div>
										<p className="font-medium">
											{incident.status}
										</p>
										<p className="mt-1 text-xs text-slate-400">
											Started:{" "}
											{formatDate(incident.startedAt)}
										</p>
										<p className="mt-1 text-xs text-slate-400">
											Resolved:{" "}
											{formatDate(incident.resolvedAt)}
										</p>
									</div>
									<span className="text-sm text-slate-400">
										{incident.failureCount} failures
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
export default function MonitorDetailsPage() {
	return (
		<Suspense
			fallback={
				<main className="min-h-screen bg-slate-950 p-8 text-slate-300">
					Loading monitor details...
				</main>
			}
		>
			<MonitorDetailsContent />
		</Suspense>
	);
}
