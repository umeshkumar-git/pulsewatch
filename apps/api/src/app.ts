import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env";

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

app.get("/api/v1/health", (_req, res) => {
	res.status(200).json({
		success: true,
		message: "PulseWatch API is running",
		data: {
			status: "healthy",
			environment: env.NODE_ENV,
			timestamp: new Date().toISOString(),
		},
	});
});

app.use((_req, res) => {
	res.status(404).json({
		success: false,
		message: "Route not found",
	});
});

export default app;
