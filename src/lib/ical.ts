import { createEvents, type EventAttributes } from "ics";

export interface CalendarMeetup {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  url: string;
  cancelled: boolean;
}

function parts(d: Date): [number, number, number, number, number] {
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

/** An iCalendar feed of a group's meetups; UIDs are stable so calendar apps update instead of duplicating. */
export function groupCalendar(calendarName: string, host: string, items: CalendarMeetup[]): string {
  const events: EventAttributes[] = items.map((m) => ({
    uid: `${m.id}@${host}`,
    title: m.title,
    description: m.description,
    location: m.location,
    url: m.url,
    start: parts(m.startsAt),
    startInputType: "utc",
    end: parts(m.endsAt),
    endInputType: "utc",
    status: m.cancelled ? "CANCELLED" : "CONFIRMED",
    calName: calendarName,
    productId: "coursemates",
  }));
  const { error, value } = createEvents(events);
  if (error) throw error;
  return value ?? "";
}
