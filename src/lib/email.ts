import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";
import { metrics } from "./metrics";

declare global {
  var __coursematesMailer: Transporter | null | undefined;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: "reminder" | "digest" | "test";
}

function transporter(): Transporter | null {
  if (globalThis.__coursematesMailer !== undefined) return globalThis.__coursematesMailer;
  const url = process.env.SMTP_URL;
  globalThis.__coursematesMailer = url ? nodemailer.createTransport(url) : null;
  return globalThis.__coursematesMailer;
}

/** Hands one message to SMTP. Without SMTP_URL it logs and counts the message as skipped. */
export async function sendMail(mail: Mail): Promise<"sent" | "skipped"> {
  const t = transporter();
  if (!t) {
    logger.info({ to: mail.to, subject: mail.subject, kind: mail.kind }, "SMTP_URL not set, e-mail skipped");
    metrics.emailsSent.labels(mail.kind, "skipped").inc();
    return "skipped";
  }
  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? "Coursemates <no-reply@coursemates.local>",
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    metrics.emailsSent.labels(mail.kind, "sent").inc();
    return "sent";
  } catch (err) {
    metrics.emailsSent.labels(mail.kind, "failed").inc();
    throw err;
  }
}

export function resetMailerForTests(): void {
  globalThis.__coursematesMailer = undefined;
}
