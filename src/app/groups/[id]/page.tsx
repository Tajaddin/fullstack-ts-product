import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveGroupAction, cancelMeetupAction, joinGroupAction, leaveGroupAction, removeMemberAction, rsvpAction } from "@/app/actions";
import { db } from "@/db/client";
import { ActionButton } from "@/components/action-button";
import { MeetupForm, ReportForm } from "@/components/forms";
import { formatTimeRange } from "@/lib/format";
import { canJoinGroup, canLeaveGroup, canManageGroup, HttpError } from "@/lib/rbac";
import { getVisibleGroup, listMembers } from "@/server/groups";
import { listMeetupsForGroup } from "@/server/meetups";
import { getCurrentUser } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/groups/[id]">): Promise<Metadata> {
  const { id } = await params;
  try {
    const user = await getCurrentUser();
    const { group } = await getVisibleGroup(db(), id, user);
    return { title: `${group.name} (${group.course.code})`, description: group.description.slice(0, 160) || undefined };
  } catch {
    return { title: "Group" };
  }
}

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  let data;
  try {
    data = await getVisibleGroup(db(), id, user);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
  const { group, membership } = data;
  const [members, meetups] = await Promise.all([listMembers(db(), group.id), listMeetupsForGroup(db(), group.id, user?.id ?? null)]);
  const manage = canManageGroup(user, group, membership);
  const joinVerdict = canJoinGroup(user, group, membership, members.length);
  const leave = canLeaveGroup(membership);

  return (
    <>
      <p className="text-sm text-muted">
        <Link href="/courses" className="hover:underline">
          Courses
        </Link>{" "}
        /{" "}
        <Link href={`/courses/${group.course.code}`} className="hover:underline">
          {group.course.code}
        </Link>
      </p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <p className="text-muted">
            {group.course.code.slice(0, 3)} {group.course.code.slice(3)} · {group.course.title}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {group.archived && <span className="badge">archived</span>}
          {group.visibility === "private" && <span className="badge">private</span>}
          {membership ? (
            leave ? (
              <ActionButton action={leaveGroupAction.bind(null, group.id)} confirm="Leave this group?">
                Leave group
              </ActionButton>
            ) : (
              <span className="badge">you own this group</span>
            )
          ) : joinVerdict.ok ? (
            <ActionButton action={joinGroupAction.bind(null, group.id)} className="btn btn-primary" pendingText="Joining…">
              Join group
            </ActionButton>
          ) : joinVerdict.reason === "signed-out" ? (
            <Link className="btn btn-primary" href={`/signin?next=/groups/${group.id}`}>
              Sign in to join
            </Link>
          ) : (
            <span className="text-sm text-muted">
              {joinVerdict.reason === "full"
                ? "This group is full"
                : joinVerdict.reason === "archived"
                  ? "This group is archived"
                  : "Members only"}
            </span>
          )}
        </div>
      </div>

      {group.description && <p className="prose mt-4 max-w-2xl whitespace-pre-line">{group.description}</p>}

      <div className="mt-8 grid gap-8 md:grid-cols-[2fr_1fr]">
        <section aria-labelledby="meetups">
          <div className="flex items-baseline justify-between">
            <h2 id="meetups" className="text-xl font-semibold">
              Upcoming meetups
            </h2>
            <a className="text-sm underline" href={`/api/v1/groups/${group.id}/calendar.ics`}>
              Calendar (.ics)
            </a>
          </div>
          {meetups.length === 0 ? (
            <p className="card mt-3 text-muted">Nothing scheduled yet.</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {meetups.map((m) => (
                <li key={m.id} className="card" data-testid="meetup">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      <time dateTime={m.startsAt.toISOString()}>{formatTimeRange(m.startsAt, m.endsAt)}</time>
                    </p>
                    {m.cancelled && <span className="badge">cancelled</span>}
                  </div>
                  <p className="text-sm">{m.location}</p>
                  {m.notes && <p className="mt-1 text-sm text-muted whitespace-pre-line">{m.notes}</p>}
                  <p className="mt-2 text-sm text-muted">
                    {m.going} going · {m.maybe} maybe
                    {m.myStatus ? ` · you: ${m.myStatus}` : ""}
                  </p>
                  {membership && !m.cancelled && (
                    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="RSVP">
                      {(["going", "maybe", "no"] as const).map((s) => (
                        <ActionButton
                          key={s}
                          action={rsvpAction.bind(null, m.id, group.id, s)}
                          className={m.myStatus === s ? "btn btn-primary" : "btn btn-secondary"}
                          pendingText="…"
                        >
                          {s === "no" ? "Can't make it" : s === "going" ? "Going" : "Maybe"}
                        </ActionButton>
                      ))}
                      {manage && (
                        <ActionButton
                          action={cancelMeetupAction.bind(null, m.id, group.id)}
                          className="btn btn-danger"
                          confirm="Cancel this meetup for everyone?"
                        >
                          Cancel meetup
                        </ActionButton>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {manage && !group.archived && (
            <details className="card mt-4">
              <summary className="cursor-pointer font-semibold">Schedule a meetup</summary>
              <div className="mt-3">
                <MeetupForm groupId={group.id} />
              </div>
            </details>
          )}
        </section>

        <aside>
          <section aria-labelledby="members">
            <h2 id="members" className="text-xl font-semibold">
              Members ({members.length}/{group.capacity})
            </h2>
            <ul className="mt-3 grid gap-2">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {m.name ?? m.email.split("@")[0]}
                    {m.role === "owner" && <span className="ml-2 badge">owner</span>}
                  </span>
                  {manage && m.role !== "owner" && (
                    <ActionButton
                      action={removeMemberAction.bind(null, group.id, m.userId)}
                      className="btn btn-danger px-2 py-1 text-xs"
                      confirm={`Remove ${m.name ?? m.email} from the group?`}
                    >
                      Remove
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {manage && (
            <section aria-labelledby="owner-tools" className="mt-6">
              <h2 id="owner-tools" className="text-lg font-semibold">
                Owner tools
              </h2>
              <div className="mt-2">
                <ActionButton
                  action={archiveGroupAction.bind(null, group.id, !group.archived)}
                  className="btn btn-secondary"
                  confirm={group.archived ? undefined : "Archive the group? It disappears from search and nobody can join."}
                >
                  {group.archived ? "Unarchive group" : "Archive group"}
                </ActionButton>
              </div>
            </section>
          )}

          {user && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted">Report this group</summary>
              <div className="card mt-2">
                <ReportForm targetType="group" targetId={group.id} />
              </div>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
