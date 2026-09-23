import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  cleanupStalePairing,
  stalePairingCutoff,
  PAIR_RETENTION_GRACE_SECONDS,
  CLEANUP_MAX_ROWS,
} from "../src/lib/cleanup.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Recording fake: captures every (sql, args) bind plus each batch. Rows come
// from the candidate SELECT; batch change counts are configurable so child
// and parent deletions can be asserted independently.
function fakeDb({ rows = [], batchChanges = [2, 0, 2] } = {}) {
  const prepared = [];
  const batches = [];
  return {
    prepared,
    batches,
    db: {
      prepare(sql) {
        return {
          bind(...args) {
            const stmt = { sql, args };
            prepared.push(stmt);
            return {
              sql,
              args,
              run: async () => ({ meta: { changes: 1 } }),
              first: async () => null,
              all: async () => ({ results: rows }),
            };
          },
        };
      },
      async batch(stmts) {
        batches.push(stmts);
        return batchChanges.map((changes) => ({ meta: { changes } }));
      },
    },
  };
}

test("cutoff boundary: pair_expires_at at least 24h old is inclusive (== cutoff is stale)", async () => {
  assert.equal(PAIR_RETENTION_GRACE_SECONDS, 86400);
  const now = 1_700_000_000;
  assert.equal(stalePairingCutoff(now), now - 86400);

  const { db, prepared } = fakeDb({ rows: [] });
  await cleanupStalePairing(db, { nowUnix: now });
  const { sql, args } = prepared[0];
  // "at least 24 hours old" => pair_expires_at <= now - 86400 (<=, not <).
  assert.match(sql, /pair_expires_at <= \?/);
  assert.doesNotMatch(sql, /pair_expires_at < \?/);
  assert.match(sql, /pair_expires_at IS NOT NULL/, "NULL-expiry rows have no age and must never be eligible");
  assert.equal(args[0], now - 86400, "cutoff must be exactly now minus the 24h grace");
  assert.equal(args[1], CLEANUP_MAX_ROWS, "cutoff SELECT is bounded by the row cap");
});

test("cutoff is parameterized: moving nowUnix moves the bound value, SQL text never hardcodes time", async () => {
  const a = fakeDb({ rows: [] });
  const b = fakeDb({ rows: [] });
  await cleanupStalePairing(a.db, { nowUnix: 1_000_000_000 });
  await cleanupStalePairing(b.db, { nowUnix: 1_000_086_400 });
  assert.equal(a.prepared[0].args[0], 1_000_000_000 - 86400);
  assert.equal(b.prepared[0].args[0], 1_000_086_400 - 86400);
  assert.notEqual(a.prepared[0].args[0], b.prepared[0].args[0]);
  for (const { sql } of a.prepared) {
    assert.doesNotMatch(sql, /86400/, "grace period must live in binds, not SQL text");
    assert.doesNotMatch(sql, /\b1[0-9]{9}\b/, "no epoch timestamp may be interpolated into SQL");
  }
});

test("status scoping: only pending|denied are ever eligible; approved/revoked appear nowhere", async () => {
  const { db, prepared, batches } = fakeDb({
    rows: [{ id: "d1" }, { id: "d2" }],
    batchChanges: [1, 0, 1],
  });
  await cleanupStalePairing(db, { nowUnix: 1_700_000_000 });

  const allSql = prepared.map((p) => p.sql).concat(batches[0].map((s) => s.sql));
  assert.ok(allSql.length >= 4, "expected SELECT + three DELETEs");
  for (const sql of allSql) {
    assert.match(sql, /status IN \('pending', 'denied'\)/, `eligibility scope missing in: ${sql}`);
    assert.doesNotMatch(sql, /approved/, `approved must never be deletable: ${sql}`);
    assert.doesNotMatch(sql, /revoked/, `revoked must never be deletable: ${sql}`);
  }
});

