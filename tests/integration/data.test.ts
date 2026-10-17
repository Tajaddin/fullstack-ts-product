import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { HttpError } from "@/lib/rbac";
import { createCourse, getCourseByCode, listCoursesWithGroupCounts, searchCourses } from "@/server/courses";
import {
  createGroup,
  getGroup,
  getMembership,
  getVisibleGroup,
  joinGroup,
  leaveGroup,
  listGroups,
  listMembers,
  listMyGroups,
  removeMember,
  updateGroup,
} from "@/server/groups";
import {
  createMeetup,
  listMeetupsForGroup,
  listMeetupsForUser,
  reminderRecipients,
  setRsvp,
  updateMeetup,
  type JobHooks,
} from "@/server/meetups";
import { createReport, listOpenReports, resolveReport } from "@/server/reports";
import {
  deleteOwnAccount,
  findOrCreateUserByEmail,
  findUserById,
  listAudit,
  setUserRole,
  touchActivity,
  weeklyActiveUsers,
  type CurrentUser,
} from "@/server/users";
import { startPostgres } from "./containers";

let db: Db;
let stop: () => Promise<unknown>;

async function user(email: string, role: CurrentUser["role"] = "member"): Promise<CurrentUser> {
  const u = await findOrCreateUserByEmail(db, email, email.split("@")[0]);
  if (role !== "member") {
    const admin = await findOrCreateUserByEmail(db, "root@example.edu", "root");
    // the first admin is bootstrapped the way the seed script does it: straight in the database
    await db.execute(`update users set role = 'admin' where id = '${admin.id}'`);
    await setUserRole(db, { ...admin, role: "admin" }, u.id, role);
  }
  const fresh = await findUserById(db, u.id);
  return { id: fresh!.id, email: fresh!.email, name: fresh!.name, image: fresh!.image, role: fresh!.role };
}

function hooks(): JobHooks & { scheduled: [string, Date][]; cancelled: string[] } {
  const h = {
    scheduled: [] as [string, Date][],
    cancelled: [] as string[],
    schedule: async (id: string, at: Date) => void h.scheduled.push([id, at]),
    cancel: async (id: string) => void h.cancelled.push(id),
  };
  return h;
}

const inAnHour = () => new Date(Date.now() + 3600_000);

beforeAll(async () => {
  const started = await startPostgres();
  db = started.db;
  stop = () => started.container.stop();
});

afterAll(async () => {
  await stop();
});

describe("courses", () => {
  it("creates idempotently and searches by code or title", async () => {
    const owner = await user("c1@example.edu");
    const a = await createCourse(db, { code: "COP4530", title: "Data Structures" }, owner.id);
    const b = await createCourse(db, { code: "COP4530", title: "Different title" }, owner.id);
    expect(b.id).toBe(a.id);
    expect(b.title).toBe("Data Structures");
    expect((await searchCourses(db, "cop 45")).map((c) => c.code)).toContain("COP4530");
    expect((await searchCourses(db, "structures")).map((c) => c.code)).toContain("COP4530");
    expect(await getCourseByCode(db, "NOPE0000")).toBeNull();
  });
});

