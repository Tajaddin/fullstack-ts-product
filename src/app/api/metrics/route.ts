import type { NextRequest } from "next/server";
import { metrics } from "@/lib/metrics";

/**
 * Prometheus scrape target, behind `Authorization: Bearer <METRICS_TOKEN>`. A production build without a
 * token refuses every scrape rather than publishing the metrics; development serves them openly.
 */
export async function GET(request: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  const allowed = token ? request.headers.get("authorization") === `Bearer ${token}` : process.env.NODE_ENV !== "production";
  if (!allowed) {
    return new Response("unauthorized", { status: 401 });
  }
  return new Response(await metrics.registry.metrics(), {
    headers: { "Content-Type": metrics.registry.contentType, "Cache-Control": "no-store" },
  });
}
