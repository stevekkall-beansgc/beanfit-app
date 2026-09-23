#!/usr/bin/env bash
# End-to-end dev test: signup in UI, pair a real device via CLI, approve in UI.
# Usage: scripts/e2e-dev.sh [base_url]   (default http://127.0.0.1:8787)
set -euo pipefail

BASE="${1:-http://127.0.0.1:8787}"
BEANFIT_SRC="${BEANFIT_SRC:-$HOME/beans/products/beanfit/src}"
JAR="$(mktemp)"
HOME_DIR="$(mktemp -d)"
REGLOG="$(mktemp)"
HTML_HDR="$(mktemp)"
REG_PID=""

cleanup() {
  if [ -n "$REG_PID" ]; then
    kill "$REG_PID" 2>/dev/null || true
    wait "$REG_PID" 2>/dev/null || true
  fi
  rm -f "$JAR" "$REGLOG" "$HTML_HDR" || true
  rm -rf "$HOME_DIR" || true
}

trap cleanup EXIT

http_request() {
  local label="$1"
  local expected="$2"
  shift 2
  local response

  if ! response=$(curl -sS -w $'\n%{http_code}' "$@"); then
    echo "FAIL: $label request failed"
    exit 1
  fi
  HTTP_STATUS="${response##*$'\n'}"
  HTTP_BODY="${response%$'\n'*}"
  if [ "$HTTP_STATUS" != "$expected" ]; then
    echo "FAIL: $label returned HTTP $HTTP_STATUS (expected $expected)"
    exit 1
  fi
}

EXPECTED_CSP="default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'unsafe-inline'"

header_value() {
  awk -v wanted="$1" '
    BEGIN { key = tolower(wanted) ":" }
    tolower($1) == key {
      sub(/\r$/, "")
      sub(/^[^:]*:[[:space:]]*/, "")
      value = $0
    }
    END { if (value != "") print value }
  ' "$HTML_HDR"
}

assert_html_security() {
  local label="$1"
  local script_src="$2"
  local csp script_count

  csp=$(header_value content-security-policy)
  if [ "$csp" != "$EXPECTED_CSP" ]; then
    echo "FAIL: $label missing or has unexpected CSP"
    exit 1
  fi
  script_count=$(printf '%s' "$HTTP_BODY" | grep -o '<script[^>]*>' | wc -l | tr -d ' ' || true)
  if [ "$script_count" != "1" ]; then
    echo "FAIL: $label expected exactly one script tag"
    exit 1
  fi
  if ! printf '%s' "$HTTP_BODY" | grep -F "<script src=\"$script_src\" defer></script>" >/dev/null; then
    echo "FAIL: $label missing fixed script $script_src"
    exit 1
  fi
  echo "$label CSP and fixed script OK"
}

assert_javascript_asset() {
  local label="$1"
  local path="$2"
  local required_source="$3"
  local content_type nosniff

  http_request "$label" "200" -D "$HTML_HDR" "$BASE$path"
  content_type=$(printf '%s' "$(header_value content-type)" | tr '[:upper:]' '[:lower:]')
  case "$content_type" in
    application/javascript*) ;;
    *)
      echo "FAIL: $label returned non-JavaScript content type"
      exit 1
      ;;
  esac
  nosniff=$(printf '%s' "$(header_value x-content-type-options)" | tr '[:upper:]' '[:lower:]')
  if [ "$nosniff" != "nosniff" ]; then
    echo "FAIL: $label missing nosniff"
    exit 1
  fi
  if ! node -e 'new Function(process.argv[1])' "$HTTP_BODY" >/dev/null 2>&1; then
    echo "FAIL: $label body is not parsable JavaScript"
    exit 1
  fi
  if ! printf '%s' "$HTTP_BODY" | grep -F "$required_source" >/dev/null; then
    echo "FAIL: $label body missing expected fixed behavior"
    exit 1
  fi
  echo "$label JavaScript response OK"
}

EMAIL="e2e-$(date +%s)@test.local"

echo "== 1. signup $EMAIL"
http_request "signup" "303" -c "$JAR" -d "email=$EMAIL" \
  -d "password=e2e-password-123" "$BASE/signup"
echo "signup: $HTTP_STATUS OK"

echo "== CSP guard: empty dashboard and fixed assets"
: > "$HTML_HDR"
http_request "dashboard CSP" "200" -b "$JAR" -D "$HTML_HDR" "$BASE/dashboard"
assert_html_security "dashboard" "/assets/register.js"
assert_javascript_asset "register asset" "/assets/register.js" 'document.getElementById("register-browser")'
assert_javascript_asset "configurator asset" "/assets/configurator.js" 'root.getAttribute("data-device-id")'

