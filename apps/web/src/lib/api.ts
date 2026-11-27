const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
	accessToken = token;
}

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public fieldErrors: FieldErrors = {},
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function refreshAccessToken(): Promise<string | null> {
	if (refreshPromise) return refreshPromise;

	refreshPromise = (async () => {
		try {
			const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				accessToken = null;
				return null;
			}

			const result = await response.json();
			accessToken = result.data?.accessToken ?? null;
			return accessToken;
		} catch {
			accessToken = null;
			return null;
		} finally {
			refreshPromise = null;
		}
	})();

	return refreshPromise;
}

export async function apiFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const sendRequest = () =>
		fetch(`${API_URL}/api/v1${path}`, {
			...options,
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				...(accessToken
					? { Authorization: `Bearer ${accessToken}` }
					: {}),
				...options.headers,
			},
		});

	let response = await sendRequest();

	if (response.status === 401) {
		const newToken = await refreshAccessToken();

		if (!newToken) {
			throw new ApiError(
				"Your session has expired. Please log in again.",
				401,
			);
		}

		response = await sendRequest();
	}

	const result = await response.json().catch(() => null);

	if (!response.ok) {
		const rawFieldErrors = result?.errors?.fieldErrors;

		const fieldErrors: FieldErrors =
			rawFieldErrors && typeof rawFieldErrors === "object"
				? Object.fromEntries(
						Object.entries(rawFieldErrors).filter(
							(entry): entry is [string, string[]] =>
								Array.isArray(entry[1]) &&
								entry[1].every(
									(message) => typeof message === "string",
								),
						),
					)
				: {};

		throw new ApiError(
			result?.message ?? "Something went wrong.",
			response.status,
			fieldErrors,
		);
	}

	return result.data as T;
}

export async function loginRequest(email: string, password: string) {
	const response = await fetch(`${API_URL}/api/v1/auth/login`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});

	const result = await response.json().catch(() => null);

	if (!response.ok) {
		throw new ApiError(result?.message ?? "Login failed.", response.status);
	}

	const token = result.data?.accessToken;

	if (!token) {
		throw new ApiError("The API did not return an access token.", 500);
	}

	setAccessToken(token);
	return result.data.user;
}
