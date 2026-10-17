import type { Metadata } from "next";
import { db } from "@/db/client";
import { GroupForm } from "@/components/forms";
import { courseCode } from "@/lib/validation";
import { getCourseByCode } from "@/server/courses";
import { requireUserOrRedirect } from "@/server/session";

export const metadata: Metadata = { title: "Start a group" };

export default async function NewGroupPage({ searchParams }: PageProps<"/groups/new">) {
  await requireUserOrRedirect("/groups/new");
  const { course } = await searchParams;
  const parsed = courseCode.safeParse(typeof course === "string" ? course : "");
  const known = parsed.success ? await getCourseByCode(db(), parsed.data) : null;
  return (
    <>
      <h1 className="text-2xl font-bold">Start a group</h1>
      <p className="mt-2 max-w-2xl text-muted">
        You become the owner: you schedule meetups and can remove members. Groups are public unless you make them private.
      </p>
      <div className="card mt-6 max-w-2xl">
        <GroupForm courseCode={known?.code ?? (parsed.success ? parsed.data : "")} courseKnown={!!known} />
      </div>
    </>
  );
}