echo "== 2. start beanfit register (isolated HOME)"
HOME="$HOME_DIR" BEANFIT_ALLOW_UNSUPPORTED_PLATFORM=1 PYTHONPATH="$BEANFIT_SRC" \
  python3 -m beanfit register --server "$BASE" --use-case coding > "$REGLOG" 2>&1 &
REG_PID=$!

PAIRING_TIMEOUT=15
PAIRING_DEADLINE=$((SECONDS + PAIRING_TIMEOUT))
CODE=""
while [ "$SECONDS" -lt "$PAIRING_DEADLINE" ]; do
  CODE=$(grep -Eo 'Pairing code: [0-9A-Z]{8}' "$REGLOG" | awk '{print $3}' || true)
  if [ -n "$CODE" ]; then
    break
  fi
  if ! kill -0 "$REG_PID" 2>/dev/null; then
    REG_STATUS=0
    wait "$REG_PID" || REG_STATUS=$?
    REG_PID=""
    echo "FAIL: beanfit register exited with status $REG_STATUS before printing a pairing code"
    cat "$REGLOG"
    exit 1
  fi
  sleep 0.25
done

echo "pairing code from CLI: ${CODE:-MISSING}"
if [ -z "$CODE" ]; then
  echo "FAIL: no pairing code within ${PAIRING_TIMEOUT}s"
  cat "$REGLOG"
  exit 1
fi

echo "== 3. confirm page renders device"
http_request "pair confirmation" "200" -b "$JAR" "$BASE/pair/$CODE"
CONFIRM="$HTTP_BODY"
if ! printf '%s' "$CONFIRM" | grep -F "Pair this device?" >/dev/null; then
  echo "FAIL: pair confirmation missing 'Pair this device?'"
  exit 1
fi
echo "confirm page OK"
CSRF=$(printf '%s' "$CONFIRM" | grep -o 'name="csrf" value="[a-f0-9]*"' \
  | sed -nE '1{s/.*value="([a-f0-9]+)".*/\1/p;}' || true)
[ -n "$CSRF" ] || { echo "FAIL: pair confirmation missing csrf token"; exit 1; }

echo "== 4. approve"
http_request "device approval" "200" -b "$JAR" -d "csrf=$CSRF" \
  -d "label=E2E Test Mac" "$BASE/pair/$CODE/approve"
if ! printf '%s' "$HTTP_BODY" | grep -F "is registered." >/dev/null; then
  echo "FAIL: device approval response missing success content"
  exit 1
fi
echo "approve: $HTTP_STATUS OK"

APPROVAL_TIMEOUT="${E2E_APPROVAL_TIMEOUT:-20}"
APPROVAL_DEADLINE=$((SECONDS + APPROVAL_TIMEOUT))
while kill -0 "$REG_PID" 2>/dev/null; do
  if [ "$SECONDS" -ge "$APPROVAL_DEADLINE" ]; then
    echo "FAIL: beanfit register did not exit within ${APPROVAL_TIMEOUT}s after approval"
    cat "$REGLOG"
    exit 1
  fi
  sleep 0.25
done
REG_STATUS=0
wait "$REG_PID" || REG_STATUS=$?
REG_PID=""
if [ "$REG_STATUS" -ne 0 ]; then
  echo "FAIL: beanfit register exited with status $REG_STATUS after approval"
  cat "$REGLOG"
  exit 1
fi
echo "== 5. CLI exited 0 (approved)"

if ! grep -Fq "Approved" "$REGLOG"; then
  echo "FAIL: beanfit register log missing approval confirmation"
  cat "$REGLOG"
  exit 1
fi
HOME="$HOME_DIR" python3 -c "
import json, glob
path = glob.glob('$HOME_DIR/.config/beanfit/device.json')
assert path, 'device.json not written'
doc = json.load(open(path[0]))
assert doc['device_token'] and doc['device_id'], 'credential incomplete'
print('credential file OK:', sorted(doc))
"

echo "== 6. dashboard lists the device"
http_request "dashboard" "200" -b "$JAR" "$BASE/dashboard"
DASH="$HTTP_BODY"
if ! printf '%s' "$DASH" | grep -F "E2E Test Mac" >/dev/null; then
  echo "FAIL: dashboard missing approved device"
  exit 1
fi
echo "dashboard shows device OK"

DEVICE_ID=$(printf '%s' "$DASH" | grep -oE '/devices/[a-f0-9]{32}' \
  | sed -n '1s#/devices/##p' || true)
