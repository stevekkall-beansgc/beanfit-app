import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import worker from "../src/index.js";

// Real SQLite integration (node:sqlite is a Node built-in, so the
// zero-dependency contract holds): D1's engine is SQLite, and the cleanup
// core's "FK-safe deletes" claim is about *order and atomicity* — children are
// deleted before their devices inside one transactional batch. Running the
// real Worker route against a real SQLite database with `PRAGMA foreign_keys
// = ON` proves the batch commits without a FOREIGN KEY constraint failure and
// never touches approved/revoked rows. (node:sqlite is experimental in Node
// 22; skip cleanly when unavailable.)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "integration-maintenance-secret";
const PATH = "/api/maintenance/retention-cleanup";
const NOW = 1_700_000_000;
const CUTOFF = NOW - 86400; // 24h grace

let DatabaseSync = null;
try {
  DatabaseSync = (await import("node:sqlite")).DatabaseSync ?? null;
} catch {
  DatabaseSync = null;
}
const DI_SKIP = DatabaseSync == null ? "node:sqlite unavailable" : false;

// D1-compatible adapter over node:sqlite. The cleanup core only uses
// `prepare(sql).bind(...args).all()` and `db.batch([stmts])` (transactional),
// so the adapter needs exactly that surface plus `PRAGMA foreign_keys = ON`.
function sqliteDb() {
  const handle = new DatabaseSync(":memory:");
  handle.exec("PRAGMA foreign_keys = ON");
  const applied = handle.prepare("PRAGMA foreign_keys").get();
  if (Number(applied.foreign_keys) !== 1) throw new Error("test connection must enforce foreign keys");

  const stats = { batches: 0 };
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = handle.prepare(sql);
          return {
            sql,
            args,
            async all() {
              return { results: stmt.all(...args) };
            },
            async run() {
              const info = stmt.run(...args);
              return { meta: { changes: Number(info.changes) } };
            },
          };
        },
      };
    },
    async batch(stmts) {
      stats.batches += 1;
      const results = [];
      handle.exec("BEGIN");
      try {
        for (const s of stmts) {
          const info = handle.prepare(s.sql).run(...s.args);
          results.push({ meta: { changes: Number(info.changes) } });
        }
        handle.exec("COMMIT");
      } catch (err) {
        handle.exec("ROLLBACK");
        throw err;
      }
      return results;
    },
  };

  return {
    handle,
    db,
    get batches() {
      return stats.batches;
    },
    apply() {
      handle.exec(readFileSync(path.join(repoRoot, "schema.sql"), "utf8"));
      for (const name of ["0002_user_identities.sql", "0003_device_stack.sql", "0004_device_credential_handoff.sql"]) {
        handle.exec(readFileSync(path.join(repoRoot, "migrations", name), "utf8"));
      }
    },
    seed() {
      const insDevice = handle.prepare(
        "INSERT INTO devices (id, user_id, label, pair_expires_at, status) VALUES (?, ?, ?, ?, ?)");
      const device = (id, status, expires, userId = null) => insDevice.run(id, userId, `dev ${id}`, expires, status);
      device("d_pending_stale", "pending", CUTOFF);            // == cutoff -> stale (inclusive)
      device("d_denied_stale", "denied", CUTOFF - 100);        // older than grace -> stale
      device("d_approved", "approved", CUTOFF - 5000, "u1");   // old but approved -> NEVER touched
      device("d_revoked", "revoked", CUTOFF - 5000, "u1");     // old but revoked -> NEVER touched
      device("d_fresh", "pending", CUTOFF + 1);                // younger than grace -> kept
      device("d_null", "pending", null);                       // no expiry -> no age -> kept

      const insRec = handle.prepare(
        "INSERT INTO recommendations (device_id, use_case, payload_json) VALUES (?, 'chat', '{}')");
      const insOut = handle.prepare(
        "INSERT INTO outbound_updates (id, device_id, type, payload_json) VALUES (?, ?, 'config_tip', '{}')");
      for (const id of ["d_pending_stale", "d_denied_stale", "d_approved", "d_fresh", "d_null"]) insRec.run(id);
      insOut.run("o_pending", "d_pending_stale");
      insOut.run("o_revoked", "d_revoked");
    },
    rowCount(sql, ...args) {
      return Number(handle.prepare(sql).get(...args).c);
    },
    close() {
      handle.close();
    },
  };
}

