# 0004. Background jobs on BullMQ with deterministic job ids and a worker that re-validates

Date: 2026-10-17. Status: accepted.

## Context

Two things happen outside a request: a reminder an hour before each meetup and a weekly digest. The spec
offers BullMQ + Redis or Inngest. Reminders must survive restarts, must not be sent twice, and must not be
sent for a meetup that moved or was cancelled.

## Decision

- BullMQ 6 on the Redis the app already has. Two queues: `reminders` (one delayed job per meetup) and
  `digest` (a BullMQ job scheduler, Mondays 13:00 UTC). A separate `worker` process (`src/worker`) runs the
  processors and exposes `/metrics` and `/healthz`.
- Idempotency by **job id**: the reminder's id is `reminder-<meetupId>`. Scheduling twice replaces a pending
  job; a running or finished job is left alone. The job payload carries the start time it was scheduled
  for, and the processor re-reads the meetup and **skips** when the time changed, the meetup was cancelled
  or the group was archived. Rescheduling is therefore safe even if the old job slips through.
- Delivery through nodemailer to whatever SMTP `SMTP_URL` names: Mailpit in Compose, a provider in
  production. Without `SMTP_URL` the worker logs and counts the message as skipped rather than failing.
- Inngest was not chosen because it requires an account and a public endpoint for local development; a
  queue the project already runs keeps the whole thing testable offline.

## Consequences

- The integration test schedules a reminder, asserts one delayed job with the right delay, runs the
  processor and reads the two e-mails back out of Mailpit; it then moves the meetup and asserts the stale job
  is skipped.
- On Fly.io the worker is a second app from the same Dockerfile, and its release command applies the
  database migrations before the web app deploys.
- Reminders are per meetup, not per recipient: a failure mid-way retries the whole job and can re-send to
  recipients who already got it. Per-recipient child jobs would remove that and are the next step.
