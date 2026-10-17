import { and, asc, count, countDistinct, desc, eq, gte, ilike, isNull, lt, ne, or, sql } from "drizzle-orm";
import { type Db } from "@/db/client";
import { auditLog, dailyActive, groups, memberships, users, type SiteRole, type User } from "@/db/schema";
import { canChangeRole, forbidden, notFound } from "@/lib/rbac";

export type CurrentUser = Pick<User, "id" | "email" | "name" | "image" | "role">;

export async function findUserById(d: Db, id: string): Promise<User | null> {
  const [u] = await d.select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

export async function findUserByEmail(d: Db, email: string): Promise<User | null> {
  const [u] = await d.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return u ?? null;
}

/** Used by the dev login only; Google sign-ins go through the Auth.js adapter. */
export async function findOrCreateUserByEmail(d: Db, email: string, name: string | null): Promise<User> {
  const [u] = await d
    .insert(users)
    .values({ email: email.toLowerCase(), name, emailVerified: new Date() })
    .onConflictDoUpdate({ target: users.email, set: { name: sql`coalesce(${users.name}, excluded.name)` } })
    .returning();
  return u;
}

/**
 * Marks the user active: last_seen_at at most once an hour and one daily_active row per UTC day.
 * Returns true when it wrote something, so callers can keep it cheap on hot paths.
 */
export async function touchActivity(d: Db, userId: string, now: Date = new Date()): Promise<boolean> {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const updated = await d
    .update(users)
    .set({ lastSeenAt: now })
    .where(and(eq(users.id, userId), or(isNull(users.lastSeenAt), lt(users.lastSeenAt, hourAgo))))
    .returning({ id: users.id });
  if (updated.length === 0) return false;
  await d
    .insert(dailyActive)
    .values({ userId, day: now.toISOString().slice(0, 10) })
    .onConflictDoNothing();
  return true;
}

/** Distinct users active in the 7 days ending at `asOf` (the README's weekly active users). */
export async function weeklyActiveUsers(d: Db, asOf: Date = new Date()): Promise<number> {
  const from = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [row] = await d
    .select({ n: countDistinct(dailyActive.userId) })
    .from(dailyActive)
    .where(gte(dailyActive.day, from));
  return Number(row?.n ?? 0);
}

export async function listUsers(
  d: Db,
  q = "",
  limit = 50,
): Promise<Pick<User, "id" | "email" | "name" | "role" | "lastSeenAt" | "createdAt">[]> {
  const where = q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined;
  return d
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export async function countUsers(d: Db): Promise<number> {
  const [row] = await d.select({ n: count() }).from(users);
  return Number(row?.n ?? 0);
}

export async function writeAudit(
  d: Db,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await d.insert(auditLog).values({ actorId, action, targetType, targetId, details });
}

export async function setUserRole(d: Db, actor: CurrentUser, targetId: string, role: SiteRole): Promise<User> {
  const target = await findUserById(d, targetId);
  if (!target) throw notFound("user not found");
  if (!canChangeRole(actor, target, role)) throw forbidden("only admins change roles, and not their own");
  const [updated] = await d.update(users).set({ role }).where(eq(users.id, targetId)).returning();
  await writeAudit(d, actor.id, "user.role", "user", targetId, { from: target.role, to: role });
  return updated;
}

export async function listAudit(d: Db, limit = 50) {
  return d.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}

/**
 * Deletes the caller's account. Groups they own pass to the longest-standing other member; a group with no
 * other members is deleted. Everything else (memberships, RSVPs, reports, activity) cascades.
 */
export async function deleteOwnAccount(d: Db, user: CurrentUser): Promise<void> {
  await d.transaction(async (tx) => {
    const owned = await tx.select({ id: groups.id }).from(groups).where(eq(groups.ownerId, user.id));
    for (const g of owned) {
      const [heir] = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.groupId, g.id), ne(memberships.userId, user.id)))
        .orderBy(asc(memberships.joinedAt))
        .limit(1);
      if (heir) {
        await tx.update(groups).set({ ownerId: heir.userId, updatedAt: new Date() }).where(eq(groups.id, g.id));
        await tx
          .update(memberships)
          .set({ role: "owner" })
          .where(and(eq(memberships.groupId, g.id), eq(memberships.userId, heir.userId)));
      } else {
        await tx.delete(groups).where(eq(groups.id, g.id));
      }
    }
    await tx
      .insert(auditLog)
      .values({ actorId: null, action: "user.delete", targetType: "user", targetId: user.id, details: { ownedGroups: owned.length } });
    await tx.delete(users).where(eq(users.id, user.id));
  });
}
