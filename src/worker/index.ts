// Background worker: meetup reminders and the weekly digest. Run with `npm run worker`.
process.env.SERVICE_NAME ??= "worker";

import http from "node:http";
import { Worker, type Job } from "bullmq";
import { db } from "@/db/client";
import { logger } from "@/lib/logger";
import { metrics } from "@/lib/metrics";
import { sendMail } from "@/lib/email";
import { digestEmail, reminderEmail, type MeetupLine } from "@/lib/emails";
import {
  closeQueues,
  DIGEST_QUEUE,
  ensureDigestSchedule,
  queueConnection,
  REMINDERS_QUEUE,
  type DigestJob,
  type ReminderJob,
} from "@/lib/queue";
import { getGroup } from "@/server/groups";
import { getMeetup, listMeetupsForUser, reminderRecipients, usersWithMemberships } from "@/server/meetups";

const appUrl = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const connection = queueConnection();

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
  for (const r of recipients) {
    const mail = reminderEmail(r.name, line);
    await sendMail({ to: r.email, kind: "reminder", ...mail });
  }
  logger.info({ meetupId: meetup.id, recipients: recipients.length }, "reminder sent");
  return "sent";
}

export async function processDigest(_job: Job<DigestJob>, now: Date = new Date()): Promise<number> {
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekLabel = `${now.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`;
  const people = await usersWithMemberships(db());
  let sent = 0;
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
    await sendMail({ to: p.email, kind: "digest", ...digestEmail(p.name, lines, weekLabel) });
    sent++;
  }
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
  await ensureDigestSchedule();

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
    await closeQueues();
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
