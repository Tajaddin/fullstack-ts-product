import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { updateGroupSchema } from "@/lib/validation";
import { getVisibleGroup, listMembers, updateGroup } from "@/server/groups";
import { listMeetupsForGroup } from "@/server/meetups";

export const GET = api({ route: "/api/v1/groups/[id]", auth: "optional" }, async ({ params, user }) => {
  const { group, membership } = await getVisibleGroup(db(), params.id, user);
  const [members, meetups] = await Promise.all([listMembers(db(), group.id), listMeetupsForGroup(db(), group.id, user?.id ?? null)]);
  return json({
    group,
    membership,
    members: members.map((m) => ({ userId: m.userId, name: m.name, role: m.role, joinedAt: m.joinedAt })),
    meetups,
  });
});

export const PATCH = api(
  { route: "/api/v1/groups/[id]", auth: "required", mutation: true, body: updateGroupSchema },
  async ({ params, body, user }) => {
    const group = await updateGroup(db(), params.id, body, user!);
    return json(group);
  },
);
