import pino, { type Logger } from "pino";

declare global {
  var __coursematesLogger: Logger | undefined;
}

function create(): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: process.env.SERVICE_NAME ?? "web" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"], censor: "[redacted]" },
    formatters: { level: (label) => ({ level: label }) },
  });
}

// One logger per process; `globalThis` keeps it across Next.js dev hot reloads.
export const logger: Logger = globalThis.__coursematesLogger ?? (globalThis.__coursematesLogger = create());
