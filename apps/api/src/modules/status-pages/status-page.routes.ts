import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";

import {
	create,
	list,
	getOne,
	update,
	updateMonitors,
	remove,
	getPublic,
} from "./status-page.controller";

const router = Router();

// Public endpoint: intentionally registered before requireAuth.
router.get("/public/:slug", getPublic);

// All management endpoints require authentication.
router.use(requireAuth);

router.post("/", create);
router.get("/", list);
router.get("/:id", getOne);
router.patch("/:id", update);
router.put("/:id/monitors", updateMonitors);
router.delete("/:id", remove);

export default router;
