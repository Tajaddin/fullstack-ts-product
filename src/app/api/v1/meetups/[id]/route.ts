import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { updateMeetupSchema } from "@/lib/validation";
import { updateMeetup } from "@/server/meetups";

export const PATCH = api(
  { route: "/api/v1/meetups/[id]", auth: "required", mutation: true, body: updateMeetupSchema },
  async ({ params, body, user }) => {
    const meetup = await updateMeetup(db(), params.id, body, user!);
    return json(meetup);
  },
);
