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

function handleError(error: unknown, res: Response) {
        if (error instanceof Error && error.message === "UNAUTHORIZED") {
                return res.status(401).json({
                        success: false,
                        message: "Unauthorized",
                });
        }

        if (error instanceof z.ZodError) {
                return res.status(400).json({
                        success: false,
                        message: "Invalid request data",
                        errors: error.flatten(),
                });
        }

        console.error("Incident controller error:", error);

        return res.status(500).json({
                success: false,
                message: "Internal server error",
        });
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

                return res.status(200).json({
                        success: true,
                        data: result,
                });
        } catch (error) {
                return handleError(error, res);
        }
}

export async function getIncident(req: Request, res: Response) {
        try {
                const userId = getUserId(req);
                const incidentId = incidentIdSchema.parse(req.params.id);

                const incident = await getIncidentById(userId, incidentId);

                if (!incident) {
                        return res.status(404).json({
                                success: false,
                                message: "Incident not found",
                        });
                }

                return res.status(200).json({
                        success: true,
                        data: incident,
                });
        } catch (error) {
                return handleError(error, res);
        }
}
