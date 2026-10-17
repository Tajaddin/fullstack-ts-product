// Pure authorisation rules. Every mutation checks one of these; the tests pin them down.

export type SiteRole = "member" | "moderator" | "admin";
export type GroupRole = "owner" | "member";

export interface Principal {
  id: string;
  role: SiteRole;
}

export interface GroupLike {
  id: string;
  ownerId: string;
  visibility: "public" | "private";
  archived: boolean;
  capacity: number;
}

export interface MembershipLike {
  userId: string;
  role: GroupRole;
}

const rank: Record<SiteRole, number> = { member: 0, moderator: 1, admin: 2 };

export function hasRole(user: Principal | null | undefined, min: SiteRole): boolean {
  return !!user && rank[user.role] >= rank[min];
}

export function canModerate(user: Principal | null | undefined): boolean {
  return hasRole(user, "moderator");
}

export function canViewGroup(user: Principal | null | undefined, group: GroupLike, membership: MembershipLike | null | undefined): boolean {
  if (group.visibility === "public") return true;
  if (!user) return false;
  return !!membership || canModerate(user);
}

/** Owners and admins manage a group (edit, archive, schedule meetups, remove members). */
export function canManageGroup(
  user: Principal | null | undefined,
  group: GroupLike,
  membership: MembershipLike | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (group.ownerId === user.id) return true;
  return membership?.role === "owner";
}

export function canJoinGroup(
  user: Principal | null | undefined,
  group: GroupLike,
  membership: MembershipLike | null | undefined,
  memberCount: number,
): { ok: true } | { ok: false; reason: "signed-out" | "already-member" | "archived" | "full" | "private" } {
  if (!user) return { ok: false, reason: "signed-out" };
  if (membership) return { ok: false, reason: "already-member" };
  if (group.archived) return { ok: false, reason: "archived" };
  if (group.visibility === "private" && !canModerate(user)) return { ok: false, reason: "private" };
  if (memberCount >= group.capacity) return { ok: false, reason: "full" };
  return { ok: true };
}

/** Owners cannot leave; they archive or hand the group over instead. */
export function canLeaveGroup(membership: MembershipLike | null | undefined): boolean {
  return !!membership && membership.role !== "owner";
}

export function canChangeRole(actor: Principal, target: Principal, next: SiteRole): boolean {
  if (actor.role !== "admin") return false;
  if (actor.id === target.id && next !== "admin") return false; // no locking yourself out
  return true;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "error",
    public readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "sign in required") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "not allowed") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "not found") => new HttpError(404, msg, "not_found");
export const conflict = (msg: string) => new HttpError(409, msg, "conflict");
export const badRequest = (msg: string, details?: Record<string, string>) => new HttpError(400, msg, "bad_request", details);
