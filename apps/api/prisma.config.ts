import dotenv from "dotenv";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

const environmentFile =
	process.env.NODE_ENV === "test" ? ".env.test" : "../../.env";

dotenv.config({
	path: path.resolve(process.cwd(), environmentFile),
});

export default defineConfig({
	schema: "prisma/schema.prisma",

	migrations: {
		path: "prisma/migrations",
	},

	datasource: {
		url: env("DATABASE_URL"),
	},
});
