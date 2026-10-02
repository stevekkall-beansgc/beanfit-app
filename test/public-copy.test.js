import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { landing } from "../src/pages.js";
import worker from "../src/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expected = "Hardware detection runs locally. Pairing transmits the sanitized hardware profile and any supplied recommendation snapshot to this app, which stores them as a pending record before you approve it. Approval links that pending record to your account.";

function visibleText(markup) {
  return markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("anonymous homepage describes saved snapshots and planned alerts", async () => {
  const response = await worker.fetch(new Request("https://app.example/"), { DB: copyDb() });
  assert.equal(response.status, 200);
  const text = visibleText(await response.text());
  assert.doesNotMatch(text, /stays optimal|recommendations current|an alert when something better fits/i);
  assert.match(text, /saved recommendation snapshot/);
  assert.match(text, /Automatic update alerts are planned, not delivered by this version\./);
});

test("public pairing copy states that profile and recommendations are stored before approval", () => {
  assert.ok(visibleText(landing()).includes(expected));
  assert.ok(visibleText(readFileSync(path.join(repoRoot, "README.md"), "utf8")).includes(expected));
  assert.doesNotMatch(landing(), /approve pairing — nothing else/i);
});

// Exercise the actual route table and SSR handlers with synthetic stored data.
// No external auth, catalog or provider requests are needed for these routes.
function copyDb({ devices = [], snapshot = false } = {}) {
  const device = { id: "d1", label: "Synthetic Mac", chip: "Apple M4",
    os: "macOS", model_budget_gib: 12, pair_code: "ABCD2345" };
  const rec = snapshot ? { payload_json: JSON.stringify({ ranked: [{
    name: "Synthetic model", runtime_tag: "synthetic:7b", fits: true,
    total_gib: 5, est_tok_s: 20, quality: 1,
  }] }) } : null;
  return { prepare(sql) { return { bind() { return {
    async first() {
      if (sql.includes("FROM sessions")) return { user_id: "u1", email: "synthetic@example.com" };
      if (sql.includes("FROM devices")) return device;
      if (sql.includes("FROM recommendations")) return rec;
      throw new Error(`Unexpected copy-test query: ${sql}`);
    },
    async all() {
      if (sql.includes("FROM devices")) return { results: devices.length ? [device] : [] };
      if (sql.includes("FROM user_identities")) return { results: [] };
      throw new Error(`Unexpected copy-test query: ${sql}`);
    },
  }; } }; } };
}

for (const route of ["/", "/pair/ABCD2345", "/pair?code=ABCD2345", "/dashboard", "/devices/d1"]) {
  for (const snapshot of [false, true]) {
    test(`rendered ${route} describes snapshots and undelivered alerts (snapshot=${snapshot})`, async () => {
      const response = await worker.fetch(new Request(`https://app.example${route}`, {
        headers: { cookie: "bf_session=synthetic-session" },
      }), { DB: copyDb({ devices: snapshot ? [1] : [], snapshot }), SESSION_SECRET: "synthetic-secret" });
      assert.equal(response.status, 200);
      const text = visibleText(await response.text());
      assert.doesNotMatch(text, /stays optimal|keeps recommendations current|recommendations current as better models ship|an alert when something better fits|will use it to send you fit updates/i);
      assert.match(text, /Automatic update alerts are planned, not delivered by this version\./);
      assert.match(text, /recommendation snapshot/i);
      if (route === "/devices/d1") {
        assert.match(text, snapshot ? /Synthetic model/ : /No recommendation snapshot stored yet/);
      }
    });
  }
}