if [ -z "$DEVICE_ID" ]; then
  echo "FAIL: dashboard missing device id"
  exit 1
fi

echo "== 7. configurator honors surfaces (regression: interface/surfaces seam)"
http_request "configurator" "200" -b "$JAR" -H "content-type: application/json" \
  -d '{"surfaces":["code_opencode","chat_webui"],"model_tag":null}' \
  "$BASE/api/devices/$DEVICE_ID/stack"
FRAG="$HTTP_BODY"
if ! printf '%s' "$FRAG" | grep -i "opencode" >/dev/null; then
  echo "FAIL: configurator response missing opencode surface content"
  exit 1
fi
echo "configurator surface OK (non-webui content present)"
: > "$HTML_HDR"
http_request "device detail" "200" -b "$JAR" -D "$HTML_HDR" "$BASE/devices/$DEVICE_ID"
DETAIL="$HTTP_BODY"
if ! printf '%s' "$DETAIL" | grep -F "Your setup" >/dev/null; then
  echo "FAIL: device detail missing persisted stack content"
  exit 1
fi
echo "persisted stack renders OK"
assert_html_security "device detail" "/assets/configurator.js"

echo "== 8. OAuth cancel page keeps the Google button (passwordless lockout guard)"
http_request "oauth cancel keeps SSO" "200" -b "$JAR" "$BASE/auth/google/callback?error=access_denied"
if ! printf '%s' "$HTTP_BODY" | grep -F "Continue with Google" >/dev/null; then
  echo "FAIL: oauth cancel page missing 'Continue with Google' (lockout guard)"
  exit 1
fi
echo "oauth error path keeps SSO button OK"

echo "== 9. dashboard exposes the explicit Google link form (session + CSRF)"
http_request "dashboard link form" "200" -b "$JAR" "$BASE/dashboard"
DASH2="$HTTP_BODY"
if ! printf '%s' "$DASH2" | grep -F 'action="/auth/google/link"' >/dev/null; then
  echo "FAIL: dashboard missing Google link form (action=\"/auth/google/link\")"
  exit 1
fi
echo "dashboard link form OK"
if ! printf '%s' "$DASH2" | grep -F "A matching email never links an account on its own" >/dev/null; then
  echo "FAIL: dashboard missing no-email-link copy"
  exit 1
fi
echo "no-email-takeover copy OK"
LC=$(printf '%s' "$DASH2" | grep -o 'name="csrf" value="[a-f0-9]*"' | head -2 | tail -1 | sed -E 's/.*value="([a-f0-9]+)"/\1/' || true)
[ -n "$LC" ] || { echo "FAIL: dashboard missing link csrf token"; exit 1; }

echo "== 10. link initiation requires CSRF"
http_request "link CSRF rejection" "400" -b "$JAR" -X POST \
  -H "content-type: application/x-www-form-urlencoded" -d "csrf=wrong" "$BASE/auth/google/link"
echo "missing/wrong csrf -> 400 OK"

echo "== 11. link initiation requires a session (route auth flag)"
if ! HDR_RESP=$(curl -sS -D - -o /dev/null -w $'\n%{http_code}' -X POST \
  -H "content-type: application/x-www-form-urlencoded" -d "csrf=x" "$BASE/auth/google/link"); then
  echo "FAIL: unauthenticated link request failed (curl transport)"
  exit 1
fi
HTTP_STATUS_11="${HDR_RESP##*$'\n'}"
HDR_BODY_11="${HDR_RESP%$'\n'*}"
LOCATION_11=$(printf '%s' "$HDR_BODY_11" | grep -i '^Location:' | head -n1 || true)
if [ "$HTTP_STATUS_11" != "303" ]; then
  echo "FAIL: unauthenticated link returned HTTP $HTTP_STATUS_11 (expected 303)"
  exit 1
fi
if ! printf '%s' "$LOCATION_11" | grep -q "login"; then
  echo "FAIL: unauthenticated link Location missing login (got: $LOCATION_11)"
  exit 1
fi
echo "unauthenticated link -> login OK (303 $LOCATION_11)"

echo "== 12. callback with forged state is rejected (state mismatch, no session issued)"
http_request "forged oauth state" "200" -b "$JAR" "$BASE/auth/google/callback?state=bogus.state&code=x"
if ! printf '%s' "$HTTP_BODY" | grep -q "state mismatch"; then
  echo "FAIL: forged oauth state response missing 'state mismatch'"
  exit 1
fi
echo "forged oauth state rejected OK"

echo "E2E PASS"
