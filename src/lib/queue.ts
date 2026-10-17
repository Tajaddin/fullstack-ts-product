import { Queue, type JobsOptions, type ConnectionOptions } from "bullmq";
import { redisOptions } from "./redis";

export const REMINDERS_QUEUE = "reminders";
export const DIGEST_QUEUE = "digest";
export const REMINDER_LEAD_MS = 60 * 60 * 1000;

export interface ReminderJob {
  meetupId: string;
  /** The start time the reminder was scheduled for; the worker drops the job if the meetup moved. */
  startsAt: string;
}

export interface DigestJob {
  /** ISO date the digest run covers from; one job per schedule tick. */
  weekOf: string;
}

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
};

/** BullMQ opens its own ioredis connections from these options (blocking commands need their own). */
export function queueConnection(): ConnectionOptions {
  return redisOptions() as ConnectionOptions;
}

function createQueues() {
  return {
    reminders: new Queue<ReminderJob>(REMINDERS_QUEUE, { connection: queueConnection(), defaultJobOptions }),
    digest: new Queue<DigestJob>(DIGEST_QUEUE, { connection: queueConnection(), defaultJobOptions }),
  };
}

type Queues = ReturnType<typeof createQueues>;
const store = globalThis as unknown as { __coursematesQueues?: Queues };

/** Process-wide queue handles; kept on globalThis so Next.js dev hot reloads do not leak connections. */
export function queues(): Queues {
  if (!store.__coursematesQueues) store.__coursematesQueues = createQueues();
  return store.__coursematesQueues;
}

export const reminderJobId = (meetupId: string) => `reminder-${meetupId}`;

/** When a reminder for a meetup starting at `startsAt` should fire: an hour before, never in the past. */
export function reminderDelayMs(startsAt: Date, now: Date = new Date()): number {
  return Math.max(0, startsAt.getTime() - REMINDER_LEAD_MS - now.getTime());
}

const replaceable = new Set(["delayed", "waiting", "prioritized", "waiting-children"]);

/**
 * Schedules (or re-schedules) the reminder for a meetup. The job id derives from the meetup id, so calling
 * this twice never produces two reminders; a pending job is replaced, a running or finished one is left
 * alone because the worker re-checks the meetup's current time anyway.
 */
export async function scheduleReminder(meetupId: string, startsAt: Date, q: Queues["reminders"] = queues().reminders): Promise<void> {
  const id = reminderJobId(meetupId);
  const existing = await q.getJob(id);
  if (existing) {
    const state = await existing.getState();
    if (!replaceable.has(state)) return;
    await existing.remove();
  }
  await q.add("meetup-reminder", { meetupId, startsAt: startsAt.toISOString() }, { jobId: id, delay: reminderDelayMs(startsAt) });
}

export async function cancelReminder(meetupId: string, q: Queues["reminders"] = queues().reminders): Promise<void> {
  const existing = await q.getJob(reminderJobId(meetupId));
  if (!existing) return;
  const state = await existing.getState();
  if (replaceable.has(state)) await existing.remove();
}

/** Monday 13:00 UTC (09:00 Tampa in summer, 08:00 in winter). Idempotent: BullMQ upserts the scheduler. */
export async function ensureDigestSchedule(q: Queues["digest"] = queues().digest): Promise<void> {
  await q.upsertJobScheduler("weekly-digest", { pattern: "0 13 * * 1", tz: "UTC" }, { name: "weekly-digest" });
}

export async function closeQueues(): Promise<void> {
  const q = store.__coursematesQueues;
  if (!q) return;
  store.__coursematesQueues = undefined;
  await Promise.all([q.reminders.close(), q.digest.close()]);
}
