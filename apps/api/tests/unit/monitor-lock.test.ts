import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const redisMock = vi.hoisted(() => ({
	set: vi.fn(),
	eval: vi.fn(),
	get: vi.fn(),
}));

vi.mock("../../src/config/redis", () => ({
	redisClient: redisMock,
}));

vi.mock("node:crypto", () => ({
	randomUUID: vi.fn(() => "test-lock-token"),
}));

import { acquireMonitorLock } from "../../src/workers/monitor-lock";

describe("acquireMonitorLock", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		redisMock.set.mockResolvedValue("OK");
		redisMock.eval.mockResolvedValue(1);
		redisMock.get.mockResolvedValue("test-lock-token");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("acquires a lock using an atomic Redis SET", async () => {
		const lock = await acquireMonitorLock("monitor-1");

		expect(lock).not.toBeNull();
		expect(redisMock.set).toHaveBeenCalledWith(
			"pulsewatch:monitor-lock:monitor-1",
			"test-lock-token",
			"PX",
			30_000,
			"NX",
		);
	});

	it("returns null when another worker already owns the lock", async () => {
		redisMock.set.mockResolvedValue(null);

		const lock = await acquireMonitorLock("monitor-1");

		expect(lock).toBeNull();
	});

	it("renews the lock periodically", async () => {
		await acquireMonitorLock("monitor-1");

		await vi.advanceTimersByTimeAsync(10_000);

		expect(redisMock.eval).toHaveBeenCalledWith(
			expect.stringContaining("PEXPIRE"),
			1,
			"pulsewatch:monitor-lock:monitor-1",
			"test-lock-token",
			"30000",
		);
	});

	it("confirms ownership when the token matches", async () => {
		const lock = await acquireMonitorLock("monitor-1");

		await expect(lock!.assertOwned()).resolves.toBe(true);
		expect(lock!.isLost()).toBe(false);
	});

	it("marks the lock as lost when another worker owns it", async () => {
		redisMock.get.mockResolvedValue("different-token");

		const lock = await acquireMonitorLock("monitor-1");

		await expect(lock!.assertOwned()).resolves.toBe(false);
		expect(lock!.isLost()).toBe(true);
	});

	it("releases the lock using the token-safe Lua script", async () => {
		const lock = await acquireMonitorLock("monitor-1");

		await lock!.release();

		expect(redisMock.eval).toHaveBeenCalledWith(
			expect.stringContaining("redis.call"),
			1,
			"pulsewatch:monitor-lock:monitor-1",
			"test-lock-token",
		);
	});

	it("does not release the same lock twice", async () => {
		const lock = await acquireMonitorLock("monitor-1");

		await lock!.release();
		redisMock.eval.mockClear();

		await lock!.release();

		expect(redisMock.eval).not.toHaveBeenCalled();
	});

	it("marks the lock as lost when renewal fails", async () => {
		const lock = await acquireMonitorLock("monitor-1");

		redisMock.eval.mockRejectedValueOnce(new Error("Redis unavailable"));

		await vi.advanceTimersByTimeAsync(10_000);

		expect(lock!.isLost()).toBe(true);
	});

	it("marks the lock as lost when ownership verification fails", async () => {
		const lock = await acquireMonitorLock("monitor-1");

		redisMock.get.mockRejectedValueOnce(new Error("Redis unavailable"));

		await expect(lock!.assertOwned()).resolves.toBe(false);
		expect(lock!.isLost()).toBe(true);
	});

	it("does not renew a lock after it has been released", async () => {
		const lock = await acquireMonitorLock("monitor-1");

		await lock!.release();
		redisMock.eval.mockClear();

		await vi.advanceTimersByTimeAsync(10_000);

		expect(redisMock.eval).not.toHaveBeenCalled();
	});
});
