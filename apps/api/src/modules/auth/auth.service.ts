import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import { prisma } from "../../config/database";
import { env } from "../../config/env";
import type { RegisterInput, LoginInput } from "./auth.schemas";

const ACCESS_TOKEN_LIFETIME =
	env.ACCESS_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"];

const REFRESH_TOKEN_LIFETIME = env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

// Generate a short-lived access token.
function generateAccessToken(userId: string): string {
	return jwt.sign({ sub: userId }, env.ACCESS_TOKEN_SECRET, {
		expiresIn: ACCESS_TOKEN_LIFETIME,
	});
}

// Generate a cryptographically secure random refresh token.
function generateRefreshToken(): string {
	return crypto.randomBytes(48).toString("base64url");
}

// Store only the SHA-256 hash of the refresh token.
function hashRefreshToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

function publicUser(user: { id: string; name: string; email: string }) {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
	};
}

async function createSession(userId: string, familyId?: string) {
	const refreshToken = generateRefreshToken();

	await prisma.refreshSession.create({
		data: {
			userId,
			tokenHash: hashRefreshToken(refreshToken),
			familyId: familyId ?? crypto.randomUUID(),
			expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME),
		},
	});

	return {
		refreshToken,
		accessToken: generateAccessToken(userId),
	};
}

// REGISTER
export async function registerUser(input: RegisterInput) {
	const email = input.email.toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: { email },
	});

	if (existingUser) {
		throw new Error("EMAIL_ALREADY_EXISTS");
	}

	const passwordHash = await argon2.hash(input.password, {
		type: argon2.argon2id,
	});

	const user = await prisma.user.create({
		data: {
			name: input.name,
			email,
			passwordHash,
		},
		select: {
			id: true,
			name: true,
			email: true,
		},
	});

	const tokens = await createSession(user.id);

	return {
		user,
		...tokens,
	};
}

// LOGIN
export async function loginUser(input: LoginInput) {
	const email = input.email.toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new Error("INVALID_CREDENTIALS");
	}

	const passwordMatches = await argon2.verify(
		user.passwordHash,
		input.password,
	);

	if (!passwordMatches) {
		throw new Error("INVALID_CREDENTIALS");
	}

	const tokens = await createSession(user.id);

	return {
		user: publicUser(user),
		...tokens,
	};
}

// REFRESH TOKEN ROTATION
export async function refreshUserSession(refreshToken: string) {
	const tokenHash = hashRefreshToken(refreshToken);

	const newRefreshToken = generateRefreshToken();

	const now = new Date();

	const result = await prisma.$transaction(async (tx) => {
		const session = await tx.refreshSession.findUnique({
			where: { tokenHash },
		});

		if (!session) {
			return { kind: "invalid" as const };
		}

		// A previously rotated token has been reused.
		if (session.revokedAt) {
			await tx.refreshSession.updateMany({
				where: {
					familyId: session.familyId,
					revokedAt: null,
				},
				data: {
					revokedAt: now,
				},
			});

			return { kind: "reuse" as const };
		}

		if (session.expiresAt <= now) {
			await tx.refreshSession.updateMany({
				where: {
					id: session.id,
					revokedAt: null,
				},
				data: {
					revokedAt: now,
				},
			});

			return { kind: "invalid" as const };
		}

		// The conditional update prevents two simultaneous
		// refresh requests from both successfully rotating a token.
		const revoked = await tx.refreshSession.updateMany({
			where: {
				id: session.id,
				revokedAt: null,
			},
			data: {
				revokedAt: now,
			},
		});

		if (revoked.count !== 1) {
			await tx.refreshSession.updateMany({
				where: {
					familyId: session.familyId,
					revokedAt: null,
				},
				data: {
					revokedAt: now,
				},
			});

			return { kind: "reuse" as const };
		}

		await tx.refreshSession.create({
			data: {
				userId: session.userId,
				tokenHash: hashRefreshToken(newRefreshToken),
				familyId: session.familyId,
				expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME),
			},
		});

		return {
			kind: "success" as const,
			userId: session.userId,
		};
	});

	if (result.kind !== "success") {
		throw new Error("INVALID_REFRESH_TOKEN");
	}

	return {
		refreshToken: newRefreshToken,
		accessToken: generateAccessToken(result.userId),
	};
}

// LOGOUT
export async function logoutUser(refreshToken?: string) {
	if (!refreshToken) {
		return;
	}

	await prisma.refreshSession.updateMany({
		where: {
			tokenHash: hashRefreshToken(refreshToken),
			revokedAt: null,
		},
		data: {
			revokedAt: new Date(),
		},
	});
}
