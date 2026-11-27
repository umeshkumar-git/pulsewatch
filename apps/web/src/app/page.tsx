export default function Home() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
			<div className="max-w-xl text-center">
				<div className="mb-5 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
					● Monitoring infrastructure
				</div>

				<h1 className="text-5xl font-bold tracking-tight">
					PulseWatch
				</h1>

				<p className="mt-5 text-lg leading-8 text-slate-400">
					Monitor your services, detect incidents, and stay informed
					about your infrastructure.
				</p>

				<div className="mt-8 flex justify-center gap-4">
					<a
						href="/login"
						className="rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
					>
						Get Started
					</a>
				</div>
			</div>
		</main>
	);
}
