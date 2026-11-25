
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { redisClient } from "../../src/config/redis";
import { acquireMonitorLock } from "../../src/workers/monitor-lock";

const testIds: string[] = [];

function createMonitorId() {
  const id = `redis-test-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  testIds.push(id);
  return id;
}

function lockKey(monitorId: string) {
  return `pulsewatch:monitor-lock:${monitorId}`;
}

describe("Monitor lock - real Redis tests", () => {
  beforeAll(async () => {
    const response = await redisClient.ping();
    expect(response).toBe("PONG");
  });

  afterEach(async () => {
    for (const id of testIds.splice(0)) {
      await redisClient.del(lockKey(id));
    }
  });

  afterAll(async () => {
    // Do not quit redisClient: it is shared with the API.
  });

  it("allows only one worker to acquire a monitor lock", async () => {
    const id = createMonitorId();

    const firstLock = await acquireMonitorLock(id);
    expect(firstLock).not.toBeNull();

    const secondLock = await acquireMonitorLock(id);
    expect(secondLock).toBeNull();

    await firstLock!.release();

    const thirdLock = await acquireMonitorLock(id);
    expect(thirdLock).not.toBeNull();

    await thirdLock!.release();
  });

  it("confirms ownership while the lock is held", async () => {
    const id = createMonitorId();

    const lock = await acquireMonitorLock(id);
    expect(lock).not.toBeNull();

    expect(await lock!.assertOwned()).toBe(true);
    expect(lock!.isLost()).toBe(false);

    await lock!.release();
  });

  it("does not delete another worker's lock during release", async () => {
    const id = createMonitorId();
    const key = lockKey(id);

    const lock = await acquireMonitorLock(id);
    expect(lock).not.toBeNull();

    await redisClient.set(key, "replacement-worker-token", "PX", 30000);

    await lock!.release();

    expect(await redisClient.get(key)).toBe(
      "replacement-worker-token",
    );
  });

  it("detects when the lock is replaced by another worker", async () => {
    const id = createMonitorId();
    const key = lockKey(id);

    const lock = await acquireMonitorLock(id);
    expect(lock).not.toBeNull();

    await redisClient.set(key, "replacement-worker-token", "PX", 30000);

    expect(await lock!.assertOwned()).toBe(false);
    expect(lock!.isLost()).toBe(true);

    await lock!.release();
  });

  it(
    "renews the lock before its original expiration",
    async () => {
      const id = createMonitorId();
      const key = lockKey(id);

      const lock = await acquireMonitorLock(id);
      expect(lock).not.toBeNull();

      const initialTtl = await redisClient.pttl(key);
      expect(initialTtl).toBeGreaterThan(0);
      expect(initialTtl).toBeLessThanOrEqual(30000);

      // Wait for the real 10-second renewal interval.
      await new Promise((resolve) => setTimeout(resolve, 11000));

      expect(await lock!.assertOwned()).toBe(true);

      const renewedTtl = await redisClient.pttl(key);

      expect(renewedTtl).toBeGreaterThan(20000);
      expect(lock!.isLost()).toBe(false);

      await lock!.release();
    },
    20000,
  );
});

