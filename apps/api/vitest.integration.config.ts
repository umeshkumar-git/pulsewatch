import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const apiRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: apiRoot,
	test: {
		include: ["tests/integration/**/*.test.ts"],
		setupFiles: ["tests/integration/setup.ts"],
		environment: "node",
		globals: true,
		clearMocks: true,
		restoreMocks: true,
		reporters: ["default"],
		testTimeout: 15000,
		hookTimeout: 15000,
	},
});
