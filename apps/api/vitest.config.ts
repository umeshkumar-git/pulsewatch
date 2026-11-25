import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const apiRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: apiRoot,

	test: {
		include: ["tests/unit/**/*.test.ts"],
		environment: "node",
		globals: true,
		clearMocks: true,
		restoreMocks: true,
		reporters: ["default"],
	},
});
