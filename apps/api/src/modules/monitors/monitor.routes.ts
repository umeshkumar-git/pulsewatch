import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";

import {
	create,
	getAll,
	getOne,
	update,
	remove,
	pause,
	resume,
	getUptime,
} from "./monitor.controller";

const router = Router();

// Every monitor route requires authentication.
router.use(requireAuth);

router.post("/", create);
router.get("/", getAll);

// Keep uptime route before the generic ID route.
router.get("/:id/uptime", getUptime);

router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

router.post("/:id/pause", pause);
router.post("/:id/resume", resume);

export default router;
