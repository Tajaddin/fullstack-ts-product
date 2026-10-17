# 0001. Next.js App Router with Cache Components, server actions for forms, and a thin REST layer

Date: 2026-10-17. Status: accepted.

## Context

The postings this project targets name React and TypeScript first, and most of them mean a full-stack
framework in practice. The product is form-heavy (create a group, schedule a meetup, RSVP, report) and read-
heavy (course and group pages), with per-user content on almost every page.

## Decision

- Next.js 16 App Router with `cacheComponents` on, as `create-next-app` sets it up. Every page that reads the
  database or the session renders behind a Suspense boundary (`app/loading.tsx` plus one around the
  navigation's user chip), which is what the framework requires for request-time data.
- Mutations are **server actions** called from plain `<form action>` elements and from small client
  components (`ActionButton`, `useActionState` forms). Forms keep working without JavaScript where they are
  plain forms; the client components add pending states and inline messages.
- The same operations are exposed as **REST route handlers under `/api/v1`** for integrations, the calendar
  feed and tests. Both paths parse input with the same zod schemas (`src/lib/validation.ts`) and call the
  same data access layer (`src/server/*`), so there is one definition of every rule.
- No tRPC: with server actions covering the UI and a handful of REST endpoints, a third RPC layer would add
  plumbing without adding a capability.

## Consequences

- Pages are dynamic; the static shell (layout, navigation, footer) prerenders and the content streams.
  Lighthouse scores stay above 90 on mobile because the shell is small and the data is one query away.
- The data access layer is the only place that touches the database and the only place that authorises;
  route handlers and actions are thin.
- Keeping the REST layer honest costs a few files; the e2e test exercises both the actions and the API.
