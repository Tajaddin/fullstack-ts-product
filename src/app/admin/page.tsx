import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveReportAction, setRoleAction } from "@/app/actions";
import { db } from "@/db/client";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format";
import { hasRole } from "@/lib/rbac";
import { listOpenReports } from "@/server/reports";
import { requireUserOrRedirect } from "@/server/session";
import { listAudit, listUsers, countUsers, weeklyActiveUsers } from "@/server/users";

export const metadata: Metadata = { title: "Moderation" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireUserOrRedirect("/admin");
  if (!hasRole(user, "moderator")) redirect("/me");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 80) : "";
  const isAdmin = user.role === "admin";
  const [reports, users, total, wau, audit] = await Promise.all([
    listOpenReports(db()),
    isAdmin ? listUsers(db(), query, 50) : Promise.resolve([]),
    countUsers(db()),
    weeklyActiveUsers(db()),
    listAudit(db(), 20),
  ]);
  return (
    <>
      <h1 className="text-2xl font-bold">Moderation</h1>
      <p className="text-muted">
        {total} accounts · {wau} active in the last 7 days · you are {user.role}
      </p>

      <section aria-labelledby="reports" className="mt-6">
        <h2 id="reports" className="text-xl font-semibold">
          Open reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="card mt-3 text-muted">Nothing open.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {reports.map((r) => (
              <li key={r.id} className="card" data-testid="report">
                <p className="text-sm text-muted">
                  {r.targetType} {r.targetId.slice(0, 8)} · reported by {r.reporterEmail} on {formatDate(r.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line">{r.reason}</p>
                <form action={resolveReportAction.bind(null, r.id)} className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="field flex-1">
                    <label htmlFor={`note-${r.id}`}>Note</label>
                    <input id={`note-${r.id}`} name="note" maxLength={500} placeholder="What you did about it" />
                  </div>
                  <SubmitButton name="status" value="resolved" className="btn btn-primary">
                    Resolve
                  </SubmitButton>
                  <SubmitButton name="status" value="dismissed" className="btn btn-secondary">
                    Dismiss
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section aria-labelledby="users" className="mt-8">
          <h2 id="users" className="text-xl font-semibold">
            Users
          </h2>
          <form action="/admin" method="get" role="search" className="mt-3 flex max-w-md gap-2">
            <label htmlFor="q" className="sr-only">
              Search users
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="E-mail or name"
              className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3"
            />
            <button type="submit" className="btn btn-secondary">
              Search
            </button>
          </form>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    User
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Last seen
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {u.name ?? "—"} <span className="text-muted">{u.email}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">{u.lastSeenAt ? formatDate(u.lastSeenAt) : "never"}</td>
                    <td className="px-3 py-2">
                      <form action={setRoleAction.bind(null, u.id)} className="flex items-center gap-2">
                        <label htmlFor={`role-${u.id}`} className="sr-only">
                          Role for {u.email}
                        </label>
                        <select
                          id={`role-${u.id}`}
                          name="role"
                          defaultValue={u.role}
                          className="rounded-md border border-border bg-surface px-2 py-1"
                        >
                          <option value="member">member</option>
                          <option value="moderator">moderator</option>
                          <option value="admin">admin</option>
                        </select>
                        <SubmitButton className="btn btn-secondary px-2 py-1 text-xs" pendingText="…">
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="audit" className="mt-8">
        <h2 id="audit" className="text-xl font-semibold">
          Recent moderation actions
        </h2>
        <ul className="mt-3 grid gap-1 text-sm">
          {audit.map((a) => (
            <li key={a.id} className="text-muted">
              {formatDate(a.createdAt)} · {a.action} · {a.targetType} {a.targetId.slice(0, 8)}
            </li>
          ))}
          {audit.length === 0 && <li className="text-muted">None yet.</li>}
        </ul>
      </section>
    </>
  );
}
