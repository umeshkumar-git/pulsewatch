import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
	path: "../../.env",
});

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),

	PORT: z.coerce.number().int().positive().default(5001),

	WEB_URL: z.string().url(),

	DATABASE_URL: z.string().min(1),

	REDIS_URL: z.string().min(1),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
	console.error(
		"Invalid environment configuration:",
		parsedEnv.error.flatten().fieldErrors,
	);

	process.exit(1);
}

export const env = parsedEnv.data;