function maintenanceRequest(token) {
  return new Request(`http://127.0.0.1${PATH}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

test("d1-integration: FK on — bounded cleanup deletes stale pending/denied children-first, never approved/revoked",
  { skip: DI_SKIP }, async (t) => {
    t.mock.method(Date, "now", () => NOW * 1000);
    const env = sqliteDb();
    try {
      env.apply();
      env.handle.prepare("INSERT INTO users (id, email, pw_hash) VALUES ('u1', 'u1@t.local', '')").run();
      env.seed();
      const before = env.rowCount("SELECT COUNT(*) c FROM devices");

      const res = await worker.fetch(maintenanceRequest(SECRET),
        { DB: env.db, RETENTION_CLEANUP_TOKEN: SECRET });
      const resText = await res.text();

      assert.equal(res.status, 200, resText);
      const body = JSON.parse(resText);
      assert.equal(body.batches, 1, "one core invocation cleared all stale candidates");
      assert.equal(body.candidates, 2, "exactly the two stale pending/denied rows are candidates");
      assert.equal(body.recommendationsDeleted, 2);
      assert.equal(body.outboxDeleted, 1);
      assert.equal(body.devicesDeleted, 2);

      assert.equal(env.rowCount("SELECT COUNT(*) c FROM devices"), before - 2,
        "only the two stale rows were deleted");
      for (const gone of ["d_pending_stale", "d_denied_stale"]) {
        assert.equal(env.rowCount("SELECT COUNT(*) c FROM devices WHERE id = ?", gone), 0,
          `${gone} must be deleted`);
      }

      for (const kept of ["d_approved", "d_revoked", "d_fresh", "d_null"]) {
        assert.equal(env.rowCount("SELECT COUNT(*) c FROM devices WHERE id = ?", kept), 1,
          `${kept} must survive`);
      }
      for (const kid of ["d_approved", "d_fresh", "d_null"]) {
        assert.equal(env.rowCount("SELECT COUNT(*) c FROM recommendations WHERE device_id = ?", kid), 1,
          `${kid}'s recommendation must survive`);
      }

      // No orphans: every surviving child references a surviving parent. With
      // FK enforcement ON and the batch committed as one transaction, the run
      // succeeding is itself the proof children were deleted before their
      // devices — the reverse order would have aborted the batch with a FK
      // error and the ROLLBACK would have left all rows intact.
      for (const tbl of ["recommendations", "outbound_updates"]) {
        assert.equal(
          env.rowCount(`SELECT COUNT(*) c FROM ${tbl} WHERE device_id NOT IN (SELECT id FROM devices)`),
          0,
          `${tbl} must hold no orphaned rows after cleanup`,
        );
      }
    } finally {
      env.close();
    }
  });

test("d1-integration: missing/wrong token or absent secret reaches no handler and deletes nothing",
  { skip: DI_SKIP }, async () => {
    for (const [envSecret, token] of [
      [SECRET, null],
      [SECRET, "wrong-secret"],
      [undefined, SECRET],
    ]) {
      const env = sqliteDb();
      try {
        env.apply();
        env.handle.prepare("INSERT INTO users (id, email, pw_hash) VALUES ('u1', 'u1@t.local', '')").run();
        env.seed();
        const before = env.rowCount("SELECT COUNT(*) c FROM devices");

        const res = await worker.fetch(maintenanceRequest(token),
          { DB: env.db, RETENTION_CLEANUP_TOKEN: envSecret });
        assert.equal(res.status, 401, `case token=${token} secret=${envSecret} must be rejected`);
        assert.equal(env.rowCount("SELECT COUNT(*) c FROM devices"), before,
          "a rejected maintenance request must not delete a single row");
        assert.equal(env.batches, 0, "no cleanup batch may run without a valid bearer token");
      } finally {
        env.close();
      }
    }
  });