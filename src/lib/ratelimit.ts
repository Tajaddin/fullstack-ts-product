import type Redis from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the window resets (what Retry-After is derived from). */
  resetMs: number;
}

// Fixed window: INCR a key, set its expiry on first use, read the remaining TTL. One round trip, atomic in
// Lua, and the same answer from every web instance that shares the Redis.
const SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export class RateLimiter {
  private sha: string | undefined;

  constructor(
    private readonly client: Redis,
    private readonly prefix = "rl",
  ) {}

  async hit(scope: string, subject: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const key = `${this.prefix}:${scope}:${subject}`;
    const [count, ttl] = await this.eval(key, windowMs);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetMs: Math.max(0, ttl),
    };
  }

  private async eval(key: string, windowMs: number): Promise<[number, number]> {
    try {
      if (!this.sha) this.sha = (await this.client.script("LOAD", SCRIPT)) as string;
      return (await this.client.evalsha(this.sha, 1, key, String(windowMs))) as [number, number];
    } catch (err) {
      // Scripts are flushed when Redis restarts; reload once and retry.
      if (err instanceof Error && err.message.includes("NOSCRIPT")) {
        this.sha = (await this.client.script("LOAD", SCRIPT)) as string;
        return (await this.client.evalsha(this.sha, 1, key, String(windowMs))) as [number, number];
      }
      throw err;
    }
  }
}

export function retryAfterSeconds(result: RateLimitResult): number {
  return Math.max(1, Math.ceil(result.resetMs / 1000));
}
