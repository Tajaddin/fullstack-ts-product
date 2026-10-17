import type { NextRequest } from "next/server";
import { metrics } from "@/lib/metrics";

/** Prometheus scrape target. Set METRICS_TOKEN to require `Authorization: Bearer <token>`. */
export async function GET(request: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  if (token && request.headers.get("authorization") !== `Bearer ${token}`) {
    return new Response("unauthorized", { status: 401 });
  }
  return new Response(await metrics.registry.metrics(), {
    headers: { "Content-Type": metrics.registry.contentType, "Cache-Control": "no-store" },
  });
}
