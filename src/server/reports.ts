import { asc, eq } from "drizzle-orm";
import { type Db } from "@/db/client";
import { reports, users, type Report } from "@/db/schema";
import { canModerate, forbidden, notFound, type Principal } from "@/lib/rbac";
import type { CreateReportInput } from "@/lib/validation";
import { writeAudit } from "./users";

export interface OpenReport extends Report {
  reporterEmail: string;
}

export async function createReport(d: Db, input: CreateReportInput, reporter: Principal): Promise<Report> {
  const [r] = await d
    .insert(reports)
    .values({ targetType: input.targetType, targetId: input.targetId, reporterId: reporter.id, reason: input.reason })
    .returning();
  return r;
}

export async function listOpenReports(d: Db, limit = 100): Promise<OpenReport[]> {
  const rows = await d
    .select({ report: reports, reporterEmail: users.email })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.status, "open"))
    .orderBy(asc(reports.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.report, reporterEmail: r.reporterEmail }));
}

export async function resolveReport(
  d: Db,
  id: string,
  outcome: { status: "resolved" | "dismissed"; note: string },
  actor: Principal,
): Promise<Report> {
  if (!canModerate(actor)) throw forbidden("moderators only");
  const [existing] = await d.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!existing) throw notFound("report not found");
  const [updated] = await d
    .update(reports)
    .set({ status: outcome.status, resolvedBy: actor.id, resolvedAt: new Date(), resolutionNote: outcome.note })
    .where(eq(reports.id, id))
    .returning();
  await writeAudit(d, actor.id, `report.${outcome.status}`, existing.targetType, existing.targetId, { reportId: id, note: outcome.note });
  return updated;
}
