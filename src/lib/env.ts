import { z } from "zod";

// Server-side configuration, validated once. Anything secret stays in the environment; nothing here is
// bundled for the browser (NEXT_PUBLIC_* values are read where they are used).
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  AUTH_URL: z.string().url().optional(),
  AUTH_GOOGLE_ID: z.string().optional().default(""),
  AUTH_GOOGLE_SECRET: z.string().optional().default(""),
  AUTH_DEV_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  APP_URL: z.string().url().default("http://localhost:3100"),
  SMTP_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default("Coursemates <no-reply@coursemates.local>"),
  RATE_LIMIT_API_PER_MINUTE: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_MUTATIONS_PER_MINUTE: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  SENTRY_DSN: z.string().optional().default(""),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(""),
  WORKER_METRICS_PORT: z.coerce.number().int().positive().default(9465),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid environment: ${issues}`);
  }
  // The dev login must never be reachable in a production build, whatever the environment says.
  if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_DEV_LOGIN) {
    parsed.data = { ...parsed.data, AUTH_DEV_LOGIN: false };
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
