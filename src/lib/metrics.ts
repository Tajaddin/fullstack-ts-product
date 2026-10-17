import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

declare global {
  var __coursematesMetrics: Metrics | undefined;
}

export interface Metrics {
  registry: Registry;
  httpDuration: Histogram<"method" | "route" | "status">;
  rateLimited: Counter<"scope">;
  jobsProcessed: Counter<"queue" | "status">;
  jobDuration: Histogram<"queue">;
  emailsSent: Counter<"kind" | "status">;
  dbErrors: Counter<"op">;
}

function create(): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: process.env.SERVICE_NAME ?? "web" });
  collectDefaultMetrics({ register: registry });
  return {
    registry,
    httpDuration: new Histogram({
      name: "http_request_duration_seconds",
      help: "Server time per request, by route pattern",
      labelNames: ["method", "route", "status"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    }),
    rateLimited: new Counter({
      name: "rate_limit_rejections_total",
      help: "Requests answered 429",
      labelNames: ["scope"],
      registers: [registry],
    }),
    jobsProcessed: new Counter({
      name: "jobs_processed_total",
      help: "Background jobs by outcome",
      labelNames: ["queue", "status"],
      registers: [registry],
    }),
    jobDuration: new Histogram({
      name: "job_duration_seconds",
      help: "Background job processing time",
      labelNames: ["queue"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15],
      registers: [registry],
    }),
    emailsSent: new Counter({
      name: "emails_sent_total",
      help: "E-mails handed to SMTP",
      labelNames: ["kind", "status"],
      registers: [registry],
    }),
    dbErrors: new Counter({
      name: "db_errors_total",
      help: "Database errors surfaced to handlers",
      labelNames: ["op"],
      registers: [registry],
    }),
  };
}

export const metrics: Metrics = globalThis.__coursematesMetrics ?? (globalThis.__coursematesMetrics = create());

/** Records one request against a route pattern (never a raw path: ids would explode the label set). */
export function observeRequest(method: string, route: string, status: number, startedAtMs: number): void {
  metrics.httpDuration.labels(method, route, String(status)).observe((Date.now() - startedAtMs) / 1000);
}
