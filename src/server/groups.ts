import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { type Db } from "@/db/client";
import { courses, groups, memberships, users, type Course, type Group, type Membership } from "@/db/schema";
import {
  badRequest,
  canJoinGroup,
  canLeaveGroup,
  canManageGroup,
  canViewGroup,
  conflict,
  forbidden,
  notFound,
  type Principal,
} from "@/lib/rbac";
import type { CreateGroupInput } from "@/lib/validation";
import { createCourse, getCourseByCode } from "./courses";
import { writeAudit } from "./users";

export interface GroupSummary extends Group {
  course: Pick<Course, "id" | "code" | "title">;
  memberCount: number;
}

export interface GroupMember {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Membership["role"];
  joinedAt: Date;
}

const memberCountSql = sql<number>`(select count(*) from ${memberships} m where m.group_id = ${groups.id})`;

function summaryColumns() {
  return {
    id: groups.id,
    courseId: groups.courseId,
    name: groups.name,
    description: groups.description,
    capacity: groups.capacity,
    visibility: groups.visibility,
    ownerId: groups.ownerId,
    archived: groups.archived,
    createdAt: groups.createdAt,
    updatedAt: groups.updatedAt,
    course: { id: courses.id, code: courses.code, title: courses.title },
    memberCount: memberCountSql,
  };
}

export interface ListGroupsOptions {
  courseId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  viewer?: Principal | null;
  includeArchived?: boolean;
}

/** Public groups, plus private ones the viewer belongs to (moderators see all). Newest first. */
export async function listGroups(d: Db, opts: ListGroupsOptions = {}): Promise<{ items: GroupSummary[]; total: number }> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const conds = [];
  if (opts.courseId) conds.push(eq(groups.courseId, opts.courseId));
  if (!opts.includeArchived) conds.push(eq(groups.archived, false));
  if (opts.q)
    conds.push(
      or(
        ilike(groups.name, `%${opts.q}%`),
        ilike(groups.description, `%${opts.q}%`),
        ilike(courses.code, `%${opts.q.toUpperCase().replace(/\s+/g, "")}%`),
      ),
    );
  const viewer = opts.viewer;
  if (!viewer) conds.push(eq(groups.visibility, "public"));
  else if (viewer.role === "member") {
    conds.push(
      or(
        eq(groups.visibility, "public"),
        sql`exists (select 1 from ${memberships} m where m.group_id = ${groups.id} and m.user_id = ${viewer.id})`,
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const [items, [{ total }]] = await Promise.all([
    d
      .select(summaryColumns())
      .from(groups)
      .innerJoin(courses, eq(courses.id, groups.courseId))
      .where(where)
      .orderBy(desc(groups.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    d.select({ total: count() }).from(groups).innerJoin(courses, eq(courses.id, groups.courseId)).where(where),
  ]);
  return { items: items.map((g) => ({ ...g, memberCount: Number(g.memberCount) })), total: Number(total) };
}

export async function getGroup(d: Db, id: string): Promise<GroupSummary | null> {
  const [g] = await d
    .select(summaryColumns())
    .from(groups)
    .innerJoin(courses, eq(courses.id, groups.courseId))
    .where(eq(groups.id, id))
    .limit(1);
  return g ? { ...g, memberCount: Number(g.memberCount) } : null;
}

export async function getMembership(d: Db, groupId: string, userId: string): Promise<Membership | null> {
  const [m] = await d
    .select()
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)))
    .limit(1);
  return m ?? null;
}

export async function listMembers(d: Db, groupId: string): Promise<GroupMember[]> {
  return d
    .select({
      userId: memberships.userId,
      name: users.name,
      email: users.email,
      image: users.image,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.groupId, groupId))
    .orderBy(asc(memberships.joinedAt));
}

export async function listMyGroups(d: Db, userId: string): Promise<(GroupSummary & { myRole: Membership["role"] })[]> {
  const rows = await d
    .select({ ...summaryColumns(), myRole: memberships.role })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .innerJoin(courses, eq(courses.id, groups.courseId))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(groups.createdAt));
  return rows.map((g) => ({ ...g, memberCount: Number(g.memberCount) }));
}

/** Loads a group the viewer may see, or throws 404 (private groups do not reveal their existence). */
export async function getVisibleGroup(
  d: Db,
  id: string,
  viewer: Principal | null,
): Promise<{ group: GroupSummary; membership: Membership | null }> {
  const group = await getGroup(d, id);
  if (!group) throw notFound("group not found");
  const membership = viewer ? await getMembership(d, id, viewer.id) : null;
  if (!canViewGroup(viewer, group, membership)) throw notFound("group not found");
  return { group, membership };
}

