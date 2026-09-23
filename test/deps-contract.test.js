import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));

// GHSA-rgj7-g3m4-5g8c (sharp, via miniflare in the dev tree): libheif
// vulnerabilities fixed only in sharp >= 0.35.4. The lock must never regress
// below the patched release, and the manifest must keep the override.
const PATCHED_SHARP = "0.35.4";
const PINNED_WRANGLER = "4.125.0";
const PINNED_MINIFLARE = "5.20260820.0-alpha";

function semverParts(v) {
  return v.split(".").slice(0, 3).map(Number);
}
function semverGte(a, b) {
  const A = semverParts(a);
  const B = semverParts(b);
  for (let i = 0; i < A.length; i++) {
    if (A[i] > B[i]) return true;
    if (A[i] < B[i]) return false;
  }
  return true;
}
function firstVersion(spec) {
  const m = /(\d+\.\d+\.\d+)/.exec(spec);
  return m ? m[1] : null;
}

test("lockfile resolves sharp to the patched version, dev-only", () => {
  const sharpNode = lock.packages["node_modules/sharp"];
  assert.ok(sharpNode, "sharp must be present in the lockfile");
  assert.equal(sharpNode.dev, true, "sharp must remain a dev-only dependency");
  assert.ok(
    semverGte(sharpNode.version, PATCHED_SHARP),
    `sharp ${sharpNode.version} must be >= ${PATCHED_SHARP} (GHSA-rgj7-g3m4-5g8c)`,
  );
});

test("package.json keeps the sharp override at the patched release", () => {
  const spec = pkg.overrides?.sharp;
  assert.ok(spec, "package.json must declare a sharp override");
  const v = firstVersion(String(spec));
  assert.ok(v, `override spec ${spec} must name a concrete sharp version`);
  assert.ok(
    semverGte(v, PATCHED_SHARP),
    `sharp override ${spec} must be >= ${PATCHED_SHARP}`,
  );
});

test("override fixes only sharp: wrangler + miniflare stay pinned", () => {
  assert.equal(pkg.devDependencies.wrangler, PINNED_WRANGLER);
  assert.equal(lock.packages["node_modules/wrangler"]?.version, PINNED_WRANGLER);
  assert.equal(
    lock.packages["node_modules/miniflare"]?.version,
    PINNED_MINIFLARE,
    "miniflare pin must not be replaced to chase the advisory",
  );
});

test("production tree stays dependency-free (advisory is dev-only)", () => {
  assert.equal(pkg.dependencies, undefined, "no production dependencies");
  assert.equal(pkg.devDependencies.sharp, undefined, "sharp must not be a direct dependency");
});