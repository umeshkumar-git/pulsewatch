import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/database";

import {
	registerUser,
	loginUser,
	refreshUserSession,
	logoutUser,
} from "./auth.service";

import { registerSchema, loginSchema } from "./auth.schemas";

import { env } from "../../config/env";

const COOKIE_NAME = "pulsewatch_refresh";

const cookieOptions = {
	httpOnly: true,
	secure: env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/api/v1/auth",
};

function setRefreshCookie(res: Response, token: string) {
	res.cookie(COOKIE_NAME, token, {
		...cookieOptions,
		maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
	});
}

function clearRefreshCookie(res: Response) {
	res.clearCookie(COOKIE_NAME, cookieOptions);
}

// REGISTER
export async function register(req: Request, res: Response) {
	const parsed = registerSchema.safeParse(req.body);

	if (!parsed.success) {
		return res.status(400).json({
			success: false,
			message: "Invalid registration data",
			errors: parsed.error.flatten(),
		});
	}

	try {
		const result = await registerUser(parsed.data);

		setRefreshCookie(res, result.refreshToken);

		return res.status(201).json({
			success: true,
			data: {
				user: result.user,
				accessToken: result.accessToken,
			},
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "EMAIL_ALREADY_EXISTS"
		) {
			return res.status(409).json({
				success: false,
				message: "An account with this email already exists",
			});
		}

		// Handle a duplicate-email race condition at the database level.
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "P2002"
		) {
			return res.status(409).json({
				success: false,
				message: "An account with this email already exists",
			});
		}

		throw error;
	}
}

// LOGIN
export async function login(req: Request, res: Response) {
	const parsed = loginSchema.safeParse(req.body);

	if (!parsed.success) {
		return res.status(400).json({
			success: false,
			message: "Invalid login data",
			errors: parsed.error.flatten(),
		});
	}

	try {
		const result = await loginUser(parsed.data);

		setRefreshCookie(res, result.refreshToken);

		return res.status(200).json({
			success: true,
			data: {
				user: result.user,
				accessToken: result.accessToken,
			},
		});
	} catch (error) {
		if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
			return res.status(401).json({
				success: false,
				message: "Invalid email or password",
			});
		}

		throw error;
	}
}

// REFRESH
export async function refresh(req: Request, res: Response) {
	const refreshToken = req.cookies?.[COOKIE_NAME];

	if (!refreshToken) {
		return res.status(401).json({
			success: false,
			message: "Refresh token missing",
		});
	}

	try {
		const result = await refreshUserSession(refreshToken);

		setRefreshCookie(res, result.refreshToken);

		return res.status(200).json({
			success: true,
			data: {
				accessToken: result.accessToken,
			},
		});
	} catch {
		clearRefreshCookie(res);

		return res.status(401).json({
			success: false,
			message: "Invalid or expired refresh token",
		});
	}
}

// LOGOUT
export async function logout(req: Request, res: Response) {
	const refreshToken = req.cookies?.[COOKIE_NAME];

	await logoutUser(refreshToken);

	clearRefreshCookie(res);

	return res.status(200).json({
		success: true,
		message: "Logged out successfully",
	});
}
export async function getMe(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: {
				id: req.user!.id,
			},
			select: {
				id: true,
				name: true,
				email: true,
			},
		});

		if (!user) {
			res.status(404).json({
				success: false,
				message: "User not found",
			});
			return;
		}

		res.status(200).json({
			success: true,
			data: {
				user,
			},
		});
	} catch (error) {
		next(error);
	}
}
