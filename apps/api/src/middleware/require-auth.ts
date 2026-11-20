import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";

export function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const authorization = req.headers.authorization;

	if (!authorization?.startsWith("Bearer ")) {
		res.status(401).json({
			success: false,
			message: "Authentication required",
		});
		return;
	}

	const token = authorization.slice(7);

	try {
		const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

		if (typeof payload === "string" || typeof payload.sub !== "string") {
			res.status(401).json({
				success: false,
				message: "Invalid access token",
			});
			return;
		}

		req.user = {
			id: payload.sub,
		};

		next();
	} catch {
		res.status(401).json({
			success: false,
			message: "Invalid or expired access token",
		});
		return;
	}
}
