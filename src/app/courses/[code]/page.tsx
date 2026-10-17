import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { GroupCard } from "@/components/group-card";
import { courseCode } from "@/lib/validation";
import { getCourseByCode } from "@/server/courses";
import { listGroups } from "@/server/groups";
import { getCurrentUser } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/courses/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: `${code.toUpperCase()} study groups` };
}

export default async function CoursePage({ params }: PageProps<"/courses/[code]">) {
  const { code: raw } = await params;
  const parsed = courseCode.safeParse(raw);
  if (!parsed.success) notFound();
  const course = await getCourseByCode(db(), parsed.data);
  if (!course) notFound();
  const user = await getCurrentUser();
  const { items } = await listGroups(db(), { courseId: course.id, viewer: user, pageSize: 50 });
  return (
    <>
      <p className="text-sm text-muted">
        <Link href="/courses" className="hover:underline">
          Courses
        </Link>{" "}
        / {course.code}
      </p>
      <h1 className="mt-1 text-2xl font-bold">
        {course.code.slice(0, 3)} {course.code.slice(3)}: {course.title}
      </h1>
      <p className="mt-4">
        <Link className="btn btn-primary" href={`/groups/new?course=${course.code}`}>
          Start a group for this course
        </Link>
      </p>
      <h2 className="mt-8 text-xl font-semibold">Groups</h2>
      {items.length === 0 ? (
        <p className="card mt-3 text-muted">No groups for this course yet.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </ul>
      )}
    </>
  );
}
