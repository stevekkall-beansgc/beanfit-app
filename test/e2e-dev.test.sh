#!/usr/bin/env bash
# Regression tests for scripts/e2e-dev.sh fail-closed behavior. A fake
# `curl` is injected via PATH so nothing touches the network:
#   * signup returns HTTP 500  -> script exits nonzero + "FAIL: signup"
#   * curl transport error     -> script exits nonzero + "FAIL: signup"
#   * CLI hangs after approval -> script times out and terminates the CLI
# Both cases must also remove every temp artifact (JAR cookie jar, HOME_DIR,
# REGLOG), proven by pinning TMPDIR to a disposable directory that must end
# up empty after the run.
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0
ran() { echo "  ok $*"; }
fail() { echo "  FAIL $*"; FAIL=1; }

STUB_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$STUB_DIR"
}
trap cleanup EXIT

cat > "$STUB_DIR/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
header_path() {
  local previous="" arg
  for arg in "$@"; do
    if [ "$previous" = "-D" ]; then
      printf '%s' "$arg"
      return 0
    fi
    previous="$arg"
  done
  return 1
}
write_headers() {
  local path="$1" content_type="$2" csp="${3:-}"
  {
    printf 'Content-Type: %s\r\n' "$content_type"
    [ -z "$csp" ] || printf 'Content-Security-Policy: %s\r\n' "$csp"
    printf 'X-Content-Type-Options: nosniff\r\n\r\n'
  } > "$path"
}
case "${CURL_STUB_MODE:-}" in
  500)
    printf 'stub signup response body\n'
    printf '500\n'
    exit 0
    ;;
  transport)
    printf 'stub curl: connection refused\n' >&2
    exit 52
    ;;
  hang)
    case "${*: -1}" in
      */signup) printf '303\n' ;;
      */dashboard)
        H=$(header_path "$@")
        write_headers "$H" "text/html; charset=utf-8" "default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'unsafe-inline'"
        printf '<script src="/assets/register.js" defer></script>\n200\n'
        ;;
      */assets/register.js)
        H=$(header_path "$@")
        write_headers "$H" "application/javascript; charset=utf-8"
        printf 'function registerBrowser() { document.getElementById("register-browser"); }\n200\n'
        ;;
      */assets/configurator.js)
        H=$(header_path "$@")
        write_headers "$H" "application/javascript; charset=utf-8"
        printf 'function configureDevice() { var root = {}; root.getAttribute("data-device-id"); }\n200\n'
        ;;
      */pair/ABCD2345) printf 'Pair this device? <input name="csrf" value="abc123">\n200\n' ;;
      */pair/ABCD2345/approve) printf 'is registered.\n200\n' ;;
      *) printf 'unexpected curl URL\n' >&2; exit 99 ;;
    esac
    ;;
  *)
    printf 'curl stub: unexpected mode %s\n' "${CURL_STUB_MODE:-}" >&2
    exit 99
    ;;
esac
STUB
chmod +x "$STUB_DIR/curl"

cat > "$STUB_DIR/python3" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'Pairing code: ABCD2345\n'
printf '%s\n' "$$" > "$CLI_PID_FILE"
exec sleep 10
STUB
chmod +x "$STUB_DIR/python3"

# Runs scripts/e2e-dev.sh with the stubbed curl and asserts it (a) exits
# nonzero, (b) prints the expected FAIL message, and (c) leaves TMPDIR empty.
check_fail_closed() {
  local label="$1" mode="$2" want_msg="$3"
  local out
  mkdir -p "$STUB_DIR/tmp-$label"

  echo "== $label"
  if out=$(PATH="$STUB_DIR:$PATH" TMPDIR="$STUB_DIR/tmp-$label" \
      CURL_STUB_MODE="$mode" bash scripts/e2e-dev.sh 2>&1); then
    fail "$label: e2e-dev.sh exited 0 (expected nonzero)"
  else
    ran "$label: e2e-dev.sh exited nonzero"
  fi

  if printf '%s' "$out" | grep -Fq "$want_msg"; then
    ran "$label: printed '$want_msg'"
  else
    fail "$label: missing '$want_msg'; output:"
    printf '%s\n' "$out" | sed 's/^/    /'
  fi

  if [ -z "$(ls -A "$STUB_DIR/tmp-$label")" ]; then
    ran "$label: temp artifacts cleaned up (TMPDIR empty)"
  else
    fail "$label: temp artifacts left in TMPDIR:"
    find "$STUB_DIR/tmp-$label" -mindepth 1 | sed 's/^/    /'
  fi
}

check_fail_closed "signup HTTP 500" "500" "FAIL: signup returned HTTP 500 (expected 303)"
check_fail_closed "curl transport error" "transport" "FAIL: signup request failed"

echo "== CLI approval timeout"
mkdir -p "$STUB_DIR/tmp-hang"
if out=$(PATH="$STUB_DIR:$PATH" TMPDIR="$STUB_DIR/tmp-hang" \
    CURL_STUB_MODE=hang CLI_PID_FILE="$STUB_DIR/cli.pid" \
    E2E_APPROVAL_TIMEOUT=1 bash scripts/e2e-dev.sh 2>&1); then
  fail "CLI approval timeout: e2e-dev.sh exited 0"
else
  ran "CLI approval timeout: e2e-dev.sh exited nonzero"
fi
if printf '%s' "$out" | grep -Fq 'FAIL: beanfit register did not exit within 1s after approval'; then
  ran "CLI approval timeout: clear diagnostic"
else
  fail "CLI approval timeout: missing diagnostic"
  printf '%s\n' "$out" | sed 's/^/    /'
fi
if [ -f "$STUB_DIR/cli.pid" ] && ! kill -0 "$(cat "$STUB_DIR/cli.pid")" 2>/dev/null; then
  ran "CLI approval timeout: CLI terminated"
else
  fail "CLI approval timeout: CLI still running or PID missing"
fi
if [ -z "$(ls -A "$STUB_DIR/tmp-hang")" ]; then
  ran "CLI approval timeout: temp artifacts cleaned"
else
  fail "CLI approval timeout: temp artifacts remain"
fi

[ "$FAIL" = "0" ] && { echo "E2E-DEV FAIL-CLOSED TESTS PASS"; exit 0; } \
  || { echo "E2E-DEV FAIL-CLOSED FAILURES"; exit 1; }
