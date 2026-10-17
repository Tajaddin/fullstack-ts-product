import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { type Db } from "@/db/client";
import { courses, groups, meetups, memberships, rsvps, users, type Meetup, type Rsvp } from "@/db/schema";
import { cancelReminder, scheduleReminder } from "@/lib/queue";
import { canManageGroup, conflict, forbidden, notFound, type Principal } from "@/lib/rbac";
import { getMembership, getVisibleGroup } from "./groups";

export interface MeetupWithRsvps extends Meetup {
  going: number;
  maybe: number;
  myStatus: Rsvp["status"] | null;
}

export interface MeetupForUser extends Meetup {
  groupName: string;
  courseCode: string;
}

export interface CreateMeetupData {
  groupId: string;
  startsAt: Date;
  durationMinutes: number;
  location: string;
  notes: string;
}

export interface JobHooks {
  schedule: (meetupId: string, startsAt: Date) => Promise<void>;
  cancel: (meetupId: string) => Promise<void>;
}

const defaultHooks: JobHooks = { schedule: scheduleReminder, cancel: cancelReminder };

export async function createMeetup(d: Db, data: CreateMeetupData, actor: Principal, hooks: JobHooks = defaultHooks): Promise<Meetup> {
  const { group, membership } = await getVisibleGroup(d, data.groupId, actor);
  if (!canManageGroup(actor, group, membership)) throw forbidden("only the owner schedules meetups");
  if (group.archived) throw conflict("this group is archived");
  const endsAt = new Date(data.startsAt.getTime() + data.durationMinutes * 60_000);
  const [m] = await d
    .insert(meetups)
    .values({ groupId: data.groupId, startsAt: data.startsAt, endsAt, location: data.location, notes: data.notes, createdBy: actor.id })
    .returning();
  await d.insert(rsvps).values({ meetupId: m.id, userId: actor.id, status: "going" }).onConflictDoNothing();
  await hooks.schedule(m.id, m.startsAt);
  return m;
}

export async function updateMeetup(
  d: Db,
  id: string,
  patch: { startsAt?: Date; durationMinutes?: number; location?: string; notes?: string; cancelled?: boolean },
  actor: Principal,
  hooks: JobHooks = defaultHooks,
): Promise<Meetup> {
  const existing = await getMeetup(d, id);
  if (!existing) throw notFound("meetup not found");
  const { group, membership } = await getVisibleGroup(d, existing.groupId, actor);
  if (!canManageGroup(actor, group, membership)) throw forbidden("only the owner edits meetups");
  const startsAt = patch.startsAt ?? existing.startsAt;
  const duration = patch.durationMinutes ?? Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000);
  const [updated] = await d
    .update(meetups)
    .set({
      startsAt,
      endsAt: new Date(startsAt.getTime() + duration * 60_000),
      location: patch.location ?? existing.location,
      notes: patch.notes ?? existing.notes,
      cancelled: patch.cancelled ?? existing.cancelled,
      updatedAt: new Date(),
    })
    .where(eq(meetups.id, id))
    .returning();
  if (updated.cancelled) await hooks.cancel(id);
  else if (updated.startsAt.getTime() !== existing.startsAt.getTime() || existing.cancelled) await hooks.schedule(id, updated.startsAt);
  return updated;
}

export async function getMeetup(d: Db, id: string): Promise<Meetup | null> {
  const [m] = await d.select().from(meetups).where(eq(meetups.id, id)).limit(1);
  return m ?? null;
}

export async function listMeetupsForGroup(
  d: Db,
  groupId: string,
  viewerId: string | null,
  from: Date = new Date(),
): Promise<MeetupWithRsvps[]> {
  const rows = await d
    .select({
      meetup: meetups,
      going: sql<number>`(select count(*) from ${rsvps} r where r.meetup_id = ${meetups.id} and r.status = 'going')`,
      maybe: sql<number>`(select count(*) from ${rsvps} r where r.meetup_id = ${meetups.id} and r.status = 'maybe')`,
      myStatus: viewerId
        ? sql<Rsvp["status"] | null>`(select r.status from ${rsvps} r where r.meetup_id = ${meetups.id} and r.user_id = ${viewerId})`
        : sql<null>`null`,
    })
    .from(meetups)
    .where(and(eq(meetups.groupId, groupId), gte(meetups.endsAt, from)))
    .orderBy(asc(meetups.startsAt))
    .limit(50);
  return rows.map((r) => ({ ...r.meetup, going: Number(r.going), maybe: Number(r.maybe), myStatus: r.myStatus }));
}

/** Upcoming meetups across every group the user belongs to, for /me and the weekly digest. */
export async function listMeetupsForUser(d: Db, userId: string, from: Date, to: Date): Promise<MeetupForUser[]> {
  const rows = await d
    .select({ meetup: meetups, groupName: groups.name, courseCode: courses.code })
    .from(meetups)
    .innerJoin(groups, eq(groups.id, meetups.groupId))
    .innerJoin(courses, eq(courses.id, groups.courseId))
    .innerJoin(memberships, and(eq(memberships.groupId, groups.id), eq(memberships.userId, userId)))
    .where(and(gte(meetups.startsAt, from), lte(meetups.startsAt, to), eq(meetups.cancelled, false)))
    .orderBy(asc(meetups.startsAt))
    .limit(100);
  return rows.map((r) => ({ ...r.meetup, groupName: r.groupName, courseCode: r.courseCode }));
}

export async function setRsvp(d: Db, meetupId: string, user: Principal, status: Rsvp["status"]): Promise<void> {
  const m = await getMeetup(d, meetupId);
  if (!m) throw notFound("meetup not found");
  const membership = await getMembership(d, m.groupId, user.id);
  if (!membership) throw forbidden("join the group to RSVP");
  if (m.cancelled) throw conflict("this meetup was cancelled");
  await d
    .insert(rsvps)
    .values({ meetupId, userId: user.id, status })
    .onConflictDoUpdate({ target: [rsvps.meetupId, rsvps.userId], set: { status, updatedAt: new Date() } });
}

export interface Recipient {
  userId: string;
  email: string;
  name: string | null;
}

/** Members who have not declined: everyone with RSVP going/maybe, plus members with no RSVP yet. */
export async function reminderRecipients(d: Db, meetupId: string): Promise<Recipient[]> {
  const m = await getMeetup(d, meetupId);
  if (!m) return [];
  const declined = d
    .select({ userId: rsvps.userId })
    .from(rsvps)
    .where(and(eq(rsvps.meetupId, meetupId), eq(rsvps.status, "no")));
  return d
    .select({ userId: users.id, email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.groupId, m.groupId), sql`${users.id} not in (${declined})`));
}

export async function usersWithMemberships(d: Db): Promise<Recipient[]> {
  return d
    .selectDistinct({ userId: users.id, email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId));
}

export async function meetupsByIds(d: Db, ids: string[]): Promise<Meetup[]> {
  if (!ids.length) return [];
  return d
    .select()
    .from(meetups)
    .where(and(inArray(meetups.id, ids), ne(meetups.cancelled, true)));
}