describe("groups and memberships", () => {
  it("creates a group with a new course, makes the creator owner, enforces capacity under concurrency", async () => {
    const owner = await user("g-owner@example.edu");
    const g = await createGroup(
      db,
      { courseCode: "MAC2311", courseTitle: "Calculus I", name: "Morning calc", description: "", capacity: 2, visibility: "public" },
      owner,
    );
    expect(g.course.code).toBe("MAC2311");
    expect(g.memberCount).toBe(1);
    expect((await getMembership(db, g.id, owner.id))?.role).toBe("owner");

    const joiners = await Promise.all(["j1", "j2", "j3"].map((n) => user(`${n}@example.edu`)));
    const results = await Promise.allSettled(joiners.map((j) => joinGroup(db, g.id, j)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1); // capacity 2 with the owner inside leaves one seat
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(HttpError);
    expect((failed.reason as HttpError).status).toBe(409);
    expect((await listMembers(db, g.id)).length).toBe(2);

    const counts = await listCoursesWithGroupCounts(db, "MAC2311");
    expect(counts[0].groupCount).toBe(1);
  });

  it("refuses unknown courses without a title, duplicate joins, owner leaving, and capacity below members", async () => {
    const owner = await user("g2-owner@example.edu");
    await expect(
      createGroup(db, { courseCode: "ZZZ9999", name: "Ghost course", description: "", capacity: 5, visibility: "public" }, owner),
    ).rejects.toMatchObject({ status: 400 });
    const g = await createGroup(
      db,
      { courseCode: "COP4530", name: "Night sets", description: "", capacity: 5, visibility: "public" },
      owner,
    );
    await expect(joinGroup(db, g.id, owner)).rejects.toMatchObject({ status: 409 });
    await expect(leaveGroup(db, g.id, owner)).rejects.toMatchObject({ status: 409 });
    const m = await user("g2-member@example.edu");
    await joinGroup(db, g.id, m);
    await expect(updateGroup(db, g.id, { capacity: 1 }, owner)).rejects.toMatchObject({ status: 400 });
    await expect(updateGroup(db, g.id, { name: "Renamed" }, m)).rejects.toMatchObject({ status: 403 });
    expect((await updateGroup(db, g.id, { name: "Renamed" }, owner)).name).toBe("Renamed");
    await leaveGroup(db, g.id, m);
    expect(await getMembership(db, g.id, m.id)).toBeNull();
  });

  it("hides private groups from non-members and from the public list, shows them to moderators", async () => {
    const owner = await user("p-owner@example.edu");
    const outsider = await user("p-outsider@example.edu");
    const mod = await user("p-mod@example.edu", "moderator");
    const g = await createGroup(
      db,
      { courseCode: "COP4530", name: "Secret circle", description: "", capacity: 4, visibility: "private" },
      owner,
    );
    await expect(getVisibleGroup(db, g.id, outsider)).rejects.toMatchObject({ status: 404 });
    await expect(getVisibleGroup(db, g.id, null)).rejects.toMatchObject({ status: 404 });
    expect((await getVisibleGroup(db, g.id, owner)).group.id).toBe(g.id);
    expect((await getVisibleGroup(db, g.id, mod)).group.id).toBe(g.id);
    const anon = await listGroups(db, { viewer: null, pageSize: 50 });
    expect(anon.items.map((x) => x.id)).not.toContain(g.id);
    const asOwner = await listGroups(db, { viewer: owner, pageSize: 50 });
    expect(asOwner.items.map((x) => x.id)).toContain(g.id);
    await expect(joinGroup(db, g.id, outsider)).rejects.toMatchObject({ status: 409 });
    await joinGroup(db, g.id, mod);
    expect((await listMyGroups(db, mod.id)).map((x) => x.id)).toContain(g.id);
    await removeMember(db, g.id, mod.id, owner);
    expect(await getMembership(db, g.id, mod.id)).toBeNull();
  });
});

describe("meetups and RSVPs", () => {
  it("schedules a reminder, reschedules on time change, cancels, and lists per user", async () => {
    const owner = await user("m-owner@example.edu");
    const member = await user("m-member@example.edu");
    const decliner = await user("m-decliner@example.edu");
    const g = await createGroup(
      db,
      { courseCode: "COP4530", name: "Meetup group", description: "", capacity: 5, visibility: "public" },
      owner,
    );
    await joinGroup(db, g.id, member);
    await joinGroup(db, g.id, decliner);
    const h = hooks();
    const startsAt = inAnHour();
    const m = await createMeetup(db, { groupId: g.id, startsAt, durationMinutes: 90, location: "LIB 207", notes: "" }, owner, h);
    expect(h.scheduled).toEqual([[m.id, startsAt]]);
    expect(m.endsAt.getTime() - m.startsAt.getTime()).toBe(90 * 60_000);
    await expect(
      createMeetup(db, { groupId: g.id, startsAt, durationMinutes: 60, location: "x", notes: "" }, member, h),
    ).rejects.toMatchObject({ status: 403 });

    await setRsvp(db, m.id, member, "maybe");
    await setRsvp(db, m.id, decliner, "no");
    await expect(setRsvp(db, m.id, await user("m-stranger@example.edu"), "going")).rejects.toMatchObject({ status: 403 });
    const listed = await listMeetupsForGroup(db, g.id, member.id);
    expect(listed[0]).toMatchObject({ going: 1, maybe: 1, myStatus: "maybe" });
    const recipients = (await reminderRecipients(db, m.id)).map((r) => r.email).sort();
    expect(recipients).toEqual(["m-member@example.edu", "m-owner@example.edu"]);

    const later = new Date(startsAt.getTime() + 24 * 3600_000);
    const moved = await updateMeetup(db, m.id, { startsAt: later }, owner, h);
    expect(moved.startsAt.getTime()).toBe(later.getTime());
    expect(h.scheduled.at(-1)).toEqual([m.id, later]);
    await updateMeetup(db, m.id, { location: "Room 301" }, owner, h);
    expect(h.scheduled.length).toBe(2); // a location change does not reschedule
    const mine = await listMeetupsForUser(db, member.id, new Date(), new Date(Date.now() + 3 * 24 * 3600_000));
    expect(mine.map((x) => x.id)).toContain(m.id);

    await updateMeetup(db, m.id, { cancelled: true }, owner, h);
    expect(h.cancelled).toEqual([m.id]);
    await expect(setRsvp(db, m.id, member, "going")).rejects.toMatchObject({ status: 409 });
  });
});

describe("reports, roles, activity and account deletion", () => {
  it("moderators resolve reports with an audit trail; members cannot", async () => {
    const reporter = await user("r-reporter@example.edu");
    const mod = await user("r-mod@example.edu", "moderator");
    const target = await createGroup(
      db,
      { courseCode: "COP4530", name: "Reported", description: "", capacity: 3, visibility: "public" },
      reporter,
    );
    const r = await createReport(db, { targetType: "group", targetId: target.id, reason: "spam links in the description" }, reporter);
    expect((await listOpenReports(db)).map((x) => x.id)).toContain(r.id);
    await expect(resolveReport(db, r.id, { status: "resolved", note: "" }, reporter)).rejects.toMatchObject({ status: 403 });
    const done = await resolveReport(db, r.id, { status: "resolved", note: "removed the links" }, mod);
    expect(done.status).toBe("resolved");
    expect((await listOpenReports(db)).map((x) => x.id)).not.toContain(r.id);
    expect((await listAudit(db)).some((a) => a.action === "report.resolved" && a.targetId === target.id)).toBe(true);
  });

  it("only admins change roles, and not their own", async () => {
    const admin = await user("a-admin@example.edu", "admin");
    const mod = await user("a-mod@example.edu", "moderator");
    const plain = await user("a-plain@example.edu");
    await expect(setUserRole(db, mod, plain.id, "moderator")).rejects.toMatchObject({ status: 403 });
    expect((await setUserRole(db, admin, plain.id, "moderator")).role).toBe("moderator");
    await expect(setUserRole(db, admin, admin.id, "member")).rejects.toMatchObject({ status: 403 });
  });

  it("records activity at most once an hour and counts weekly active users", async () => {
    const u = await user("act@example.edu");
    const before = await weeklyActiveUsers(db);
    expect(await touchActivity(db, u.id)).toBe(true);
    expect(await touchActivity(db, u.id)).toBe(false);
    expect(await weeklyActiveUsers(db)).toBe(before + 1);
    expect(await weeklyActiveUsers(db, new Date(Date.now() + 30 * 24 * 3600_000))).toBe(0);
  });

  it("deleting an account hands groups to the next member or removes them", async () => {
    const owner = await user("d-owner@example.edu");
    const heir = await user("d-heir@example.edu");
    const shared = await createGroup(
      db,
      { courseCode: "COP4530", name: "Shared", description: "", capacity: 5, visibility: "public" },
      owner,
    );
    const solo = await createGroup(db, { courseCode: "COP4530", name: "Solo", description: "", capacity: 5, visibility: "public" }, owner);
    await joinGroup(db, shared.id, heir);
    await deleteOwnAccount(db, owner);
    expect(await findUserById(db, owner.id)).toBeNull();
    expect((await getGroup(db, shared.id))?.ownerId).toBe(heir.id);
    expect((await getMembership(db, shared.id, heir.id))?.role).toBe("owner");
    expect(await getGroup(db, solo.id)).toBeNull();
  });
});
