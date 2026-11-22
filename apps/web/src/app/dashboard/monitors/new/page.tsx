"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import type { Monitor } from "@/lib/types";

export default function NewMonitorPage() {
	const router = useRouter();

	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [method, setMethod] = useState<"GET" | "HEAD">("GET");
	const [intervalSeconds, setIntervalSeconds] = useState(60);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		setLoading(true);

		try {
			await apiFetch<{ monitor: Monitor }>("/monitors", {
				method: "POST",
				body: JSON.stringify({
					name,
					url,
					method,
					intervalSeconds,
					timeoutMs: 10000,
					failureThreshold: 3,
					recoveryThreshold: 2,
				}),
			});

			router.push("/dashboard");
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace("/login");
				return;
			}

			setError(
				err instanceof Error
					? err.message
					: "Could not create monitor.",
			);
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
						<label className="mb-2 block text-sm text-slate-300">
							Monitor name
						</label>
						<input
							required
							minLength={2}
							maxLength={80}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Production API"
							className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm text-slate-300">
							URL
						</label>
						<input
							required
							type="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://example.com/health"
							className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
						/>
						<p className="mt-2 text-xs text-slate-500">
							Use a public HTTP or HTTPS endpoint. The API
							validates the URL for SSRF risks.
						</p>
					</div>

					<div>
						<label className="mb-2 block text-sm text-slate-300">
							HTTP method
						</label>
						<select
							value={method}
							onChange={(e) =>
								setMethod(e.target.value as "GET" | "HEAD")
							}
							className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
						>
							<option value="GET">GET</option>
							<option value="HEAD">HEAD</option>
						</select>
					</div>

					<div>
						<label className="mb-2 block text-sm text-slate-300">
							Check interval
						</label>
						<select
							value={intervalSeconds}
							onChange={(e) =>
								setIntervalSeconds(Number(e.target.value))
							}
							className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
						>
							<option value={30}>Every 30 seconds</option>
							<option value={60}>Every 1 minute</option>
							<option value={300}>Every 5 minutes</option>
							<option value={600}>Every 10 minutes</option>
						</select>
					</div>

					{error && (
						<p role="alert" className="text-sm text-red-400">
							{error}
						</p>
					)}

					<button
						disabled={loading}
						className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
					>
						{loading ? "Creating..." : "Create monitor"}
					</button>
				</form>
			</div>
		</main>
	);
}
