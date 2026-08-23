#!/usr/bin/env bash
# End-to-end dev test: signup in UI, pair a real device via CLI, approve in UI.
# Usage: scripts/e2e-dev.sh [base_url]   (default http://127.0.0.1:8787)
set -euo pipefail

BASE="${1:-http://127.0.0.1:8787}"
BEANFIT_SRC="${BEANFIT_SRC:-$HOME/Desktop/beanfit/src}"
JAR="$(mktemp)"
HOME_DIR="$(mktemp -d)"
EMAIL="e2e-$(date +%s)@test.local"

echo "== 1. signup $EMAIL"
curl -s -o /dev/null -w "signup: %{http_code} -> %{redirect_url}\n" \
  -c "$JAR" -d "email=$EMAIL" -d "password=e2e-password-123" \
  "$BASE/signup"

echo "== 2. start beanfit register (isolated HOME)"
HOME="$HOME_DIR" PYTHONPATH="$BEANFIT_SRC" \
  python3 -m beanfit register --server "$BASE" --use-case coding > /tmp/e2e-register.log 2>&1 &
REG_PID=$!
sleep 6

CODE=$(grep -Eo 'Pairing code: [0-9A-Z]{8}' /tmp/e2e-register.log | awk '{print $3}')
echo "pairing code from CLI: ${CODE:-MISSING}"
[ -n "$CODE" ] || { echo FAIL; cat /tmp/e2e-register.log; exit 1; }

echo "== 3. confirm page renders device"
CONFIRM=$(curl -s -b "$JAR" "$BASE/pair/$CODE")
echo "$CONFIRM" | grep -q "Pair this device?" && echo "confirm page OK"
CSRF=$(echo "$CONFIRM" | grep -o 'name="csrf" value="[a-f0-9]*"' | head -1 | sed -E 's/.*value="([a-f0-9]+)"/\1/')
[ -n "$CSRF" ] || { echo "no csrf token"; echo "$CONFIRM" | head; exit 1; }

echo "== 4. approve"
curl -s -b "$JAR" -d "csrf=$CSRF" -d "label=E2E Test Mac" \
  -o /dev/null -w "approve: %{http_code}\n" "$BASE/pair/$CODE/approve"

wait $REG_PID && echo "== 5. CLI exited 0 (approved)"

grep -q "Approved" /tmp/e2e-register.log
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

echo "E2E PASS"
