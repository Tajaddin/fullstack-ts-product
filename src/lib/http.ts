import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { env } from "./env";
import { logger } from "./logger";
import { observeRequest, metrics } from "./metrics";
import { RateLimiter, retryAfterSeconds } from "./ratelimit";
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

export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
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
      limiter ??= new RateLimiter(redis());
      const ip = clientIp(request);
      const perIp = await limiter.hit("api", ip, cfg.RATE_LIMIT_API_PER_MINUTE, 60_000);
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
        const perUser = await limiter.hit("mutation", user.id, cfg.RATE_LIMIT_MUTATIONS_PER_MINUTE, 60_000);
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
