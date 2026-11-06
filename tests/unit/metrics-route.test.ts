import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/metrics/route";

const scrape = (authorization?: string) =>
  GET(new NextRequest("http://localhost:3100/api/metrics", { headers: authorization ? { authorization } : {} }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/metrics", () => {
  it("is closed in production when METRICS_TOKEN is not set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_TOKEN", "");
    expect((await scrape()).status).toBe(401);
    expect((await scrape("Bearer ")).status).toBe(401);
  });

  it("needs the bearer token whenever one is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_TOKEN", "scrape-token-for-tests");
    expect((await scrape()).status).toBe(401);
    expect((await scrape("Bearer wrong")).status).toBe(401);
    const ok = await scrape("Bearer scrape-token-for-tests");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("# HELP");
  });

  it("is open in development without a token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("METRICS_TOKEN", "");
    expect((await scrape()).status).toBe(200);
  });
});
