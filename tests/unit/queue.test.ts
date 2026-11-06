import net from "node:net";
import { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { DIGEST_QUEUE, ensureDigestSchedule, queueConnection, type DigestJob } from "@/lib/queue";

describe("ensureDigestSchedule", () => {
  it("gives every digest run its retries, also when the queue it registers on has no default job options", async () => {
    // Nothing listens here: the queue's connection attempt fails, and the scheduler call never reaches Redis.
    const closed = net.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    process.env.REDIS_URL = `redis://127.0.0.1:${(closed.address() as net.AddressInfo).port}`;
    await new Promise((resolve) => closed.close(resolve));

    // Built the way the worker builds the queue it registers the schedule on.
    const q = new Queue<DigestJob>(DIGEST_QUEUE, { connection: queueConnection() });
    q.on("error", () => {});
    const upsert = vi.fn();
    vi.spyOn(q, "jobScheduler", "get").mockReturnValue(Promise.resolve({ upsertJobScheduler: upsert }) as never);

    await ensureDigestSchedule(q);
    await q.close();

    // BullMQ stores these options as the template of every job the scheduler creates.
    const [schedulerId, , name, , template] = upsert.mock.calls[0];
    expect(schedulerId).toBe("weekly-digest");
    expect(name).toBe("weekly-digest");
    expect(template).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    });
  }, 10_000);
});
