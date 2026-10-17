# 0002. Auth.js v5 with Google, JWT sessions re-checked against the database, and a development-only login

Date: 2026-10-17. Status: accepted.

## Context

Students have Google accounts; the spec asks for Google OAuth. Local development, integration tests and the
end-to-end suite must work without a Google OAuth client, and role changes or deleted accounts must take
effect immediately.

## Decision

- Auth.js v5 (`next-auth@5`) with the Google provider and the Drizzle adapter, which creates the `users`
  and `accounts` rows on first sign-in. Only name, e-mail and picture URL are requested.
- Sessions are **JWTs** carrying nothing but the user id. The data access layer (`getCurrentUser`) resolves
  the id to a fresh `users` row on every request, so `role` is never stale and a deleted user is signed out
  by the next request. The row read doubles as the activity ping (`last_seen_at`, `daily_active`).
- A **Credentials "dev login"** provider signs in any e-mail without a password. It exists only when
  `AUTH_DEV_LOGIN=true` and `NODE_ENV` is not `production`; `env()` forces it off in production builds
  regardless of the flag, and a unit test pins that.
- The end-to-end suite does not use the dev login. It mints the same encrypted session cookie Auth.js
  issues (`encode` from `next-auth/jwt` with `AUTH_SECRET`), so it runs against the production build with no
  test-only code path in the server.
- `proxy.ts` (Next 16's middleware) does an optimistic redirect to `/signin` for `/me`, `/admin` and
  `/groups/new`; it is a convenience, not the authorisation.

## Consequences

- No session table lookups per request, but one `users` read; the trade-off was chosen because the row is
  needed anyway for the role.
- Revoking a session before its 30-day expiry means deleting the user or rotating `AUTH_SECRET`; a session
  table would allow per-session revocation and is the next step if it is ever needed.
- A Google OAuth client is a manual step for the deployed instance; locally nobody needs one.