test("child cleanup: recommendations and outbox go first, devices last, all in one batch", async () => {
  const { db, batches } = fakeDb({
    rows: [{ id: "d1" }, { id: "d2" }],
    batchChanges: [2, 1, 2],
  });
  const result = await cleanupStalePairing(db, { nowUnix: 1_700_000_000 });

  assert.equal(batches.length, 1, "one transactional batch, no partial multi-batch sequence");
  const stmts = batches[0];
  assert.equal(stmts.length, 3);
  assert.match(stmts[0].sql, /DELETE FROM recommendations/);
  assert.match(stmts[1].sql, /DELETE FROM outbound_updates/);
  assert.match(stmts[2].sql, /DELETE FROM devices/);

  // Children carry the FK-parent eligibility guard so their removal stays in
  // lockstep with the device row itself (race + FK safety).
  for (const child of [stmts[0], stmts[1]]) {
    assert.match(child.sql, /device_id IN \(SELECT id FROM devices WHERE status IN \('pending', 'denied'\)/);
    assert.match(child.sql, /pair_expires_at <= \?/);
    assert.equal(child.args[0], 1_700_000_000 - 86400);
    assert.deepEqual(child.args.slice(1), ["d1", "d2"]);
  }
  // The device DELETE re-asserts the full predicate itself — the SELECT's
  // candidate list alone is never trusted.
  assert.match(stmts[2].sql, /status IN \('pending', 'denied'\)/);
  assert.match(stmts[2].sql, /pair_expires_at IS NOT NULL AND pair_expires_at <= \?/);
  assert.match(stmts[2].sql, /id IN \(\?, \?\)/);
  assert.deepEqual(stmts[2].args, [1_700_000_000 - 86400, "d1", "d2"]);

  assert.equal(result.candidates, 2);
  assert.equal(result.recommendationsDeleted, 2);
  assert.equal(result.outboxDeleted, 1);
  assert.equal(result.devicesDeleted, 2);
});

test("idempotent: an empty candidate set performs no DELETEs and reports zeros", async () => {
  const { db, prepared, batches } = fakeDb({ rows: [] });
  const result = await cleanupStalePairing(db, { nowUnix: 1_700_000_000 });
  assert.equal(prepared.length, 1, "only the candidate SELECT runs");
  assert.equal(batches.length, 0, "nothing to delete => no batch");
  assert.deepEqual(result, {
    cutoff: 1_700_000_000 - 86400,
    candidates: 0,
    recommendationsDeleted: 0,
    outboxDeleted: 0,
    devicesDeleted: 0,
  });
  // Second run against the same (now clean) table is the same no-op path.
  const again = await cleanupStalePairing(db, { nowUnix: 1_700_000_000 });
  assert.equal(again.candidates, 0);
  assert.equal(batches.length, 0);
});

test("bounded: limit is a bound parameter, clamped into [1, 100] even under hostile input", async () => {
  for (const [input, expected] of [
    [undefined, CLEANUP_MAX_ROWS],
    [10, 10],
    [0, 1],
    [-5, 1],
    [1_000_000, CLEANUP_MAX_ROWS],
    [NaN, CLEANUP_MAX_ROWS],
    [1.9, 1],
  ]) {
    const { db, prepared } = fakeDb({ rows: [] });
    await cleanupStalePairing(db, { nowUnix: 1_700_000_000, limit: input });
    assert.equal(prepared[0].args[1], expected, `limit ${input} must clamp to ${expected}`);
  }
  assert.equal(CLEANUP_MAX_ROWS, 100);
});

test("no credential logging: cleanup never touches console and never fetches or returns secrets", async () => {
  const methods = ["log", "info", "warn", "error", "debug", "trace"];
  const originals = Object.fromEntries(methods.map((m) => [m, console[m]]));
  const seen = [];
  for (const m of methods) console[m] = (...args) => seen.push(args);

  try {
    const { db, prepared } = fakeDb({
      rows: [{ id: "d1" }, { id: "d2" }],
      batchChanges: [2, 0, 2],
    });
    const result = await cleanupStalePairing(db, { nowUnix: 1_700_000_000 });

    assert.equal(seen.length, 0, "cleanup must not log anything (counts are returned, not printed)");

    // The candidate SELECT fetches ids only — credential columns never enter
    // memory, so no code path can echo them.
    assert.match(prepared[0].sql, /^SELECT id FROM devices WHERE /);
    for (const { sql } of prepared) {
      for (const col of ["device_token", "device_token_hash", "pair_claim_hash", "pair_code", "pw_hash"]) {
        assert.doesNotMatch(sql, new RegExp(col), `credential column ${col} must never appear in cleanup SQL`);
      }
    }

    // Summary is counts + cutoff only: no row ids, no row objects.
    assert.deepEqual(Object.keys(result).sort(), [
      "candidates", "cutoff", "devicesDeleted", "outboxDeleted", "recommendationsDeleted",
    ]);
    for (const [k, v] of Object.entries(result)) {
      assert.equal(typeof v, "number", `${k} must be a number, not row data`);
    }
  } finally {
    for (const m of methods) console[m] = originals[m];
  }
});

test("one-clock rule: no cron trigger, scheduled handler, or bean-sched job file; endpoint is bearer-gated and inactive", () => {
  const indexSrc = readFileSync(path.join(repoRoot, "src", "index.js"), "utf8");
  const maintenanceSrc = readFileSync(path.join(repoRoot, "src", "routes", "maintenance.js"), "utf8");
  const wranglerSrc = readFileSync(path.join(repoRoot, "wrangler.jsonc"), "utf8");
  const cleanupSrc = readFileSync(path.join(repoRoot, "src", "lib", "cleanup.js"), "utf8");

  assert.doesNotMatch(indexSrc, /\bscheduled\b/, "src/index.js must not export a scheduled handler");
  assert.doesNotMatch(wranglerSrc, /crons|triggers/, "wrangler.jsonc must not declare cron triggers");
  assert.doesNotMatch(maintenanceSrc, /setInterval|setTimeout|\bCronExpression\b/, "maintenance handler must not self-schedule");
  assert.equal(existsSync(path.join(repoRoot, "jobs.json")), false,
    "the bean-sched command registry must live outside this repo; no jobs.json here");

  // The endpoint exists, but the route table owns auth via the "bearer" flag:
  // it can only run when a secret is provisioned, and nothing here schedules it.
  assert.match(indexSrc, /retention-cleanup/, "maintenance route is present in the route table");
  assert.match(indexSrc, /"bearer"/, "maintenance route auth is owned by the route-table bearer flag");
  assert.match(indexSrc, /RETENTION_CLEANUP_TOKEN/, "bearer gate validates against the provisioned secret");
  assert.doesNotMatch(cleanupSrc, /console\./, "cleanup core must never log");
});
