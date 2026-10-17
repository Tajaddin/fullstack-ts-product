# 0003. Authorisation rules as pure functions, enforced in the data access layer; Redis fixed-window rate limits

Date: 2026-10-17. Status: accepted.

## Context

Role-based access and rate limiting are must-haves. Authorisation bugs are usually inconsistencies between
places that re-implement the same rule; rate limits must hold across several web instances.

## Decision

- Site roles `member < moderator < admin` and group roles `owner | member`. The rules live in
  `src/lib/rbac.ts` as pure functions (`canViewGroup`, `canManageGroup`, `canJoinGroup`, `canLeaveGroup`,
  `canModerate`, `canChangeRole`) with unit tests that read like a policy table.
- The data access layer calls those functions and throws `HttpError` (401/403/404/409); pages map 404 to
  `notFound()`, route handlers and actions map every `HttpError` to its status. Private groups answer 404,
  not 403, so their existence is not revealed.
- Capacity is enforced inside a transaction with `SELECT ... FOR UPDATE` on the group row; the integration
  test joins three users concurrently into one free seat and expects exactly one success.
- Rate limiting is a fixed window in Redis, implemented as one Lua script (`INCR`, `PEXPIRE` on first hit,
  `PTTL`): per IP on `/api/*` (120/min by default) and per user on mutations (30/min), returning 429 with
  `Retry-After`. The same limiter guards server actions through `guardMutation()`.

## Consequences

- Adding a rule means adding a function and a test; adding an endpoint means calling the function.
- A fixed window allows up to 2x the limit across a boundary; acceptable here, and a sliding window is a
  drop-in change to the script if it ever matters.
- The limiter needs Redis; without it the API fails closed (500), which is deliberate.
