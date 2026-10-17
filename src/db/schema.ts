import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const siteRole = pgEnum("site_role", ["member", "moderator", "admin"]);
export const groupRole = pgEnum("group_role", ["owner", "member"]);
export const visibility = pgEnum("visibility", ["public", "private"]);
export const rsvpStatus = pgEnum("rsvp_status", ["going", "maybe", "no"]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);
export const reportTarget = pgEnum("report_target", ["group", "meetup", "user"]);

const tz = { withTimezone: true, mode: "date" } as const;

// Auth.js tables (column keys are what @auth/drizzle-adapter expects).
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", tz),
  image: text("image"),
  role: siteRole("role").notNull().default("member"),
  lastSeenAt: timestamp("last_seen_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] }), index("accounts_user_idx").on(t.userId)],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", tz).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", tz).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// Product tables.
export const courses = pgTable(
  "courses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull(), // normalised, e.g. COP4530
    title: text("title").notNull(),
    department: text("department").notNull(), // e.g. COP
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("courses_code_idx").on(t.code), index("courses_department_idx").on(t.department)],
);

export const groups = pgTable(
  "groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    capacity: integer("capacity").notNull().default(8),
    visibility: visibility("visibility").notNull().default("public"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [index("groups_course_idx").on(t.courseId), index("groups_owner_idx").on(t.ownerId)],
);

export const memberships = pgTable(
  "memberships",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: groupRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const meetups = pgTable(
  "meetups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", tz).notNull(),
    endsAt: timestamp("ends_at", tz).notNull(),
    location: text("location").notNull(),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cancelled: boolean("cancelled").notNull().default(false),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [index("meetups_group_starts_idx").on(t.groupId, t.startsAt), index("meetups_starts_idx").on(t.startsAt)],
);

export const rsvps = pgTable(
  "rsvps",
  {
    meetupId: text("meetup_id")
      .notNull()
      .references(() => meetups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpStatus("status").notNull(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.meetupId, t.userId] })],
);

export const reports = pgTable(
  "reports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    targetType: reportTarget("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: reportStatus("status").notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", tz),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

// One row per user per UTC day they used the product; weekly active users = distinct users in 7 days.
export const dailyActive = pgTable(
  "daily_active",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] }), index("daily_active_day_idx").on(t.day)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Meetup = typeof meetups.$inferSelect;
export type Rsvp = typeof rsvps.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type SiteRole = (typeof siteRole.enumValues)[number];
export type GroupRole = (typeof groupRole.enumValues)[number];
