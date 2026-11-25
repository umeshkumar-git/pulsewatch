import Redis from "ioredis";
import type { ConnectionOptions } from "bullmq";

import { env } from "./env";

const redisUrl = new URL(env.REDIS_URL);

export const redisConnection: ConnectionOptions = {
	host: redisUrl.hostname,
	port: Number(redisUrl.port || 6379),

	username: redisUrl.username
		? decodeURIComponent(redisUrl.username)
		: undefined,

	password: redisUrl.password
		? decodeURIComponent(redisUrl.password)
		: undefined,

	db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,

	maxRetriesPerRequest: null,

	...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
};
export const redisClient = new Redis(redisConnection);
