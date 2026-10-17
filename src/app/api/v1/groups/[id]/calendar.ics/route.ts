import { db } from "@/db/client";
import { api } from "@/lib/http";
import { groupCalendar } from "@/lib/ical";
import { getVisibleGroup } from "@/server/groups";
import { listMeetupsForGroup } from "@/server/meetups";

/** Subscribe-able calendar of a group's upcoming meetups (private groups need a signed-in member). */
export const GET = api({ route: "/api/v1/groups/[id]/calendar.ics", auth: "optional" }, async ({ params, user, request }) => {
  const { group } = await getVisibleGroup(db(), params.id, user);
  const meetups = await listMeetupsForGroup(db(), group.id, null, new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const origin = process.env.APP_URL ?? request.nextUrl.origin;
  const body = groupCalendar(
    `${group.course.code} ${group.name}`,
    new URL(origin).host,
    meetups.map((m) => ({
      id: m.id,
      title: `${group.course.code} ${group.name}`,
      description: m.notes,
      location: m.location,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      url: `${origin}/groups/${group.id}`,
      cancelled: m.cancelled,
    })),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${group.course.code.toLowerCase()}-${group.id.slice(0, 8)}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});
