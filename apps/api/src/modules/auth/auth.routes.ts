import { Router } from "express";
import rateLimit from "express-rate-limit";

import { register, login, refresh, logout, getMe } from "./auth.controller";

import { requireAuth } from "../../middleware/require-auth";

const router = Router();

const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many authentication requests. Try again later.",
	},
});

const authRateLimit =
	process.env.NODE_ENV === "test"
		? (_req: any, _res: any, next: any) => next()
		: authLimiter;

router.post("/register", authRateLimit, register);
router.post("/login", authRateLimit, login);
router.post("/refresh", authRateLimit, refresh);
router.post("/logout", logout);

router.get("/me", requireAuth, getMe);

export default router;
