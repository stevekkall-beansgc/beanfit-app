import test from "node:test";
import assert from "node:assert/strict";

import {
  speedBand, modelInfo, capabilityHeadline, deviceTasks, plainPicks,
} from "../src/lib/plain.js";

test("speed bands translate tok/s to experience", () => {
  assert.equal(speedBand(40).label, "Instant");
  assert.equal(speedBand(15).label, "Fast");
  assert.equal(speedBand(8).label, "Steady");
  assert.equal(speedBand(2).label, "Slow");
  assert.equal(speedBand(null), null);
});

test("known models get their plain role; unknowns fall back by size", () => {
  assert.equal(modelInfo("gemma4:31b", 20.4).role, "Smart all-rounder");
  assert.equal(modelInfo("deepseek-coder-v2:16b", 11.2).role, "Coding specialist");
  assert.equal(modelInfo("mystery:7b", 5).role, "Quick helper");
  assert.equal(modelInfo("mystery:70b", 45).role, "Heavyweight brain");
});

test("capability headline scales with budget", () => {
  assert.match(capabilityHeadline(null).headline, /couldn't measure/);
  assert.match(capabilityHeadline(4).detail, /Compact/);
  assert.match(capabilityHeadline(16).detail, /Serious/);
  assert.match(capabilityHeadline(40).detail, /Advanced/);
  assert.match(capabilityHeadline(96).detail, /biggest/);
  assert.ok(capabilityHeadline(16).tasks.length > 0);
});

test("plainPicks: best, quickest, smartest — deduped, max 3", () => {
  const ranked = [
    { name: "A", fits: true, est_tok_s: 20, quality: 9, score: 100 },  // best+smartest
    { name: "B", fits: true, est_tok_s: 60, quality: 7, score: 90 },   // quickest
    { name: "C", fits: true, est_tok_s: 10, quality: 8, score: 80 },
    { name: "D", fits: false, est_tok_s: null, quality: 10, score: 0 },
  ];
  const picks = plainPicks(ranked);
  assert.equal(picks.length, 2);
  assert.equal(picks[0].row.name, "A");
  assert.equal(picks[0].key, "Best for most people");
  assert.equal(picks[1].row.name, "B");
  assert.equal(picks[1].key, "If you want more speed");
});

test("plainPicks: empty when nothing fits", () => {
  assert.deepEqual(plainPicks([{ fits: false }]), []);
  assert.deepEqual(plainPicks([]), []);
  assert.deepEqual(plainPicks(null), []);
});

test("models expose concrete tasks", () => {
  const info = modelInfo("deepseek-coder-v2:16b", 11);
  assert.ok(info.tasks.includes("Write new code"));
  assert.ok(modelInfo("mystery:5b", 5).tasks.length >= 3);
});

test("device tasks scale with budget", () => {
  const tiny = deviceTasks(4);
  const mid = deviceTasks(16);
  const big = deviceTasks(96);
  assert.ok(!tiny.some(t => /code/i.test(t)));
  assert.ok(mid.some(t => /code/i.test(t)));
  assert.ok(big.length > mid.length);
  assert.equal(deviceTasks(null).length, 0);
});
