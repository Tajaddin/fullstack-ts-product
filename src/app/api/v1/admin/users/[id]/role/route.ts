import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { setRoleSchema } from "@/lib/validation";
import { setUserRole } from "@/server/users";

export const PATCH = api(
  { route: "/api/v1/admin/users/[id]/role", auth: "required", role: "admin", mutation: true, body: setRoleSchema },
  async ({ params, body, user }) => {
    const updated = await setUserRole(db(), user!, params.id, body.role);
    return json({ id: updated.id, role: updated.role });
  },
);
