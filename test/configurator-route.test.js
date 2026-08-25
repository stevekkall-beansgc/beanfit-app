import test from "node:test";
import assert from "node:assert/strict";

import { makePageHandlers } from "../src/routes/pair.js";

// Route-seam regression for the audit's configurator fix: the route must
// forward body.surfaces (not the stale interface key) into generateStack,
// and persist exactly what it rendered.
function fakeEnv() {
  const captured = {};
  const deviceRow = {
    id: "d1", user_id: "u1", label: "Test Mac", stack_json: null,
    chip: "Apple M4", family: "M4", variant: "", ram_gib: 16,
    model_budget_gib: 12,
  };
  const db = {
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => {
          if (sql.includes("stack_json")) captured.setStackArgs = args;
          return { meta: { changes: 1 } };
        },
        first: async () => {
          if (sql.startsWith("SELECT * FROM devices WHERE id")) return deviceRow;
          return null; // recommendations.forDevice -> no snapshot
        },
        all: async () => ({ results: [] }),
      }),
    }),
    batch: async () => ({}),
  };
  return { db, captured };
}

async function postStack(surfaces) {
  const { db, captured } = fakeEnv();
  const handlers = makePageHandlers({ DB: db }, {});
  const res = await handlers.generateStackRoute({
    params: { id: "d1" },
    user: { id: "u1", email: "t@t.local" },
    request: { json: async () => ({ surfaces, model_tag: null }) },
  });
  return { text: await res.text(), captured };
}

test("configurator forwards surfaces; opencode surface reaches the fragment", async () => {
  const { text, captured } = await postStack(["code_opencode"]);
  assert.match(text, /opencode/i);
  const persisted = JSON.parse(captured.setStackArgs[0]); // bind order: (stackJson, deviceId)
  assert.deepEqual(persisted.surfaces, ["code_opencode"]);
});

test("unknown surfaces fall back to chat_webui (no opencode fragment)", async () => {
  const { text, captured } = await postStack(["bogus_surface"]);
  assert.doesNotMatch(text, /opencode/i);
  assert.deepEqual(JSON.parse(captured.setStackArgs[0]).surfaces, ["chat_webui"]);
});
