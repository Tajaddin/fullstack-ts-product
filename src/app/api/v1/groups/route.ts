import { z } from "zod";
import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { createGroupSchema, listGroupsQuerySchema } from "@/lib/validation";
import { getCourseByCode } from "@/server/courses";
import { createGroup, listGroups } from "@/server/groups";

export const GET = api({ route: "/api/v1/groups", auth: "optional", query: listGroupsQuerySchema }, async ({ query, user }) => {
  let courseId: string | undefined;
  if (query.course) {
    const course = await getCourseByCode(db(), query.course);
    if (!course) return json({ items: [], total: 0, page: query.page, pageSize: query.pageSize });
    courseId = course.id;
  }
  const { items, total } = await listGroups(db(), { courseId, q: query.q, page: query.page, pageSize: query.pageSize, viewer: user });
  return json({ items, total, page: query.page, pageSize: query.pageSize });
});

const createBody = createGroupSchema.extend({ courseTitle: z.string().trim().max(120).optional() });

export const POST = api({ route: "/api/v1/groups", auth: "required", mutation: true, body: createBody }, async ({ body, user }) => {
  const group = await createGroup(db(), body, user!);
  return json(group, { status: 201 });
});
