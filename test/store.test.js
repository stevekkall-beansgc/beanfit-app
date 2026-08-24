import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../src/lib/store.js";

test("createStore exposes every repository (regression: identities was missing)", () => {
  const fakeDb = new Proxy({}, {
    get: () => () => ({
      bind: () => ({ run: async () => {}, first: async () => null, all: async () => ({ results: [] }) }),
    }),
  });
  const store = createStore(fakeDb);
  for (const repo of ["users", "sessions", "identities", "devices", "recommendations", "catalog"]) {
    assert.ok(store[repo], `${repo} missing from store`);
  }
  // every method used by routes exists
  for (const fn of ["find", "create"]) {
    assert.equal(typeof store.identities[fn], "function");
  }
});

function recordingDb() {
  const calls = [];
  return {
    calls,
    db: {
      prepare: (sql) => ({
        bind: (...args) => {
          calls.push({ sql, args });
          return {
            run: async () => ({ meta: { changes: 1 } }),
            first: async () => null,
            all: async () => ({ results: [] }),
          };
        },
      }),
      batch: async (stmts) => ({ results: stmts.map(() => ({})) }),
    },
  };
}

test("pendingByCode encodes the whole pairing-liveness rule in SQL", async () => {
  const { db, calls } = recordingDb();
  const store = createStore(db);
  await store.devices.pendingByCode("ABCD2345", 1000);
  const { sql, args } = calls.at(-1);
  assert.match(sql, /status = 'pending'/);
  assert.match(sql, /pair_expires_at IS NOT NULL/, "null-expiry rows must stay expired");
  assert.match(sql, /pair_expires_at > \?/);
  assert.deepEqual(args, ["ABCD2345", 1000]);
});

test("approve claims token atomically under the pending guard", async () => {
  const { db, calls } = recordingDb();
  const store = createStore(db);
  await store.devices.approve("dev1", "usr1", "hash123", "raw456");
  const { sql, args } = calls.at(-1);
  assert.match(sql, /status = 'approved'/);
  assert.match(sql, /device_token_hash = \?/);
  assert.match(sql, /device_token = \?/, "token must land in the same UPDATE");
  assert.match(sql, /status = 'pending'/, "guard must stay");
  assert.deepEqual(args, ["usr1", "hash123", "raw456", "dev1"]);
});

test("setRawToken/setLastSeen are gone (approval is one statement)", () => {
  const { db } = recordingDb();
  const store = createStore(db);
  assert.equal(store.devices.setRawToken, undefined);
  assert.equal(store.devices.setLastSeen, undefined);
});

test("createWithIdentity batches user+identity inserts", async () => {
  let batched = null;
  const db = {
    prepare: (sql) => ({ sql, bind: (...a) => ({ sql, args: a }) }),
    batch: async (stmts) => {
      batched = stmts;
      return { ok: true };
    },
  };
  const store = createStore(db);
  await store.users.createWithIdentity(
    { id: "u1", email: "g@g.co", pwHash: "" },
    { provider: "google", providerUid: "gid", userId: "u1", emailAtLink: "g@g.co" },
  );
  assert.equal(batched.length, 2);
  assert.match(batched[0].sql, /INSERT INTO users/);
  assert.match(batched[1].sql, /INSERT INTO user_identities/);
});
