import { afterEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";

import { validateMonitorUrl } from "../../src/modules/monitors/monitor-url";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);

describe("validateMonitorUrl", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid URLs", async () => {
    await expect(validateMonitorUrl("not-a-url"))
      .rejects.toThrow("INVALID_MONITOR_URL");
  });

  it("rejects unsupported protocols", async () => {
    await expect(validateMonitorUrl("ftp://example.com"))
      .rejects.toThrow("UNSUPPORTED_URL_PROTOCOL");
  });

  it("rejects URLs containing credentials", async () => {
    await expect(
      validateMonitorUrl("https://user:password@example.com"),
    ).rejects.toThrow("URL_CREDENTIALS_NOT_ALLOWED");
  });

  it("rejects localhost", async () => {
    await expect(validateMonitorUrl("http://localhost"))
      .rejects.toThrow("PRIVATE_HOST_NOT_ALLOWED");
  });

  it.each([
    "http://service.local",
    "http://service.internal",
    "http://service.localhost",
  ])("rejects blocked hostname %s", async (url) => {
    await expect(validateMonitorUrl(url))
      .rejects.toThrow("PRIVATE_HOST_NOT_ALLOWED");
  });

  it.each([
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://192.168.1.1",
    "http://169.254.1.1",
  ])("rejects private or reserved IP %s", async (url) => {
    await expect(validateMonitorUrl(url))
      .rejects.toThrow("PRIVATE_IP_NOT_ALLOWED");
  });

  it("accepts a public IPv4 address", async () => {
    const result = await validateMonitorUrl("https://8.8.8.8");

    expect(result).toBe("https://8.8.8.8/");
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("accepts a hostname resolving to a public IP", async () => {
    mockedLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);

    const result = await validateMonitorUrl("https://example.com");

    expect(result).toBe("https://example.com/");
    expect(mockedLookup).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true,
    });
  });

  it("rejects a hostname resolving to a private IP", async () => {
    mockedLookup.mockResolvedValue([
      { address: "192.168.1.10", family: 4 },
    ]);

    await expect(validateMonitorUrl("https://example.com"))
      .rejects.toThrow("PRIVATE_IP_NOT_ALLOWED");
  });

  it("rejects a hostname when DNS returns mixed public and private IPs", async () => {
    mockedLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    await expect(validateMonitorUrl("https://example.com"))
      .rejects.toThrow("PRIVATE_IP_NOT_ALLOWED");
  });

  it("rejects DNS lookup failures", async () => {
    mockedLookup.mockRejectedValue(new Error("DNS unavailable"));

    await expect(validateMonitorUrl("https://example.com"))
      .rejects.toThrow("DNS_RESOLUTION_FAILED");
  });

  it("rejects empty DNS results", async () => {
    mockedLookup.mockResolvedValue([]);

    await expect(validateMonitorUrl("https://example.com"))
      .rejects.toThrow("DNS_RESOLUTION_FAILED");
  });
});
