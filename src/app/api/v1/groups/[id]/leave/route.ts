import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { leaveGroup } from "@/server/groups";

export const POST = api({ route: "/api/v1/groups/[id]/leave", auth: "required", mutation: true }, async ({ params, user }) => {
  await leaveGroup(db(), params.id, user!);
  return json({ ok: true });
});
