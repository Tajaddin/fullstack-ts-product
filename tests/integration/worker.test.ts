import { Queue } from "bullmq";
import type { Job } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMailpit, startPostgres, startRedis } from "./containers";

// The worker reads DATABASE_URL, REDIS_URL and SMTP_URL from the environment, so the containers come up
// first and the modules are imported afterwards.
let stops: (() => Promise<unknown>)[] = [];
let mailpitApi: string;
let redisUrl: string;

beforeAll(async () => {
  const [pg, redis, mail] = await Promise.all([startPostgres(), startRedis(), startMailpit()]);
  process.env.DATABASE_URL = pg.url;
  process.env.REDIS_URL = redis.url;
  process.env.SMTP_URL = mail.smtpUrl;
  process.env.APP_URL = "http://localhost:3100";
  mailpitApi = mail.apiUrl;
  redisUrl = redis.url;
  stops = [() => pg.container.stop(), () => redis.container.stop(), () => mail.container.stop()];
});

afterAll(async () => {
  const { closeQueues } = await import("@/lib/queue");
  await closeQueues();
  await Promise.all(stops.map((s) => s()));
});

async function mailpitMessages(): Promise<{ To: { Address: string }[]; Subject: string }[]> {
  const res = await fetch(`${mailpitApi}/api/v1/messages`);
  const body = (await res.json()) as { messages: { To: { Address: string }[]; Subject: string }[] };
  return body.messages;
}

describe("reminders end to end", () => {
  it("queues a delayed job per meetup, de-duplicates it, and the worker e-mails the people who have not declined", async () => {
    const { db } = await import("@/db/client");
    const { findOrCreateUserByEmail } = await import("@/server/users");
    const { createGroup, joinGroup } = await import("@/server/groups");
    const { createMeetup, setRsvp, updateMeetup } = await import("@/server/meetups");
    const { queues, reminderJobId, scheduleReminder } = await import("@/lib/queue");
    const { processReminder, processDigest } = await import("@/worker/index");

    const owner = await findOrCreateUserByEmail(db(), "w-owner@example.edu", "Olive");
    const member = await findOrCreateUserByEmail(db(), "w-member@example.edu", "Max");
    const decliner = await findOrCreateUserByEmail(db(), "w-decliner@example.edu", "Dee");
    const g = await createGroup(
      db(),
      { courseCode: "COP4530", courseTitle: "Data Structures", name: "Worker group", description: "", capacity: 5, visibility: "public" },
      owner,
    );
    await joinGroup(db(), g.id, member);
    await joinGroup(db(), g.id, decliner);

    const startsAt = new Date(Date.now() + 2 * 3600_000);
    const meetup = await createMeetup(db(), { groupId: g.id, startsAt, durationMinutes: 60, location: "LIB 207", notes: "" }, owner);
    await setRsvp(db(), meetup.id, decliner, "no");

    const q = queues().reminders;
    const job = await q.getJob(reminderJobId(meetup.id));
    expect(job).toBeTruthy();
    expect(await job!.getState()).toBe("delayed");
    expect(job!.delay).toBeGreaterThan(3500_000);
    expect(job!.delay).toBeLessThanOrEqual(3600_000);

    // Scheduling again replaces rather than duplicates.
    await scheduleReminder(meetup.id, startsAt);
    expect((await q.getDelayedCount()) + (await q.getWaitingCount())).toBe(1);

    // Run the processor directly, as the worker would when the delay elapses.
    const outcome = await processReminder({ data: { meetupId: meetup.id, startsAt: startsAt.toISOString() } } as Job<{
      meetupId: string;
      startsAt: string;
    }>);
    expect(outcome).toBe("sent");
    const messages = await mailpitMessages();
    const to = messages.map((m) => m.To[0].Address).sort();
    expect(to).toEqual(["w-member@example.edu", "w-owner@example.edu"]);
    expect(messages[0].Subject).toContain("Worker group");

    // A stale job (the meetup moved) is skipped.
    await updateMeetup(db(), meetup.id, { startsAt: new Date(startsAt.getTime() + 3600_000) }, owner);
    const stale = await processReminder({ data: { meetupId: meetup.id, startsAt: startsAt.toISOString() } } as Job<{
      meetupId: string;
      startsAt: string;
    }>);
    expect(stale).toBe("skipped");

    // The digest goes to members with something coming up (the decliner is still a member).
    const sent = await processDigest({ data: { weekOf: "2026-10-19" } } as Job<{ weekOf: string }>);
    expect(sent).toBe(3);
    expect((await mailpitMessages()).length).toBe(5);

    // The digest scheduler is registered once.
    const { ensureDigestSchedule } = await import("@/lib/queue");
    await ensureDigestSchedule();
    await ensureDigestSchedule();
    const schedulers = await queues().digest.getJobSchedulers();
    expect(schedulers.map((s) => s.key ?? s.id)).toHaveLength(1);

    const probe = new Queue("reminders", { connection: { url: redisUrl } as never });
    await probe.close();
  }, 180_000);
});
