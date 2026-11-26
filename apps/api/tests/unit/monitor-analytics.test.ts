import { describe, it, expect } from "vitest";

import { calculateLatencyStatistics } from "../../src/modules/monitors/monitor-analytics";

describe("Monitor latency analytics", () => {
        it("returns null statistics when there are no samples", () => {
                expect(calculateLatencyStatistics([])).toEqual({
                        sampleCount: 0,
                        averageMs: null,
                        minMs: null,
                        maxMs: null,
                        p50Ms: null,
                        p95Ms: null,
                        p99Ms: null,
                });
        });

        it("calculates statistics from unsorted latency values", () => {
                expect(calculateLatencyStatistics([50, 10, 30, 20, 40])).toEqual({
                        sampleCount: 5,
                        averageMs: 30,
                        minMs: 10,
                        maxMs: 50,
                        p50Ms: 30,
                        p95Ms: 50,
                        p99Ms: 50,
                });
        });

        it("uses nearest-rank percentiles for larger samples", () => {
                const values = Array.from({ length: 100 }, (_, index) => index + 1);

                const result = calculateLatencyStatistics(values);

                expect(result.p50Ms).toBe(50);
                expect(result.p95Ms).toBe(95);
                expect(result.p99Ms).toBe(99);
        });

        it("ignores negative and non-finite latency values", () => {
                const result = calculateLatencyStatistics([
                        10,
                        -5,
                        Number.NaN,
                        Number.POSITIVE_INFINITY,
                        20,
                ]);

                expect(result.sampleCount).toBe(2);
                expect(result.averageMs).toBe(15);
                expect(result.minMs).toBe(10);
                expect(result.maxMs).toBe(20);
        });

        it("handles a single latency sample", () => {
                const result = calculateLatencyStatistics([42]);

                expect(result.p50Ms).toBe(42);
                expect(result.p95Ms).toBe(42);
                expect(result.p99Ms).toBe(42);
        });
});
