import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { type Db } from "@/db/client";
import { courses, groups, type Course } from "@/db/schema";

export function departmentOf(code: string): string {
  return code.slice(0, 3);
}

export async function searchCourses(d: Db, q: string, limit = 20): Promise<Course[]> {
  const needle = q.trim();
  const where = needle
    ? or(ilike(courses.code, `%${needle.toUpperCase().replace(/\s+/g, "")}%`), ilike(courses.title, `%${needle}%`))
    : undefined;
  return d.select().from(courses).where(where).orderBy(asc(courses.code)).limit(limit);
}

export async function getCourseByCode(d: Db, code: string): Promise<Course | null> {
  const [c] = await d.select().from(courses).where(eq(courses.code, code)).limit(1);
  return c ?? null;
}

/** Idempotent: a second create with the same code returns the existing row. */
export async function createCourse(d: Db, input: { code: string; title: string }, createdBy: string | null): Promise<Course> {
  const [c] = await d
    .insert(courses)
    .values({ code: input.code, title: input.title, department: departmentOf(input.code), createdBy })
    .onConflictDoNothing({ target: courses.code })
    .returning();
  if (c) return c;
  const existing = await getCourseByCode(d, input.code);
  if (!existing) throw new Error("course insert raced and vanished");
  return existing;
}

export interface CourseWithCounts extends Course {
  groupCount: number;
}

export async function listCoursesWithGroupCounts(d: Db, q = ""): Promise<CourseWithCounts[]> {
  const needle = q.trim();
  const where = needle
    ? or(ilike(courses.code, `%${needle.toUpperCase().replace(/\s+/g, "")}%`), ilike(courses.title, `%${needle}%`))
    : undefined;
  const rows = await d
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      department: courses.department,
      createdBy: courses.createdBy,
      createdAt: courses.createdAt,
      groupCount: count(sql`case when ${groups.archived} = false then 1 end`),
    })
    .from(courses)
    .leftJoin(groups, and(eq(groups.courseId, courses.id)))
    .where(where)
    .groupBy(courses.id)
    .orderBy(asc(courses.code));
  return rows.map((r) => ({ ...r, groupCount: Number(r.groupCount) }));
}
