#!/usr/bin/env bash
# Self-contained local e2e: local D1 bootstrap -> wrangler dev -> e2e-dev.sh.
# Invoked by `npm run test:e2e` and by qa-kit's manifest.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-8787}"
LOG="$(mktemp)"

# 1. Local D1 schema + migrations (idempotent-enough: failures on already-
#    applied migrations are tolerated; fresh machines get everything).
for f in schema.sql migrations/*.sql; do
  npx wrangler d1 execute beanfit-app --local --file "$f" >/dev/null 2>&1 || true
done

# 2. Dev vars (gitignored): session secret + dummy Google creds so the SSO
#    button renders on error pages during the lockout-guard assertion.
if [ ! -f .dev.vars ]; then
  printf 'SESSION_SECRET=e2e-local-dev-secret\nGOOGLE_CLIENT_ID=dummy\nGOOGLE_CLIENT_SECRET=dummy\n' > .dev.vars
fi

# 3. Boot wrangler, wait for readiness.
npx wrangler dev --local --port "$PORT" > "$LOG" 2>&1 &
WRANGLER_PID=$!
trap 'kill "$WRANGLER_PID" 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then break; fi
  sleep 1
  if ! kill -0 "$WRANGLER_PID" 2>/dev/null; then echo "wrangler died:"; tail "$LOG"; exit 1; fi
done

# 4. The flow itself.
bash scripts/e2e-dev.sh "http://127.0.0.1:$PORT"
