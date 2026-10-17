#!/usr/bin/env bash
# Removes everything that costs money or quota: both Fly apps and the Terraform-managed Neon and Upstash
# resources. Local docker compose data goes with `make down`.
set -uo pipefail
cd "$(dirname "$0")/.."

WEB_APP="${WEB_APP:-coursemates}"
WORKER_APP="${WORKER_APP:-coursemates-worker}"

if command -v fly >/dev/null; then
  for app in "$WEB_APP" "$WORKER_APP"; do
    fly apps destroy "$app" --yes 2>/dev/null && echo "destroyed fly app $app" || echo "fly app $app not found or already gone"
  done
else
  echo "flyctl not installed; skipping Fly apps"
fi

if [ -f infra/terraform/terraform.tfstate ] || [ -d infra/terraform/.terraform ]; then
  (cd infra/terraform && terraform destroy -auto-approve) && echo "terraform resources destroyed"
else
  echo "no terraform state; nothing to destroy"
fi
