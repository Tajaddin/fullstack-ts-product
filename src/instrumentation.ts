import type { Instrumentation } from "next";

// Server start-up: tracing and error reporting. Sentry brings its own OpenTelemetry setup, so when a DSN is
// configured Sentry owns tracing; otherwise @vercel/otel exports OTLP traces (to Tempo in docker compose).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.env.SERVICE_NAME ??= "web";
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
    });
    return;
  }
  // Tracing is opt-in. A registered tracer provider makes Next.js generate span ids while it prerenders the
  // static shell, which Cache Components reports as an unstable value and answers by rendering those routes
  // dynamically; so with no endpoint configured there is no provider at all.
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  const { registerOTel, OTLPHttpJsonTraceExporter } = await import("@vercel/otel");
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "coursemates-web",
    traceExporter: new OTLPHttpJsonTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }),
  });
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
