import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = readFileSync(path.join(repoRoot, ".github", "workflows", "gate.yml"), "utf8");

// Gate-kit v0.4.18 is an immutable release tag (commit
// c8cebc23bbce70ed66bbeb975872d66af8e3941b): its compliance.yml prepares Node 22
// for beanfit-app, runs the npm ci setup, and pins Beanfit CLI v0.4.0. The caller
// must stay on this exact tag so exact-commit CI uses the clean-checkout setup.
const PINNED_REF = "v0.4.18";
const PINNED_SHA = "c8cebc23bbce70ed66bbeb975872d66af8e3941b";
const KNOWN_OLD = ["v0.4.1", "v0.4.3"];

function callers() {
  return gate.match(/uses:\s+(\S+)/g) ?? [];
}

test("gate.yml calls exactly one gate-kit compliance workflow", () => {
  const all = callers();
  assert.equal(all.length, 1, `expected a single uses: caller, got ${all.length}`);
  assert.match(
    all[0],
    /stevekkall-beansgc\/gate-kit\/\.github\/workflows\/compliance\.yml@/,
  );
});

test("gate-kit pin is the immutable v0.4.18 tag, never main or a drifting tag", () => {
  const all = callers();
  assert.equal(all.length, 1);
  const ref = all[0].split("@").at(-1);
  assert.equal(ref, PINNED_REF, "gate-kit ref must be the exact immutable v0.4.18 tag");
  assert.notEqual(ref, "main", "CI must never track the default branch");
  for (const old of KNOWN_OLD) {
    assert.notEqual(ref, old, `CI must not drift back to ${old}`);
  }
  assert.ok(
    !/^v0\.4\.(?!18)\d+$/.test(ref),
    `another v0.4.x pin was introduced: ${ref}`,
  );
});

test("gate.yml keeps the compliance caller's inputs intact", () => {
  assert.match(gate, /repo: beanfit-app/);
  assert.match(gate, /full: true/);
  assert.doesNotMatch(gate, /uses:[^\n]*@main/);
});

test("pinned uses line has an adjacent comment documenting the verified peeled commit", () => {
  const lines = gate.split("\n");
  const pinIdx = lines.findIndex((l) => /compliance\.yml@v0\.4\.18\s*$/.test(l));
  assert.notEqual(pinIdx, -1, "pinned uses: line not found");
  assert.notEqual(pinIdx, 0, "expected a doc comment directly above the pinned line");

  const doc = lines[pinIdx - 1] ?? "";
  assert.match(doc, /^\s*#/, "expected a # comment immediately above the pinned uses: line");
  assert.match(
    doc,
    new RegExp(`\\b${PINNED_SHA}\\b`),
    `comment must document the verified peeled commit ${PINNED_SHA}: ${doc}`,
  );
  assert.match(
    doc,
    new RegExp(`v0\\.4\\.18`),
    `comment must name the exact tag ${PINNED_REF}: ${doc}`,
  );

  const pin = lines[pinIdx];
  assert.match(pin, new RegExp(`@${PINNED_REF.replace(/\./g, "\\.")}\\s*$`));
});