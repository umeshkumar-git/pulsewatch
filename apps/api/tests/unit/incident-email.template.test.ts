import { describe, expect, it } from "vitest";

import {
	incidentOpenedTemplate,
	incidentResolvedTemplate,
} from "../../src/templates/incident-email.template";

const startedAt = new Date("2026-01-01T10:00:00.000Z");
const resolvedAt = new Date("2026-01-01T10:05:30.000Z");

const templateInput = {
	monitorName: "Production API",
	monitorUrl: "https://api.example.com",
	incidentId: "incident-123",
	startedAt,
	resolvedAt,
	durationMs: 330_000,
};

describe("incident email templates", () => {
	describe("incidentOpenedTemplate", () => {
		it("generates the incident-opened subject and content", () => {
			const email = incidentOpenedTemplate(templateInput);

			expect(email.subject).toBe("Incident detected: Production API");
			expect(email.text).toContain("Production API");
			expect(email.text).toContain("https://api.example.com");
			expect(email.text).toContain("incident-123");
			expect(email.html).toContain("Production API");
			expect(email.html).toContain("Service outage detected");
		});

		it("escapes HTML-sensitive monitor values", () => {
			const email = incidentOpenedTemplate({
				...templateInput,
				monitorName: '<script>alert("x")</script>',
				monitorUrl: "https://example.com/?a=1&b=2",
			});

			expect(email.html).not.toContain("<script>");
			expect(email.html).toContain("&lt;script&gt;");
			expect(email.html).toContain("&amp;");
		});
	});

	describe("incidentResolvedTemplate", () => {
		it("generates the recovery subject and content", () => {
			const email = incidentResolvedTemplate(templateInput);

			expect(email.subject).toBe("Service recovered: Production API");
			expect(email.text).toContain("Production API");
			expect(email.text).toContain("incident-123");
			expect(email.text).toContain("0h 5m 30s");
			expect(email.html).toContain("Service recovered");
			expect(email.html).toContain("0h 5m 30s");
		});

		it("escapes HTML-sensitive monitor values", () => {
			const email = incidentResolvedTemplate({
				...templateInput,
				monitorName: "<Production & API>",
			});

			expect(email.html).not.toContain("<Production & API>");
			expect(email.html).toContain("&lt;Production &amp; API&gt;");
		});
	});
});
