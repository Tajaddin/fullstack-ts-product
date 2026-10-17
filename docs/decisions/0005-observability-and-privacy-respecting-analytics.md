# 0005. Observability built in, analytics that respect the user, and how the numbers are measured

Date: 2026-10-17. Status: accepted.

## Context

The README promises three numbers: weekly active users, p95 page load, and the test count. The spec asks for
Sentry and PostHog, a privacy policy, and the same observability bar as the other projects (JSON logs,
metrics, traces, a dashboard, alerts with tests).

## Decision

- **Logs**: pino JSON on stdout with the service name and request ids; headers and secrets redacted.
- **Metrics**: `prom-client` registries in both processes. `/api/metrics` on the web app (optionally
  behind `METRICS_TOKEN`), `:9465/metrics` on the worker. Request durations are recorded per **route
  pattern** by the `api()` wrapper, never per concrete path. Seven alert rules with promtool tests; a Grafana
  dashboard in Compose.
- **Traces**: opt-in. `@vercel/otel` exports OTLP to Tempo when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; when
  `SENTRY_DSN` is set, Sentry owns tracing instead, because it brings its own OpenTelemetry setup and two
  tracer providers would fight. With no endpoint there is no tracer provider at all, on purpose: a
  registered provider makes Next.js mint span ids while it prerenders each page's static shell, which Cache
  Components flags as an unstable value (`crypto.getRandomValues`) and answers by rendering that route
  dynamically. Measured locally, that is the difference between a cached shell and a server render per
  navigation, so the default favours the shell and traces are switched on where they are collected.
- **Analytics**: PostHog in cookieless mode: `persistence: memory`, no autocapture, no session recording, no
  IP, Do-Not-Track honoured, page views only. Off entirely without a key. `/privacy` says exactly this.
- **Weekly active users** come from the database, not from PostHog: `daily_active` gets one row per user per
  UTC day they load a page while signed in, written by the same read that resolves the session.
  `scripts/wau.ts` counts distinct users over 7 days and writes the line into the README between markers.
  The number is zero until the product is deployed and announced; the README says so.
- **p95 page load** is two measurements with their methods stated: Lighthouse CI (mobile, throttled) scores
  and LCP on `/`, `/courses`, `/privacy`, and a k6 run of the public pages at 10 VUs against the production
  build on one machine.

## Consequences

- Nothing about a user is sent to a third party that is not needed to run the service; Sentry gets stack
  traces, PostHog gets page views, Google gets the sign-in.
- Request metrics cover the REST API; server-rendered pages are measured from the outside (Lighthouse, k6)
  rather than instrumented inside Next's rendering.
- Counting WAU ourselves means the number is checkable by anyone with database access and survives an
  analytics outage.
