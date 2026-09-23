#!/usr/bin/env bash
# Shell-level regression tests for scripts/e2e-local.sh hardening:
#   * isolation: every Wrangler call carries --local and ONE shared disposable
#     --persist-to directory; the directory is cleaned up afterwards.
#   * .dev.vars lifecycle: a dummy created by the wrapper is removed on exit
#     (success AND failure path); a pre-existing .dev.vars is never
#     overwritten nor deleted; a concurrently created/modified/replaced file
#     survives cleanup via byte-for-byte (cmp) ownership; a path replaced by a
#     symlink is always preserved; creation is atomic (noclobber), so a file
#     that appears between check and write still wins.
#   * failure propagation: a schema/migration error aborts the E2E run
#     immediately instead of being hidden by `|| true`.
# Uses the real repo-pinned Wrangler for bootstrap/failure checks and a
# recording stub for wiring checks. Requires deps (npm ci) first.
set -euo pipefail
cd "$(dirname "$0")/.."

WRANGLER_REAL="${WRANGLER_REAL:-./node_modules/.bin/wrangler}"
FAIL=0
ran() { echo "  ok $*"; }
fail() { echo "  FAIL $*"; FAIL=1; }

[ -x "$WRANGLER_REAL" ] || { echo "npm ci first (missing $WRANGLER_REAL)"; exit 2; }

