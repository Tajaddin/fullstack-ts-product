import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { getGroup, joinGroup } from "@/server/groups";

export const POST = api({ route: "/api/v1/groups/[id]/join", auth: "required", mutation: true }, async ({ params, user }) => {
  await joinGroup(db(), params.id, user!);
  return json(await getGroup(db(), params.id));
});
