import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import worker from "../src/index.js";
import { MAINTENANCE_MAX_BATCHES } from "../src/routes/maintenance.js";
import { CLEANUP_MAX_ROWS } from "../src/lib/cleanup.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATHPATH = "/api/maintenance/retention-cleanup";
const SECRET = "correct-maintenance-secret";

// These tests drive the REAL Worker fetch so the route table owns auth. The
// bearer gate must reject before any handler runs — 401 paths must never touch
// the DB — and only a provisioned RETENTION_CLEANUP_TOKEN can authorize.
function buildRequest({ method = "POST", token = null } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  return new Request(`http://127.0.0.1${PATHPATH}`, { method, headers });
}

// Recording DB: every D1 call is captured so tests can prove the bearer gate
// short-circuits (no handler batches) and a session cookie alone cannot reach
// the handler. The gate for 401 paths returns before the handler queries; a
// browser session cookie DOES trigger a normal (and safe) userFromRequest
// lookup, which is unrelated to maintenance authorization.
function recordingDb() {
  const stats = { prepares: 0, batches: 0 };
  return {
    stats,
    db: {
      prepare() {
        stats.prepares += 1;
        return {
          bind() {
            return {
              all: async () => ({ results: [] }),
              first: async () => null,
              run: async () => ({ meta: { changes: 0 } }),
            };
          },
        };
      },
      async batch() {
        stats.batches += 1;
        return [];
      },
    },
  };
}

function minimalEnv(overrides = {}) {
  const rec = recordingDb();
  return {
    DB: rec.db,
    stats: rec.stats,
    RETENTION_CLEANUP_TOKEN: SECRET,
    ...overrides,
  };
}

test("missing bearer token -> 401, handler never runs (no DB access)", async () => {
  const env = minimalEnv();
  const res = await worker.fetch(buildRequest({ token: null }), env);
  assert.equal(res.status, 401);
  assert.match(await res.text(), /^Unauthorized$/);
  assert.equal(env.stats.prepares, 0, "401 path must short-circuit before the handler touches the DB");
  assert.equal(env.stats.batches, 0);
});

test("wrong bearer token -> 401, handler never runs", async () => {
  const env = minimalEnv();
  const res = await worker.fetch(buildRequest({ token: "wrong-secret" }), env);
  assert.equal(res.status, 401);
  assert.equal(env.stats.prepares, 0);
});

test("secret absent -> 401 fail closed even with the exact future token value", async () => {
  const env = minimalEnv({ RETENTION_CLEANUP_TOKEN: undefined });
  const res = await worker.fetch(buildRequest({ token: SECRET }), env);
  assert.equal(res.status, 401, "no provisioned secret => maintenance must never authorize");
  assert.equal(env.stats.prepares, 0);
});

test("empty secret string -> 401 fail closed", async () => {
  const env = minimalEnv({ RETENTION_CLEANUP_TOKEN: "" });
  const res = await worker.fetch(buildRequest({ token: SECRET }), env);
  assert.equal(res.status, 401);
  assert.equal(env.stats.prepares, 0);
});

test("browser session must not authorize maintenance: a session cookie alone gets 401 and the handler never runs", async () => {
  const env = minimalEnv({ RETENTION_CLEANUP_TOKEN: undefined });
  const req = new Request(`http://127.0.0.1${PATHPATH}`, {
    method: "POST",
    headers: { cookie: "bf_session=some-signed-session-token", "content-type": "application/json" },
  });
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 401, "a session cookie alone must never reach the maintenance handler");
  assert.equal(env.stats.batches, 0, "the handler (which performs cleanup batches) must never run");
});

test("non-POST method is not routed (404) and never touches the DB", async () => {
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const env = minimalEnv();
    const res = await worker.fetch(buildRequest({ method, token: SECRET }), env);
    assert.equal(res.status, 404, `${method} must not route to the maintenance POST endpoint`);
    assert.equal(env.stats.prepares, 0, `${method} must not invoke the handler`);
  }
});

// Recording DB whose candidate SELECT returns a controllable page size per
// cleanup invocation; batches echo the page size into the device/recom counts.
function stagedDb(candidateCounts = []) {
  const batchCounts = [];
  let call = 0;
  const page = () => candidateCounts[Math.min(call, candidateCounts.length - 1)] ?? 0;
  return {
    batchCounts,
    db: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              all: async () => {
                const n = page();
                return { results: Array.from({ length: n }, (_, i) => ({ id: `d${call}-${i}` })) };
              },
              run: async () => ({ meta: { changes: 0 } }),
              first: async () => null,
            };
          },
        };
      },
      async batch() {
        const n = page();
        call += 1;
        batchCounts.push(n);
        return [
          { meta: { changes: n } }, // recommendations
          { meta: { changes: 0 } }, // outbound_updates
          { meta: { changes: n } }, // devices
        ];
      },
    },
  };
}

