import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateManyMock } = vi.hoisted(() => ({
        updateManyMock: vi.fn(),
}));

vi.mock("../../src/config/database", () => ({
        prisma: {
                notification: {
                        updateMany: updateManyMock,
                },
        },
}));

import { handleNotificationFailure } from "../../src/workers/notification-failure.handler";

describe("handleNotificationFailure", () => {
        beforeEach(() => {
                updateManyMock.mockReset();
                updateManyMock.mockResolvedValue({ count: 1 });
        });

        it("marks a known pre-delivery network error PENDING when attempts remain", async () => {
                const error = Object.assign(new Error("Connection reset"), {
                        code: "ECONNRESET",
                        command: "EHLO",
                });

                await expect(
                        handleNotificationFailure("notification-1", error, 0, 5),
                ).rejects.toBe(error);

                expect(updateManyMock).toHaveBeenCalledWith({
                        where: {
                                id: "notification-1",
                                status: "SENDING",
                        },
                        data: {
                                status: "PENDING",
                                errorMessage: "Connection reset",
                        },
                });
        });

        it("marks a retryable error FAILED when attempts are exhausted", async () => {
                const error = Object.assign(new Error("Temporary SMTP failure"), {
                        responseCode: 451,
                });

                await expect(
                        handleNotificationFailure("notification-2", error, 4, 5),
                ).resolves.toBeUndefined();

                expect(updateManyMock).toHaveBeenCalledWith(
                        expect.objectContaining({
                                where: {
                                        id: "notification-2",
                                        status: "SENDING",
                                },
                                data: {
                                        status: "FAILED",
                                        errorMessage: "Temporary SMTP failure",
                                },
                        }),
                );
        });

        it("marks missing SMTP configuration as FAILED", async () => {
                const error = new Error("SMTP_CONFIGURATION_MISSING");

                await expect(
                        handleNotificationFailure("notification-3", error, 0, 5),
                ).resolves.toBeUndefined();

                expect(updateManyMock).toHaveBeenCalledWith(
                        expect.objectContaining({
                                data: {
                                        status: "FAILED",
                                        errorMessage: "SMTP_CONFIGURATION_MISSING",
                                },
                        }),
                );
        });

        it("marks SMTP authentication errors as FAILED", async () => {
                const error = Object.assign(new Error("Authentication failed"), {
                        code: "EAUTH",
                });

                await expect(
                        handleNotificationFailure("notification-4", error, 0, 5),
                ).resolves.toBeUndefined();

                expect(updateManyMock).toHaveBeenCalledWith(
                        expect.objectContaining({
                                data: {
                                        status: "FAILED",
                                        errorMessage: "Authentication failed",
                                },
                        }),
                );
        });

        it("marks ambiguous delivery outcomes as DELIVERY_UNKNOWN without retrying", async () => {
                const error = Object.assign(new Error("Connection timed out"), {
                        code: "ETIMEDOUT",
                });

                await expect(
                        handleNotificationFailure("notification-5", error, 0, 5),
                ).resolves.toBeUndefined();

                expect(updateManyMock).toHaveBeenCalledWith({
                        where: {
                                id: "notification-5",
                                status: "SENDING",
                        },
                        data: {
                                status: "DELIVERY_UNKNOWN",
                                errorMessage: "Connection timed out",
                        },
                });
        });

        it("marks DATA-stage connection failures as DELIVERY_UNKNOWN", async () => {
                const error = Object.assign(new Error("Connection reset"), {
                        code: "ECONNRESET",
                        command: "DATA",
                });

                await expect(
                        handleNotificationFailure("notification-6", error, 0, 5),
                ).resolves.toBeUndefined();

                expect(updateManyMock).toHaveBeenCalledWith(
                        expect.objectContaining({
                                data: {
                                        status: "DELIVERY_UNKNOWN",
                                        errorMessage: "Connection reset",
                                },
                        }),
                );
        });

        it("limits stored error messages to 500 characters", async () => {
                const error = Object.assign(new Error("x".repeat(600)), {
                        code: "ECONNRESET",
                        command: "EHLO",
                });

                await expect(
                        handleNotificationFailure("notification-7", error, 0, 5),
                ).rejects.toBe(error);

                expect(updateManyMock).toHaveBeenCalledWith(
                        expect.objectContaining({
                                data: {
                                        status: "PENDING",
                                        errorMessage: "x".repeat(500),
                                },
                        }),
                );
        });

        it("uses a fallback message for non-Error failures and marks them unknown", async () => {
                await expect(
                        handleNotificationFailure(
                                "notification-8",
                                "unexpected failure",
                                0,
                                5,
                        ),
                ).resolves.toBeUndefined();

                expect(updateManyMock).toHaveBeenCalledWith(
                        expect.objectContaining({
                                data: {
                                        status: "DELIVERY_UNKNOWN",
                                        errorMessage: "Email delivery failed",
                                },
                        }),
                );
        });

        it("does not overwrite a notification that is no longer SENDING", async () => {
                updateManyMock.mockResolvedValueOnce({ count: 0 });

                await expect(
                        handleNotificationFailure(
                                "notification-9",
                                new Error("SMTP_CONFIGURATION_MISSING"),
                                0,
                                5,
                        ),
                ).resolves.toBeUndefined();

                expect(updateManyMock).toHaveBeenCalledWith(
                        expect.objectContaining({
                                where: {
                                        id: "notification-9",
                                        status: "SENDING",
                                },
                        }),
                );
        });
});