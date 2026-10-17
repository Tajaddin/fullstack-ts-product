import Redis, { type RedisOptions } from "ioredis";

declare global {
  var __coursematesRedis: Redis | undefined;
}

export function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6380";
}

/** ioredis options parsed from REDIS_URL (rediss:// turns TLS on). */
export function redisOptions(url: string = redisUrl()): RedisOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    // BullMQ requires these on the connections it blocks on; harmless for everything else.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

/** Shared client for rate limits and small lookups; BullMQ gets its own connections from redisOptions(). */
export function redis(): Redis {
  if (!globalThis.__coursematesRedis) {
    globalThis.__coursematesRedis = new Redis(redisOptions());
  }
  return globalThis.__coursematesRedis;
}
