import Redis, { type RedisOptions } from "ioredis";

declare global {
  var __coursematesRedis: Redis | undefined;
}

export function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6380";
}

/**
 * ioredis options parsed from REDIS_URL (rediss:// turns TLS on), for the BullMQ workers: their blocking
 * connections must keep a command queued until Redis comes back, so they never give up on one.
 */
export function redisOptions(url: string = redisUrl()): RedisOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

/**
 * For Redis calls made while a request waits (rate limits, the health check, queueing a reminder): when
 * Redis is down or stops answering, a command fails within a second instead of waiting for it to return.
 */
export function failFastRedisOptions(url: string = redisUrl()): RedisOptions {
  return { ...redisOptions(url), maxRetriesPerRequest: 1, commandTimeout: 1_000 };
}

/** Shared client for rate limits and the health check; BullMQ opens its own connections. */
export function redis(): Redis {
  if (!globalThis.__coursematesRedis) {
    globalThis.__coursematesRedis = new Redis(failFastRedisOptions());
  }
  return globalThis.__coursematesRedis;
}