export async function createGroup(d: Db, input: CreateGroupInput & { courseTitle?: string }, owner: Principal): Promise<GroupSummary> {
  let course = await getCourseByCode(d, input.courseCode);
  if (!course) {
    if (!input.courseTitle || input.courseTitle.trim().length < 2) {
      throw badRequest("unknown course; give it a title to add it", { courseTitle: "required for a new course" });
    }
    course = await createCourse(d, { code: input.courseCode, title: input.courseTitle.trim() }, owner.id);
  }
  const id = await d.transaction(async (tx) => {
    const [g] = await tx
      .insert(groups)
      .values({
        courseId: course.id,
        name: input.name,
        description: input.description,
        capacity: input.capacity,
        visibility: input.visibility,
        ownerId: owner.id,
      })
      .returning({ id: groups.id });
    await tx.insert(memberships).values({ groupId: g.id, userId: owner.id, role: "owner" });
    return g.id;
  });
  const created = await getGroup(d, id);
  if (!created) throw new Error("group vanished after insert");
  return created;
}

export async function updateGroup(
  d: Db,
  id: string,
  patch: Partial<Pick<Group, "name" | "description" | "capacity" | "visibility" | "archived">>,
  actor: Principal,
): Promise<GroupSummary> {
  const { group, membership } = await getVisibleGroup(d, id, actor);
  if (!canManageGroup(actor, group, membership)) throw forbidden("only the owner can edit this group");
  if (patch.capacity !== undefined && patch.capacity < group.memberCount) {
    throw badRequest(`capacity cannot be below the current ${group.memberCount} members`, { capacity: "too small" });
  }
  await d
    .update(groups)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(groups.id, id));
  if (patch.archived !== undefined) await writeAudit(d, actor.id, patch.archived ? "group.archive" : "group.unarchive", "group", id);
  const updated = await getGroup(d, id);
  if (!updated) throw notFound("group not found");
  return updated;
}

/** Joins inside a transaction with the group row locked, so capacity holds under concurrent joins. */
export async function joinGroup(d: Db, groupId: string, user: Principal): Promise<void> {
  await d.transaction(async (tx) => {
    const [g] = await tx.select().from(groups).where(eq(groups.id, groupId)).for("update").limit(1);
    if (!g) throw notFound("group not found");
    const [m] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, user.id)))
      .limit(1);
    const [{ n }] = await tx.select({ n: count() }).from(memberships).where(eq(memberships.groupId, groupId));
    const verdict = canJoinGroup(user, g, m ?? null, Number(n));
    if (!verdict.ok) {
      const messages = {
        "signed-out": "sign in required",
        "already-member": "you are already in this group",
        archived: "this group is archived",
        full: "this group is full",
        private: "this group is private",
      } as const;
      throw conflict(messages[verdict.reason]);
    }
    await tx.insert(memberships).values({ groupId, userId: user.id, role: "member" });
  });
}

export async function leaveGroup(d: Db, groupId: string, user: Principal): Promise<void> {
  const membership = await getMembership(d, groupId, user.id);
  if (!membership) throw notFound("you are not in this group");
  if (!canLeaveGroup(membership)) throw conflict("the owner cannot leave; archive the group instead");
  await d.delete(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, user.id)));
}

export async function removeMember(d: Db, groupId: string, targetUserId: string, actor: Principal): Promise<void> {
  const { group, membership } = await getVisibleGroup(d, groupId, actor);
  if (!canManageGroup(actor, group, membership)) throw forbidden("only the owner removes members");
  if (targetUserId === group.ownerId) throw conflict("the owner cannot be removed");
  await d.delete(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId)));
  await writeAudit(d, actor.id, "group.remove_member", "group", groupId, { userId: targetUserId });
}

export async function groupsByIds(d: Db, ids: string[]): Promise<Map<string, GroupSummary>> {
  if (ids.length === 0) return new Map();
  const rows = await d
    .select(summaryColumns())
    .from(groups)
    .innerJoin(courses, eq(courses.id, groups.courseId))
    .where(inArray(groups.id, ids));
  return new Map(rows.map((g) => [g.id, { ...g, memberCount: Number(g.memberCount) }]));
}
