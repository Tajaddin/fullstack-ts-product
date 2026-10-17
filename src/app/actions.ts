"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/db/client";
import { logger } from "@/lib/logger";
import { HttpError } from "@/lib/rbac";
import {
  createGroupSchema,
  createMeetupSchema,
  createReportSchema,
  fieldErrors,
  resolveReportSchema,
  rsvpSchema,
  setRoleSchema,
} from "@/lib/validation";
import { createGroup, joinGroup, leaveGroup, removeMember, updateGroup } from "@/server/groups";
import { guardMutation } from "@/server/guard";
import { createMeetup, setRsvp, updateMeetup } from "@/server/meetups";
import { createReport, resolveReport } from "@/server/reports";
import { deleteOwnAccount, setUserRole } from "@/server/users";

export interface FormState {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

const idle: FormState = { ok: false };

function fail(err: unknown): FormState {
  if (err instanceof ZodError) return { ok: false, message: "Please fix the highlighted fields.", errors: fieldErrors(err) };
  if (err instanceof HttpError) return { ok: false, message: err.message, errors: err.details };
  logger.error({ err }, "server action failed");
  return { ok: false, message: "Something went wrong. Please try again." };
}

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function signInWithGoogleAction(formData: FormData) {
  const next = str(formData, "next") || "/me";
  await signIn("google", { redirectTo: next.startsWith("/") ? next : "/me" });
}

export async function signInDevAction(_prev: FormState = idle, formData: FormData): Promise<FormState> {
  const next = str(formData, "next") || "/me";
  try {
    await signIn("dev", {
      email: str(formData, "email") ?? "",
      name: str(formData, "name") ?? "",
      redirectTo: next.startsWith("/") ? next : "/me",
    });
    return { ok: true };
  } catch (err) {
    // signIn redirects by throwing; let Next handle that and only report real failures.
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (typeof err === "object" && err && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT"))
      throw err;
    return { ok: false, message: "Sign-in failed. Check the e-mail address." };
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

const createGroupForm = createGroupSchema.extend({ courseTitle: z.string().trim().max(120).optional() });

export async function createGroupAction(_prev: FormState = idle, formData: FormData): Promise<FormState> {
  let groupId: string;
  try {
    const user = await guardMutation();
    const input = createGroupForm.parse({
      courseCode: str(formData, "courseCode"),
      courseTitle: str(formData, "courseTitle") || undefined,
      name: str(formData, "name"),
      description: str(formData, "description") ?? "",
      capacity: str(formData, "capacity") ?? "8",
      visibility: str(formData, "visibility") ?? "public",
    });
    const group = await createGroup(db(), input, user);
    groupId = group.id;
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/");
  revalidatePath("/courses");
  redirect(`/groups/${groupId}`);
}

export async function joinGroupAction(groupId: string): Promise<FormState> {
  try {
    const user = await guardMutation();
    await joinGroup(db(), groupId, user);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/me");
  return { ok: true, message: "You joined the group." };
}

export async function leaveGroupAction(groupId: string): Promise<FormState> {
  try {
    const user = await guardMutation();
    await leaveGroup(db(), groupId, user);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/me");
  return { ok: true, message: "You left the group." };
}

export async function archiveGroupAction(groupId: string, archived: boolean): Promise<FormState> {
  try {
    const user = await guardMutation();
    await updateGroup(db(), groupId, { archived }, user);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function removeMemberAction(groupId: string, userId: string): Promise<FormState> {
  try {
    const user = await guardMutation();
    await removeMember(db(), groupId, userId, user);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

export async function createMeetupAction(_prev: FormState = idle, formData: FormData): Promise<FormState> {
  const groupId = str(formData, "groupId") ?? "";
  try {
    const user = await guardMutation();
    // The form posts local wall-clock time plus the browser's offset; combine them into an instant.
    const local = str(formData, "startsAtLocal") ?? "";
    const offset = str(formData, "tzOffsetMinutes") ?? "0";
    const startsAt = localToIso(local, Number(offset));
    const input = createMeetupSchema.parse({
      groupId,
      startsAt,
      durationMinutes: str(formData, "durationMinutes") ?? "60",
      location: str(formData, "location"),
      notes: str(formData, "notes") ?? "",
    });
    await createMeetup(db(), input, user);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/me");
  return { ok: true, message: "Meetup scheduled. Members get a reminder an hour before." };
}

export async function cancelMeetupAction(meetupId: string, groupId: string): Promise<FormState> {
  try {
    const user = await guardMutation();
    await updateMeetup(db(), meetupId, { cancelled: true }, user);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: true, message: "Meetup cancelled." };
}

export async function rsvpAction(meetupId: string, groupId: string, status: string): Promise<FormState> {
  try {
    const user = await guardMutation();
    const parsed = rsvpSchema.parse({ status });
    await setRsvp(db(), meetupId, user, parsed.status);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

export async function reportAction(_prev: FormState = idle, formData: FormData): Promise<FormState> {
  try {
    const user = await guardMutation();
    const input = createReportSchema.parse({
      targetType: str(formData, "targetType"),
      targetId: str(formData, "targetId"),
      reason: str(formData, "reason"),
    });
    await createReport(db(), input, user);
  } catch (err) {
    return fail(err);
  }
  return { ok: true, message: "Thanks. A moderator will look at it." };
}

// Plain <form action> handlers: they return nothing, so failures are logged and the page simply re-renders.
export async function resolveReportAction(reportId: string, formData: FormData): Promise<void> {
  try {
    const user = await guardMutation();
    const input = resolveReportSchema.parse({ status: str(formData, "status"), note: str(formData, "note") ?? "" });
    await resolveReport(db(), reportId, input, user);
  } catch (err) {
    logger.warn({ err, reportId }, "resolve report failed");
    return;
  }
  revalidatePath("/admin");
}

export async function setRoleAction(userId: string, formData: FormData): Promise<void> {
  try {
    const user = await guardMutation();
    const input = setRoleSchema.parse({ role: str(formData, "role") });
    await setUserRole(db(), user, userId, input.role);
  } catch (err) {
    logger.warn({ err, userId }, "set role failed");
    return;
  }
  revalidatePath("/admin");
}

export async function deleteAccountAction(): Promise<FormState> {
  try {
    const user = await guardMutation();
    await deleteOwnAccount(db(), user);
  } catch (err) {
    return fail(err);
  }
  await signOut({ redirectTo: "/?deleted=1" });
  return { ok: true };
}

/** "2026-10-20T18:30" typed in a browser whose offset is `offsetMinutes` (Date#getTimezoneOffset) -> ISO instant. */
export async function localToIsoAction(local: string, offsetMinutes: number): Promise<string> {
  return localToIso(local, offsetMinutes);
}

function localToIso(local: string, offsetMinutes: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return local; // let zod report it
  const [, y, mo, d, h, mi] = m.map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi) + offsetMinutes * 60_000;
  return new Date(utc).toISOString();
}
