import { z } from "zod";

// One schema per input, shared by server actions and the /api/v1 route handlers.

export const courseCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[A-Z]{3}\d{4}[A-Z]?$/, "course code looks like COP 4530"));

export const createCourseSchema = z.object({
  code: courseCode,
  title: z.string().trim().min(2).max(120),
});

export const visibilitySchema = z.enum(["public", "private"]);

export const createGroupSchema = z.object({
  courseCode,
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(2000).default(""),
  capacity: z.coerce.number().int().min(2).max(50).default(8),
  visibility: visibilitySchema.default("public"),
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(2000),
    capacity: z.coerce.number().int().min(2).max(50),
    visibility: visibilitySchema,
    archived: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "nothing to update");

export const createMeetupSchema = z
  .object({
    groupId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
    location: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(2000).default(""),
  })
  .refine((v) => !(v.startsAt instanceof Date) || v.startsAt.getTime() > Date.now() - 5 * 60_000, {
    message: "meetup must start in the future",
    path: ["startsAt"],
  });

export const updateMeetupSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    durationMinutes: z.coerce.number().int().min(15).max(480),
    location: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(2000),
    cancelled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "nothing to update");

export const rsvpSchema = z.object({ status: z.enum(["going", "maybe", "no"]) });

export const createReportSchema = z.object({
  targetType: z.enum(["group", "meetup", "user"]),
  targetId: z.uuid(),
  reason: z.string().trim().min(10).max(1000),
});

export const resolveReportSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  note: z.string().trim().max(500).default(""),
});

export const setRoleSchema = z.object({ role: z.enum(["member", "moderator", "admin"]) });

export const listGroupsQuerySchema = z.object({
  course: courseCode.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchCoursesQuerySchema = z.object({
  q: z.string().trim().max(80).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateMeetupInput = z.infer<typeof createMeetupSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;

/** Flattens zod issues to { field: message } for forms and API error bodies. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
