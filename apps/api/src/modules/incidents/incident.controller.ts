import { z } from "zod";
import type { Request, Response } from "express";

import { incidentIdSchema, incidentListQuerySchema } from "./incident.schemas";

import { getIncidentById, getIncidents } from "./incident.service";

function getUserId(req: Request): string {
	if (!req.user?.id) {
		throw new Error("UNAUTHORIZED");
	}

	return req.user.id;
}

export async function listIncidents(req: Request, res: Response) {
	try {
		const userId = getUserId(req);

		const query = incidentListQuerySchema.parse(req.query);

		const result = await getIncidents(
			userId,
			query.page,
			query.limit,
			query.status,
		);

		res.status(200).json({
			success: true,
			data: result,
		});
	} catch (error) {
		if (error instanceof Error && error.message === "UNAUTHORIZED") {
			res.status(401).json({
				success: false,
				message: "Unauthorized",
			});
			return;
		}

		res.status(400).json({
			success: false,
			message:
				error instanceof Error
					? error.message
					: "Unable to retrieve incidents",
		});
	}
}

export async function getIncident(req: Request, res: Response) {
	try {
		const userId = getUserId(req);

		const incidentId = incidentIdSchema.parse(req.params.id);

		const incident = await getIncidentById(userId, incidentId);

		if (!incident) {
			res.status(404).json({
				success: false,
				message: "Incident not found",
			});
			return;
		}

		res.status(200).json({
			success: true,
			data: incident,
		});
	} catch (error) {
		if (error instanceof Error && error.message === "UNAUTHORIZED") {
			res.status(401).json({
				success: false,
				message: "Unauthorized",
			});
			return;
		}

		res.status(400).json({
			success: false,
			message:
				error instanceof Error
					? error.message
					: "Unable to retrieve incident",
		});
	}
}
