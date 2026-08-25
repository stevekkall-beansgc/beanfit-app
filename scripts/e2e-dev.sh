#!/usr/bin/env bash
# End-to-end dev test: signup in UI, pair a real device via CLI, approve in UI.
# Usage: scripts/e2e-dev.sh [base_url]   (default http://127.0.0.1:8787)
set -euo pipefail

BASE="${1:-http://127.0.0.1:8787}"
BEANFIT_SRC="${BEANFIT_SRC:-$HOME/beans/products/beanfit/src}"
JAR="$(mktemp)"
HOME_DIR="$(mktemp -d)"
REGLOG="$(mktemp)"
EMAIL="e2e-$(date +%s)@test.local"

echo "== 1. signup $EMAIL"
curl -s -o /dev/null -w "signup: %{http_code} -> %{redirect_url}\n" \
  -c "$JAR" -d "email=$EMAIL" -d "password=e2e-password-123" \
  "$BASE/signup"

echo "== 2. start beanfit register (isolated HOME)"
HOME="$HOME_DIR" PYTHONPATH="$BEANFIT_SRC" \
  python3 -m beanfit register --server "$BASE" --use-case coding > "$REGLOG" 2>&1 &
REGLOG_FILE="$REGLOG"
REG_PID=$!
REGLOG="${REGLOG:-$(mktemp)}"
sleep 6

CODE=$(grep -Eo 'Pairing code: [0-9A-Z]{8}' "$REGLOG" | awk '{print $3}')
echo "pairing code from CLI: ${CODE:-MISSING}"
[ -n "$CODE" ] || { echo FAIL; cat "$REGLOG"; exit 1; }

echo "== 3. confirm page renders device"
CONFIRM=$(curl -s -b "$JAR" "$BASE/pair/$CODE")
echo "$CONFIRM" | grep -q "Pair this device?" && echo "confirm page OK"
CSRF=$(echo "$CONFIRM" | grep -o 'name="csrf" value="[a-f0-9]*"' | head -1 | sed -E 's/.*value="([a-f0-9]+)"/\1/')
[ -n "$CSRF" ] || { echo "no csrf token"; echo "$CONFIRM" | head; exit 1; }

echo "== 4. approve"
curl -s -b "$JAR" -d "csrf=$CSRF" -d "label=E2E Test Mac" \
  -o /dev/null -w "approve: %{http_code}\n" "$BASE/pair/$CODE/approve"

wait $REG_PID && echo "== 5. CLI exited 0 (approved)"

grep -q "Approved" "$REGLOG"
HOME="$HOME_DIR" python3 -c "
import json, glob
path = glob.glob('$HOME_DIR/.config/beanfit/device.json')
assert path, 'device.json not written'
doc = json.load(open(path[0]))
assert doc['device_token'] and doc['device_id'], 'credential incomplete'
print('credential file OK:', sorted(doc))
"

echo "== 6. dashboard lists the device"
DASH=$(curl -s -b "$JAR" "$BASE/dashboard")
echo "$DASH" | grep -q "E2E Test Mac" && echo "dashboard shows device OK"

DEVICE_ID=$(curl -s -b "$JAR" "$BASE/dashboard" | grep -oE '/devices/[a-f0-9]{32}' | head -1 | cut -d/ -f3)
[ -n "$DEVICE_ID" ] || { echo "no device id on dashboard"; exit 1; }

echo "== 7. configurator honors surfaces (regression: interface/surfaces seam)"
FRAG=$(curl -s -b "$JAR" -H "content-type: application/json" \
  -d '{"surfaces":["code_opencode","chat_webui"],"model_tag":null}' \
  "$BASE/api/devices/$DEVICE_ID/stack")
echo "$FRAG" | grep -qi "opencode" && echo "configurator surface OK (non-webui content present)"
DETAIL=$(curl -s -b "$JAR" "$BASE/devices/$DEVICE_ID")
echo "$DETAIL" | grep -q "Your setup" && echo "persisted stack renders OK"

echo "== 8. OAuth cancel page keeps the Google button (passwordless lockout guard)"
CB=$(curl -s -b "$JAR" "$BASE/auth/google/callback?error=access_denied")
echo "$CB" | grep -q "Continue with Google" && echo "oauth error path keeps SSO button OK"

echo "E2E PASS"
