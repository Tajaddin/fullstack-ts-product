import net from "node:net";
import { afterAll, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

describe("redis()", () => {
  afterAll(() => {
    redis().disconnect();
    vi.restoreAllMocks();
  });

  it("logs a refused connection rather than leaving ioredis to print an unhandled error event", async () => {
    const closed = net.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    process.env.REDIS_URL = `redis://127.0.0.1:${(closed.address() as net.AddressInfo).port}`;
    await new Promise((resolve) => closed.close(resolve));

    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(redis().ping()).rejects.toThrow();

    expect(warn).toHaveBeenCalledWith({ err: expect.any(Error) }, "redis error");
    expect(consoleError).not.toHaveBeenCalled();
  }, 10_000);
});
