import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { rsvpSchema } from "@/lib/validation";
import { setRsvp } from "@/server/meetups";

export const POST = api(
  { route: "/api/v1/meetups/[id]/rsvp", auth: "required", mutation: true, body: rsvpSchema },
  async ({ params, body, user }) => {
    await setRsvp(db(), params.id, user!, body.status);
    return json({ ok: true, status: body.status });
  },
);
