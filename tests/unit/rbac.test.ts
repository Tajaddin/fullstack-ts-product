import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canJoinGroup,
  canLeaveGroup,
  canManageGroup,
  canModerate,
  canViewGroup,
  hasRole,
  type GroupLike,
  type Principal,
} from "@/lib/rbac";

const member: Principal = { id: "u1", role: "member" };
const other: Principal = { id: "u2", role: "member" };
const moderator: Principal = { id: "m1", role: "moderator" };
const admin: Principal = { id: "a1", role: "admin" };
const group: GroupLike = { id: "g1", ownerId: "u1", visibility: "public", archived: false, capacity: 2 };
const privateGroup: GroupLike = { ...group, visibility: "private" };

describe("site roles", () => {
  it("ranks member < moderator < admin", () => {
    expect(hasRole(member, "member")).toBe(true);
    expect(hasRole(member, "moderator")).toBe(false);
    expect(hasRole(moderator, "moderator")).toBe(true);
    expect(hasRole(moderator, "admin")).toBe(false);
    expect(hasRole(admin, "member")).toBe(true);
    expect(hasRole(null, "member")).toBe(false);
    expect(canModerate(moderator)).toBe(true);
    expect(canModerate(member)).toBe(false);
  });
});

describe("viewing groups", () => {
  it("public groups are visible to everyone, private ones to members and moderators", () => {
    expect(canViewGroup(null, group, null)).toBe(true);
    expect(canViewGroup(null, privateGroup, null)).toBe(false);
    expect(canViewGroup(other, privateGroup, null)).toBe(false);
    expect(canViewGroup(other, privateGroup, { userId: "u2", role: "member" })).toBe(true);
    expect(canViewGroup(moderator, privateGroup, null)).toBe(true);
  });
});

describe("managing groups", () => {
  it("owner by group.ownerId, owner by membership role, and admins manage; others do not", () => {
    expect(canManageGroup(member, group, null)).toBe(true);
    expect(canManageGroup(other, group, { userId: "u2", role: "owner" })).toBe(true);
    expect(canManageGroup(other, group, { userId: "u2", role: "member" })).toBe(false);
    expect(canManageGroup(moderator, group, null)).toBe(false);
    expect(canManageGroup(admin, group, null)).toBe(true);
    expect(canManageGroup(null, group, null)).toBe(false);
  });
});

describe("joining and leaving", () => {
  it("explains every refusal", () => {
    expect(canJoinGroup(null, group, null, 0)).toEqual({ ok: false, reason: "signed-out" });
    expect(canJoinGroup(other, group, { userId: "u2", role: "member" }, 1)).toEqual({ ok: false, reason: "already-member" });
    expect(canJoinGroup(other, { ...group, archived: true }, null, 1)).toEqual({ ok: false, reason: "archived" });
    expect(canJoinGroup(other, privateGroup, null, 1)).toEqual({ ok: false, reason: "private" });
    expect(canJoinGroup(other, group, null, 2)).toEqual({ ok: false, reason: "full" });
    expect(canJoinGroup(other, group, null, 1)).toEqual({ ok: true });
    expect(canJoinGroup(moderator, privateGroup, null, 1)).toEqual({ ok: true });
  });

  it("owners cannot leave", () => {
    expect(canLeaveGroup({ userId: "u1", role: "owner" })).toBe(false);
    expect(canLeaveGroup({ userId: "u2", role: "member" })).toBe(true);
    expect(canLeaveGroup(null)).toBe(false);
  });
});

describe("changing roles", () => {
  it("only admins, and never demoting themselves", () => {
    expect(canChangeRole(admin, member, "moderator")).toBe(true);
    expect(canChangeRole(moderator, member, "moderator")).toBe(false);
    expect(canChangeRole(admin, admin, "member")).toBe(false);
    expect(canChangeRole(admin, admin, "admin")).toBe(true);
  });
});
