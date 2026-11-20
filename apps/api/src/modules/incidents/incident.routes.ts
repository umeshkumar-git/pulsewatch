import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";

import { listIncidents, getIncident } from "./incident.controller";

const router = Router();

router.use(requireAuth);

router.get("/", listIncidents);

router.get("/:id", getIncident);

export default router;
