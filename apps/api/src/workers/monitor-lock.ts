import { randomUUID } from "node:crypto";
import { redisClient } from "../config/redis";

const LOCK_TTL_MS = 30_000;
const LOCK_RENEW_INTERVAL_MS = 10_000;

const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;

const RENEW_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
  end
  return 0
`;

export async function acquireMonitorLock(monitorId: string) {
	const lockKey = `pulsewatch:monitor-lock:${monitorId}`;
	const lockToken = randomUUID();

	const acquired = await redisClient.set(
		lockKey,
		lockToken,
		"PX",
		LOCK_TTL_MS,
		"NX",
	);

	if (acquired !== "OK") {
		return null;
	}

	let released = false;
	let lost = false;

	const renewalTimer = setInterval(async () => {
		if (released || lost) return;

		try {
			const renewed = await redisClient.eval(
				RENEW_LOCK_SCRIPT,
				1,
				lockKey,
				lockToken,
				String(LOCK_TTL_MS),
			);

			if (renewed !== 1) {
				lost = true;
			}
		} catch {
			lost = true;
		}
	}, LOCK_RENEW_INTERVAL_MS);

	renewalTimer.unref();

	return {
		isLost: () => lost,

		assertOwned: async () => {
			if (lost || released) {
				return false;
			}

			try {
				const currentToken = await redisClient.get(lockKey);

				if (currentToken !== lockToken) {
					lost = true;
					return false;
				}

				return true;
			} catch {
				lost = true;
				return false;
			}
		},

		release: async () => {
			if (released) return;

			released = true;
			clearInterval(renewalTimer);

			await redisClient.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockToken);
		},
	};
}
