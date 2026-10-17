import Link from "next/link";
import { db } from "@/db/client";
import { GroupCard } from "@/components/group-card";
import { listGroups } from "@/server/groups";
import { getCurrentUser } from "@/server/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  const { items, total } = await listGroups(db(), { viewer: user, pageSize: 6 });
  return (
    <>
      <section className="py-6 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Study groups for your courses</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Find people taking the same course, or start a group yourself. Schedule meetups, RSVP, and get a reminder an hour before.
        </p>
        <form action="/courses" method="get" role="search" className="mt-6 flex max-w-xl gap-2">
          <label htmlFor="q" className="sr-only">
            Search courses
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Course code or title, e.g. COP 4530"
            className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        <p className="mt-3 text-sm text-muted">
          Or{" "}
          <Link className="underline" href="/groups/new">
            start a group
          </Link>{" "}
          for a course that has none yet.
        </p>
      </section>

      <section aria-labelledby="recent">
        <div className="flex items-baseline justify-between">
          <h2 id="recent" className="text-xl font-semibold">
            Newest groups
          </h2>
          <span className="text-sm text-muted">{total} open</span>
        </div>
        {items.length === 0 ? (
          <p className="card mt-3 text-muted">No groups yet. Be the first to start one.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {items.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how" className="mt-10">
        <h2 id="how" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          <li className="card">
            <span className="badge">1</span>
            <p className="mt-2 text-sm">Sign in with your Google account. We keep your name and e-mail, nothing else from Google.</p>
          </li>
          <li className="card">
            <span className="badge">2</span>
            <p className="mt-2 text-sm">Join a group for your course, or start one and set its size and visibility.</p>
          </li>
          <li className="card">
            <span className="badge">3</span>
            <p className="mt-2 text-sm">The owner schedules meetups; everyone RSVPs and gets a reminder e-mail an hour before.</p>
          </li>
        </ol>
      </section>
    </>
  );
}
