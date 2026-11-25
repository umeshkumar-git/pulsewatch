import { describe, it, expect } from "vitest";
import { evaluateMonitorState } from "../../src/workers/monitor-state";

describe("evaluateMonitorState", () => {
        it("changes UNKNOWN to UP after a successful check", () => {
                expect(
                        evaluateMonitorState({
                                currentStatus: "UNKNOWN",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [true],
                        }),
                ).toEqual({
                        nextStatus: "UP",
                        consecutiveCount: 1,
                });
        });

        it("does not mark UP monitor DOWN before failure threshold", () => {
                expect(
                        evaluateMonitorState({
                                currentStatus: "UP",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [false, false],
                        }).nextStatus,
                ).toBe("UP");
        });

        it("marks UP monitor DOWN when failure threshold is reached", () => {
                expect(
                        evaluateMonitorState({
                                currentStatus: "UP",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [false, false, false],
                        }),
                ).toEqual({
                        nextStatus: "DOWN",
                        consecutiveCount: 3,
                });
        });

        it("does not recover DOWN monitor before recovery threshold", () => {
                expect(
                        evaluateMonitorState({
                                currentStatus: "DOWN",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [true],
                        }).nextStatus,
                ).toBe("DOWN");
        });

        it("recovers DOWN monitor when recovery threshold is reached", () => {
                expect(
                        evaluateMonitorState({
                                currentStatus: "DOWN",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [true, true],
                        }),
                ).toEqual({
                        nextStatus: "UP",
                        consecutiveCount: 2,
                });
        });

        it("resets the consecutive count when results change", () => {
                expect(
                        evaluateMonitorState({
                                currentStatus: "UP",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [false, false, true],
                        }),
                ).toEqual({
                        nextStatus: "UP",
                        consecutiveCount: 2,
                });
        });

        it("keeps PAUSED monitors paused", () => {
                expect(
                        evaluateMonitorState({
                                currentStatus: "PAUSED",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [false, false, false],
                        }),
                ).toEqual({
                        nextStatus: "PAUSED",
                        consecutiveCount: 0,
                });
        });

        it("rejects invalid thresholds", () => {
                expect(() =>
                        evaluateMonitorState({
                                currentStatus: "UP",
                                failureThreshold: 0,
                                recoveryThreshold: 2,
                                recentResults: [false],
                        }),
                ).toThrow("Monitor thresholds must be positive integers");
        });

        it("rejects empty results for an active monitor", () => {
                expect(() =>
                        evaluateMonitorState({
                                currentStatus: "UP",
                                failureThreshold: 3,
                                recoveryThreshold: 2,
                                recentResults: [],
                        }),
                ).toThrow("At least one check result is required");
        });
});
