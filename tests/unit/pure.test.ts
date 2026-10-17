import { afterEach, describe, expect, it } from "vitest";
import { digestEmail, reminderEmail } from "@/lib/emails";
import { env, resetEnvForTests } from "@/lib/env";
import { formatTimeRange, nextHourLocal } from "@/lib/format";
import { groupCalendar } from "@/lib/ical";
import { reminderDelayMs, reminderJobId, REMINDER_LEAD_MS } from "@/lib/queue";
import { retryAfterSeconds } from "@/lib/ratelimit";

const line = {
  groupName: "Tuesday sets",
  courseCode: "COP4530",
  startsAt: new Date("2026-10-20T22:00:00Z"),
  endsAt: new Date("2026-10-20T23:00:00Z"),
  location: "LIB 207",
  url: "http://localhost:3100/groups/abc",
};

describe("reminder scheduling", () => {
  it("fires an hour before, never in the past, with a stable job id", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    expect(reminderDelayMs(new Date("2026-10-20T12:00:00Z"), now)).toBe(3600_000);
    expect(reminderDelayMs(new Date("2026-10-20T10:30:00Z"), now)).toBe(0);
    expect(REMINDER_LEAD_MS).toBe(3600_000);
    expect(reminderJobId("m1")).toBe("reminder-m1");
  });
});

describe("e-mails", () => {
  it("reminder names the group, place and link, in Tampa time", () => {
    const m = reminderEmail("Olive Owner", line);
    expect(m.subject).toContain("Tuesday sets");
    expect(m.text).toContain("Hi Olive,");
    expect(m.text).toContain("LIB 207");
    expect(m.text).toContain(line.url);
    expect(m.text).toMatch(/6:00 PM/);
  });
  it("digest counts meetups and escapes HTML", () => {
    const m = digestEmail(null, [{ ...line, groupName: "<script>alert(1)</script>" }], "2026-10-19 to 2026-10-26");
    expect(m.subject).toContain("1 meetup");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain("Hi,");
  });
});

describe("calendar feed", () => {
  it("emits one VEVENT per meetup with a stable UID and cancelled status", () => {
    const ics = groupCalendar("COP4530 Tuesday sets", "localhost", [
      {
        id: "m1",
        title: "COP4530 Tuesday sets",
        description: "",
        location: "LIB 207",
        startsAt: line.startsAt,
        endsAt: line.endsAt,
        url: line.url,
        cancelled: false,
      },
      {
        id: "m2",
        title: "COP4530 Tuesday sets",
        description: "x",
        location: "LIB 207",
        startsAt: line.startsAt,
        endsAt: line.endsAt,
        url: line.url,
        cancelled: true,
      },
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:m1@localhost");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("DTSTART:20261020T220000Z");
  });
});

describe("formatting", () => {
  it("prefills the next full hour and prints ranges in ET", () => {
    expect(nextHourLocal(new Date(2026, 9, 20, 14, 35))).toBe("2026-10-20T15:00");
    expect(formatTimeRange(line.startsAt, line.endsAt)).toBe("Tue, Oct 20, 6:00 PM to 7:00 PM ET");
  });
  it("retry-after rounds up to whole seconds", () => {
    expect(retryAfterSeconds({ allowed: false, limit: 1, remaining: 0, resetMs: 1 })).toBe(1);
    expect(retryAfterSeconds({ allowed: false, limit: 1, remaining: 0, resetMs: 2500 })).toBe(3);
  });
});

describe("environment", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvForTests();
  });
  it("validates and applies defaults", () => {
    process.env = {
      ...saved,
      DATABASE_URL: "postgres://a:b@localhost:5432/x",
      REDIS_URL: "redis://localhost:6379",
      AUTH_SECRET: "0123456789abcdef",
      AUTH_DEV_LOGIN: "true",
      NODE_ENV: "test",
    };
    resetEnvForTests();
    const e = env();
    expect(e.RATE_LIMIT_API_PER_MINUTE).toBe(120);
    expect(e.AUTH_DEV_LOGIN).toBe(true);
  });
  it("refuses the dev login in production whatever the flag says", () => {
    process.env = {
      ...saved,
      DATABASE_URL: "postgres://a:b@localhost:5432/x",
      REDIS_URL: "redis://localhost:6379",
      AUTH_SECRET: "0123456789abcdef",
      AUTH_DEV_LOGIN: "true",
      NODE_ENV: "production",
    };
    resetEnvForTests();
    expect(env().AUTH_DEV_LOGIN).toBe(false);
  });
  it("names the missing variable", () => {
    process.env = { ...saved, DATABASE_URL: "", REDIS_URL: "redis://localhost:6379", AUTH_SECRET: "short" };
    delete process.env.DATABASE_URL;
    resetEnvForTests();
    expect(() => env()).toThrow(/DATABASE_URL/);
  });
});