test("correct bearer token authorizes the bounded run and the response is counts only", async () => {
  // Two full pages then a short page: handler must stop after the short page.
  const fake = stagedDb([CLEANUP_MAX_ROWS, CLEANUP_MAX_ROWS, 40]);
  const env = { DB: fake.db, RETENTION_CLEANUP_TOKEN: SECRET };
  const res = await worker.fetch(buildRequest({ token: SECRET }), env);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(Object.keys(body).sort(), [
    "batches", "candidates", "devicesDeleted", "outboxDeleted", "recommendationsDeleted",
  ], "response must be counts only — never row data, ids, or credentials");
  assert.equal(body.batches, 3);
  assert.equal(body.candidates, CLEANUP_MAX_ROWS * 2 + 40);
  assert.equal(body.recommendationsDeleted, CLEANUP_MAX_ROWS * 2 + 40);
  assert.equal(body.outboxDeleted, 0);
  assert.equal(body.devicesDeleted, CLEANUP_MAX_ROWS * 2 + 40);
  assert.deepEqual(fake.batchCounts, [CLEANUP_MAX_ROWS, CLEANUP_MAX_ROWS, 40],
    "each cleanup core call must be bounded to the 100-row cap");
});

test("bounded execution: a saturated table runs at most MAINTENANCE_MAX_BATCHES 100-row batches", async () => {
  // Every page is full, so the loop must stop at the hard batch cap.
  const fake = stagedDb(new Array(30).fill(CLEANUP_MAX_ROWS));
  const env = { DB: fake.db, RETENTION_CLEANUP_TOKEN: SECRET };
  const res = await worker.fetch(buildRequest({ token: SECRET }), env);
  const body = await res.json();

  assert.ok(fake.batchCounts.length <= MAINTENANCE_MAX_BATCHES, `loop exceeded the batch cap: ${fake.batchCounts.length}`);
  assert.equal(body.batches, MAINTENANCE_MAX_BATCHES);
  assert.equal(body.candidates, MAINTENANCE_MAX_BATCHES * CLEANUP_MAX_ROWS);
  assert.equal(fake.batchCounts.length, MAINTENANCE_MAX_BATCHES);
});

test("no credential or row-data leakage: responses never echo the token and source never logs it", async () => {
  const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const seen = [];
  for (const k of Object.keys(orig)) console[k] = (...a) => seen.push(a.join(" "));
  try {
    const env = minimalEnv(); // no handler runs -> no logging path at all
    const denied = await worker.fetch(buildRequest({ token: "wrong" }), env);
    const deniedText = await denied.text();
    assert.doesNotMatch(deniedText, new RegExp(SECRET), "401 body must not echo the configured secret");
    assert.ok(!seen.some((line) => line.includes(SECRET)), "nothing may log the maintenance secret");

    const fake = stagedDb([5]);
    const envOk = { DB: fake.db, RETENTION_CLEANUP_TOKEN: SECRET };
    const ok = await worker.fetch(buildRequest({ token: SECRET }), envOk);
    const okText = await ok.text();
    assert.doesNotMatch(okText, new RegExp(SECRET), "200 body must not echo the token");
    assert.ok(!seen.some((line) => line.includes("d0-")), "200 path must not log row data");
  } finally {
    for (const k of Object.keys(orig)) console[k] = orig[k];
  }
});

test("route table owns maintenance auth: the bearer flag and secret reference live in src/index.js", () => {
  const src = readFileSync(path.join(repoRoot, "src", "index.js"), "utf8");
  assert.match(src, /retention-cleanup/, "route registered in the declarative table");
  const line = src.split("\n").find((l) => l.includes("retention-cleanup"));
  assert.match(line, /"bearer"/, "auth flag for the row is the bearer mode, not the session 'required' mode");
  assert.doesNotMatch(line, /"required"/);
  assert.match(src, /authorizedMaintenanceBearer/, "the auth gate lives with the route table in index.js");
  assert.doesNotMatch(line, /csrf/i, "maintenance route must never involve CSRF/session");
});