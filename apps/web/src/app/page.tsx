export default function Home() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
			<div className="max-w-xl text-center">
				<div className="mb-5 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
					● Monitoring infrastructure
				</div>

				<h1 className="text-5xl font-bold tracking-tight">
					Pulse<span className="text-emerald-400">Watch</span>
				</h1>

				<p className="mt-5 text-lg text-slate-400">
					Know when your services go down, before your users do.
				</p>

				<div className="mt-10 rounded-xl border border-slate-800 bg-slate-900 p-5">
					<p className="text-sm text-slate-400">Platform status</p>
					<p className="mt-2 text-xl font-semibold text-emerald-400">
						Initializing infrastructure
					</p>
				</div>

				<p className="mt-8 text-xs text-slate-600">
					PulseWatch · Website & API Monitoring
				</p>
			</div>
		</main>
	);
}
