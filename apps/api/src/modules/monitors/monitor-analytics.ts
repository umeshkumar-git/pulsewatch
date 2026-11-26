export interface LatencyStatistics {
        sampleCount: number;
        averageMs: number | null;
        minMs: number | null;
        maxMs: number | null;
        p50Ms: number | null;
        p95Ms: number | null;
        p99Ms: number | null;
}

function nearestRankPercentile(
        sortedValues: number[],
        percentile: number,
): number | null {
        if (sortedValues.length === 0) {
                return null;
        }

        const rank = Math.ceil((percentile / 100) * sortedValues.length);

        return sortedValues[Math.max(0, rank - 1)];
}

export function calculateLatencyStatistics(
        latencies: number[],
): LatencyStatistics {
        const sortedValues = latencies
                .filter((value) => Number.isFinite(value) && value >= 0)
                .sort((a, b) => a - b);

        const sampleCount = sortedValues.length;

        if (sampleCount === 0) {
                return {
                        sampleCount: 0,
                        averageMs: null,
                        minMs: null,
                        maxMs: null,
                        p50Ms: null,
                        p95Ms: null,
                        p99Ms: null,
                };
        }

        const sum = sortedValues.reduce((total, value) => total + value, 0);

        return {
                sampleCount,
                averageMs: Number((sum / sampleCount).toFixed(2)),
                minMs: sortedValues[0],
                maxMs: sortedValues[sampleCount - 1],
                p50Ms: nearestRankPercentile(sortedValues, 50),
                p95Ms: nearestRankPercentile(sortedValues, 95),
                p99Ms: nearestRankPercentile(sortedValues, 99),
        };
}
