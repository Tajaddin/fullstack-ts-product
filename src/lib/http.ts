import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { env } from "./env";
import { logger } from "./logger";
import { observeRequest, metrics } from "./metrics";
import { RateLimiter, retryAfterSeconds, type RateLimitResult } from "./ratelimit";
import { HttpError, hasRole, forbidden, unauthorized, type SiteRole } from "./rbac";
import { redis } from "./redis";
import { fieldErrors } from "./validation";
import { getCurrentUser } from "@/server/session";
import type { CurrentUser } from "@/server/users";

export interface ApiContext<TBody, TQuery> {
  request: NextRequest;
  requestId: string;
  user: CurrentUser | null;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
}

export interface ApiOptions<TBody, TQuery> {
  /** Route pattern for metrics, never a concrete path. */
  route: string;
  auth?: "none" | "optional" | "required";
  role?: SiteRole;
  /** Mutations are rate limited per user as well as per IP. */
  mutation?: boolean;
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
}

type Handler<TBody, TQuery> = (ctx: ApiContext<TBody, TQuery>) => Promise<Response> | Response;
type RouteContext = { params: Promise<Record<string, string>> };

let limiter: RateLimiter | undefined;

/**
 * The address per-IP rate limits count against. Fly's proxy sets Fly-Client-IP and overwrites any value a
 * client sends; X-Forwarded-For is not used because its first entry is whatever the client wrote. Without
 * Fly in front (local, Compose, CI) requests share one bucket.
 */
export function clientIp(request: NextRequest): string {
  return request.headers.get("fly-client-ip")?.trim() || "local";
}

/** The limiter needs Redis; without it the API fails closed, with a 503 the caller can retry. */
async function rateLimit(log: typeof logger, scope: string, subject: string, limit: number): Promise<RateLimitResult> {
  limiter ??= new RateLimiter(redis());
  try {
    return await limiter.hit(scope, subject, limit, 60_000);
  } catch (err) {
    log.error({ err, scope }, "rate limiter unavailable");
    throw new HttpError(503, "temporarily unavailable, try again shortly", "unavailable");
  }
}

export function problem(status: number, message: string, extra: Record<string, unknown> = {}, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status, headers });
}

/**
 * Wraps a route handler with request ids, rate limiting, authentication, zod parsing, error mapping and
 * metrics. Handlers throw HttpError for expected failures; anything else becomes a logged 500.
 */
export function api<TBody = undefined, TQuery = undefined>(opts: ApiOptions<TBody, TQuery>, handler: Handler<TBody, TQuery>) {
  return async (request: NextRequest, context?: RouteContext): Promise<Response> => {
    const started = Date.now();
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const log = logger.child({ requestId, route: opts.route, method: request.method });
    let status = 500;
    try {
      const cfg = env();
      const perIp = await rateLimit(log, "api", clientIp(request), cfg.RATE_LIMIT_API_PER_MINUTE);
      if (!perIp.allowed) {
        metrics.rateLimited.labels("api").inc();
        status = 429;
        return problem(
          429,
          "too many requests",
          { retryAfterSeconds: retryAfterSeconds(perIp) },
          { "Retry-After": String(retryAfterSeconds(perIp)) },
        );
      }

      let user: CurrentUser | null = null;
      if (opts.auth && opts.auth !== "none") {
        user = await getCurrentUser();
        if (opts.auth === "required" && !user) throw unauthorized();
        if (opts.role && !hasRole(user, opts.role)) throw forbidden();
      }
      if (opts.mutation && user) {
        const perUser = await rateLimit(log, "mutation", user.id, cfg.RATE_LIMIT_MUTATIONS_PER_MINUTE);
        if (!perUser.allowed) {
          metrics.rateLimited.labels("mutation").inc();
          status = 429;
          return problem(
            429,
            "too many changes, slow down",
            { retryAfterSeconds: retryAfterSeconds(perUser) },
            { "Retry-After": String(retryAfterSeconds(perUser)) },
          );
        }
      }

      let body = undefined as TBody;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw new HttpError(400, "malformed JSON body", "bad_request");
        }
        body = opts.body.parse(raw);
      }
      let query = undefined as TQuery;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
      }
      const params = context ? await context.params : {};
      const response = await handler({ request, requestId, user, body, query, params });
      status = response.status;
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (err) {
      if (err instanceof ZodError) {
        status = 400;
        return problem(400, "validation failed", { fields: fieldErrors(err) }, { "x-request-id": requestId });
      }
      if (err instanceof HttpError) {
        status = err.status;
        return problem(
          err.status,
          err.message,
          { code: err.code, ...(err.details ? { fields: err.details } : {}) },
          { "x-request-id": requestId },
        );
      }
      log.error({ err }, "unhandled error in route handler");
      if (process.env.SENTRY_DSN) {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureException(err, { tags: { requestId, route: opts.route } });
      }
      status = 500;
      return problem(500, "internal error", { requestId }, { "x-request-id": requestId });
    } finally {
      observeRequest(request.method, opts.route, status, started);
      log.info({ status, durationMs: Date.now() - started }, "request");
    }
  };
}

export const json = NextResponse.json.bind(NextResponse);