STUB_DIR="$(mktemp -d)"
P=""
cleanup() {
  [ -z "$P" ] || rm -rf "$P"
  rm -rf "$STUB_DIR"
}
trap cleanup EXIT
STUB_LOG="$STUB_DIR/invocations.log"
STUB_COUNT="$STUB_DIR/count"
STUB_PORT=$(( ( RANDOM % 2000 ) + 9000 ))
FIXTURE="$STUB_DIR/project"
mkdir -p "$FIXTURE/scripts" "$FIXTURE/migrations"
cp scripts/e2e-local.sh "$FIXTURE/scripts/e2e-local.sh"
cp schema.sql "$FIXTURE/schema.sql"
cp migrations/*.sql "$FIXTURE/migrations/"
export STUB_LOG STUB_COUNT STUB_PORT STUB_DIR
# Recorder stub: logs every invocation, serves a fake `dev` HTTP endpoint,
# and can fail a chosen invocation to exercise failure propagation.
# STUB_FAIL_AT is inherited from the caller via STUB_DEV_WRAPPER.
cat > "$STUB_DIR/wrangler-stub.sh" <<STUB
#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "\$*" >> "\$STUB_LOG"
N="\$((\$(cat "\$STUB_COUNT" 2>/dev/null || echo 0) + 1))"
printf '%s\\n' "\$N" > "\$STUB_COUNT"
if [ "\${STUB_FAIL_AT:-0}" != "0" ] && [ "\$N" -eq "\$STUB_FAIL_AT" ]; then
  echo "stub was told to fail invocation #\$N" >&2
  exit 42
fi
case "\${1:-}" in
  d1) ;;
  dev)
    python3 -m http.server "\$STUB_PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
    PY=\$!
    trap 'kill "\$PY" 2>/dev/null || true; exit 0' TERM INT EXIT
    wait "\$PY"
    ;;
  *) echo "stub: unexpected subcommand: \$*" >&2; exit 99 ;;
esac
exit 0
STUB
chmod +x "$STUB_DIR/wrangler-stub.sh"

cat > "$STUB_DIR/fake-e2e-dev.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "fake-e2e-dev PASS url=$1"
STUB
chmod +x "$STUB_DIR/fake-e2e-dev.sh"

# Records what (.dev.vars) the wrapper had in place mid-run, so tests can
# prove the dummy was created live and then cleaned up on exit.
cat > "$STUB_DIR/inspect-e2e-dev.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
if [ -f .dev.vars ]; then
  cat .dev.vars > "$STUB_DIR/midrun-dev-vars.txt"
else
  printf 'MISSING\n' > "$STUB_DIR/midrun-dev-vars.txt"
fi
echo "inspect-e2e-dev done"
STUB
chmod +x "$STUB_DIR/inspect-e2e-dev.sh"

# Simulates a concurrent process REPLACING the dummy .dev.vars mid-run.
cat > "$STUB_DIR/replace-e2e-dev.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'SESSION_SECRET=concurrent-process-wins\n' > .dev.vars
echo "replace-e2e-dev done"
STUB
chmod +x "$STUB_DIR/replace-e2e-dev.sh"

# Simulates a concurrent process MODIFYING the dummy .dev.vars mid-run.
cat > "$STUB_DIR/modify-e2e-dev.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'GOOGLE_CLIENT_SCOPE=extra\n' >> .dev.vars
echo "modify-e2e-dev done"
STUB
chmod +x "$STUB_DIR/modify-e2e-dev.sh"

# Simulates a concurrent process appending ONLY an extra blank line to the
# dummy mid-run (the case a trailing-newline-stripping comparison would
# wrongly treat as an exact match).
cat > "$STUB_DIR/append-newline-e2e-dev.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '\n' >> .dev.vars
echo "append-newline-e2e-dev done"
STUB
chmod +x "$STUB_DIR/append-newline-e2e-dev.sh"

# Simulates a concurrent process REPLACING the dummy with a symlink whose
# target holds byte-identical dummy content.
cat > "$STUB_DIR/symlink-e2e-dev.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
cp .dev.vars "$STUB_DIR/symlink-target.dev-vars"
rm -f .dev.vars
ln -s "$STUB_DIR/symlink-target.dev-vars" .dev.vars
echo "symlink-e2e-dev done"
STUB
chmod +x "$STUB_DIR/symlink-e2e-dev.sh"

echo "== 1. real pinned CLI: bootstrap + failure propagation"
P="$(mktemp -d)"
for f in schema.sql migrations/*.sql; do
  "$WRANGLER_REAL" d1 execute beanfit-app --local --persist-to "$P/persist" --file "$f" \
    >/dev/null 2>&1 || fail "real bootstrap failed on $f"
done
ran "schema + all migrations apply cleanly into one disposable --persist-to dir"
[ -n "$(find "$P/persist" -type f 2>/dev/null)" ] \
  && ran "D1 state was written under the disposable dir" \
  || fail "no D1 state under --persist-to dir"

printf 'INSERT INTO table_that_does_not_exist VALUES (1);\n' > "$P/bad.sql"
if "$WRANGLER_REAL" d1 execute beanfit-app --local --persist-to "$P/persist-bad" --file "$P/bad.sql" \
  >"$P/out.log" 2>&1; then
  fail "real CLI accepted bad SQL (success would have been misread as fine)"
else
  ran "bad SQL fails the real CLI (nonzero exit)"
fi
rm -rf "$P"
P=""

echo "== 2. e2e-local.sh wiring: shared --persist-to, --local, cleanup, .dev.vars"
printf 'SESSION_SECRET=pre-existing-sentinel\n' > "$FIXTURE/.dev.vars"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/fake-e2e-dev.sh" \
  bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run1.log" 2>&1; then
  ran "e2e-local.sh full run exits 0 with stub CLI + fake flow"
else
  fail "e2e-local.sh full run failed; tail of log:"; tail -n 20 "$STUB_DIR/run1.log" || true
fi
grep -q "fake-e2e-dev PASS" "$STUB_DIR/run1.log" \
  && ran "flow script was invoked against the local server" \
  || fail "flow script was not invoked"

[ "$(cat "$FIXTURE/.dev.vars")" = "SESSION_SECRET=pre-existing-sentinel" ] \
  && ran "pre-existing .dev.vars preserved on success (not overwritten, not removed)" \
  || fail "pre-existing .dev.vars overwritten or removed"
rm -f "$FIXTURE/.dev.vars"

MAPS="$(awk '{ for (i=1; i<NF; i++) if ($i == "--persist-to") print $(i+1) }' "$STUB_LOG" | sort -u | wc -l | tr -d ' ')"
[ "$MAPS" = "1" ] \
  && ran "every invocation used the SAME --persist-to path ($MAPS unique)" \
  || fail "expected exactly one --persist-to path, saw $MAPS"
MISSING_LOCAL="$(grep -cv ' --local ' "$STUB_LOG" || true)"
[ "$MISSING_LOCAL" = "0" ] \
  && ran "every invocation carried --local" \
  || fail "$MISSING_LOCAL invocation(s) missing --local"
TOTAL="$(wc -l < "$STUB_LOG" | tr -d ' ')"
# schema + 3 migrations + 1 dev
[ "$TOTAL" = "5" ] \
  && ran "expected 5 invocations (schema, 3 migrations, dev), saw $TOTAL" \
  || fail "expected 5 invocations, saw $TOTAL"
USED_PERSIST="$(awk '{ for (i=1; i<NF; i++) if ($i == "--persist-to") print $(i+1) }' "$STUB_LOG" | head -1)"
[ ! -e "$USED_PERSIST" ] \
  && ran "disposable persist dir was cleaned up on exit" \
  || fail "disposable persist dir still exists: $USED_PERSIST"
[ "$(grep -c '^dev ' "$STUB_LOG")" = "1" ] \
  && ran "dev was launched exactly once through the shared persist path" \
  || fail "dev launch count != 1"

echo "== 3. e2e-local.sh wiring: migration failure aborts immediately"
: > "$STUB_LOG"
: > "$STUB_COUNT"
# Invocation #2 is migrations/0002 (schema itself is #1).
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/fake-e2e-dev.sh" \
  STUB_FAIL_AT=2 bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run2.log" 2>&1; then
  fail "e2e-local.sh exited 0 despite a failing migration"
else
  ran "migration failure makes e2e-local.sh exit nonzero"
fi
grep -q "D1 bootstrap failed on" "$STUB_DIR/run2.log" \
  && ran "failure names the failing SQL file" \
  || fail "no explicit 'D1 bootstrap failed on ...' message"
RUN2_TOTAL="$(wc -l < "$STUB_LOG" | tr -d ' ')"
[ "$RUN2_TOTAL" = "2" ] \
  && ran "run stopped at the failing file (2 invocations, no dev)" \
  || fail "expected 2 invocations total, saw $RUN2_TOTAL"
[ "$(grep -c '^dev ' "$STUB_LOG")" = "0" ] \
  && ran "dev was never launched after bootstrap failure" \
  || fail "dev launched despite bootstrap failure"
[ ! -e "$FIXTURE/.dev.vars" ] \
  && ran "no .dev.vars left behind after pre-creation failure" \
  || fail ".dev.vars exists after pre-creation failure"

echo "== 4. e2e-local.sh wiring: missing .dev.vars is created and removed on exit"
rm -f "$FIXTURE/.dev.vars"
rm -f "$STUB_DIR/midrun-dev-vars.txt"
: > "$STUB_LOG"
: > "$STUB_COUNT"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/inspect-e2e-dev.sh" \
  bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run3.log" 2>&1; then
  ran "e2e-local.sh full run exits 0 without pre-existing .dev.vars"
else
  fail "e2e-local.sh failed without pre-existing .dev.vars; log tail:"
  tail -n 20 "$STUB_DIR/run3.log" || true
fi
grep -q "SESSION_SECRET=e2e-local-dev-secret" "$STUB_DIR/midrun-dev-vars.txt" \
  && ran "dummy .dev.vars existed during the run" \
  || fail "dummy .dev.vars was not present mid-run"
[ ! -e "$FIXTURE/.dev.vars" ] \
  && ran "created dummy .dev.vars removed on exit" \
  || fail "created dummy .dev.vars left behind"

echo "== 5. e2e-local.sh failure path: created dummy .dev.vars removed on failure"
rm -f "$FIXTURE/.dev.vars"
: > "$STUB_LOG"
: > "$STUB_COUNT"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/fake-e2e-dev.sh" \
  STUB_FAIL_AT=5 bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run5.log" 2>&1; then
  fail "e2e-local.sh exited 0 despite dev failing"
else
  ran "dev failure makes e2e-local.sh exit nonzero"
fi
grep -q "wrangler dev exited before becoming ready" "$STUB_DIR/run5.log" \
  && ran "startup failure was reported clearly" \
  || fail "no startup-failure message"
[ ! -e "$FIXTURE/.dev.vars" ] \
  && ran "created dummy .dev.vars removed on failure path" \
  || fail "created dummy .dev.vars left behind after failure"

echo "== 6. e2e-local.sh failure path: pre-existing .dev.vars untouched on failure"
printf 'SESSION_SECRET=pre-existing-sentinel\n' > "$FIXTURE/.dev.vars"
: > "$STUB_LOG"
: > "$STUB_COUNT"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/fake-e2e-dev.sh" \
  STUB_FAIL_AT=5 bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run6.log" 2>&1; then
  fail "e2e-local.sh exited 0 despite dev failing (pre-existing .dev.vars case)"
else
  ran "dev failure makes e2e-local.sh exit nonzero (pre-existing .dev.vars case)"
fi
[ -f "$FIXTURE/.dev.vars" ] && [ "$(cat "$FIXTURE/.dev.vars")" = "SESSION_SECRET=pre-existing-sentinel" ] \
  && ran "pre-existing .dev.vars preserved on failure path" \
  || fail "pre-existing .dev.vars lost on failure path"
rm -f "$FIXTURE/.dev.vars"

echo "== 7. e2e-local.sh: concurrently REPLACED .dev.vars survives cleanup"
: > "$STUB_LOG"
: > "$STUB_COUNT"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/replace-e2e-dev.sh" \
  bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run7.log" 2>&1; then
  ran "run succeeds when another process replaces the dummy mid-run"
else
  fail "run failed when another process replaced the dummy mid-run; log tail:"
  tail -n 20 "$STUB_DIR/run7.log" || true
fi
[ -f "$FIXTURE/.dev.vars" ] && [ "$(cat "$FIXTURE/.dev.vars")" = "SESSION_SECRET=concurrent-process-wins" ] \
  && ran "replaced .dev.vars survived cleanup" \
  || fail "replaced .dev.vars was deleted by cleanup"
grep -q "preserving .dev.vars" "$STUB_DIR/run7.log" \
  && ran "cleanup reported the preservation" \
  || fail "no preservation notice in cleanup output"
rm -f "$FIXTURE/.dev.vars"

echo "== 8. e2e-local.sh: concurrently MODIFIED .dev.vars survives cleanup"
: > "$STUB_LOG"
: > "$STUB_COUNT"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/modify-e2e-dev.sh" \
  bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run8.log" 2>&1; then
  ran "run succeeds when another process modifies the dummy mid-run"
else
  fail "run failed when another process modified the dummy mid-run; log tail:"
  tail -n 20 "$STUB_DIR/run8.log" || true
fi
[ -f "$FIXTURE/.dev.vars" ] && grep -q "GOOGLE_CLIENT_SCOPE=extra" "$FIXTURE/.dev.vars" \
  && ran "modified .dev.vars survived cleanup with its change intact" \
  || fail "modified .dev.vars was deleted or reverted by cleanup"
grep -q "preserving .dev.vars" "$STUB_DIR/run8.log" \
  && ran "cleanup reported the preservation" \
  || fail "no preservation notice in cleanup output"
rm -f "$FIXTURE/.dev.vars"

echo "== 9. .dev.vars creation is atomic (noclobber create-if-absent)"
T="$(mktemp -d)"
printf 'x=1\n' > "$T/.dev.vars"
if ( set -C; printf 'y=2\n' > "$T/.dev.vars" ) 2>/dev/null; then
  fail "noclobber redirection clobbered an existing file"
else
  ran "noclobber refuses to overwrite an existing file (atomic create-if-absent)"
fi
[ "$(cat "$T/.dev.vars")" = "x=1" ] \
  && ran "existing content preserved under the check/write race" \
  || fail "existing content lost under the check/write race"
rm -f "$T/.dev.vars"
( set -C; printf 'z=3\n' > "$T/.dev.vars" ) 2>/dev/null \
  && ran "noclobber creates the file when absent" \
  || fail "noclobber failed to create when absent"
[ "$(cat "$T/.dev.vars")" = "z=3" ] \
  && ran "atomically created file holds the dummy content" \
  || fail "atomically created file has wrong content"
rm -rf "$T"

echo "== 10. e2e-local.sh: byte-for-byte — appended extra newline survives cleanup"
REF="$STUB_DIR/ref.dev-vars"
printf 'SESSION_SECRET=e2e-local-dev-secret\nGOOGLE_CLIENT_ID=dummy\nGOOGLE_CLIENT_SECRET=dummy\n' > "$REF"
: > "$STUB_LOG"
: > "$STUB_COUNT"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/append-newline-e2e-dev.sh" \
  bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run10.log" 2>&1; then
  ran "run succeeds when another process appends an extra newline mid-run"
else
  fail "e2e-local.sh failed; log tail:"; tail -n 20 "$STUB_DIR/run10.log" || true
fi
if [ -f "$FIXTURE/.dev.vars" ] && cmp -s "$FIXTURE/.dev.vars" <( { cat "$REF"; printf '\n'; } ); then
  ran "appended-extra-newline .dev.vars survived cleanup byte-for-byte"
else
  fail "appended-extra-newline .dev.vars was deleted or altered by cleanup"
fi
grep -q "preserving .dev.vars" "$STUB_DIR/run10.log" \
  && ran "cleanup reported the preservation" \
  || fail "no preservation notice for appended newline"
rm -f "$FIXTURE/.dev.vars" "$REF"

echo "== 11. e2e-local.sh: symlink replacement preserved even if content matches"
: > "$STUB_LOG"
: > "$STUB_COUNT"
if E2E_PORT="$STUB_PORT" WRANGLER_BIN="$STUB_DIR/wrangler-stub.sh" E2E_DEV_SCRIPT="$STUB_DIR/symlink-e2e-dev.sh" \
  bash "$FIXTURE/scripts/e2e-local.sh" >"$STUB_DIR/run11.log" 2>&1; then
  ran "run succeeds when another process swaps in a symlink mid-run"
else
  fail "e2e-local.sh failed; log tail:"; tail -n 20 "$STUB_DIR/run11.log" || true
fi
[ -L "$FIXTURE/.dev.vars" ] \
  && ran "symlink .dev.vars still a symlink after cleanup" \
  || fail "symlink .dev.vars deleted or dereferenced by cleanup"
[ -f "$STUB_DIR/symlink-target.dev-vars" ] \
  && ran "symlink target still present and untouched" \
  || fail "symlink target missing after cleanup"
grep -q "preserving .dev.vars replaced by a symlink" "$STUB_DIR/run11.log" \
  && ran "cleanup reported the symlink preservation" \
  || fail "no symlink preservation notice"
rm -f "$FIXTURE/.dev.vars" "$STUB_DIR/symlink-target.dev-vars"

[ "$FAIL" = "0" ] && { echo "ALL E2E-LOCAL REGRESSION TESTS PASS"; exit 0; } \
  || { echo "E2E-LOCAL REGRESSION FAILURES"; exit 1; }
