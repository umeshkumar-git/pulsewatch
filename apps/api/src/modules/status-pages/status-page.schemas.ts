import { z } from "zod";

export const createStatusPageSchema = z.object({
	title: z.string().trim().min(2).max(80),
	monitorIds: z.array(z.string().uuid()).min(1).max(50),
});

export const updateStatusPageSchema = z
	.object({
		title: z.string().trim().min(2).max(80).optional(),
		isPublic: z.boolean().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});

export const updateStatusPageMonitorsSchema = z.object({
	monitorIds: z.array(z.string().uuid()).min(1).max(50),
});

export const statusPageIdSchema = z.string().uuid();

export const statusPageSlugSchema = z
	.string()
	.min(3)
	.max(100)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
