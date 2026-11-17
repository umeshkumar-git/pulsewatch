import { prisma } from "./config/database";
import app from "./app";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => {
	console.log("--------------------------------");
	console.log("PulseWatch API started");
	console.log(`Environment: ${env.NODE_ENV}`);
	console.log(`Port: ${env.PORT}`);
	console.log(`Health: http://localhost:${env.PORT}/api/v1/health`);
	console.log("--------------------------------");
});

function shutdown(signal: string) {
	console.log(`${signal} received. Shutting down...`);

	server.close(async (error) => {
		if (error) {
			console.error("Server shutdown error:", error);
			process.exitCode = 1;
			return;
		}

		await prisma.$disconnect();

		console.log("Database disconnected.");
		console.log("Server closed successfully.");
	});
}
