// Pure e-mail templates: text first, a small HTML twin. Times are shown in Tampa's zone and in UTC.

export interface MeetupLine {
  groupName: string;
  courseCode: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  url: string;
}

const TZ = "America/New_York";

export function formatWhen(startsAt: Date, endsAt: Date): string {
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ }).format(startsAt);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ, timeZoneName: "short" });
  return `${day}, ${time.format(startsAt)} to ${time.format(endsAt)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function reminderEmail(name: string | null, m: MeetupLine): { subject: string; text: string; html: string } {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  const when = formatWhen(m.startsAt, m.endsAt);
  const subject = `Reminder: ${m.groupName} (${m.courseCode}) meets in an hour`;
  const text = [
    greeting,
    "",
    `${m.groupName} for ${m.courseCode} meets ${when} at ${m.location}.`,
    "",
    `Details and RSVP: ${m.url}`,
    "",
    "You get this because you are in the group and have not declined. Change your RSVP on the page above.",
  ].join("\n");
  const html = `<p>${escapeHtml(greeting)}</p><p><strong>${escapeHtml(m.groupName)}</strong> for ${escapeHtml(m.courseCode)} meets ${escapeHtml(when)} at ${escapeHtml(m.location)}.</p><p><a href="${escapeHtml(m.url)}">Details and RSVP</a></p><p style="color:#666;font-size:12px">You get this because you are in the group and have not declined.</p>`;
  return { subject, text, html };
}

export function digestEmail(
  name: string | null,
  meetups: MeetupLine[],
  weekLabel: string,
): { subject: string; text: string; html: string } {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  const subject = `Your study week: ${meetups.length} meetup${meetups.length === 1 ? "" : "s"} (${weekLabel})`;
  const lines = meetups.map((m) => `- ${m.courseCode} ${m.groupName}: ${formatWhen(m.startsAt, m.endsAt)}, ${m.location} (${m.url})`);
  const text = [
    greeting,
    "",
    "Coming up in your groups this week:",
    "",
    ...lines,
    "",
    "Weekly digest from Coursemates. Leave a group on its page to stop its mails.",
  ].join("\n");
  const items = meetups
    .map(
      (m) =>
        `<li><a href="${escapeHtml(m.url)}">${escapeHtml(m.courseCode)} ${escapeHtml(m.groupName)}</a>: ${escapeHtml(formatWhen(m.startsAt, m.endsAt))}, ${escapeHtml(m.location)}</li>`,
    )
    .join("");
  const html = `<p>${escapeHtml(greeting)}</p><p>Coming up in your groups this week:</p><ul>${items}</ul><p style="color:#666;font-size:12px">Weekly digest from Coursemates.</p>`;
  return { subject, text, html };
}
