import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { resolveReportSchema } from "@/lib/validation";
import { resolveReport } from "@/server/reports";

export const POST = api(
  { route: "/api/v1/admin/reports/[id]", auth: "required", role: "moderator", mutation: true, body: resolveReportSchema },
  async ({ params, body, user }) => {
    const report = await resolveReport(db(), params.id, body, user!);
    return json(report);
  },
);
