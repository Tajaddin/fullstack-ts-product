#!/usr/bin/env bash
# Deploys to Fly.io: the worker app first (its release command runs the migrations), then the web app.
# Needs flyctl logged in, and the secrets in .env.deploy, exported in the shell, or already set with `fly secrets set`:
#   DATABASE_URL REDIS_URL AUTH_SECRET SMTP_URL [AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET SENTRY_DSN]
set -euo pipefail
cd "$(dirname "$0")/.."
# the secrets can also live in .env.deploy (gitignored), one KEY=value per line
if [ -f .env.deploy ]; then set -a; . ./.env.deploy; set +a; fi

WEB_APP="${WEB_APP:-coursemates}"
WORKER_APP="${WORKER_APP:-coursemates-worker}"
ORG="${FLY_ORG:-personal}"

command -v fly >/dev/null || { echo "flyctl not found: https://fly.io/docs/flyctl/install/"; exit 1; }

for app in "$WORKER_APP" "$WEB_APP"; do
  fly apps list --json | grep -q "\"Name\": *\"$app\"" || fly apps create "$app" --org "$ORG"
done

secrets=()
for key in DATABASE_URL REDIS_URL AUTH_SECRET SMTP_URL AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET SENTRY_DSN; do
  if [ -n "${!key:-}" ]; then secrets+=("$key=${!key}"); fi
done
if [ ${#secrets[@]} -gt 0 ]; then
  fly secrets set --stage -a "$WORKER_APP" "${secrets[@]}" >/dev/null
  fly secrets set --stage -a "$WEB_APP" "${secrets[@]}" >/dev/null
  echo "secrets staged for both apps"
fi

fly deploy -c fly.worker.toml -a "$WORKER_APP" --remote-only
fly deploy -c fly.toml -a "$WEB_APP" --remote-only \
  --build-arg "NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY:-}" \
  --build-arg "NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN:-}" \
  --build-arg "NEXT_PUBLIC_CONTACT=${NEXT_PUBLIC_CONTACT:-}" \
  --build-arg "APP_URL=https://${WEB_APP}.fly.dev"

echo "web:    https://${WEB_APP}.fly.dev"
echo "health: https://${WEB_APP}.fly.dev/api/health"
