import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, enqueueNotificationMock, txMock, acquireMonitorLockMock } =
	vi.hoisted(() => {
		const tx = {
			$queryRaw: vi.fn(),
			monitor: {
				findFirst: vi.fn(),
				update: vi.fn(),
			},
			checkResult: {
				create: vi.fn(),
				findMany: vi.fn(),
			},
			incident: {
				findFirst: vi.fn(),
				create: vi.fn(),
				update: vi.fn(),
			},
			user: {
				findUnique: vi.fn(),
			},
			notification: {
				create: vi.fn(),
			},
		};

		return {
			txMock: tx,
			prismaMock: {
				monitor: {
					findUnique: vi.fn(),
				},
				$transaction: vi.fn(),
			},
			enqueueNotificationMock: vi.fn(),
			acquireMonitorLockMock: vi.fn(),
		};
	});
vi.mock("../../src/workers/monitor-lock", () => ({
	acquireMonitorLock: acquireMonitorLockMock,
}));

vi.mock("../../src/config/database", () => ({
	prisma: prismaMock,
}));

vi.mock("../../src/queues/notification.queue", () => ({
	enqueueNotification: enqueueNotificationMock,
}));

import { processMonitorCheck } from "../../src/workers/monitor.processor";

const monitor = {
	id: "monitor-123",
	userId: "user-123",
	name: "Test Website",
	url: "https://example.com",
	method: "GET" as const,
	timeoutMs: 5000,
	intervalSeconds: 60,
	failureThreshold: 2,
	recoveryThreshold: 2,
	status: "UP",
	enabled: true,
	checkGeneration: 1n,
};
acquireMonitorLockMock.mockResolvedValue({
	isLost: () => false,
	assertOwned: vi.fn().mockResolvedValue(true),
	release: vi.fn().mockResolvedValue(undefined),
});

