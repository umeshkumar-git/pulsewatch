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
	const [periodHours, setPeriodHours] = useState(24);
	const [uptimeLoading, setUptimeLoading] = useState(false);
	const [error, setError] = useState("");
	const [uptimeError, setUptimeError] = useState("");
	const [loading, setLoading] = useState(true);

	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [actionLoading, setActionLoading] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [actionError, setActionError] = useState("");
	const [fieldErrors, setFieldErrors] = useState<
		Partial<Record<keyof typeof formData, string>>
	>({});
	function clearFieldError(field: keyof typeof formData) {
		setFieldErrors((current) => ({
			...current,
			[field]: undefined,
		}));
		setActionError("");
	}

	const [formData, setFormData] = useState({
		name: "",
		url: "",
		method: "GET" as "GET" | "HEAD",
		intervalSeconds: 60,
		timeoutMs: 10000,
		failureThreshold: 3,
		recoveryThreshold: 2,
	});

	useEffect(() => {
		let active = true;

		async function load() {
			try {
				const detailData = await apiFetch<{ monitor: MonitorDetails }>(
					`/monitors/${id}`,
				);

				if (!active) return;

				setMonitor(detailData.monitor);
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

	useEffect(() => {
		let active = true;

		async function loadUptime() {
			setUptimeLoading(true);
			setUptimeError("");
			setUptime(null);

			try {
				const uptimeData = await apiFetch<UptimeData>(
					`/monitors/${id}/uptime?hours=${periodHours}`,
				);

				if (active) {
					setUptime(uptimeData);
				}
			} catch (err) {
				if (!active) return;

				if (err instanceof ApiError && err.status === 401) {
					router.replace("/login");
					return;
				}

				setUptimeError(
					err instanceof Error
						? err.message
						: "Unable to load uptime analytics.",
				);
			} finally {
				if (active) setUptimeLoading(false);
			}
		}

		loadUptime();

		return () => {
			active = false;
		};
	}, [id, periodHours, router]);
	function handleEdit() {
		if (!monitor) return;

		setFormData({
			name: monitor.name,
			url: monitor.url,
			method: monitor.method,
			intervalSeconds: monitor.intervalSeconds,
			timeoutMs: monitor.timeoutMs,
			failureThreshold: monitor.failureThreshold,
			recoveryThreshold: monitor.recoveryThreshold,
		});

		setActionError("");
		setFieldErrors({});
		setEditing(true);
	}

	async function handleSave() {
		if (saving) return;

		setActionError("");
		setFieldErrors({});

		const validationErrors: Partial<Record<keyof typeof formData, string>> =
			{};

		const trimmedName = formData.name.trim();
		const trimmedUrl = formData.url.trim();

		if (trimmedName.length < 2 || trimmedName.length > 80) {
			validationErrors.name =
				"Name must contain between 2 and 80 characters.";
		}

		try {
			const parsedUrl = new URL(trimmedUrl);

			if (
				parsedUrl.protocol !== "http:" &&
				parsedUrl.protocol !== "https:"
			) {
				validationErrors.url =
					"Only HTTP and HTTPS URLs are supported.";
			}
		} catch {
			validationErrors.url = "Enter a valid URL.";
		}

		if (
			!Number.isInteger(formData.intervalSeconds) ||
			formData.intervalSeconds < 30 ||
			formData.intervalSeconds > 86400
		) {
			validationErrors.intervalSeconds =
				"Interval must be between 30 and 86,400 seconds.";
		}

		if (
			!Number.isInteger(formData.timeoutMs) ||
			formData.timeoutMs < 1000 ||
			formData.timeoutMs > 30000
		) {
			validationErrors.timeoutMs =
				"Timeout must be between 1,000 and 30,000 ms.";
		}

		if (
			!Number.isInteger(formData.failureThreshold) ||
			formData.failureThreshold < 1 ||
			formData.failureThreshold > 10
		) {
			validationErrors.failureThreshold =
				"Failure threshold must be between 1 and 10.";
		}

		if (
			!Number.isInteger(formData.recoveryThreshold) ||
			formData.recoveryThreshold < 1 ||
			formData.recoveryThreshold > 10
		) {
			validationErrors.recoveryThreshold =
				"Recovery threshold must be between 1 and 10.";
		}

		if (Object.keys(validationErrors).length > 0) {
			setFieldErrors(validationErrors);
			return;
		}

		setSaving(true);

		try {
			const result = await apiFetch<{ monitor: Monitor }>(
				`/monitors/${id}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						...formData,
						name: trimmedName,
						url: trimmedUrl,
					}),
				},
			);

			setMonitor((current) =>
				current ? { ...current, ...result.monitor } : current,
			);

			setEditing(false);
			setFieldErrors({});
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace("/login");
				return;
			}

			if (err instanceof ApiError) {
				const backendErrors: Partial<
					Record<keyof typeof formData, string>
				> = {};

				for (const field of [
					"name",
					"url",
					"method",
					"intervalSeconds",
					"timeoutMs",
					"failureThreshold",
					"recoveryThreshold",
				] as const) {
					const message = err.fieldErrors[field]?.[0];

					if (message) {
						backendErrors[field] = message;
					}
				}

				setFieldErrors(backendErrors);

				if (Object.keys(backendErrors).length === 0) {
					setActionError(err.message);
				}
			} else {
				setActionError(
					err instanceof Error
						? err.message
						: "Unable to update monitor.",
				);
			}
		} finally {
			setSaving(false);
		}
	}

	async function handlePauseResume() {
		if (!monitor || actionLoading) return;

		setActionLoading(true);
		setActionError("");

		const action = monitor.status === "PAUSED" ? "resume" : "pause";

		try {
			const result = await apiFetch<{ monitor: Monitor }>(
				`/monitors/${id}/${action}`,
				{ method: "POST" },
			);

			setMonitor((current) =>
				current ? { ...current, ...result.monitor } : current,
			);
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace("/login");
				return;
			}

			setActionError(
				err instanceof Error
					? err.message
					: "Unable to change monitor status.",
			);
		} finally {
			setActionLoading(false);
		}
	}

	async function handleDelete() {
		if (actionLoading) return;
		setActionLoading(true);
		setActionError("");

		try {
			await apiFetch(`/monitors/${id}`, { method: "DELETE" });
			router.replace("/dashboard");
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace("/login");
				return;
			}

			setActionError(
				err instanceof Error
					? err.message
					: "Unable to delete monitor.",
			);
			setActionLoading(false);
		}
	}

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

					<div className="flex flex-wrap items-center gap-3">
						<span className="rounded-full bg-slate-800 px-3 py-2 text-sm">
							{monitor.status}
						</span>

						<button
							onClick={handleEdit}
							className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium hover:bg-cyan-500"
						>
							Edit
						</button>

						<button
							onClick={handlePauseResume}
							disabled={actionLoading}
							className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
						>
							{actionLoading
								? "Please wait..."
								: monitor.status === "PAUSED"
									? "Resume"
									: "Pause"}
						</button>

						<button
							onClick={() => setShowDeleteConfirm(true)}
							className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500"
						>
							Delete
						</button>
					</div>
				</div>

				{actionError && (
					<p className="mt-4 text-sm text-red-400">{actionError}</p>
				)}

				{editing && (
					<section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-6">
						<h2 className="mb-5 text-xl font-semibold">
							Edit Monitor
						</h2>

						<form
							onSubmit={(event) => {
								event.preventDefault();
								void handleSave();
							}}
							className="grid gap-5 sm:grid-cols-2"
						>
							<label className="block text-sm font-medium text-slate-300">
								Monitor name
								<input
									required
									minLength={2}
									maxLength={80}
									value={formData.name}
									onChange={(e) => {
										setFormData({
											...formData,
											name: e.target.value,
										});
										clearFieldError("name");
									}}
									aria-invalid={Boolean(fieldErrors.name)}
									className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
								/>
								{fieldErrors.name && (
									<p
										className="mt-1 text-sm text-red-400"
										role="alert"
									>
										{fieldErrors.name}
									</p>
								)}
							</label>

							<label className="text-sm text-slate-300">
								Website URL
								<input
									required
									type="url"
									value={formData.url}
									onChange={(e) => {
										setFormData({
											...formData,
											url: e.target.value,
										});
										clearFieldError("url");
									}}
									className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
								/>
								{fieldErrors.url && (
									<p
										className="mt-1 text-sm text-red-400"
										role="alert"
									>
										{fieldErrors.url}
									</p>
								)}
							</label>

							<label className="text-sm text-slate-300">
								HTTP method
								<select
									value={formData.method}
									onChange={(e) => {
										setFormData({
											...formData,
											method: e.target.value as
												"GET" | "HEAD",
										});
										clearFieldError("method");
									}}
									className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
								>
									<option value="GET">GET</option>
									<option value="HEAD">HEAD</option>
								</select>
								{fieldErrors.method && (
									<p
										className="mt-1 text-sm text-red-400"
										role="alert"
									>
										{fieldErrors.method}
									</p>
								)}
							</label>

							<label className="text-sm text-slate-300">
								Check interval (seconds)
								<input
									required
									type="number"
									min={30}
									max={86400}
									value={formData.intervalSeconds}
									onChange={(e) => {
										setFormData({
											...formData,
											intervalSeconds: Number(
												e.target.value,
											),
										});
										clearFieldError("intervalSeconds");
									}}
									className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
								/>
								{fieldErrors.intervalSeconds && (
									<p
										className="mt-1 text-sm text-red-400"
										role="alert"
									>
										{fieldErrors.intervalSeconds}
									</p>
								)}
							</label>

							<label className="text-sm text-slate-300">
								Timeout (milliseconds)
								<input
									required
									type="number"
									min={1000}
									max={30000}
									value={formData.timeoutMs}
									onChange={(e) => {
										setFormData({
											...formData,
											timeoutMs: Number(e.target.value),
										});
										clearFieldError("timeoutMs");
									}}
									className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
								/>
								{fieldErrors.timeoutMs && (
									<p
										className="mt-1 text-sm text-red-400"
										role="alert"
									>
										{fieldErrors.timeoutMs}
									</p>
								)}
							</label>

							<label className="text-sm text-slate-300">
								Failure threshold
								<input
									required
									type="number"
									min={1}
									max={10}
									value={formData.failureThreshold}
									onChange={(e) => {
										setFormData({
											...formData,
											failureThreshold: Number(
												e.target.value,
											),
										});
										clearFieldError("failureThreshold");
									}}
									className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
								/>
								{fieldErrors.failureThreshold && (
									<p
										className="mt-1 text-sm text-red-400"
										role="alert"
									>
										{fieldErrors.failureThreshold}
									</p>
								)}
							</label>

							<label className="text-sm text-slate-300">
								Recovery threshold
								<input
									required
									type="number"
									min={1}
									max={10}
									value={formData.recoveryThreshold}
									onChange={(e) => {
										setFormData({
											...formData,
											recoveryThreshold: Number(
												e.target.value,
											),
										});
										clearFieldError("recoveryThreshold");
									}}
									className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
								/>
								{fieldErrors.recoveryThreshold && (
									<p
										className="mt-1 text-sm text-red-400"
										role="alert"
									>
										{fieldErrors.recoveryThreshold}
									</p>
								)}
							</label>

							<div className="flex flex-wrap gap-3 sm:col-span-2">
								<button
									type="submit"
									disabled={saving}
									className="rounded-lg bg-cyan-600 px-5 py-2 font-medium hover:bg-cyan-500 disabled:opacity-50"
								>
									{saving ? "Saving..." : "Save Changes"}
								</button>

								<button
									type="button"
									onClick={() => setEditing(false)}
									disabled={saving}
									className="rounded-lg border border-slate-600 px-5 py-2 hover:bg-slate-800"
								>
									Cancel
								</button>
							</div>
						</form>
					</section>
				)}
				{showDeleteConfirm && (
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
						role="dialog"
						aria-modal="true"
						aria-labelledby="delete-monitor-title"
					>
						<div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
							<h2
								id="delete-monitor-title"
								className="text-xl font-semibold text-white"
							>
								Delete monitor?
							</h2>

							<p className="mt-3 text-sm text-slate-400">
								Are you sure you want to delete{" "}
								<span className="font-semibold text-white">
									{monitor.name}
								</span>
								? This action cannot be undone.
							</p>

							{actionError && (
								<p className="mt-4 text-sm text-red-400">
									{actionError}
								</p>
							)}

							<div className="mt-6 flex justify-end gap-3">
								<button
									type="button"
									onClick={() => {
										setShowDeleteConfirm(false);
										setActionError("");
									}}
									disabled={actionLoading}
									className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
								>
									Cancel
								</button>

								<button
									type="button"
									onClick={handleDelete}
									disabled={actionLoading}
									className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50"
								>
									{actionLoading
										? "Deleting..."
										: "Confirm Delete"}
								</button>
							</div>
						</div>
					</div>
				)}

				<section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold">
								Uptime & Latency Analytics
							</h2>
							<p className="mt-1 text-sm text-slate-400">
								Availability and response-time statistics for
								the selected period.
							</p>
						</div>

						<select
							value={periodHours}
							onChange={(event) =>
								setPeriodHours(Number(event.target.value))
							}
							className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
						>
							<option value={1}>Last 1 hour</option>
							<option value={24}>Last 24 hours</option>
							<option value={168}>Last 7 days</option>
							<option value={720}>Last 30 days</option>
						</select>
					</div>

					{uptimeLoading && (
						<p className="mt-4 text-sm text-slate-400">
							Loading analytics...
						</p>
					)}

					<div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{[
							[
								`${periodHours === 1 ? "1-hour" : periodHours === 24 ? "24-hour" : periodHours === 168 ? "7-day" : "30-day"} uptime`,
								uptime?.uptimePercentage == null
									? "—"
									: `${uptime.uptimePercentage.toFixed(2)}%`,
							],
							["Total checks", uptime?.totalChecks ?? "—"],
							[
								"Successful checks",
								uptime?.successfulChecks ?? "—",
							],
							["Failed checks", uptime?.failedChecks ?? "—"],
						].map(([label, value]) => (
							<div
								key={label}
								className="rounded-xl border border-slate-800 bg-slate-950 p-4"
							>
								<p className="text-sm text-slate-400">
									{label}
								</p>
								<p className="mt-3 text-2xl font-bold">
									{value}
								</p>
							</div>
						))}
					</div>

					<div className="mt-6">
						<h3 className="mb-4 font-semibold">
							Latency statistics
						</h3>

						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{[
								["Average", uptime?.latency.averageMs],
								["Minimum", uptime?.latency.minMs],
								["Maximum", uptime?.latency.maxMs],
								["P50", uptime?.latency.p50Ms],
								["P95", uptime?.latency.p95Ms],
								["P99", uptime?.latency.p99Ms],
								[
									"Latency samples",
									uptime?.latency.sampleCount,
								],
							].map(([label, value]) => (
								<div
									key={label}
									className="rounded-xl border border-slate-800 bg-slate-950 p-4"
								>
									<p className="text-sm text-slate-400">
										{label}
									</p>
									<p className="mt-3 text-xl font-bold">
										{value == null
											? "—"
											: label === "Latency samples"
												? value
												: `${value} ms`}
									</p>
								</div>
							))}
						</div>
					</div>

					{uptime?.calculatedAt && (
						<p className="mt-5 text-xs text-slate-500">
							Calculated at:{" "}
							{new Date(uptime.calculatedAt).toLocaleString()}
						</p>
					)}
				</section>

				<section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="mb-5">
						<h2 className="text-lg font-semibold">Response time</h2>
						<p className="mt-1 text-sm text-slate-400">
							Recent successful checks, measured in milliseconds.
						</p>
					</div>
					{uptimeError && (
						<p className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
							{uptimeError}
						</p>
					)}

					<ResponseTimeChart
						checks={uptime?.checks ?? []}
						loading={uptimeLoading}
					/>
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
