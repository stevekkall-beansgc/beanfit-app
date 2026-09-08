// The configurator is a checked-in mirror of beanfit's emitted catalog.
// Keep its fit-critical metadata exact; a tag/name-only comparison is not
// enough because memory drift changes the recommendation and context advice.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { MODELS } from "../src/lib/stack.js";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = process.env.BEANFIT_SRC ?? path.resolve(here, "../../beanfit/src");

test("configurator metadata matches beanfit --export-catalog", {
  skip: !fs.existsSync(path.join(src, "beanfit", "cli.py")) && "beanfit source not checked out",
}, () => {
  const output = execFileSync("python3", ["-m", "beanfit", "--export-catalog"], {
    env: { ...process.env, PYTHONPATH: src }, encoding: "utf8",
  });
  const emitted = JSON.parse(output);
  assert.equal(emitted.artifact_schema, 1);
  const expected = Object.fromEntries(emitted.models.map((m) => [m.runtime_tag, {
    name: m.name, mem_q4: m.mem_q4, mem_q8: m.mem_q8, kv32k: m.kv32k,
  }]));
  assert.deepEqual(MODELS, expected);
});
