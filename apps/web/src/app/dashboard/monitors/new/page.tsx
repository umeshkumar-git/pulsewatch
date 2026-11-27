"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import type { Monitor } from "@/lib/types";

type MonitorField =
	| "name"
	| "url"
	| "method"
	| "intervalSeconds"
	| "timeoutMs"
	| "failureThreshold"
	| "recoveryThreshold";

type FormErrors = Partial<Record<MonitorField, string>>;

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-500";

export default function NewMonitorPage() {
	const router = useRouter();

	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [method, setMethod] = useState<"GET" | "HEAD">("GET");
	const [intervalSeconds, setIntervalSeconds] = useState(60);
	const [timeoutMs, setTimeoutMs] = useState(10000);
	const [failureThreshold, setFailureThreshold] = useState(3);
	const [recoveryThreshold, setRecoveryThreshold] = useState(2);

	const [errors, setErrors] = useState<FormErrors>({});
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	function clearFieldError(field: MonitorField) {
		setErrors((current) => ({
			...current,
			[field]: undefined,
		}));
		setError("");
	}

	function getFieldError(field: MonitorField, message: string) {
		return (
			<p id={`${field}-error`} className="mt-1 text-sm text-red-400">
				{message}
			</p>
		);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (loading) return;

		setErrors({});
		setError("");

		const trimmedName = name.trim();
		const trimmedUrl = url.trim();
		const clientErrors: FormErrors = {};

		if (trimmedName.length < 2 || trimmedName.length > 80) {
			clientErrors.name = "Name must contain 2–80 characters.";
		}

		try {
			const parsedUrl = new URL(trimmedUrl);

			if (
				parsedUrl.protocol !== "http:" &&
				parsedUrl.protocol !== "https:"
			) {
				clientErrors.url = "Only HTTP and HTTPS URLs are supported.";
			}
		} catch {
			clientErrors.url = "Enter a valid URL.";
		}

		if (
			!Number.isInteger(timeoutMs) ||
			timeoutMs < 1000 ||
			timeoutMs > 30000
		) {
			clientErrors.timeoutMs =
				"Timeout must be between 1,000 and 30,000 ms.";
		}

		if (
			!Number.isInteger(failureThreshold) ||
			failureThreshold < 1 ||
			failureThreshold > 10
		) {
			clientErrors.failureThreshold =
				"Failure threshold must be between 1 and 10.";
		}

		if (
			!Number.isInteger(recoveryThreshold) ||
			recoveryThreshold < 1 ||
			recoveryThreshold > 10
		) {
			clientErrors.recoveryThreshold =
				"Recovery threshold must be between 1 and 10.";
		}

		if (Object.keys(clientErrors).length > 0) {
			setErrors(clientErrors);
			return;
		}

		setLoading(true);

		try {
			await apiFetch<{ monitor: Monitor }>("/monitors", {
				method: "POST",
				body: JSON.stringify({
					name: trimmedName,
					url: trimmedUrl,
					method,
					intervalSeconds,
					timeoutMs,
					failureThreshold,
					recoveryThreshold,
				}),
			});

			router.push("/dashboard");
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace("/login");
				return;
			}

			if (err instanceof ApiError) {
				const backendErrors: FormErrors = {};

				for (const field of [
					"name",
					"url",
					"method",
					"intervalSeconds",
					"timeoutMs",
					"failureThreshold",
					"recoveryThreshold",
				] as const) {
					const messages = err.fieldErrors[field];

					if (messages?.[0]) {
						backendErrors[field] = messages[0];
					}
				}

				setErrors(backendErrors);

				if (Object.keys(backendErrors).length === 0) {
					setError(err.message);
				}
			} else {
				setError(
					err instanceof Error
						? err.message
						: "Could not create monitor.",
				);
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
			<div className="mx-auto max-w-xl">
				<Link
					href="/dashboard"
					className="text-sm text-cyan-400 hover:underline"
				>
					← Back to dashboard
				</Link>

				<h1 className="mt-6 text-3xl font-bold">Add a monitor</h1>

				<p className="mt-2 text-sm text-slate-400">
					Configure a website or API endpoint for scheduled health
					checks.
				</p>

				<form
					onSubmit={handleSubmit}
					className="mt-8 space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-6"
				>
					<div>
						<label
							htmlFor="name"
							className="mb-2 block text-sm text-slate-300"
						>
							Monitor name
						</label>
						<input
							id="name"
							required
							minLength={2}
							maxLength={80}
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								clearFieldError("name");
							}}
							placeholder="Production API"
							aria-invalid={!!errors.name}
							aria-describedby={
								errors.name ? "name-error" : undefined
							}
							className={inputClass}
						/>
						{errors.name && getFieldError("name", errors.name)}
					</div>

					<div>
						<label
							htmlFor="url"
							className="mb-2 block text-sm text-slate-300"
						>
							URL
						</label>
						<input
							id="url"
							required
							type="url"
							value={url}
							onChange={(e) => {
								setUrl(e.target.value);
								clearFieldError("url");
							}}
							placeholder="https://example.com/health"
							aria-invalid={!!errors.url}
							aria-describedby={
								errors.url ? "url-error" : undefined
							}
							className={inputClass}
						/>
						{errors.url && getFieldError("url", errors.url)}
						<p className="mt-2 text-xs text-slate-500">
							Use a public HTTP or HTTPS endpoint. The API
							validates the URL for SSRF risks.
						</p>
					</div>

					<div>
						<label
							htmlFor="method"
							className="mb-2 block text-sm text-slate-300"
						>
							HTTP method
						</label>
						<select
							id="method"
							value={method}
							onChange={(e) => {
								setMethod(e.target.value as "GET" | "HEAD");
								clearFieldError("method");
							}}
							className={inputClass}
						>
							<option value="GET">GET</option>
							<option value="HEAD">HEAD</option>
						</select>
						{errors.method &&
							getFieldError("method", errors.method)}
					</div>

					<div>
						<label
							htmlFor="interval"
							className="mb-2 block text-sm text-slate-300"
						>
							Check interval
						</label>
						<select
							id="interval"
							value={intervalSeconds}
							onChange={(e) => {
								setIntervalSeconds(Number(e.target.value));
								clearFieldError("intervalSeconds");
							}}
							className={inputClass}
						>
							<option value={30}>Every 30 seconds</option>
							<option value={60}>Every 1 minute</option>
							<option value={300}>Every 5 minutes</option>
							<option value={600}>Every 10 minutes</option>
						</select>
						{errors.intervalSeconds &&
							getFieldError(
								"intervalSeconds",
								errors.intervalSeconds,
							)}
					</div>

					<div>
						<label
							htmlFor="timeout"
							className="mb-2 block text-sm text-slate-300"
						>
							Request timeout (milliseconds)
						</label>
						<input
							id="timeout"
							type="number"
							required
							min={1000}
							max={30000}
							step={1000}
							value={timeoutMs}
							onChange={(e) => {
								setTimeoutMs(Number(e.target.value));
								clearFieldError("timeoutMs");
							}}
							aria-invalid={!!errors.timeoutMs}
							aria-describedby={
								errors.timeoutMs ? "timeoutMs-error" : undefined
							}
							className={inputClass}
						/>
						{errors.timeoutMs &&
							getFieldError("timeoutMs", errors.timeoutMs)}
						<p className="mt-1 text-xs text-slate-500">
							Allowed range: 1,000–30,000 ms.
						</p>
					</div>

					<div>
						<label
							htmlFor="failure"
							className="mb-2 block text-sm text-slate-300"
						>
							Failure threshold
						</label>
						<select
							id="failure"
							value={failureThreshold}
							onChange={(e) => {
								setFailureThreshold(Number(e.target.value));
								clearFieldError("failureThreshold");
							}}
							className={inputClass}
						>
							{Array.from({ length: 10 }, (_, i) => i + 1).map(
								(value) => (
									<option key={value} value={value}>
										{value} consecutive{" "}
										{value === 1 ? "failure" : "failures"}
									</option>
								),
							)}
						</select>
						{errors.failureThreshold &&
							getFieldError(
								"failureThreshold",
								errors.failureThreshold,
							)}
					</div>

					<div>
						<label
							htmlFor="recovery"
							className="mb-2 block text-sm text-slate-300"
						>
							Recovery threshold
						</label>
						<select
							id="recovery"
							value={recoveryThreshold}
							onChange={(e) => {
								setRecoveryThreshold(Number(e.target.value));
								clearFieldError("recoveryThreshold");
							}}
							className={inputClass}
						>
							{Array.from({ length: 10 }, (_, i) => i + 1).map(
								(value) => (
									<option key={value} value={value}>
										{value} consecutive{" "}
										{value === 1 ? "success" : "successes"}
									</option>
								),
							)}
						</select>
						{errors.recoveryThreshold &&
							getFieldError(
								"recoveryThreshold",
								errors.recoveryThreshold,
							)}
					</div>

					{error && (
						<p
							role="alert"
							className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-400"
						>
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loading ? "Creating..." : "Create monitor"}
					</button>
				</form>
			</div>
		</main>
	);
}
