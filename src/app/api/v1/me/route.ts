import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { listMyGroups } from "@/server/groups";
import { listMeetupsForUser } from "@/server/meetups";

export const GET = api({ route: "/api/v1/me", auth: "required" }, async ({ user }) => {
  const now = new Date();
  const [groups, upcoming] = await Promise.all([
    listMyGroups(db(), user!.id),
    listMeetupsForUser(db(), user!.id, now, new Date(now.getTime() + 14 * 24 * 3600 * 1000)),
  ]);
  return json({ user: { id: user!.id, name: user!.name, email: user!.email, role: user!.role }, groups, upcoming });
});
