import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { createCourseSchema, searchCoursesQuerySchema } from "@/lib/validation";
import { createCourse, searchCourses } from "@/server/courses";

export const GET = api({ route: "/api/v1/courses", query: searchCoursesQuerySchema }, async ({ query }) => {
  const items = await searchCourses(db(), query.q, query.limit);
  return json({ items });
});

export const POST = api(
  { route: "/api/v1/courses", auth: "required", mutation: true, body: createCourseSchema },
  async ({ body, user }) => {
    const course = await createCourse(db(), body, user!.id);
    return json(course, { status: 201 });
  },
);
