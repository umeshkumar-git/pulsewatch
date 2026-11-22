"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginRequest } from "@/lib/api";

export default function LoginPage() {
	const router = useRouter();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		setLoading(true);

		try {
			await loginRequest(email, password);
			router.replace("/dashboard");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
			<form
				onSubmit={handleSubmit}
				className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-8"
			>
				<div>
					<p className="text-sm font-semibold text-cyan-400">
						PULSEWATCH
					</p>
					<h1 className="mt-2 text-3xl font-bold">Welcome back</h1>
					<p className="mt-2 text-sm text-slate-400">
						Sign in to monitor your services.
					</p>
				</div>

				<div>
					<label className="mb-2 block text-sm text-slate-300">
						Email
					</label>
					<input
						type="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
						placeholder="you@example.com"
					/>
				</div>

				<div>
					<label className="mb-2 block text-sm text-slate-300">
						Password
					</label>
					<input
						type="password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
						placeholder="Enter your password"
					/>
				</div>

				{error && (
					<p role="alert" className="text-sm text-red-400">
						{error}
					</p>
				)}

				<button
					disabled={loading}
					className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
				>
					{loading ? "Signing in..." : "Sign in"}
				</button>
			</form>
		</main>
	);
}
