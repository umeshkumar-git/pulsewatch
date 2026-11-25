import dotenv from "dotenv";
import path from "node:path";

const result = dotenv.config({
	path: path.resolve(process.cwd(), ".env.test"),
	override: true,
});

if (result.error) {
	throw new Error("Could not load apps/api/.env.test");
}

if (process.env.NODE_ENV !== "test") {
	throw new Error("Integration tests must run with NODE_ENV=test");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is missing from .env.test");
}

const databaseName = new URL(databaseUrl).pathname.replace("/", "");

if (databaseName !== "pulsewatch_test") {
	throw new Error(
		`Unsafe test database: expected pulsewatch_test, received ${databaseName}`,
	);
}

console.log(
	"Integration tests connected to the pulsewatch_test configuration.",
);
