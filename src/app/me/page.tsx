import type { Metadata } from "next";
import Link from "next/link";
import { deleteAccountAction } from "@/app/actions";
import { db } from "@/db/client";
import { ActionButton } from "@/components/action-button";
import { GroupCard } from "@/components/group-card";
import { formatTimeRange } from "@/lib/format";
import { listMyGroups } from "@/server/groups";
import { listMeetupsForUser } from "@/server/meetups";
import { requireUserOrRedirect } from "@/server/session";

export const metadata: Metadata = { title: "My groups" };

export default async function MePage() {
  const user = await requireUserOrRedirect("/me");
  const now = new Date();
  const [groups, upcoming] = await Promise.all([
    listMyGroups(db(), user.id),
    listMeetupsForUser(db(), user.id, now, new Date(now.getTime() + 14 * 24 * 3600 * 1000)),
  ]);
  return (
    <>
      <h1 className="text-2xl font-bold">My groups</h1>
      <p className="text-muted">
        Signed in as {user.name ?? user.email} ({user.email}).
      </p>

      <section aria-labelledby="upcoming" className="mt-6">
        <h2 id="upcoming" className="text-xl font-semibold">
          Next two weeks
        </h2>
        {upcoming.length === 0 ? (
          <p className="card mt-3 text-muted">No meetups scheduled in your groups.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {upcoming.map((m) => (
              <li key={m.id} className="card flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <Link href={`/groups/${m.groupId}`} className="font-semibold hover:underline">
                    {m.courseCode} · {m.groupName}
                  </Link>
                  <span className="block text-sm text-muted">{m.location}</span>
                </span>
                <time className="text-sm" dateTime={m.startsAt.toISOString()}>
                  {formatTimeRange(m.startsAt, m.endsAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="groups" className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 id="groups" className="text-xl font-semibold">
            Groups
          </h2>
          <Link className="btn btn-primary" href="/groups/new">
            Start a group
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="card mt-3 text-muted">
            You are not in any group yet.{" "}
            <Link className="underline" href="/courses">
              Find your course.
            </Link>
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="account" className="mt-10">
        <h2 id="account" className="text-lg font-semibold">
          Account
        </h2>
        <p className="mt-1 text-sm text-muted">
          Deleting your account removes your memberships, RSVPs and reports. Groups you own pass to their longest-standing member, or are
          deleted if you were the only one. See the{" "}
          <Link className="underline" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
        <div className="mt-3">
          <ActionButton
            action={deleteAccountAction}
            className="btn btn-danger"
            confirm="Delete your account and everything tied to it? This cannot be undone."
          >
            Delete my account
          </ActionButton>
        </div>
      </section>
    </>
  );
}
