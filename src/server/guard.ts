import "server-only";
import { env } from "@/lib/env";
import { metrics } from "@/lib/metrics";
import { RateLimiter } from "@/lib/ratelimit";
import { HttpError } from "@/lib/rbac";
import { redis } from "@/lib/redis";
import { requireUser } from "./session";
import type { CurrentUser } from "./users";

let limiter: RateLimiter | undefined;

/** Server actions call this first: a signed-in user who is under the per-user mutation limit. */
export async function guardMutation(): Promise<CurrentUser> {
  const user = await requireUser();
  limiter ??= new RateLimiter(redis());
  const result = await limiter.hit("mutation", user.id, env().RATE_LIMIT_MUTATIONS_PER_MINUTE, 60_000);
  if (!result.allowed) {
    metrics.rateLimited.labels("mutation").inc();
    throw new HttpError(429, "too many changes in a minute, try again shortly", "rate_limited");
  }
  return user;
}
