import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { redis } from "@/lib/redis";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("timeout")), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness plus the two dependencies; 503 when either is down so the load balancer stops sending traffic. */
export async function GET() {
  const checks = await Promise.allSettled([withTimeout(db().execute(sql`select 1`), 2000), withTimeout(redis().ping(), 2000)]);
  const database = checks[0].status === "fulfilled" ? "up" : "down";
  const cache = checks[1].status === "fulfilled" ? "up" : "down";
  const ok = database === "up" && cache === "up";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, redis: cache, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
