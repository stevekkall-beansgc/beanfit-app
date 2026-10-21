import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import worker from "../src/index.js";
import { sha256Hex } from "../src/lib/crypto.js";

// Execute the actual route table, stores, SQL and renderers against disposable
// SQLite, following cleanup-d1-integration.test.js. This is neither a D1
// service test nor CLI/device qualification. No generated command is executed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch {}

function sqliteFixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  sql.exec(readFileSync(path.join(root, "schema.sql"), "utf8"));
  for (const name of readdirSync(path.join(root, "migrations")).filter(n => n.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(path.join(root, "migrations", name), "utf8"));
  }
  const DB = { prepare(query) { return { bind(...args) {
    const statement = sql.prepare(query);
    return {
      async first() { return statement.get(...args) ?? null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
    };
  } }; } };
  return { sql, env: { DB, SESSION_SECRET: "synthetic-snapshot-session-secret", ENVIRONMENT: "dev" } };
}

test("snapshot-persistence: sanitized pending snapshot and generated stack survive approval and owner reads",
  { skip: !DatabaseSync && "node:sqlite unavailable" }, async t => {
    const { sql, env } = sqliteFixture();
    t.after(() => sql.close());
    // Refuse any accidental network use, including provider/auth discovery.
    t.mock.method(globalThis, "fetch", async () => { throw new Error("network forbidden in synthetic persistence test"); });
    const now = Math.floor(Date.now() / 1000);
    for (const owner of ["owner", "other"]) {
      sql.prepare("INSERT INTO users (id, email, pw_hash) VALUES (?, ?, '')").run(owner, `${owner}@synthetic.invalid`);
      sql.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .run(await sha256Hex(`synthetic-${owner}`), owner, now + 3600);
    }
    async function request(url, { owner = "owner", method = "GET", json, form } = {}) {
      const headers = owner ? { cookie: `bf_session=synthetic-${owner}` } : {};
      let body;
      if (json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
      if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form); }
      return worker.fetch(new Request(`https://synthetic.invalid${url}`, { method, headers, body }), env);
    }
    const expectedRows = Array.from({ length: 20 }, (_, i) => ({
      name: i === 0 ? "Synthetic <snapshot> & model" : `Synthetic model ${i}`,
      runtime_tag: i === 0 ? "qwen3:8b" : `synthetic:${i}`,
      quality: i + 1, score: 100 - i, fits: i === 0,
      quant: "q4_K_M", weights_gib: 5.2, total_gib: 5.7,
      est_tok_s: 27.5, est_uncertainty_pct: 40,
    }));
    const submittedRows = [...expectedRows.map(r => ({ ...r, quality: String(r.quality),
      score: String(r.score), weights_gib: String(r.weights_gib),
      unlisted: "DROP-SNAPSHOT-FIELD" })), { name: "DROP-ROW-21" }];
    const expectedSnapshot = { use_case: "coding", ranked: expectedRows };
    const started = await request("/api/pair/start", { method: "POST", owner: null, json: {
      label: "Synthetic persistence device",
      profile: { hardware: { os: "macOS", arch: "arm64", backend: "metal", chip: "Synthetic chip",
        family: "M", variant: "base", ram_gib: 16, metal_cap_gib: 12,
        model_budget_gib: 6, mem_bandwidth_gbs: 120, bw_source: "estimate",
        unlisted: "DROP-PROFILE-FIELD" } },
      recommendations: { use_case: "coding", engine_version: "synthetic-v1", ranked: submittedRows,
        unlisted: "DROP-RECOMMENDATIONS-FIELD" },
    } });
    assert.equal(started.status, 201);
    const { code, pair_id: pairId } = await started.json();
    const device = sql.prepare("SELECT * FROM devices WHERE pair_id = ?").get(pairId);
    const snapshot = () => sql.prepare("SELECT * FROM recommendations WHERE device_id = ?").get(device.id);
    assert.equal(device.status, "pending");
    assert.equal(device.user_id, null);
    assert.deepEqual(JSON.parse(snapshot().payload_json), expectedSnapshot, "full sanitized snapshot must be stored before approval");
    assert.equal(snapshot().use_case, "coding");
    assert.equal(snapshot().engine_version, "synthetic-v1");
    const snapshotBytes = snapshot().payload_json;

    const confirm = await request(`/pair/${code}`);
    assert.equal(confirm.status, 200);
    const confirmation = await confirm.text();
    const assertSnapshotRendered = markup => {
      assert.ok(markup.includes("Synthetic &lt;snapshot&gt; &amp; model"));
      assert.ok(markup.includes("Synthetic model 7"));
      assert.ok(markup.includes("5.7G"));
      assert.ok(markup.includes("~27.5 ±40%"));
      assert.ok(!markup.includes("Synthetic <snapshot>"), "snapshot must be escaped");
      assert.doesNotMatch(markup, /DROP-SNAPSHOT-FIELD|DROP-ROW-21|DROP-PROFILE-FIELD|DROP-RECOMMENDATIONS-FIELD/);
    };
    assertSnapshotRendered(confirmation);
    const csrf = confirmation.match(/name="csrf" value="([a-f0-9]+)"/)?.[1];
    assert.ok(csrf);
    const detailUrl = `/devices/${device.id}`;
    const stackUrl = `/api/devices/${device.id}/stack`;
    assert.equal((await request(detailUrl)).status, 404, "pending record is not an owner device yet");
    assert.equal((await request(`/pair/${code}/approve`, { method: "POST", form: { csrf: "wrong" } })).status, 400);
    assert.equal(sql.prepare("SELECT status FROM devices WHERE id = ?").get(device.id).status, "pending");
    assert.equal(snapshot().payload_json, snapshotBytes);
    assert.equal((await request(`/pair/${code}/approve`, { method: "POST", form: { csrf, label: "Synthetic approved device" } })).status, 200);
    const approved = sql.prepare("SELECT * FROM devices WHERE id = ?").get(device.id);
    assert.equal(approved.status, "approved");
    assert.equal(approved.user_id, "owner");
    assert.equal(snapshot().payload_json, snapshotBytes, "approval must preserve every sanitized snapshot value");
    assert.equal((await request(detailUrl, { owner: "other" })).status, 404);
    const beforeStack = await request(detailUrl);
    assert.equal(beforeStack.status, 200);
    assertSnapshotRendered(await beforeStack.text());

    const choices = { surfaces: ["chat_terminal", "edit_continue"], model_tag: "qwen3:8b" };
    const generated = await request(stackUrl, { method: "POST", json: choices });
    assert.equal(generated.status, 200);
    const fragment = await generated.text();
    const stackBytes = sql.prepare("SELECT stack_json FROM devices WHERE id = ?").get(device.id).stack_json;
    assert.ok(stackBytes, "stack generation must persist JSON");
    const stack = JSON.parse(stackBytes);
    assert.ok(Number.isFinite(Date.parse(stack.generated_at)));
    // Independently authored expectation: do not call generateStack/sanitizeRanked
    // to construct the expected output of the same implementation under test.
    assert.deepEqual(stack, {
      surfaces: ["chat_terminal", "edit_continue"], model_tag: "qwen3:8b", context: 16384, warnings: [],
      steps: [
        { title: "Install Ollama (runs the AI on this machine)", detail: "Download the free app from ollama.com and open it once." },
        { title: "Download Qwen3 8B (one time)", code: "ollama pull qwen3:8b" },
        { title: "Give it room to think: 16k tokens (several pages at once)", detail: "Add this to your shell profile (~/.zshrc) so Ollama uses the context your memory allows:", code: "export OLLAMA_CONTEXT_LENGTH=16384" },
        { title: "Start chatting", code: "ollama run qwen3:8b" },
        { title: "Install the Continue extension", detail: "In VS Code or JetBrains: search 'Continue' in extensions, install once." },
      ],
      files: [{ name: "config.yaml  →  save to ~/.continue/config.yaml", content: "# beanfit — local AI in your editor\nname: beanfit local\nversion: 1.0.0\nmodels:\n  - name: qwen3:8b\n    provider: ollama\n    model: qwen3:8b\n    roles: [chat, edit, apply]\n" }],
      generated_at: stack.generated_at,
    });
    assert.ok(fragment.includes("ollama pull qwen3:8b"));
    assert.ok(fragment.includes("ollama run qwen3:8b"));
    assert.ok(fragment.includes("config.yaml"));
    assert.ok(!fragment.includes("docker compose"));
    const afterStack = await request(detailUrl);
    assert.equal(afterStack.status, 200);
    const detail = await afterStack.text();
    assertSnapshotRendered(detail);
    assert.ok(detail.includes(fragment), "subsequent owner GET must render the exact generated stack fragment");

    assert.equal((await request(stackUrl, { owner: "other", method: "POST", json: { surfaces: ["api"], model_tag: "gemma3:27b" } })).status, 404);
    assert.equal((await request(detailUrl, { owner: null })).status, 303);
    assert.equal((await request(stackUrl, { owner: null, method: "POST", json: choices })).status, 303);
    assert.equal(sql.prepare("SELECT stack_json FROM devices WHERE id = ?").get(device.id).stack_json, stackBytes,
      "refused requests and owner reads must leave the entire persisted stack unchanged");
    assert.equal(snapshot().payload_json, snapshotBytes);
  });
