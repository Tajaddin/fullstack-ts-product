"use client";

import { useActionState } from "react";
import { createGroupAction, createMeetupAction, reportAction, signInDevAction, type FormState } from "@/app/actions";
import { nextHourLocal } from "@/lib/format";
import { SelectField, TextArea, TextField } from "./field";
import { SubmitButton } from "./submit-button";

const idle: FormState = { ok: false };

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-muted" : "text-sm text-danger"}>
      {state.message}
    </p>
  );
}

export function GroupForm({ courseCode = "", courseKnown = false }: { courseCode?: string; courseKnown?: boolean }) {
  const [state, formAction] = useActionState(createGroupAction, idle);
  const e = state.errors ?? {};
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <TextField
        label="Course code"
        name="courseCode"
        defaultValue={courseCode}
        placeholder="COP 4530"
        required
        maxLength={12}
        error={e.courseCode}
        hint="As in the catalog, for example COP 4530."
      />
      {!courseKnown && (
        <TextField
          label="Course title (only if the course is new here)"
          name="courseTitle"
          placeholder="Data Structures"
          maxLength={120}
          error={e.courseTitle}
        />
      )}
      <TextField
        label="Group name"
        name="name"
        required
        minLength={3}
        maxLength={80}
        placeholder="Tuesday night problem sets"
        error={e.name}
      />
      <TextArea
        label="What the group is about"
        name="description"
        rows={4}
        maxLength={2000}
        placeholder="What you meet for, how you work, anything newcomers should know."
        error={e.description}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Capacity" name="capacity" type="number" min={2} max={50} defaultValue={8} error={e.capacity} />
        <SelectField
          label="Visibility"
          name="visibility"
          defaultValue="public"
          options={[
            { value: "public", label: "Public: anyone can find and join" },
            { value: "private", label: "Private: members only" },
          ]}
          error={e.visibility}
        />
      </div>
      <Message state={state} />
      <div>
        <SubmitButton pendingText="Creating…">Create group</SubmitButton>
      </div>
    </form>
  );
}

export function MeetupForm({ groupId }: { groupId: string }) {
  const [state, formAction] = useActionState(createMeetupAction, idle);
  const e = state.errors ?? {};
  // The browser's offset and a sensible default start are filled in after mount through refs, so the
  // server-rendered markup and the first client render agree.
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="groupId" value={groupId} />
      <input
        type="hidden"
        name="tzOffsetMinutes"
        defaultValue="0"
        ref={(el) => {
          if (el) el.value = String(new Date().getTimezoneOffset());
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Starts"
          name="startsAtLocal"
          type="datetime-local"
          required
          error={e.startsAt}
          ref={(el: HTMLInputElement | null) => {
            if (el && !el.value) el.value = nextHourLocal();
          }}
        />
        <TextField
          label="Length (minutes)"
          name="durationMinutes"
          type="number"
          min={15}
          max={480}
          step={15}
          defaultValue={60}
          error={e.durationMinutes}
        />
      </div>
      <TextField
        label="Where"
        name="location"
        required
        minLength={2}
        maxLength={120}
        placeholder="LIB 2nd floor, room 207, or a video call link"
        error={e.location}
      />
      <TextArea label="Notes" name="notes" rows={3} maxLength={2000} placeholder="What to prepare." error={e.notes} />
      <Message state={state} />
      <div>
        <SubmitButton pendingText="Scheduling…">Schedule meetup</SubmitButton>
      </div>
    </form>
  );
}

export function ReportForm({ targetType, targetId }: { targetType: "group" | "meetup" | "user"; targetId: string }) {
  const [state, formAction] = useActionState(reportAction, idle);
  const e = state.errors ?? {};
  if (state.ok) return <Message state={state} />;
  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <TextArea
        label="What is wrong?"
        name="reason"
        rows={3}
        required
        minLength={10}
        maxLength={1000}
        error={e.reason}
        hint="Spam, harassment, or something that should not be here. A moderator reads every report."
      />
      <Message state={state} />
      <div>
        <SubmitButton className="btn btn-secondary" pendingText="Sending…">
          Send report
        </SubmitButton>
      </div>
    </form>
  );
}

export function DevSignInForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signInDevAction, idle);
  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField label="E-mail" name="email" type="email" required autoComplete="email" placeholder="you@example.edu" />
      <TextField label="Name" name="name" autoComplete="name" placeholder="Optional" />
      <Message state={state} />
      <div>
        <SubmitButton pendingText="Signing in…">Sign in (development)</SubmitButton>
      </div>
    </form>
  );
}
