// Page-load latency of the public pages and the groups API on one machine, from k6 in a container
// against the production server on the host. Not a capacity test: the numbers are p95 response times at
// a modest, steady concurrency, which is what "p95 page load" in the README refers to.
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

const base = __ENV.BASE_URL || "http://host.docker.internal:3100";
// The /api/v1 endpoints are rate limited per IP (120/min by default) and a load generator is one IP, so
// they are measured elsewhere (the integration tests) rather than here.
const pages = ["/", "/courses", "/courses/COP4530", "/privacy", "/api/health"];
const trends = Object.fromEntries(pages.map((p) => [p, new Trend(`page_${p.replace(/[^a-z0-9]+/gi, "_")}`, true)]));

export const options = {
  scenarios: {
    steady: { executor: "constant-vus", vus: Number(__ENV.VUS || 10), duration: __ENV.DURATION || "60s" },
  },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<1000"] },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

export default function () {
  for (const p of pages) {
    const res = http.get(`${base}${p}`, { tags: { page: p } });
    trends[p].add(res.timings.duration);
    check(res, { "status 200": (r) => r.status === 200 });
  }
}

export function handleSummary(data) {
  const out = {
    run_utc: new Date().toISOString().slice(0, 16).replace("T", " "),
    vus: Number(__ENV.VUS || 10),
    duration: __ENV.DURATION || "60s",
    method:
      "k6 in a container (grafana/k6) against `npm run start` on the same machine, constant VUs, each iteration fetches every page once; durations are full HTTP response times in milliseconds",
    requests: data.metrics.http_reqs.values.count,
    failed_rate: data.metrics.http_req_failed.values.rate,
    overall_ms: {
      p50: data.metrics.http_req_duration.values.med,
      p95: data.metrics.http_req_duration.values["p(95)"],
      p99: data.metrics.http_req_duration.values["p(99)"],
    },
    pages: pages.map((p) => {
      const m = data.metrics[`page_${p.replace(/[^a-z0-9]+/gi, "_")}`].values;
      return { page: p, p50_ms: m.med, p95_ms: m["p(95)"], p99_ms: m["p(99)"], max_ms: m.max };
    }),
  };
  return { "/results/latest.json": JSON.stringify(out, null, 2), stdout: textSummary(out) };
}

function textSummary(o) {
  const lines = [`k6: ${o.requests} requests, ${(o.failed_rate * 100).toFixed(2)}% failed, overall p95 ${o.overall_ms.p95.toFixed(0)} ms`];
  for (const p of o.pages)
    lines.push(
      `  ${p.page.padEnd(28)} p50 ${p.p50_ms.toFixed(0).padStart(5)} ms  p95 ${p.p95_ms.toFixed(0).padStart(5)} ms  p99 ${p.p99_ms.toFixed(0).padStart(5)} ms`,
    );
  return lines.join("\n") + "\n";
}
