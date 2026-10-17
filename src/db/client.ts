import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __coursematesDb: Db | undefined;
}

export function createDb(url: string, max = 10) {
  const sql = postgres(url, {
    max,
    // Pooled Neon endpoints (PgBouncer in transaction mode) cannot keep prepared statements.
    prepare: !url.includes("-pooler"),
    connect_timeout: 10,
    idle_timeout: 30,
  });
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** The process-wide database handle; `globalThis` keeps one pool across Next.js dev hot reloads. */
export function db(): Db {
  if (!globalThis.__coursematesDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__coursematesDb = createDb(url);
  }
  return globalThis.__coursematesDb;
}

export { schema };
