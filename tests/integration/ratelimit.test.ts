import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/ratelimit";
import { startRedis } from "./containers";

let stop: () => Promise<unknown>;
let client: Redis;

beforeAll(async () => {
  const { container, url } = await startRedis();
  client = new Redis(url);
  stop = async () => {
    await client.quit();
    await container.stop();
  };
});

afterAll(async () => {
  await stop();
});

describe("RateLimiter", () => {
  it("allows `limit` hits per window and then rejects with a reset time", async () => {
    const rl = new RateLimiter(client, "t1");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rl.hit("api", "1.2.3.4", 3, 60_000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].remaining).toBe(0);
    expect(results[3].resetMs).toBeGreaterThan(50_000);
    expect(results[3].resetMs).toBeLessThanOrEqual(60_000);
  });

  it("keeps subjects and scopes apart", async () => {
    const rl = new RateLimiter(client, "t2");
    await rl.hit("api", "a", 1, 60_000);
    expect((await rl.hit("api", "a", 1, 60_000)).allowed).toBe(false);
    expect((await rl.hit("api", "b", 1, 60_000)).allowed).toBe(true);
    expect((await rl.hit("mutation", "a", 1, 60_000)).allowed).toBe(true);
  });

  it("resets after the window", async () => {
    const rl = new RateLimiter(client, "t3");
    expect((await rl.hit("api", "x", 1, 300)).allowed).toBe(true);
    expect((await rl.hit("api", "x", 1, 300)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 400));
    expect((await rl.hit("api", "x", 1, 300)).allowed).toBe(true);
  });

  it("survives a script flush (Redis restart)", async () => {
    const rl = new RateLimiter(client, "t4");
    await rl.hit("api", "y", 5, 60_000);
    await client.script("FLUSH");
    const r = await rl.hit("api", "y", 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(3);
  });
});
