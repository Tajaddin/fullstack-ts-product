import Link from "next/link";
import type { GroupSummary } from "@/server/groups";

export function GroupCard({ group }: { group: GroupSummary }) {
  const full = group.memberCount >= group.capacity;
  return (
    <li className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          <Link href={`/groups/${group.id}`} className="hover:underline">
            {group.name}
          </Link>
        </h3>
        <span className="badge">{group.course.code}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{group.course.title}</p>
      {group.description && <p className="mt-2 line-clamp-2 text-sm">{group.description}</p>}
      <p className="mt-2 text-sm text-muted">
        {group.memberCount} of {group.capacity} members
        {full ? " · full" : ""}
        {group.visibility === "private" ? " · private" : ""}
        {group.archived ? " · archived" : ""}
      </p>
    </li>
  );
}
