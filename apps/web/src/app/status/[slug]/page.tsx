"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { PublicStatusPage, MonitorStatus } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

function statusLabel(status: MonitorStatus) {
	switch (status) {
		case "UP":
			return "Operational";
		case "DOWN":
			return "Major outage";
		case "PAUSED":
			return "Paused";
		default:
			return "Unknown";
	}
}

function statusColor(status: MonitorStatus) {
	switch (status) {
		case "UP":
			return "bg-emerald-500";
		case "DOWN":
			return "bg-red-500";
		case "PAUSED":
			return "bg-amber-500";
		default:
			return "bg-slate-500";
	}
}

function formatDate(value: string | null) {
	if (!value) return "No checks recorded";
	return new Date(value).toLocaleString();
}

function PublicStatusPageContent() {
	const params = useParams<{ slug: string }>();
	const slug = params.slug;

	const [page, setPage] = useState<PublicStatusPage | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;

		async function loadStatusPage() {
			try {
				setLoading(true);
				setError("");

				const response = await fetch(
					`${API_URL}/api/v1/status-pages/public/${encodeURIComponent(slug)}`,
					{ cache: "no-store" },
				);

				const result = await response.json().catch(() => null);

				if (!response.ok) {
					throw new Error(
						result?.message ??
							"This status page could not be found.",
					);
				}

				if (active) {
					setPage(
						(result.data?.page ?? result.data) as PublicStatusPage,
					);
				}
			} catch (err) {
				if (active) {
					setError(
						err instanceof Error
							? err.message
							: "Unable to load this status page.",
					);
				}
			} finally {
				if (active) setLoading(false);
			}
		}

		void loadStatusPage();

		const intervalId = window.setInterval(() => {
			void loadStatusPage();
		}, 30_000);

		return () => {
			active = false;
			window.clearInterval(intervalId);
		};
	}, [slug]);

	if (loading && !page) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
				Loading service status...
			</main>
		);
	}

	if (error || !page) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
				<div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
					<h1 className="text-2xl font-bold">
						Status page unavailable
					</h1>
					<p className="mt-3 text-sm text-slate-400">
						{error ||
							"This status page does not exist or is private."}
					</p>
				</div>
			</main>
		);
	}

	const allOperational =
		page.monitors.length > 0 &&
		page.monitors.every((monitor) => monitor.status === "UP");

	const hasOutage = page.monitors.some(
		(monitor) => monitor.status === "DOWN",
	);

	const overallStatus = hasOutage
		? "Some systems are experiencing issues"
		: allOperational
			? "All systems operational"
			: "System status is being determined";

	const overallColor = hasOutage
		? "border-red-900 bg-red-950/40 text-red-300"
		: allOperational
			? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
			: "border-slate-700 bg-slate-900 text-slate-300";

	const incidents = page.monitors
		.flatMap((monitor) =>
			monitor.incidents.map((incident) => ({
				...incident,
				monitorName: monitor.name,
			})),
		)
		.sort(
			(a, b) =>
				new Date(b.startedAt).getTime() -
				new Date(a.startedAt).getTime(),
		)
		.slice(0, 10);

	return (
		<main className="min-h-screen bg-slate-950 text-white">
			<div className="mx-auto max-w-4xl px-5 py-12">
				<header className="mb-8">
					<p className="text-sm font-bold tracking-[0.25em] text-cyan-400">
						PULSEWATCH STATUS
					</p>
					<h1 className="mt-3 text-3xl font-bold sm:text-4xl">
						{page.title}
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Live service health and recent incident history.
					</p>
				</header>

				<section
					className={`rounded-xl border p-6 ${overallColor}`}
					aria-live="polite"
				>
					<div className="flex items-center gap-3">
						<span
							className={`h-3 w-3 rounded-full ${
								hasOutage
									? "bg-red-400"
									: allOperational
										? "bg-emerald-400"
										: "bg-slate-400"
							}`}
						/>
						<h2 className="text-lg font-semibold">
							{overallStatus}
						</h2>
					</div>
					<p className="mt-2 text-sm opacity-80">
						{page.monitors.length} monitored service
						{page.monitors.length === 1 ? "" : "s"} on this page.
						Automatically refreshed every 30 seconds.
					</p>
				</section>

				<section className="mt-8">
					<div className="mb-4">
						<h2 className="text-xl font-semibold">
							Monitored services
						</h2>
						<p className="mt-1 text-sm text-slate-400">
							Current operational state and 24-hour uptime.
						</p>
					</div>

					<div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
						{page.monitors.length === 0 ? (
							<p className="p-6 text-sm text-slate-400">
								No services are currently listed.
							</p>
						) : (
							<div className="divide-y divide-slate-800">
								{page.monitors.map((monitor) => (
									<article
										key={monitor.id}
										className="flex flex-wrap items-center justify-between gap-4 p-5"
									>
										<div className="min-w-0">
											<h3 className="font-semibold">
												{monitor.name}
											</h3>
											<p className="mt-1 max-w-md truncate text-xs text-slate-500">
												{monitor.url}
											</p>
											<p className="mt-2 text-xs text-slate-500">
												Last checked:{" "}
												{formatDate(
													monitor.lastCheckedAt,
												)}
											</p>
										</div>

										<div className="flex items-center gap-5">
											<div className="text-right">
												<p className="text-sm font-semibold tabular-nums">
													{monitor.uptimePercentage ===
													null
														? "—"
														: `${monitor.uptimePercentage.toFixed(2)}%`}
												</p>
												<p className="text-xs text-slate-500">
													24h uptime
												</p>
											</div>

											<span className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-300">
												<span
													className={`h-2.5 w-2.5 rounded-full ${statusColor(monitor.status)}`}
												/>
												{statusLabel(monitor.status)}
											</span>
										</div>
									</article>
								))}
							</div>
						)}
					</div>
				</section>

				<section className="mt-8">
					<h2 className="text-xl font-semibold">Recent incidents</h2>
					<p className="mt-1 text-sm text-slate-400">
						Recent service disruptions and resolutions.
					</p>

					<div className="mt-4 rounded-xl border border-slate-800 bg-slate-900">
						{incidents.length === 0 ? (
							<p className="p-6 text-sm text-slate-400">
								No incidents have been recorded.
							</p>
						) : (
							<div className="divide-y divide-slate-800">
								{incidents.map((incident) => (
									<article key={incident.id} className="p-5">
										<div className="flex flex-wrap items-center justify-between gap-3">
											<h3 className="font-medium">
												{incident.monitorName}
											</h3>
											<span
												className={`rounded-full px-3 py-1 text-xs font-semibold ${
													incident.status === "OPEN"
														? "bg-red-500/10 text-red-400"
														: "bg-emerald-500/10 text-emerald-400"
												}`}
											>
												{incident.status}
											</span>
										</div>
										<p className="mt-2 text-xs text-slate-400">
											Started:{" "}
											{formatDate(incident.startedAt)}
										</p>
										{incident.resolvedAt && (
											<p className="mt-1 text-xs text-slate-400">
												Resolved:{" "}
												{formatDate(
													incident.resolvedAt,
												)}
											</p>
										)}
									</article>
								))}
							</div>
						)}
					</div>
				</section>

				<footer className="mt-10 border-t border-slate-800 pt-5 text-center text-xs text-slate-500">
					Powered by PulseWatch · Service status updates automatically
				</footer>
			</div>
		</main>
	);
}
export default function PublicStatusPageView() {
	return (
		<Suspense
			fallback={
				<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
					Loading service status...
				</main>
			}
		>
			<PublicStatusPageContent />
		</Suspense>
	);
}
    