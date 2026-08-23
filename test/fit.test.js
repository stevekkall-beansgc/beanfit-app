import test from "node:test";
import assert from "node:assert/strict";

import { fits, sanitizeProfile, sanitizeRanked, decodeTokS } from "../src/lib/fit.js";

const HW = { model_budget_gib: 36, mem_bandwidth_gbs: 273 };
const MODEL = { mem_q4: 19.5, mem_q8: 33.0, kv32k: 1.8 };

test("fit math matches CLI engine reference numbers", () => {
  // CLI: total = 19.5 + 0.9 = 20.4; tok/s = 600/20.4*0.85 = 25.0
  const r = fits(MODEL, { model_budget_gib: 96, mem_bandwidth_gbs: 600 });
  assert.equal(r.quant, "q4_K_M");
  assert.equal(r.total_gib, 20.4);
  assert.equal(r.est_tok_s, 25.0);
});

test("prefers q4, falls back to q8 when q4 misses budget", () => {
  const tight = { model_budget_gib: 34 }; // q4 total 20.4 fits... make it miss:
  const tighter = { model_budget_gib: 18 }; // q4=20.4 no; q8=33.9 no
  assert.equal(fits(MODEL, tight).quant, "q4_K_M");
  assert.equal(fits(MODEL, tighter).fits, false);
});

test("sanitizeProfile whitelists and bounds", () => {
  const p = sanitizeProfile({
    hardware: {
      os: "macos", chip: "Apple M5 Max", family: "M5", variant: "Max",
      ram_gib: 128, model_budget_gib: 96, mem_bandwidth_gbs: 600,
      bw_source: "estimate",
      evil: "<script>", extra: { nested: true },
    },
    top_level_junk: true,
  });
  assert.deepEqual(Object.keys(p).sort(), [
    "arch", "backend", "bw_source", "chip", "family", "mem_bandwidth_gbs",
    "metal_cap_gib", "model_budget_gib", "os", "ram_gib", "variant",
  ]);
  assert.equal(p.ram_gib, 128);
});

test("sanitizeProfile rejects garbage", () => {
  assert.equal(sanitizeProfile(null), null);
  assert.equal(sanitizeProfile({}), null);
  assert.equal(sanitizeProfile({ hardware: { chip: 42 } }), null);
});

test("sanitizeRanked clamps to 20 rows and coerces types", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    name: `m${i}`, runtime_tag: `t${i}`, quality: "9", fits: i < 10,
  }));
  const out = sanitizeRanked(many);
  assert.equal(out.length, 20);
  assert.equal(typeof out[0].quality, "number");
});
