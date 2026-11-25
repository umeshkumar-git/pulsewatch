import { describe, expect, it } from "vitest";

describe("Integration test environment", () => {
	it("loads the isolated test database configuration", () => {
		expect(process.env.NODE_ENV).toBe("test");

		const databaseUrl = new URL(process.env.DATABASE_URL!);

		expect(databaseUrl.hostname).toBe("localhost");
		expect(databaseUrl.pathname).toBe("/pulsewatch_test");
	});
});
