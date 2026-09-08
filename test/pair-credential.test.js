import test from "node:test";
import assert from "node:assert/strict";
import { makePairApiHandlers } from "../src/routes/pair.js";
import { sha256Hex } from "../src/lib/crypto.js";

function handlersFor(device) {
  const db = {
    prepare: () => ({ bind: () => ({
      first: async () => device,
      run: async () => ({ meta: { changes: 1 } }),
      all: async () => ({ results: [] }),
    }) }),
  };
  return makePairApiHandlers({ DB: db, SESSION_SECRET: "test-session-secret" });
}

test("pair status never discloses a raw device credential", async () => {
  const claim = "start-time-secret";
  const handlers = handlersFor({
    id: "device-1", status: "approved", pair_expires_at: Math.floor(Date.now() / 1000) + 60,
    pair_claim_hash: await sha256Hex(claim),
  });

  const status = await handlers.status({ params: { pairId: "pair-1" } });
  assert.deepEqual(await status.json(), { status: "approved", device_id: "device-1" });

  const denied = await handlers.claim({ params: { pairId: "pair-1" }, request: new Request("https://test/claim") });
  assert.equal(denied.status, 404);

  const granted = await handlers.claim({
    params: { pairId: "pair-1" },
    request: new Request("https://test/claim", { headers: { "x-beanfit-pair-claim": claim } }),
  });
  const doc = await granted.json();
  assert.equal(doc.status, "approved");
  assert.match(doc.device_token, /^[0-9a-f]{64}$/);
});
