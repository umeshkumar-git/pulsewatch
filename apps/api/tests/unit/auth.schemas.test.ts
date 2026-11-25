import { describe, it, expect } from "vitest";
import {
	registerSchema,
	loginSchema,
} from "../../src/modules/auth/auth.schemas";

describe("registerSchema", () => {
	const validUser = {
		name: "Umesh Shah",
		email: "umesh@example.com",
		password: "password123",
	};

	it("accepts valid registration data", () => {
		expect(registerSchema.safeParse(validUser).success).toBe(true);
	});

	it("trims name and email whitespace", () => {
		const result = registerSchema.safeParse({
			...validUser,
			name: "  Umesh Shah  ",
			email: "  umesh@example.com  ",
		});

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.data.name).toBe("Umesh Shah");
			expect(result.data.email).toBe("umesh@example.com");
		}
	});

	it("rejects names shorter than 2 characters", () => {
		expect(
			registerSchema.safeParse({ ...validUser, name: "A" }).success,
		).toBe(false);
	});

	it("rejects names longer than 50 characters", () => {
		expect(
			registerSchema.safeParse({
				...validUser,
				name: "A".repeat(51),
			}).success,
		).toBe(false);
	});

	it("rejects invalid email addresses", () => {
		expect(
			registerSchema.safeParse({
				...validUser,
				email: "invalid-email",
			}).success,
		).toBe(false);
	});

	it("rejects passwords shorter than 8 characters", () => {
		expect(
			registerSchema.safeParse({
				...validUser,
				password: "1234567",
			}).success,
		).toBe(false);
	});

	it("rejects passwords longer than 128 characters", () => {
		expect(
			registerSchema.safeParse({
				...validUser,
				password: "A".repeat(129),
			}).success,
		).toBe(false);
	});
});

describe("loginSchema", () => {
	const validLogin = {
		email: "umesh@example.com",
		password: "password123",
	};

	it("accepts valid login data", () => {
		expect(loginSchema.safeParse(validLogin).success).toBe(true);
	});

	it("trims email whitespace", () => {
		const result = loginSchema.safeParse({
			...validLogin,
			email: "  umesh@example.com  ",
		});

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.data.email).toBe("umesh@example.com");
		}
	});

	it("rejects invalid email addresses", () => {
		expect(
			loginSchema.safeParse({
				...validLogin,
				email: "invalid-email",
			}).success,
		).toBe(false);
	});

	it("rejects an empty password", () => {
		expect(
			loginSchema.safeParse({
				...validLogin,
				password: "",
			}).success,
		).toBe(false);
	});

	it("rejects passwords longer than 128 characters", () => {
		expect(
			loginSchema.safeParse({
				...validLogin,
				password: "A".repeat(129),
			}).success,
		).toBe(false);
	});
});
