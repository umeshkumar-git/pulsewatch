"use client";

interface Check {
	id: string;
	success: boolean;
	statusCode: number | null;
	checkedAt: string;
	errorMessage: string | null;
}

export default function CheckHistory({ checks }: { checks: Check[] }) {
	const orderedChecks = [...checks].reverse();

	if (orderedChecks.length === 0) {
		return (
			<p className="text-sm text-slate-400">
				No monitoring history available.
			</p>
		);
	}

	return (
		<div>
			<div className="flex gap-1">
				{orderedChecks.map((check) => (
					<div
						key={check.id}
						title={`${new Date(check.checkedAt).toLocaleString()} — ${
							check.success
								? `Success (${check.statusCode ?? "no status code"})`
								: `Failed (${check.errorMessage ?? "unknown error"})`
						}`}
						className={`h-9 flex-1 rounded-sm ${
							check.success ? "bg-emerald-500" : "bg-red-500"
						}`}
					/>
				))}
			</div>

			<div className="mt-3 flex justify-between text-xs text-slate-500">
				<span>Older checks</span>
				<span>Latest checks</span>
			</div>

			<div className="mt-3 flex gap-4 text-xs text-slate-400">
				<span className="flex items-center gap-2">
					<span className="h-2 w-2 rounded-full bg-emerald-500" />
					Successful
				</span>
				<span className="flex items-center gap-2">
					<span className="h-2 w-2 rounded-full bg-red-500" />
					Failed
				</span>
			</div>
		</div>
	);
}
