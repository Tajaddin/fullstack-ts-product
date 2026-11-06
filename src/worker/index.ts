// Background worker: meetup reminders and the weekly digest. Run with `npm run worker`.
process.env.SERVICE_NAME ??= "worker";

import http from "node:http";
import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { db } from "@/db/client";
import { logger } from "@/lib/logger";
import { metrics } from "@/lib/metrics";
import { sendMail, type Mail } from "@/lib/email";
import { digestEmail, reminderEmail, type MeetupLine } from "@/lib/emails";
import {
  DIGEST_QUEUE,
  ensureDigestSchedule,
  queueConnection,
  REMINDERS_QUEUE,
  type DigestJob,
  type ReminderJob,
} from "@/lib/queue";
import { redisOptions } from "@/lib/redis";
import { getGroup } from "@/server/groups";
import { getMeetup, listMeetupsForUser, reminderRecipients, usersWithMemberships } from "@/server/meetups";

const appUrl = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const connection = queueConnection();

export interface Outgoing {
  userId: string;
  mail: Mail;
}

/** The users a job has mailed, kept between its attempts. */
export interface SentLog {
  load(): Promise<string[]>;
  add(userId: string): Promise<void>;
}

// Outlives any retry, including one picked up after the worker was down for days.
const SENT_LOG_TTL_SECONDS = 7 * 24 * 60 * 60;

let sentLogClient: Redis | undefined;

/**
 * A Redis set per job, written with one SADD per e-mail sent. Not the job's progress: BullMQ also appends
 * every progress update to the queue's event stream, so rewriting a growing list after each e-mail left
 * O(recipients²) bytes there. The key includes the job's creation time because a rescheduled reminder is a
 * new job under the same id, and it must mail everyone again.
 */
export function redisSentLog(job: Pick<Job, "queueName" | "id" | "timestamp">): SentLog {
  if (!sentLogClient) {
    // Waits out a Redis outage like the workers' own connections do.
    sentLogClient = new Redis(redisOptions());
    sentLogClient.on("error", (err) => logger.warn({ err }, "redis error"));
  }
  const client = sentLogClient;
  const key = `mail-sent:${job.queueName}:${job.id}:${job.timestamp}`;
  return {
    load: () => client.smembers(key),
    add: async (userId) => {
      await client.multi().sadd(key, userId).expire(key, SENT_LOG_TTL_SECONDS).exec();
    },
  };
}

export function closeSentLog(): void {
  sentLogClient?.disconnect();
  sentLogClient = undefined;
}

/**
 * Sends each message once across the job's attempts. A retry after a failure part-way sends only to the
 * users the log does not have yet, and one failing address does not stop the ones after it. Throws if
 * anything failed, which makes BullMQ retry just those.
 */
export async function sendOnce(log: SentLog, outgoing: Outgoing[], send: (mail: Mail) => Promise<unknown> = sendMail): Promise<number> {
  const reached = new Set(await log.load());
  let sent = 0;
  let failed = 0;
  for (const { userId, mail } of outgoing) {
    if (reached.has(userId)) continue;
    try {
      await send(mail);
    } catch (err) {
      failed++;
      logger.warn({ err, kind: mail.kind, userId }, "e-mail failed");
      continue;
    }
    reached.add(userId);
    sent++;
    await log.add(userId);
  }
  if (failed > 0) throw new Error(`${failed} of ${outgoing.length} e-mails failed`);
  return sent;
}

export async function processReminder(job: Job<ReminderJob>): Promise<"sent" | "skipped"> {
  const meetup = await getMeetup(db(), job.data.meetupId);
  if (!meetup || meetup.cancelled) return "skipped";
  // The meetup moved after this job was queued; the newer job carries the new time.
  if (meetup.startsAt.toISOString() !== job.data.startsAt) return "skipped";
  const group = await getGroup(db(), meetup.groupId);
  if (!group || group.archived) return "skipped";
  const line: MeetupLine = {
    groupName: group.name,
    courseCode: group.course.code,
    startsAt: meetup.startsAt,
    endsAt: meetup.endsAt,
    location: meetup.location,
    url: `${appUrl}/groups/${group.id}`,
  };
  const recipients = await reminderRecipients(db(), meetup.id);
  const sent = await sendOnce(
    redisSentLog(job),
    recipients.map((r) => ({ userId: r.userId, mail: { to: r.email, kind: "reminder", ...reminderEmail(r.name, line) } })),
  );
  logger.info({ meetupId: meetup.id, recipients: recipients.length, sent }, "reminder sent");
  return "sent";
}

export async function processDigest(job: Job<DigestJob>, now: Date = new Date()): Promise<number> {
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekLabel = `${now.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`;
  const people = await usersWithMemberships(db());
  const outgoing: Outgoing[] = [];
  for (const p of people) {
    const upcoming = await listMeetupsForUser(db(), p.userId, now, to);
    if (upcoming.length === 0) continue;
    const lines: MeetupLine[] = upcoming.map((m) => ({
      groupName: m.groupName,
      courseCode: m.courseCode,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      location: m.location,
      url: `${appUrl}/groups/${m.groupId}`,
    }));
    outgoing.push({ userId: p.userId, mail: { to: p.email, kind: "digest", ...digestEmail(p.name, lines, weekLabel) } });
  }
  const sent = await sendOnce(redisSentLog(job), outgoing);
  logger.info({ sent, people: people.length }, "weekly digest sent");
  return sent;
}

function timed<T extends Job>(queue: string, fn: (job: T) => Promise<unknown>) {
  return async (job: T) => {
    const end = metrics.jobDuration.labels(queue).startTimer();
    try {
      const result = await fn(job);
      metrics.jobsProcessed.labels(queue, result === "skipped" ? "skipped" : "ok").inc();
      return result;
    } catch (err) {
      metrics.jobsProcessed.labels(queue, "failed").inc();
      logger.error({ err, queue, jobId: job.id, attempt: job.attemptsMade + 1 }, "job failed");
      throw err;
    } finally {
      end();
    }
  };
}

async function main() {
  const reminders = new Worker<ReminderJob>(REMINDERS_QUEUE, timed(REMINDERS_QUEUE, processReminder), { connection, concurrency: 5 });
  const digest = new Worker<DigestJob>(
    DIGEST_QUEUE,
    timed(DIGEST_QUEUE, (job) => processDigest(job)),
    { connection, concurrency: 1 },
  );
  for (const w of [reminders, digest]) {
    w.on("error", (err) => logger.error({ err, queue: w.name }, "worker error"));
  }
  // On a connection that waits for Redis like the workers' own, not the web app's fail-fast queues: a slow
  // first connection must not stop the worker from starting.
  const scheduler = new Queue<DigestJob>(DIGEST_QUEUE, { connection });
  await ensureDigestSchedule(scheduler);
  await scheduler.close();

  const port = Number(process.env.WORKER_METRICS_PORT ?? 9465);
  const server = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.setHeader("Content-Type", metrics.registry.contentType);
      res.end(await metrics.registry.metrics());
    } else if (req.url === "/healthz") {
      const ok = !reminders.closing && !digest.closing;
      res.statusCode = ok ? 200 : 503;
      res.end(ok ? "ok" : "closing");
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(port, () => logger.info({ port }, "worker metrics listening"));

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    server.close();
    await Promise.all([reminders.close(), digest.close()]);
    closeSentLog();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  logger.info("worker started");
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    logger.fatal({ err }, "worker failed to start");
    process.exit(1);
  });
}
