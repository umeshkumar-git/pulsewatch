import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env";
import { prisma } from "./config/database";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
	cors({
		origin: env.WEB_URL,
		credentials: true,
	}),
);

app.use(express.json({ limit: "10kb" }));

app.get("/api/v1/health", async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;

		res.status(200).json({
			success: true,
			message: "PulseWatch API is running",
			data: {
				api: "healthy",
				database: "connected",
				environment: env.NODE_ENV,
				timestamp: new Date().toISOString(),
			},
		});
	} catch (error) {
		console.error("Database health check failed:", error);

		res.status(503).json({
			success: false,
			message: "Database connection unavailable",
			data: {
				api: "healthy",
				database: "disconnected",
			},
		});
	}
});

app.use((_req, res) => {
	res.status(404).json({
		success: false,
		message: "Route not found",
	});
});

export default app;
