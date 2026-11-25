export type MonitorStatus =
        | "UNKNOWN"
        | "UP"
        | "DOWN"
        | "PAUSED";

interface MonitorStateInput {
        currentStatus: MonitorStatus;
        failureThreshold: number;
        recoveryThreshold: number;

        // Ordered newest first. Must include the current check.
        recentResults: boolean[];
}

interface MonitorStateOutput {
        nextStatus: MonitorStatus;
        consecutiveCount: number;
}

export function evaluateMonitorState(
        input: MonitorStateInput,
): MonitorStateOutput {
        const {
                currentStatus,
                failureThreshold,
                recoveryThreshold,
                recentResults,
        } = input;

        if (
                !Number.isInteger(failureThreshold) ||
                failureThreshold < 1 ||
                !Number.isInteger(recoveryThreshold) ||
                recoveryThreshold < 1
        ) {
                throw new Error("Monitor thresholds must be positive integers");
        }

        if (currentStatus === "PAUSED") {
                return {
                        nextStatus: "PAUSED",
                        consecutiveCount: 0,
                };
        }

        const latestResult = recentResults[0];

        if (latestResult === undefined) {
                throw new Error("At least one check result is required");
        }

        const firstDifferentResult = recentResults.findIndex(
                (success) => success !== latestResult,
        );

        const consecutiveCount =
                firstDifferentResult === -1
                        ? recentResults.length
                        : firstDifferentResult;

        let nextStatus = currentStatus;

        if (latestResult) {
                if (currentStatus === "DOWN") {
                        if (consecutiveCount >= recoveryThreshold) {
                                nextStatus = "UP";
                        }
                } else {
                        nextStatus = "UP";
                }
        } else if (consecutiveCount >= failureThreshold) {
                nextStatus = "DOWN";
        }

        return {
                nextStatus,
                consecutiveCount,
        };
}