describe("processMonitorCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		prismaMock.monitor.findUnique.mockResolvedValue(monitor);

		prismaMock.$transaction.mockImplementation(
			async (callback: (tx: typeof txMock) => Promise<unknown>) =>
				callback(txMock),
		);

		txMock.$queryRaw
			.mockReset()
			.mockResolvedValueOnce([{ check_generation: 1n }])
			.mockResolvedValueOnce([{ id: monitor.id }]);
		txMock.monitor.findFirst.mockResolvedValue(monitor);
		txMock.monitor.update.mockResolvedValue({});
		txMock.checkResult.create.mockResolvedValue({});
		txMock.checkResult.findMany.mockResolvedValue([{ success: true }]);
		txMock.incident.findFirst.mockResolvedValue(null);
		txMock.incident.create.mockResolvedValue({ id: "incident-123" });
		txMock.incident.update.mockResolvedValue({});
		txMock.user.findUnique.mockResolvedValue({
			email: "test@example.com",
		});
		txMock.notification.create.mockResolvedValue({
			id: "notification-123",
		});

		enqueueNotificationMock.mockResolvedValue(undefined);
	});

	it("marks a monitor UP after a successful check", async () => {
		await processMonitorCheck(
			{ monitorId: monitor.id },
			vi.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				latencyMs: 120,
				errorMessage: null,
			}),
		);

		expect(txMock.checkResult.create).toHaveBeenCalled();

		expect(txMock.monitor.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: "UP",
				}),
			}),
		);

		expect(txMock.incident.create).not.toHaveBeenCalled();
	});

	it("creates an incident when the failure threshold is reached", async () => {
		txMock.monitor.findFirst.mockResolvedValue({
			...monitor,
			status: "UP",
		});

		txMock.checkResult.findMany.mockResolvedValue([
			{ success: false },
			{ success: false },
		]);

		await processMonitorCheck(
			{ monitorId: monitor.id },
			vi.fn().mockResolvedValue({
				success: false,
				statusCode: 500,
				latencyMs: 200,
				errorMessage: "HTTP 500",
			}),
		);

		expect(txMock.monitor.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: "DOWN",
				}),
			}),
		);

		expect(txMock.incident.create).toHaveBeenCalled();

		expect(txMock.notification.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					eventType: "INCIDENT_OPENED",
					status: "PENDING",
				}),
			}),
		);

		expect(enqueueNotificationMock).toHaveBeenCalledWith(
			"notification-123",
		);
	});

	it("does not resolve an incident before the recovery threshold is reached", async () => {
		txMock.monitor.findFirst.mockResolvedValue({
			...monitor,
			status: "DOWN",
			recoveryThreshold: 2,
		});

		txMock.checkResult.findMany.mockResolvedValue([{ success: true }]);

		txMock.incident.findFirst.mockResolvedValue({
			id: "incident-123",
			status: "OPEN",
		});

		await processMonitorCheck(
			{ monitorId: monitor.id },
			vi.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				latencyMs: 100,
				errorMessage: null,
			}),
		);

		expect(txMock.monitor.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: "DOWN",
				}),
			}),
		);

		expect(txMock.incident.update).not.toHaveBeenCalled();
		expect(txMock.notification.create).not.toHaveBeenCalled();
		expect(enqueueNotificationMock).not.toHaveBeenCalled();
	});
	it("resolves an incident when a DOWN monitor recovers", async () => {
		const downMonitor = {
			...monitor,
			status: "DOWN",
		};

		txMock.monitor.findFirst.mockResolvedValue(downMonitor);

		txMock.checkResult.findMany.mockResolvedValue([
			{ success: true },
			{ success: true },
		]);

		txMock.incident.findFirst.mockResolvedValue({
			id: "incident-123",
			status: "OPEN",
		});

		await processMonitorCheck(
			{ monitorId: monitor.id },
			vi.fn().mockResolvedValue({
				success: true,
				statusCode: 200,
				latencyMs: 100,
				errorMessage: null,
			}),
		);

		expect(txMock.monitor.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: "UP",
				}),
			}),
		);

		expect(txMock.incident.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "incident-123" },
				data: expect.objectContaining({
					status: "RESOLVED",
				}),
			}),
		);

		expect(txMock.notification.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					eventType: "INCIDENT_RESOLVED",
					status: "PENDING",
				}),
			}),
		);

		expect(enqueueNotificationMock).toHaveBeenCalledWith(
			"notification-123",
		);
	});

	it("increments the existing incident failure count without creating a duplicate", async () => {
		txMock.monitor.findFirst.mockResolvedValue(monitor);

		txMock.checkResult.findMany.mockResolvedValue([
			{ success: false },
			{ success: false },
		]);

		txMock.incident.findFirst.mockResolvedValue({
			id: "incident-123",
			status: "OPEN",
			failureCount: 2,
		});

		await processMonitorCheck(
			{ monitorId: monitor.id },
			vi.fn().mockResolvedValue({
				success: false,
				statusCode: 500,
				latencyMs: 200,
				errorMessage: "HTTP 500",
			}),
		);

		expect(txMock.incident.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "incident-123" },
				data: {
					failureCount: {
						increment: 1,
					},
				},
			}),
		);

		expect(txMock.incident.create).not.toHaveBeenCalled();
	});

	it("skips a check when another worker already holds the monitor lock", async () => {
		acquireMonitorLockMock.mockResolvedValueOnce(null);

		const checkHttp = vi.fn();

		await processMonitorCheck({ monitorId: monitor.id }, checkHttp);

		expect(checkHttp).not.toHaveBeenCalled();
		expect(prismaMock.monitor.findUnique).not.toHaveBeenCalled();
		expect(txMock.checkResult.create).not.toHaveBeenCalled();
		expect(txMock.monitor.update).not.toHaveBeenCalled();
	});
	it("discards a result when a newer check generation exists", async () => {
		txMock.$queryRaw
			.mockReset()
			.mockResolvedValueOnce([{ check_generation: 1n }])
			.mockResolvedValueOnce([{ id: monitor.id }]);

		txMock.monitor.findFirst.mockResolvedValueOnce({
			...monitor,
			checkGeneration: 2n,
		});

		const checkHttp = vi.fn().mockResolvedValue({
			success: true,
			statusCode: 200,
			latencyMs: 100,
			errorMessage: null,
		});

		await processMonitorCheck({ monitorId: monitor.id }, checkHttp);

		expect(checkHttp).toHaveBeenCalledOnce();

		// The stale result must not enter check history.
		expect(txMock.checkResult.create).not.toHaveBeenCalled();

		// It must not change monitor state or incidents.
		expect(txMock.monitor.update).not.toHaveBeenCalled();
		expect(txMock.incident.create).not.toHaveBeenCalled();
		expect(txMock.incident.update).not.toHaveBeenCalled();

		// It must not create or enqueue notifications.
		expect(txMock.notification.create).not.toHaveBeenCalled();
		expect(enqueueNotificationMock).not.toHaveBeenCalled();
	});
	it("does not create an incident from a stale failed check", async () => {
		txMock.$queryRaw
			.mockReset()
			.mockResolvedValueOnce([{ check_generation: 1n }])
			.mockResolvedValueOnce([{ id: monitor.id }]);

		txMock.monitor.findFirst.mockResolvedValueOnce({
			...monitor,
			checkGeneration: 2n,
			status: "UP",
		});

		const checkHttp = vi.fn().mockResolvedValue({
			success: false,
			statusCode: 500,
			latencyMs: 200,
			errorMessage: "HTTP 500",
		});

		await processMonitorCheck({ monitorId: monitor.id }, checkHttp);

		expect(txMock.checkResult.create).not.toHaveBeenCalled();
		expect(txMock.monitor.update).not.toHaveBeenCalled();
		expect(txMock.incident.create).not.toHaveBeenCalled();
		expect(txMock.incident.update).not.toHaveBeenCalled();
		expect(txMock.notification.create).not.toHaveBeenCalled();
		expect(enqueueNotificationMock).not.toHaveBeenCalled();
	});

	it("does not resolve an incident from a stale successful check", async () => {
		txMock.$queryRaw
			.mockReset()
			.mockResolvedValueOnce([{ check_generation: 1n }])
			.mockResolvedValueOnce([{ id: monitor.id }]);

		txMock.monitor.findFirst.mockResolvedValueOnce({
			...monitor,
			checkGeneration: 2n,
			status: "DOWN",
		});

		txMock.incident.findFirst.mockResolvedValueOnce({
			id: "incident-123",
			status: "OPEN",
		});

		const checkHttp = vi.fn().mockResolvedValue({
			success: true,
			statusCode: 200,
			latencyMs: 100,
			errorMessage: null,
		});

		await processMonitorCheck({ monitorId: monitor.id }, checkHttp);

		expect(txMock.checkResult.create).not.toHaveBeenCalled();
		expect(txMock.monitor.update).not.toHaveBeenCalled();
		expect(txMock.incident.update).not.toHaveBeenCalled();
		expect(txMock.notification.create).not.toHaveBeenCalled();
		expect(enqueueNotificationMock).not.toHaveBeenCalled();
	});

	it("discards the HTTP result when the lock is lost during the check", async () => {
		const assertOwnedMock = vi
			.fn()
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(false);

		const releaseMock = vi.fn().mockResolvedValue(undefined);

		acquireMonitorLockMock.mockResolvedValueOnce({
			isLost: () => true,
			assertOwned: assertOwnedMock,
			release: releaseMock,
		});

		const checkHttp = vi.fn().mockResolvedValue({
			success: true,
			statusCode: 200,
			latencyMs: 100,
			errorMessage: null,
		});

		await processMonitorCheck({ monitorId: monitor.id }, checkHttp);

		expect(checkHttp).toHaveBeenCalledOnce();
		expect(assertOwnedMock).toHaveBeenCalledTimes(2);
		expect(txMock.checkResult.create).not.toHaveBeenCalled();
		expect(txMock.monitor.update).not.toHaveBeenCalled();
		expect(txMock.incident.create).not.toHaveBeenCalled();
		expect(releaseMock).toHaveBeenCalledOnce();
	});

	it("logs a lock release failure without failing the processor", async () => {
		const releaseMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("Redis unavailable"));

		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		acquireMonitorLockMock.mockResolvedValueOnce({
			isLost: () => false,
			assertOwned: vi.fn().mockResolvedValue(true),
			release: releaseMock,
		});

		const checkHttp = vi.fn().mockResolvedValue({
			success: true,
			statusCode: 200,
			latencyMs: 100,
			errorMessage: null,
		});

		await expect(
			processMonitorCheck({ monitorId: monitor.id }, checkHttp),
		).resolves.toBeUndefined();

		expect(releaseMock).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			`[Monitor] Failed to release lock for monitor ${monitor.id}:`,
			expect.any(Error),
		);

		expect(txMock.checkResult.create).toHaveBeenCalledOnce();

		errorSpy.mockRestore();
	});

	it("prevents simultaneous executions from processing the same monitor", async () => {
		let signalHttpStarted!: () => void;
		let finishHttpCheck!: (result: {
			success: boolean;
			statusCode: number;
			latencyMs: number;
			errorMessage: string | null;
		}) => void;

		const httpStarted = new Promise<void>((resolve) => {
			signalHttpStarted = resolve;
		});

		const httpGate = new Promise<{
			success: boolean;
			statusCode: number;
			latencyMs: number;
			errorMessage: string | null;
		}>((resolve) => {
			finishHttpCheck = resolve;
		});

		const releaseMock = vi.fn().mockResolvedValue(undefined);

		acquireMonitorLockMock
			.mockResolvedValueOnce({
				isLost: () => false,
				assertOwned: vi.fn().mockResolvedValue(true),
				release: releaseMock,
			})
			.mockResolvedValueOnce(null);

		const firstHttpCheck = vi.fn(() => {
			signalHttpStarted();
			return httpGate;
		});

		const secondHttpCheck = vi.fn();

		// Start the first execution and hold it during its HTTP check.
		const firstExecution = processMonitorCheck(
			{ monitorId: monitor.id },
			firstHttpCheck,
		);

		await httpStarted;

		// The second execution must be rejected while the first holds the lock.
		await processMonitorCheck({ monitorId: monitor.id }, secondHttpCheck);

		expect(secondHttpCheck).not.toHaveBeenCalled();
		expect(txMock.checkResult.create).not.toHaveBeenCalled();

		// Allow the first execution to finish.
		finishHttpCheck({
			success: true,
			statusCode: 200,
			latencyMs: 100,
			errorMessage: null,
		});

		await firstExecution;

		expect(firstHttpCheck).toHaveBeenCalledOnce();
		expect(secondHttpCheck).not.toHaveBeenCalled();
		expect(txMock.checkResult.create).toHaveBeenCalledOnce();
		expect(txMock.monitor.update).toHaveBeenCalledOnce();
		expect(releaseMock).toHaveBeenCalledOnce();
	});
});
