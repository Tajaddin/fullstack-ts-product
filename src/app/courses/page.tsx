import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { listCoursesWithGroupCounts } from "@/server/courses";

export const metadata: Metadata = { title: "Courses", description: "Courses with study groups, searchable by code or title." };

export default async function CoursesPage({ searchParams }: PageProps<"/courses">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 80) : "";
  const courses = await listCoursesWithGroupCounts(db(), query);
  return (
    <>
      <h1 className="text-2xl font-bold">Courses</h1>
      <form action="/courses" method="get" role="search" className="mt-4 flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">
          Search courses
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Code or title"
          className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3"
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
      <p className="mt-2 text-sm text-muted">
        {courses.length} course{courses.length === 1 ? "" : "s"}
        {query ? ` matching "${query}"` : ""}. Missing yours?{" "}
        <Link className="underline" href={`/groups/new${query ? `?course=${encodeURIComponent(query)}` : ""}`}>
          Start a group and add it.
        </Link>
      </p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
        {courses.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <Link href={`/courses/${c.code}`} className="font-semibold hover:underline">
                {c.code.slice(0, 3)} {c.code.slice(3)}
              </Link>
              <p className="text-sm text-muted">{c.title}</p>
            </div>
            <span className="text-sm text-muted">
              {c.groupCount} group{c.groupCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {courses.length === 0 && <li className="px-4 py-6 text-muted">Nothing matches.</li>}
      </ul>
    </>
  );
}
