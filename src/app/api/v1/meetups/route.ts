import { db } from "@/db/client";
import { api, json } from "@/lib/http";
import { createMeetupSchema } from "@/lib/validation";
import { createMeetup } from "@/server/meetups";

export const POST = api(
  { route: "/api/v1/meetups", auth: "required", mutation: true, body: createMeetupSchema },
  async ({ body, user }) => {
    const meetup = await createMeetup(db(), body, user!);
    return json(meetup, { status: 201 });
  },
);
