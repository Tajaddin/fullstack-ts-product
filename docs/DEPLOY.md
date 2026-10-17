# Running and deploying

## Local development

```bash
cp .env.example .env            # then set AUTH_SECRET: openssl rand -base64 32
make up                         # Postgres :5436, Redis :6380, Mailpit :8026 (UI) / :1026 (SMTP)
npm ci
npm run db:migrate && npm run seed
npm run dev                     # http://localhost:3100
npm run worker                  # in a second terminal: reminders and the weekly digest
```

Sign in with the development login (any e-mail, no password) while `AUTH_DEV_LOGIN=true`; it does not exist
in production builds. Make yourself admin with `npm run seed -- --admin you@example.edu`.

Observability: `make up-obs` adds Prometheus (:9099), Alertmanager (:9101), Grafana (:3005, dashboard
"Coursemates") and Tempo (:3203, OTLP on :4319). Prometheus scrapes the app on the host (`:3100/api/metrics`,
`:9465/metrics`) and, when the `app` profile runs, the containers.

The whole thing in containers: `docker compose --profile app up -d --build` (web on :3100, worker metrics on
:9465).

## Tests and checks

| Command                                                     | What                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run lint`, `npm run format:check`, `npm run typecheck` | ESLint (Next + React hooks rules), Prettier, `tsc --noEmit` after `next typegen`                 |
| `npm run test:unit`                                         | Vitest: authorisation rules, validation, reminders, e-mails, calendar, environment               |
| `npm run test:integration`                                  | Vitest with Testcontainers: Postgres (migrations from zero), Redis, Mailpit                      |
| `npm run e2e`                                               | Playwright + axe against `npm run start` on :3100 (set `E2E_BASE_URL` to use a running server)   |
| `npm run lhci`                                              | Lighthouse CI, mobile, three runs per page, scores >= 0.9 asserted                               |
| `make load`                                                 | k6 in a container: p95 of the public pages at 10 VUs for 60 s, writes `load/results/latest.json` |
| `make alerts-test`                                          | promtool unit tests for the alert rules                                                          |
| `make tf-validate`                                          | Terraform fmt and validate in a container                                                        |
| `npm run wau`                                               | weekly active users from the database (`--write` updates the README)                             |

Playwright signs users in by minting the Auth.js session cookie with `AUTH_SECRET` (`e2e/helpers.ts`), so it
runs against the production build. Build first: `npm run build`.

## Production: Fly.io + Neon + Upstash

1. Accounts: Fly.io, Neon, Upstash (all free tiers), optionally Sentry and PostHog, and a Google OAuth client
   (Web application, redirect URI `https://<app>.fly.dev/api/auth/callback/google`).
2. Managed data stores with Terraform:
   ```bash
   cd infra/terraform && cp terraform.tfvars.example terraform.tfvars   # fill the API keys
   terraform init && terraform apply
   terraform output -raw database_url; terraform output -raw redis_url
   ```
3. Deploy (flyctl installed and logged in):
   ```bash
   export DATABASE_URL=... REDIS_URL=... AUTH_SECRET=$(openssl rand -base64 32) SMTP_URL=... \
          AUTH_GOOGLE_ID=... AUTH_GOOGLE_SECRET=... SENTRY_DSN=... NEXT_PUBLIC_POSTHOG_KEY=...
   make deploy
   ```
   `scripts/deploy.sh` creates the two apps if needed, stages the secrets, deploys the worker (whose release
   command runs `scripts/migrate.ts`), then the web app. Change the app names in `fly.toml`,
   `fly.worker.toml` and `WEB_APP`/`WORKER_APP` if `coursemates` is taken.
4. First admin: `fly ssh console -a coursemates-worker -C "node_modules/.bin/tsx src/db/seed.ts --admin you@example.edu"`.
5. GitHub deploys: repository environment `production` with secret `FLY_API_TOKEN` and variables `APP_URL`,
   `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_CONTACT`; then Actions, deploy, Run workflow.

Cost: both Fly apps fit the free allowance (shared-cpu-1x, web auto-stops when idle), Neon and Upstash free
tiers, Sentry and PostHog free tiers. `make teardown` destroys the Fly apps and the Terraform resources.

## Environment

Every variable is documented in `.env.example`; `src/lib/env.ts` validates them at start-up and refuses the
dev login in production. `NEXT_PUBLIC_*` values are inlined at build time (Docker build args).
