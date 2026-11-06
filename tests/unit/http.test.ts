import net from "node:net";
import Redis from "ioredis";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { api, clientIp } from "@/lib/http";
import { failFastRedisOptions, redis } from "@/lib/redis";

vi.mock("@/server/session", () => ({ getCurrentUser: async () => null }));

const withHeaders = (headers: Record<string, string>) => new NextRequest("http://localhost:3100/api/v1/courses", { headers });

describe("clientIp", () => {
  it("uses the address Fly's proxy reports, not the client-written X-Forwarded-For", () => {
    // Fly appends the real address to whatever X-Forwarded-For the client sent.
    const spoofed = withHeaders({ "x-forwarded-for": "198.51.100.99, 203.0.113.5", "fly-client-ip": "203.0.113.5" });
    expect(clientIp(spoofed)).toBe("203.0.113.5");
    const rotated = withHeaders({ "x-forwarded-for": "198.51.100.100, 203.0.113.5", "fly-client-ip": "203.0.113.5" });
    expect(clientIp(rotated)).toBe(clientIp(spoofed));
  });

  it("puts requests without Fly in front into one bucket whatever they claim", () => {
    expect(clientIp(withHeaders({ "x-forwarded-for": "198.51.100.1" }))).toBe("local");
    expect(clientIp(withHeaders({ "x-real-ip": "198.51.100.2" }))).toBe("local");
    expect(clientIp(withHeaders({}))).toBe("local");
  });
});

describe("when Redis does not answer", () => {
  // Accepts connections and never replies, like a Redis that is overloaded or behind a dead proxy.
  const sockets = new Set<net.Socket>();
  const silent = net.createServer((s) => void sockets.add(s));

  beforeAll(async () => {
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    Object.assign(process.env, {
      REDIS_URL: `redis://127.0.0.1:${(silent.address() as net.AddressInfo).port}`,
      DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
      AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    });
    resetEnvForTests();
  });

  afterAll(async () => {
    redis().disconnect();
    for (const s of sockets) s.destroy();
    await new Promise((resolve) => silent.close(resolve));
  });

  it("the API answers 503 within a couple of seconds instead of hanging", async () => {
    const handler = api({ route: "/t/limited" }, async () => Response.json({ ok: true }));
    const started = Date.now();
    const res = await handler(withHeaders({ "fly-client-ip": "203.0.113.9" }), undefined);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "unavailable" });
    expect(Date.now() - started).toBeLessThan(3_000);
  }, 10_000);

  it("a request-path client gives up on a refused connection instead of queueing the command", async () => {
    const closed = net.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const port = (closed.address() as net.AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    const client = new Redis(failFastRedisOptions(`redis://127.0.0.1:${port}`));
    client.on("error", () => {});
    const started = Date.now();
    await expect(client.ping()).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
    client.disconnect();
  }, 10_000);
});
