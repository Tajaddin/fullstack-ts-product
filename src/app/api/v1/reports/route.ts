import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { createReportSchema } from "@/lib/validation";
import { createReport } from "@/server/reports";

export const POST = api(
  { route: "/api/v1/reports", auth: "required", mutation: true, body: createReportSchema },
  async ({ body, user }) => {
    const report = await createReport(db(), body, user!);
    return json({ id: report.id, status: report.status }, { status: 201 });
  },
);
