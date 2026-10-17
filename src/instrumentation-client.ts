import posthog from "posthog-js";

// Runs once in the browser before the app hydrates. Both tools are off unless their keys are set.
// PostHog is configured the privacy-respecting way: no cookies (memory persistence), no autocapture of
// clicks or inputs, no session recording, Do-Not-Track honoured, pageviews only.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    persistence: "memory",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    respect_dnt: true,
    person_profiles: "identified_only",
    ip: false,
  });
  posthog.capture("$pageview");
}

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.05, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 });
  });
}

export function onRouterTransitionStart(url: string) {
  if (posthogKey) posthog.capture("$pageview", { $current_url: url });
}
