#!/usr/bin/env bash
# Self-contained local E2E: disposable local D1 bootstrap -> wrangler dev ->
# e2e-dev.sh. Invoked by `npm run test:e2e` and by qa-kit's manifest.
#
# Hardening contract:
#   * Schema + migrations + `wrangler dev` ALL share ONE fresh disposable
#     --persist-to directory, removed on exit. Every Wrangler invocation is
#     explicitly --local, so remote D1 / deployed resources are never used.
#   * Schema/migration failures abort the run immediately (set -e); no
#     `|| true` swallowing. A pristine dir means re-application never happens.
#   * The CLI is the locally installed Wrangler from the lockfile; it never
#     falls back to downloading another version.
#   * The dummy (gitignored) .dev.vars this run creates is removed on exit —
#     success OR failure — via an atomic create-if-absent write and a
#     byte-for-byte (cmp) cleanup guard: a pre-existing or concurrently
#     created/modified/replaced file is never overwritten, never deleted, and
#     a path that is now a symlink is always preserved.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-8787}"
WRANGLER_BIN="${WRANGLER_BIN:-./node_modules/.bin/wrangler}"
E2E_DEV_SCRIPT="${E2E_DEV_SCRIPT:-scripts/e2e-dev.sh}"
[ -x "$WRANGLER_BIN" ] || { echo "e2e-local: run npm ci first (missing $WRANGLER_BIN)" >&2; exit 2; }

# Exact bytes (incl. trailing newline) of the dummy we may create. Cleanup
# compares live content against this with cmp, so the comparison is exact.
DEV_VARS_DUMMY='SESSION_SECRET=e2e-local-dev-secret
GOOGLE_CLIENT_ID=dummy
GOOGLE_CLIENT_SECRET=dummy
ENVIRONMENT=dev
'

# Fresh disposable state: shared persistence dir + run log, cleaned on exit.
STATE="$(mktemp -d)"
PERSIST="$STATE/persist"
LOG="$STATE/wrangler.log"
WRANGLER_PID=""
DEV_VARS_CREATED=0
mkdir -p "$PERSIST"

cleanup() {
  if [ -n "$WRANGLER_PID" ]; then
    kill "$WRANGLER_PID" 2>/dev/null || true
  fi
  # Remove ONLY the dummy .dev.vars this run created, and only while it is a
  # regular file still byte-identical to what we wrote. Anything else — a
  # symlink, modified bytes, replaced content — is no longer ours: preserve.
  if [ "${DEV_VARS_CREATED:-0}" = "1" ]; then
    if [ -L .dev.vars ]; then
      echo "e2e-local: preserving .dev.vars replaced by a symlink" >&2
    elif [ -f .dev.vars ] && cmp -s .dev.vars <(printf '%s' "$DEV_VARS_DUMMY"); then
      rm -f .dev.vars
    elif [ -f .dev.vars ]; then
      echo "e2e-local: preserving .dev.vars modified or replaced by another process" >&2
    fi
  fi
  rm -rf "$STATE"
}
trap cleanup EXIT

die() {
  echo "e2e-local: $*" >&2
  tail -n 40 "$LOG" 2>/dev/null >&2 || true
  exit 1
}

# 1. Bootstrap local D1: schema then each migration, in order, against the
#    shared disposable persist dir. Every file must APPLY; any failure aborts
#    and the EXIT trap wipes the disposable state.
for f in schema.sql migrations/*.sql; do
  if ! "$WRANGLER_BIN" d1 execute beanfit-app --local --persist-to "$PERSIST" --file "$f" >"$LOG" 2>&1; then
    echo "e2e-local: D1 bootstrap failed on $f" >&2
    tail -n 40 "$LOG" >&2 || true
    exit 1
  fi
done

# 2. Dev vars (gitignored): dummy session secret + Google creds so the SSO
#    button renders during the lockout-guard assertion, plus explicit local mode.
#    Created ONLY when
#    absent. The write is atomic (noclobber redirection): if another process
#    creates .dev.vars between the check and the write, the redirect fails and
#    their file wins — we never clobber it and don't claim ownership.
if [ ! -e .dev.vars ]; then
  if ( set -C; printf '%s' "$DEV_VARS_DUMMY" > .dev.vars ) 2>/dev/null; then
    DEV_VARS_CREATED=1
  fi
fi

# 3. Boot wrangler on the same shared persistence dir; wait for readiness.
"$WRANGLER_BIN" dev --local --var ENVIRONMENT:dev --persist-to "$PERSIST" --port "$PORT" >"$LOG" 2>&1 &
WRANGLER_PID=$!

READY=0
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then READY=1; break; fi
  sleep 1
  if ! kill -0 "$WRANGLER_PID" 2>/dev/null; then
    die "wrangler dev exited before becoming ready"
  fi
done
[ "$READY" -eq 1 ] || die "wrangler dev not ready on port $PORT after 30s"

# 4. The flow itself.
bash "$E2E_DEV_SCRIPT" "http://127.0.0.1:$PORT"
