import { z } from "zod";

export const createMonitorSchema = z.object({
	name: z.string().trim().min(2).max(80),

	url: z.string().trim().min(1).max(2048),

	method: z.enum(["GET", "HEAD"]).default("GET"),

	intervalSeconds: z.number().int().min(30).max(86400).default(60),

	timeoutMs: z.number().int().min(1000).max(30000).default(10000),

	failureThreshold: z.number().int().min(1).max(10).default(3),

	recoveryThreshold: z.number().int().min(1).max(10).default(2),
});

export const updateMonitorSchema = z
	.object({
		name: z.string().trim().min(2).max(80).optional(),

		url: z.string().trim().min(1).max(2048).optional(),

		method: z.enum(["GET", "HEAD"]).optional(),

		intervalSeconds: z.number().int().min(30).max(86400).optional(),

		timeoutMs: z.number().int().min(1000).max(30000).optional(),

		failureThreshold: z.number().int().min(1).max(10).optional(),

		recoveryThreshold: z.number().int().min(1).max(10).optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided",
	});

export const monitorIdSchema = z.string().uuid();

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;

export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
