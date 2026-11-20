import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  login,
  refresh,
  logout,
  getMe,
} from "./auth.controller";

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

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/refresh", authLimiter, refresh);
router.post("/logout", logout);

router.get("/me", requireAuth, getMe);

export default router;