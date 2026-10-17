#!/usr/bin/env bash
# Runs load/k6.js against a running production server (npm run build && npm run start on :3100) and writes
# load/results/latest.json. VUS and DURATION override the defaults (10 VUs, 60 s).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p load/results
BASE_URL="${BASE_URL:-http://host.docker.internal:3100}"
MSYS_NO_PATHCONV=1 docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$(pwd)/load:/scripts:ro" -v "$(pwd)/load/results:/results" \
  -e BASE_URL="$BASE_URL" -e VUS="${VUS:-10}" -e DURATION="${DURATION:-60s}" \
  grafana/k6:1.0.0 run --quiet /scripts/k6.js
test -s load/results/latest.json && echo "wrote load/results/latest.json"
