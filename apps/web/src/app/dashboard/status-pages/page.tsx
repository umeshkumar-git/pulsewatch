"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { Monitor } from "@/lib/types";

type ManagedStatusPage = {
	id: string;
	title: string;
	slug: string;
	isPublic: boolean;
	createdAt: string;
	monitors: {
		monitorId: string;
		monitor: {
			id: string;
			name: string;
			url: string;
			status: string;
			enabled: boolean;
			lastCheckedAt: string | null;
		};
	}[];
};

type StatusPageListResponse = {
	pages: ManagedStatusPage[];
};

type MonitorListResponse = {
	monitors: Monitor[];
	pagination: unknown;
};

export default function StatusPagesManagement() {
	const router = useRouter();

	const [pages, setPages] = useState<ManagedStatusPage[]>([]);
	const [monitors, setMonitors] = useState<Monitor[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");

	const [title, setTitle] = useState("");
	const [selectedMonitorIds, setSelectedMonitorIds] = useState<string[]>([]);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [editMonitorIds, setEditMonitorIds] = useState<string[]>([]);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			setError("");

			const [pageData, monitorData] = await Promise.all([
				apiFetch<StatusPageListResponse>("/status-pages"),
				apiFetch<MonitorListResponse>("/monitors?page=1&limit=100"),
			]);

			setPages(pageData.pages);
			setMonitors(monitorData.monitors);
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace("/login");
				return;
			}

			setError(
				err instanceof Error
					? err.message
					: "Unable to load status pages.",
			);
		} finally {
			setLoading(false);
		}
	}, [router]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	function toggleSelection(
		id: string,
		selected: string[],
		setSelected: (value: string[]) => void,
	) {
		setSelected(
			selected.includes(id)
				? selected.filter((item) => item !== id)
				: [...selected, id],
		);
	}

	async function createPage(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (selectedMonitorIds.length === 0) {
			setError("Select at least one monitor.");
			return;
		}

		try {
			setSaving(true);
			setError("");
			setMessage("");

			await apiFetch("/status-pages", {
				method: "POST",
				body: JSON.stringify({
					title,
					monitorIds: selectedMonitorIds,
				}),
			});

			setTitle("");
			setSelectedMonitorIds([]);
			setMessage("Status page created successfully.");
			await loadData();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Could not create the status page.",
			);
		} finally {
			setSaving(false);
		}
	}

	function startEditing(page: ManagedStatusPage) {
		setEditingId(page.id);
		setEditTitle(page.title);
		setEditMonitorIds(page.monitors.map((item) => item.monitor.id));
		setError("");
		setMessage("");
	}

	async function savePage(pageId: string) {
		if (!editTitle.trim()) {
			setError("Status page title is required.");
			return;
		}

		if (editMonitorIds.length === 0) {
			setError("Select at least one monitor.");
			return;
		}

		try {
			setSaving(true);
			setError("");
			setMessage("");

			await apiFetch(`/status-pages/${pageId}`, {
				method: "PATCH",
				body: JSON.stringify({
					title: editTitle.trim(),
				}),
			});

			await apiFetch(`/status-pages/${pageId}/monitors`, {
				method: "PUT",
				body: JSON.stringify({
					monitorIds: editMonitorIds,
				}),
			});

			setEditingId(null);
			setMessage("Status page updated successfully.");
			await loadData();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Could not update the status page.",
			);
		} finally {
			setSaving(false);
		}
	}

	async function toggleVisibility(
		page: ManagedStatusPage,
		isPublic: boolean,
	) {
		try {
			setError("");
			setMessage("");

			await apiFetch(`/status-pages/${page.id}`, {
				method: "PATCH",
				body: JSON.stringify({ isPublic }),
			});

			setMessage(
				isPublic
					? "Status page is now public."
					: "Status page is now private.",
			);

			await loadData();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Could not change page visibility.",
			);
		}
	}

	async function deletePage(page: ManagedStatusPage) {
		const confirmed = window.confirm(
			`Delete "${page.title}"? This action cannot be undone.`,
		);

		if (!confirmed) return;

		try {
			setError("");
			setMessage("");

			await apiFetch(`/status-pages/${page.id}`, {
				method: "DELETE",
			});

			setMessage("Status page deleted.");
			await loadData();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Could not delete the status page.",
			);
		}
	}

	async function copyPublicUrl(slug: string) {
		const url = `${window.location.origin}/status/${encodeURIComponent(slug)}`;

		try {
			await navigator.clipboard.writeText(url);
			setMessage("Public status page URL copied.");
			setError("");
		} catch {
			setError("Clipboard access failed. Copy the URL manually.");
		}
	}

	if (loading) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
				Loading status pages...
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-slate-950 text-white">
			<div className="mx-auto max-w-6xl px-5 py-8">
				<header className="mb-8 flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-sm font-semibold tracking-widest text-cyan-400">
							PULSEWATCH
						</p>
						<h1 className="mt-2 text-3xl font-bold">
							Status pages
						</h1>
						<p className="mt-1 text-sm text-slate-400">
							Publish service health information for your users.
						</p>
					</div>

					<Link
						href="/dashboard"
						className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
					>
						Back to dashboard
					</Link>
				</header>

				{error && (
					<div
						role="alert"
						className="mb-5 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
					>
						{error}
					</div>
				)}

				{message && (
					<div
						role="status"
						className="mb-5 rounded-lg border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-300"
					>
						{message}
					</div>
				)}

				<section className="rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
					<h2 className="text-lg font-semibold">
						Create a status page
					</h2>
					<p className="mt-1 text-sm text-slate-400">
						Choose a title and select the monitors to publish.
					</p>

					<form onSubmit={createPage} className="mt-5 space-y-5">
						<div>
							<label
								htmlFor="page-title"
								className="mb-2 block text-sm font-medium text-slate-300"
							>
								Page title
							</label>
							<input
								id="page-title"
								value={title}
								onChange={(event) =>
									setTitle(event.target.value)
								}
								minLength={2}
								maxLength={80}
								required
								placeholder="e.g. Acme Service Status"
								className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
							/>
						</div>

						<div>
							<p className="mb-3 text-sm font-medium text-slate-300">
								Select monitors
							</p>

							{monitors.length === 0 ? (
								<p className="text-sm text-slate-400">
									You have no monitors yet. Create a monitor
									first.
								</p>
							) : (
								<div className="grid gap-2 sm:grid-cols-2">
									{monitors.map((monitor) => (
										<label
											key={monitor.id}
											className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 hover:border-slate-600"
										>
											<input
												type="checkbox"
												checked={selectedMonitorIds.includes(
													monitor.id,
												)}
												onChange={() =>
													toggleSelection(
														monitor.id,
														selectedMonitorIds,
														setSelectedMonitorIds,
													)
												}
												className="h-4 w-4 accent-cyan-500"
											/>
											<span className="min-w-0">
												<span className="block text-sm font-medium">
													{monitor.name}
												</span>
												<span className="block max-w-xs truncate text-xs text-slate-500">
													{monitor.url}
												</span>
											</span>
										</label>
									))}
								</div>
							)}
						</div>

						<button
							type="submit"
							disabled={saving || monitors.length === 0}
							className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{saving ? "Creating..." : "Create status page"}
						</button>
					</form>
				</section>

				<section className="mt-8">
					<div className="mb-4">
						<h2 className="text-xl font-semibold">
							Your status pages
						</h2>
						<p className="mt-1 text-sm text-slate-400">
							Manage visibility, published monitors, and public
							links.
						</p>
					</div>

					{pages.length === 0 ? (
						<div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
							<h3 className="font-semibold">
								No status pages yet
							</h3>
							<p className="mt-2 text-sm text-slate-400">
								Create your first public status page above.
							</p>
						</div>
					) : (
						<div className="space-y-5">
							{pages.map((page) => (
								<article
									key={page.id}
									className="rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6"
								>
									<div className="flex flex-wrap items-start justify-between gap-4">
										<div>
											<h3 className="text-lg font-semibold">
												{page.title}
											</h3>
											<p className="mt-1 text-xs text-slate-500">
												{page.monitors.length}{" "}
												monitor(s) · Slug: {page.slug}
											</p>
										</div>

										<span
											className={`rounded-full px-3 py-1 text-xs font-semibold ${
												page.isPublic
													? "bg-emerald-500/10 text-emerald-400"
													: "bg-amber-500/10 text-amber-400"
											}`}
										>
											{page.isPublic
												? "PUBLIC"
												: "PRIVATE"}
										</span>
									</div>

									<div className="mt-4 flex flex-wrap gap-2">
										<button
											type="button"
											onClick={() =>
												void copyPublicUrl(page.slug)
											}
											className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
										>
											Copy public URL
										</button>

										<Link
											href={`/status/${encodeURIComponent(page.slug)}`}
											target="_blank"
											className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
										>
											Open page
										</Link>

										<button
											type="button"
											onClick={() =>
												void toggleVisibility(
													page,
													!page.isPublic,
												)
											}
											className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
										>
											{page.isPublic
												? "Make private"
												: "Make public"}
										</button>

										<button
											type="button"
											onClick={() =>
												editingId === page.id
													? setEditingId(null)
													: startEditing(page)
											}
											className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
										>
											{editingId === page.id
												? "Cancel edit"
												: "Edit"}
										</button>

										<button
											type="button"
											onClick={() =>
												void deletePage(page)
											}
											className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-300 hover:bg-red-950/50"
										>
											Delete
										</button>
									</div>

									{editingId === page.id && (
										<div className="mt-5 border-t border-slate-800 pt-5">
											<label
												htmlFor={`edit-title-${page.id}`}
												className="mb-2 block text-sm font-medium text-slate-300"
											>
												Page title
											</label>
											<input
												id={`edit-title-${page.id}`}
												value={editTitle}
												onChange={(event) =>
													setEditTitle(
														event.target.value,
													)
												}
												minLength={2}
												maxLength={80}
												className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
											/>

											<p className="mb-3 mt-5 text-sm font-medium text-slate-300">
												Published monitors
											</p>

											<div className="grid gap-2 sm:grid-cols-2">
												{monitors.map((monitor) => (
													<label
														key={monitor.id}
														className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3"
													>
														<input
															type="checkbox"
															checked={editMonitorIds.includes(
																monitor.id,
															)}
															onChange={() =>
																toggleSelection(
																	monitor.id,
																	editMonitorIds,
																	setEditMonitorIds,
																)
															}
															className="h-4 w-4 accent-cyan-500"
														/>
														<span className="text-sm">
															{monitor.name}
														</span>
													</label>
												))}
											</div>

											<button
												type="button"
												disabled={saving}
												onClick={() =>
													void savePage(page.id)
												}
												className="mt-5 rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
											>
												{saving
													? "Saving..."
													: "Save changes"}
											</button>
										</div>
									)}
								</article>
							))}
						</div>
					)}
				</section>
			</div>
		</main>
	);
}
