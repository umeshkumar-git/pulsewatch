import { z } from "zod";

export const incidentIdSchema = z.string().uuid();

export const incidentListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),

	limit: z.coerce.number().int().min(1).max(100).default(20),

	status: z.enum(["OPEN", "RESOLVED"]).optional(),
});
