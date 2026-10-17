import { NextRequest } from "next/server";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/users";
import { startRedis } from "./containers";

// The route-handler wrapper, with the session resolved by a mock and a real Redis for the rate limiter.
let currentUser: CurrentUser | null = null;
vi.mock("@/server/session", () => ({ getCurrentUser: async () => currentUser }));

let stop: () => Promise<unknown>;
let api: typeof import("@/lib/http").api;

beforeAll(async () => {
  const { container, url } = await startRedis();
  stop = () => container.stop();
  Object.assign(process.env, {
    REDIS_URL: url,
    DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
    AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    RATE_LIMIT_API_PER_MINUTE: "5",
    RATE_LIMIT_MUTATIONS_PER_MINUTE: "2",
  });
  const { resetEnvForTests } = await import("@/lib/env");
  resetEnvForTests();
  ({ api } = await import("@/lib/http"));
});

afterAll(async () => {
  const { redis } = await import("@/lib/redis");
  await redis().quit();
  await stop();
});

const req = (method: string, path: string, body?: unknown, ip = "203.0.113.1") =>
  new NextRequest(`http://localhost:3100${path}`, {
    method,
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

describe("api()", () => {
  it("parses the query and body with zod and reports fields on failure", async () => {
    const handler = api(
      { route: "/t/echo", query: z.object({ n: z.coerce.number().int() }), body: z.object({ name: z.string().min(3) }) },
      async ({ query, body }) => Response.json({ n: query.n, name: body.name }),
    );
    const ok = await handler(req("POST", "/t/echo?n=4", { name: "Olive" }, "203.0.113.11"), undefined);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ n: 4, name: "Olive" });
    expect(ok.headers.get("x-request-id")).toBeTruthy();

    const bad = await handler(req("POST", "/t/echo?n=4", { name: "ab" }, "203.0.113.11"), undefined);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "validation failed", fields: { name: expect.any(String) } });

    const malformed = await handler(req("POST", "/t/echo?n=4", "{not json", "203.0.113.11"), undefined);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "malformed JSON body" });
  });

  it("requires a user when asked, checks the role, and passes params", async () => {
    const handler = api({ route: "/t/admin/[id]", auth: "required", role: "admin" }, async ({ params, user }) =>
      Response.json({ id: params.id, who: user!.id }),
    );
    currentUser = null;
    expect((await handler(req("GET", "/t/admin/1", undefined, "203.0.113.12"), { params: Promise.resolve({ id: "1" }) })).status).toBe(401);
    currentUser = { id: "u1", email: "u@example.edu", name: null, image: null, role: "moderator" };
    expect((await handler(req("GET", "/t/admin/1", undefined, "203.0.113.12"), { params: Promise.resolve({ id: "1" }) })).status).toBe(403);
    currentUser = { ...currentUser, role: "admin" };
    const ok = await handler(req("GET", "/t/admin/42", undefined, "203.0.113.12"), { params: Promise.resolve({ id: "42" }) });
    expect(await ok.json()).toEqual({ id: "42", who: "u1" });
  });

  it("maps HttpError to its status and hides unexpected errors behind a 500 with a request id", async () => {
    const { conflict } = await import("@/lib/rbac");
    const conflicting = api({ route: "/t/conflict" }, async () => {
      throw conflict("already there");
    });
    const res = await conflicting(req("GET", "/t/conflict", undefined, "203.0.113.2"), undefined);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "already there", code: "conflict" });

    const boom = api({ route: "/t/boom" }, async () => {
      throw new Error("database exploded");
    });
    const res2 = await boom(req("GET", "/t/boom", undefined, "203.0.113.2"), undefined);
    expect(res2.status).toBe(500);
    const body = await res2.json();
    expect(body.error).toBe("internal error");
    expect(body.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("exploded");
  });

  it("rate limits per IP on every call and per user on mutations", async () => {
    const handler = api({ route: "/t/limited" }, async () => Response.json({ ok: true }));
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await handler(req("GET", "/t/limited", undefined, "198.51.100.7"), undefined)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    const limited = await handler(req("GET", "/t/limited", undefined, "198.51.100.7"), undefined);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);

    currentUser = { id: "mut-user", email: "m@example.edu", name: null, image: null, role: "member" };
    const mutation = api({ route: "/t/mutate", auth: "required", mutation: true }, async () => Response.json({ ok: true }));
    const mutStatuses = [];
    for (let i = 0; i < 3; i++)
      mutStatuses.push((await mutation(req("POST", "/t/mutate", undefined, `198.51.100.${10 + i}`), undefined)).status);
    expect(mutStatuses).toEqual([200, 200, 429]);
  });
});
