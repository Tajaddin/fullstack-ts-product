import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Coursemates stores, why, for how long, and how to delete it.",
};

const contact = process.env.NEXT_PUBLIC_CONTACT ?? "the maintainer, through the repository's issue tracker";

export default function PrivacyPage() {
  return (
    <article className="prose max-w-2xl py-4">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p className="text-muted">Last updated 2026-10-17.</p>
      <p>
        Coursemates is a small, open-source service for finding study groups. This page says exactly what it keeps about you and what it
        does not. It is written to be read, not to cover the operator.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> the name, e-mail address and profile picture URL that Google returns when you sign in. Nothing else
          is requested from Google and the sign-in token is used only to identify you.
        </li>
        <li>
          <strong>What you do here:</strong> the groups you join or own, the meetups you schedule, your RSVPs, and reports you send. Other
          members of a group see your name.
        </li>
        <li>
          <strong>Activity days:</strong> one row per day you use the site, so we can count weekly active users. No pages, no clicks.
        </li>
        <li>
          <strong>Moderation log:</strong> who changed a role, removed a member or resolved a report, and when.
        </li>
      </ul>

      <h2>Cookies and analytics</h2>
      <p>
        One cookie keeps you signed in. There are no advertising or tracking cookies. If the operator enables PostHog, it runs cookieless:
        page views only, no recording of sessions, clicks or form input, no IP addresses, and it honours your browser’s Do-Not-Track
        setting. If Sentry is enabled, it receives error reports without personal data.
      </p>

      <h2>E-mail</h2>
      <p>
        You get a reminder an hour before a meetup in a group you belong to (unless you answered “can’t make it”) and a weekly digest when
        your groups have meetups coming up. Leaving a group stops its mails; deleting your account stops all of them.
      </p>

      <h2>Who can see what</h2>
      <p>
        Public groups, their members’ names and their meetups are visible to anyone. Private groups are visible to their members and to
        moderators. Moderators and admins can see reports, the moderation log, and (admins only) the list of accounts, in order to handle
        abuse.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Data stays as long as your account exists. “Delete my account” on your page removes your account, memberships, RSVPs and reports
        immediately; groups you own pass to their longest-standing member, or are deleted if you were alone. Server logs are kept for 30
        days and contain request ids, not names.
      </p>

      <h2>Where it runs</h2>
      <p>
        The application and database run on the hosting providers listed in the repository’s deployment documentation, in the United States.
        The source code is public, so you can check every claim on this page.
      </p>

      <h2>Contact</h2>
      <p>Questions or requests about your data: {contact}.</p>
    </article>
  );
}
